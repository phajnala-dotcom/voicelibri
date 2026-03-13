# Soundscape Pipeline — Full Wiring & Cleanup

## Context

Branch: `feature/soundscape-refactor`  
Backend: `apps/backend/` — Express + TypeScript on port 3001  
New soundscape pipeline: `soundscape/src/` — 10 modular TypeScript files  
Bridge: `apps/backend/src/soundscapeCompat.ts` — connects backend to new pipeline  

**Credentials are working.** `.gcsakey.json` is a fresh GCP Service Account key. Vertex AI embedding API and Gemini 2.5 Flash both confirmed functional.

## Problem Statement

The new semantic/embeddings-based soundscape pipeline (`soundscape/src/`) is **fully implemented** but produces almost no useful output — approximately 1 low-relevance ambient and maybe 1 SFX per chapter. The system should produce rich, scene-aware ambient beds with multiple SFX events timed to silence gaps in narration.

The app creates **2 independent audio files**: a TTS voice file and a soundscape ambient file — played synchronously on the frontend. No mixing.

## Root Causes (verified by code audit)

### W1: audiobookWorker.ts has ZERO soundscape calls
- File: `apps/backend/src/audiobookWorker.ts` (375 lines)
- The batch generation path (`POST /api/audiobooks/generate`) goes: `generateAllChunks()` → `consolidateAllChapters()` → mark completed
- **No import and no call** to any soundscape function whatsoever
- The `consolidateAllChapters()` method (line 255) has access to `chapterTextMap` and `chapterPath` but never calls soundscape
- The `GenerationJob` interface doesn't carry `chapters` text or subChunk data needed for soundscape

### W2: Real-time path works but depends on in-memory maps
- File: `apps/backend/src/index.ts` — the `applySoundscapeForChapter()` wrapper (line 178)
- Reads from `CHAPTER_DRAMATIZED` map and `CHAPTER_SUBCHUNKS` map
- These are populated during `startBackgroundDramatization()` and the 3 call sites at lines 1163, 1240, 1340 do work
- But if maps are empty (e.g., server restart), soundscape gets empty text → degraded output

### Q1: Quality — too few scene segments and SFX events
- Even when the pipeline fires, it often produces only 1 ambient + 0-1 SFX per chapter
- Need diagnostic logging to determine: Is the LLM returning minimal results? Are embedding scores too low? Are constraint filters too aggressive?
- The constraint filters in `buildPlacedSfxEvents()` (`subchunkSoundscape.ts`) may be over-filtering

## Action Plan

### Phase 0: Dead Code & Legacy Cleanup

Remove all remnants of the old keyword-based soundscape:

1. **`soundscape/src/audioMixer.ts`** — Dead module. Exports `prependIntro()` which is never imported by any source file. Only exists in stale `dist/` artifacts. **DELETE the file.**

2. **`soundscape/src/index.ts`** — Barrel file with ~50 exports but ZERO consumers (soundscapeCompat.ts imports directly from individual modules). Either:
   - (a) Refactor soundscapeCompat.ts to import from the barrel instead of individual modules, OR
   - (b) Prune the barrel to only re-export what's actually used externally
   - Option (a) is cleaner. If chosen, update all imports in soundscapeCompat.ts from `'../../../soundscape/src/assetResolver.js'` etc. to `'../../../soundscape/src/index.js'`

3. **`resolveByKeyword()` in `soundscape/src/assetResolver.ts`** (line 251) — Primitive keyword-overlap fallback. Used in soundscapeCompat.ts lines 342, 470, 585 as catch-block fallback when embedding resolution fails. **KEEP as safety net** but add a console.warn when it activates so we know embedding failed.

4. **`buildFallbackScene()` in `soundscape/src/llmDirector.ts`** (line 290) — Keyword-based scene analysis fallback when LLM fails. Produces single scene segment, zero SFX, intensity 0.5. Used in soundscapeCompat.ts lines 328, 456. **KEEP as safety net** but add console.warn.

5. **`prependIntro` export in `soundscape/src/index.ts`** line 133 — References deleted audioMixer.ts. **REMOVE the export line** (after deleting audioMixer.ts).

6. **Stale doc references** — These are LOW priority, don't spend time on them:
   - `scripts/generate_tech_docs_sk.py` has 4 references to `soundscapeIntegration.ts`
   - `mirror/Generate-Context.ps1` line 223 lists `soundscapeIntegration.ts`
   - `.gitignore` line 6 has `catalog.json` entry for a file that doesn't exist
   - `soundscape/README.md` references `catalog.json`

7. **`apps/backend/dist/`** — Contains stale compiled JS from old builds. After all changes, do a clean rebuild: `rm -rf dist && npx tsc`

### Phase 1: Wire audiobookWorker.ts (W1 fix)

This is the critical fix. The worker must call soundscape after consolidating each chapter.

**File: `apps/backend/src/audiobookWorker.ts`**

1. Add import at top:
```typescript
import { applySoundscapeToChapter } from './soundscapeCompat.js';
```

2. Expand the `GenerationJob` interface to carry chapter text data (subChunks from `chunkForTwoSpeakers` are NOT available in the worker — the worker uses `ChunkInfo` from `chapterChunker`, not `TwoSpeakerChunk` from `twoSpeakerChunker`). The soundscapeCompat's `applySoundscapeToChapter()` handles the case when `subChunks` is undefined — it falls back to chapter-level ambient.

3. In `consolidateAllChapters()`, after each successful chapter consolidation (after line 293: `console.log('✓ Chapter ${chapterIndex} consolidated')`), add:
```typescript
// Generate soundscape ambient track for this chapter
try {
  const chapterText = chapterTextMap.get(chapterIndex) ?? '';
  await applySoundscapeToChapter({
    bookTitle,
    chapterIndex,
    chapterPath,
    chapterText,
    // subChunks not available in worker path — soundscapeCompat handles this
    // by falling back to chapter-level ambient (no per-subchunk SFX timing)
  });
} catch (scErr) {
  console.error(`  ⚠️ Soundscape failed for chapter ${chapterIndex}:`, scErr instanceof Error ? scErr.message : scErr);
  // Non-fatal — voice audio is still usable without soundscape
}
```

4. Update `GenerationProgress` interface to add optional `soundscapeStatus` field for visibility.

### Phase 2: Quality Diagnostics (Q1)

After wiring is complete, generate a test audiobook from `apps/backend/assets/soundscape_test_story.txt` and capture verbose logs.

**Diagnostic checklist — what to look for in console output:**

1. `🎬 Analyzing scene for chapter N` — Did LLM fire or did it fall back?
2. How many `sceneSegments` returned? (should be 1-6 per chapter)
3. How many `sfxEvents` returned? (should be 3-10+ per chapter for narrative text)
4. `🔍 Scene segments resolved: X/Y matched` — embedding match rate
5. `🎯 SFX: "description" → "asset" (score=N.NNN)` — individual SFX scores (>0.5 = good, >0.7 = excellent)
6. `Subchunk N: Xs, Y silence gaps` — are silence gaps detected?
7. Any `⚠️` warnings about skipped ambient, no duration, no silence gaps

**If LLM returns too few segments/events:** The prompt in `llmDirector.ts` may need tuning — check `analyzeChapterScene()` prompt template.

**If embedding scores are too low:** The embedding index may need rebuilding with the new credentials. Check if `ambient_embeddings.json` was built with the old (broken) key — if so, delete and let it rebuild.

**If SFX are over-filtered:** Check constraint parameters in `subchunkSoundscape.ts`:
- `buildPlacedSfxEvents()` — no-layering, no-boundary-crossing, no-ambient-overlap ±500ms, min spacing 2000ms
- These may be too aggressive for short chapters

### Phase 3: Validation

1. Generate audiobook from `soundscape_test_story.txt`
2. Check output directory for `chapter_N_ambient.ogg` files alongside `chapter_N.ogg` voice files
3. Listen and score against `scripts/soundscape_eval/LISTENER_CHECKLIST.md`
4. Verify ambient tracks are roughly the same duration as voice tracks (±4s for pre/post roll)

## Key Files Reference

| File | Lines | Role |
|------|-------|------|
| `apps/backend/src/audiobookWorker.ts` | 375 | Batch generation worker — **NEEDS soundscape wiring** |
| `apps/backend/src/index.ts` | 3347 | Main server — real-time path already has soundscape calls (lines 1163, 1240, 1340) |
| `apps/backend/src/soundscapeCompat.ts` | 821 | Bridge — `applySoundscapeToChapter()` is the main entry point |
| `soundscape/src/llmDirector.ts` | 351 | LLM scene analysis via Gemini 2.5 Flash |
| `soundscape/src/assetResolver.ts` | 412 | Embedding-based asset matching |
| `soundscape/src/subchunkSoundscape.ts` | ~300 | SFX timing, silence gap mapping, constraint filters |
| `soundscape/src/ambientLayer.ts` | ~250 | FFmpeg ambient+SFX rendering per subchunk |
| `soundscape/src/config.ts` | 146 | Constants, env vars, `isSoundscapeEnabled()` |
| `soundscape/src/embeddings.ts` | ~400 | Gemini embedding-001 vector search |
| `soundscape/src/catalogLoader.ts` | ~200 | CSV catalog → SoundAsset[] |
| `soundscape/src/audioMixer.ts` | ~50 | **DEAD — delete** |
| `soundscape/src/index.ts` | 145 | Barrel exports — zero consumers, needs cleanup |
| `apps/backend/.env` | - | `SOUNDSCAPE_ENABLED=1` ✅ |
| `soundscape/assets/voicelibri_assets_catalog.csv` | 22537 | Sound asset catalog |
| `soundscape/assets/ambient_embeddings.json` | 356MB | Pre-built embedding index |
| `soundscape/assets/sfx_embeddings.json` | 41MB | Pre-built SFX embedding index |
| `soundscape/assets/music_embeddings.json` | 1.3MB | Pre-built music embedding index |

## Constraints

- **DO NOT** change the independent-tracks architecture (voice + ambient as separate files)
- **DO NOT** remove `resolveByKeyword()` or `buildFallbackScene()` — keep as safety nets
- **DO NOT** touch the real-time path in `index.ts` — it already works correctly
- **DO NOT** modify frontend/PWA code — this is backend-only work
- **DO NOT** invent new features — wire what exists to work as designed
- After all changes: `cd apps/backend && rm -rf dist && npx tsc --noEmit` must pass with zero errors
