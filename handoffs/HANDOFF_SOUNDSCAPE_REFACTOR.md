# Handoff: Soundscape Pipeline Refactor

**Branch**: `feature/soundscape-refactor`  
**Date**: 2025-07-17  
**Commit**: `9421b466` — "refactor: soundscape module architecture overhaul"

---

## Session Summary

This session completed the **soundscape module architecture overhaul** — removing all fabricated/invented behavior (arbitrary SFX limits, static genre maps, text truncation), replacing with LLM-powered asset matching, and preparing for the subchunk-level soundscape pipeline.

## What Was Done

### 1. Bugs Fixed (PWA + Soundscape)
- ✅ PWA `getAudiobooks()` data shape mismatch
- ✅ Removed duplicate `useAudioPlayback` hook (kept `useProgressiveAudioPlayback`)
- ✅ Fixed `GenerateScreen` broken reference to deleted hook
- ✅ Added `play()` call to library screen audio handlers
- ✅ `setCurrentBook` now resets `playbackMode`
- ✅ Fixed subchunk save order (subchunk 0 saved first)

### 2. Fabricated Behavior Removed
- ✅ **`maxResults=2` cap** on SFX in `assetResolver.ts` — now returns ALL above 0.5 threshold
- ✅ **Static `GENRE_MUSIC_MAP`** (60+ genre→folder entries) — replaced with LLM-generated query
- ✅ **`DEFAULT_KEYWORD_MAP`** (14 keyword categories) — removed, LLM director handles scene tagging
- ✅ **`DEFAULT_MUSIC_FOLDERS`** fallback — removed, embedding search covers all assets
- ✅ **Text truncation** (`MAX_CHAPTER_TEXT = 8000`) — removed, Gemini 2.5 Flash has 1M token context
- ✅ **Single `searchQuery`** — replaced with `searchSnippets[]` (3-8) and `sfxQueries[]` (0-4)

### 3. Architecture Changes

| File | Changes |
|------|---------|
| `soundscape/src/types.ts` | Added `SoundAssetType = 'sfx'`, `searchSnippets[]`, `sfxQueries[]`, `BookInfo.title/author`. Removed `GenreMusicMap`, `ChapterSoundscapeResult` |
| `soundscape/src/config.ts` | 48kHz/stereo/libopus, `SCENE_ANALYSIS_MODEL = 'gemini-2.5-flash'`, added `SFX_EMBEDDINGS_PATH`. Removed genre maps |
| `soundscape/src/llmDirector.ts` | Full chapter text, multilingual (any lang → English output), `searchSnippets[]` + `sfxQueries[]`, robust parsing with fallbacks |
| `soundscape/src/musicSelector.ts` | Complete rewrite — LLM generates ideal-track description → embedding search across ALL music assets. Removed `resolveMusicFolders()`, `selectChapterMusic()` |
| `soundscape/src/catalogLoader.ts` | Asset type detection from CSV `Type` column (music/sfx/ambient). Added `loadMusicCatalog()`, `loadSfxCatalog()`. Updated `getAssetById()` for all prefixes |
| `soundscape/src/embeddings.ts` | Added `searchEmbeddingsBatch()` (concurrent multi-query), SFX index management (`getSfxIndex`/`setSfxIndex`) |
| `soundscape/src/ffmpegRunner.ts` | Added `getAudioDuration()` via ffprobe |
| `soundscape/src/audioMixer.ts` | Removed `mixAmbientWithVoice()`, `processChapter()`, `processAllChapters()`. Only `prependIntro()` remains |
| `soundscape/src/introGenerator.ts` | All temp files .wav→.ogg, audio params 48kHz/stereo/libopus |
| `soundscape/src/index.ts` | Updated all barrel exports to match refactored modules |
| `soundscape/src/assetResolver.ts` | `resolveSfxAssets()` returns all above threshold (no arbitrary cap). Added `ensureSfxEmbeddingIndex()` |

### 4. New Files
- `scripts/test_ogg_opus_tts.mjs` — Standalone OGG Opus native TTS test (single + multi-speaker + size comparison)
- `soundscape/package.json` — Module package config with `"type": "module"`

### 5. Key Discovery: Gemini TTS Has No Timestamps
- **Gemini 2.5 Flash/Pro TTS**: Text-only input → raw audio output. **NO SSML, NO marks, NO timestamps** in request or response.
- **Google Cloud TTS** (separate service): HAS SSML `<mark>` with `timepoints` — but VoiceLibri uses Gemini TTS, not this.
- **Conclusion**: Character-index proportional timing is the correct approach: `(charIndex / totalChars) × audioLengthMs`

---

## Next Session Plan

### Step 1: Dead Code & Old Pipeline Cleanup

Clean up remaining dead code and old pipeline artifacts before building anything new.

#### Dead Code in `ambientLayer.ts` — FABRICATED SFX Timing

**File**: `soundscape/src/ambientLayer.ts` lines 88-158  
**Issue**: Contains **fabricated "evenly distributed" SFX placement** — pure invention with no data source.

The current code at lines 93-107 calculates SFX positions by:
```typescript
// FABRICATED — no timing data exists in SceneAnalysis
const sfxStartBound = preRollSec + 2;
const sfxEndBound = Math.max(fadeOutStart - 2, sfxStartBound + 1);
const sfxSpan = sfxEndBound - sfxStartBound;
// Evenly distribute SFX across chapter duration
for (let i = 0; i < validSfx.length; i++) {
  const offset = sfxStartBound + (sfxSpan * i) / (validSfx.length - 1);
  sfxOffsets.push(offset);
}
```

**Action**: Remove entire SFX overlay section. Will be replaced by Step 2.5 (per-subchunk approach with LLM-produced character indices mapped to actual milliseconds).

#### Dead Code in Backend Integration

| Location | Dead Code | Action |
|----------|-----------|--------|
| `apps/backend/src/soundscapeCompat.ts:166` | `applySoundscapeToChapter()` — chapter-level function | Replace with subchunk-level equivalent |
| `apps/backend/src/soundscapeCompat.ts:62` | `startEarlyIntroGeneration()` — blocking call pattern | Make non-blocking (remove `await` at caller) |
| `apps/backend/src/audiobookWorker.ts:288` | `await applySoundscapeToChapter({...})` inside consolidation loop | Move soundscape to subchunk generation loop |
| `apps/backend/src/index.ts:184` | `await applySoundscapeToChapter({...})` in manual regen endpoint | Update to new pipeline |
| `apps/backend/src/index.ts:1003` | `await startEarlyIntroGeneration({...})` — blocking | Remove `await` |

#### Removed Types — Verify Clean Removal

Run: `grep -rn "GenreMusicMap\|ChapterSoundscapeResult\|GENRE_MUSIC_MAP\|DEFAULT_KEYWORD_MAP\|DEFAULT_MUSIC_FOLDERS\|resolveMusicFolders\|selectChapterMusic\|mixAmbientWithVoice\|processChapter\|processAllChapters" soundscape/src/ apps/backend/src/` to confirm no stale references to:
- `GenreMusicMap`, `ChapterSoundscapeResult`, `GENRE_MUSIC_MAP`, `DEFAULT_KEYWORD_MAP`, `DEFAULT_MUSIC_FOLDERS`
- `resolveMusicFolders`, `selectChapterMusic`, `mixAmbientWithVoice`, `processChapter`, `processAllChapters`

#### `config.ts` Comment Block

`soundscape/src/config.ts` lines 143-146 contain a deprecation note — remove after confirming no code references the old maps.

---

### Step 2: Subchunk-Level Soundscape Pipeline (7 sub-steps)

**Step 2.0 — Intro Generation (parallel)**
- Make intro generation run parallel to first subchunk TTS
- Currently blocks at `apps/backend/src/index.ts:1003`: `await startEarlyIntroGeneration({...})`
- Fix: Remove `await`, let it run in background

**Step 2.1 — LLM Director Enhancement**
- Extend `SceneAnalysis` in `soundscape/src/types.ts` with:
  ```typescript
  sfxEvents: Array<{ query: string; charIndex: number; description: string }>
  ```
- Update LLM Director prompt in `soundscape/src/llmDirector.ts` to produce character-index positioned SFX events
- Each event specifies WHERE in the chapter text the sound occurs (character index)

**Step 2.2 — Chunking Mapper**
- Build a function that maps chapter-level `charIndex` → subchunk-level `charIndex`
- Input: chapter text, subchunk boundaries (from `_boundaries.json`)
- Output: per-subchunk list of `{ query, localCharIndex }` events

**Step 2.3 — TTS Subchunk Completion Hook**
- After each TTS subchunk is generated, get actual duration via `getAudioDuration()`
- Store `{ subchunkIndex, durationMs, text, charCount }` for timing calculation

**Step 2.4 — Proportional Timing Calculation**
- For each SFX event in a subchunk:
  ```
  offsetMs = (localCharIndex / subchunkTotalChars) × subchunkDurationMs
  ```
- This gives precise millisecond placement without any timestamp data from TTS

**Step 2.5 — Per-Subchunk Ambient + SFX Generation**
- Generate ambient+SFX overlay per subchunk (not per chapter)
- Use calculated `adelay` values for precise SFX placement
- Much faster than chapter-level processing (subchunks are ~10-30s vs ~30min chapters)

**Step 2.6 — Soundscape Chapter Concatenation**
- Concatenate per-subchunk soundscape tracks into chapter-level soundscape
- Simple ffmpeg concat (no re-encoding needed for same format)

**Step 2.7 — Synchronized Dual-Track Playback**
- Serve voice chapters and soundscape chapters as separate streams
- PWA player synchronizes playback of both tracks
- Allows independent volume control

### Key Files for Implementation

| File | Role | What to change |
|------|------|---------------|
| `soundscape/src/types.ts` | Types | Add `sfxEvents` to `SceneAnalysis` |
| `soundscape/src/llmDirector.ts` | LLM scene analysis | Update prompt for character-indexed SFX events |
| `soundscape/src/ambientLayer.ts` | Ambient+SFX generation | Rewrite for per-subchunk generation with precise timing |
| `soundscape/src/assetResolver.ts` | Asset matching | Already ready (no caps, batch search) |
| `soundscape/src/ffmpegRunner.ts` | Duration probe | Already has `getAudioDuration()` |
| `apps/backend/src/soundscapeCompat.ts` | Integration layer | Restructure for subchunk-level pipeline |
| `apps/backend/src/audiobookWorker.ts` | Pipeline orchestrator | Move soundscape into subchunk loop |
| `apps/backend/src/tempChunkManager.ts` | Subchunk generation | Hook soundscape after each subchunk TTS |
| `apps/backend/src/index.ts:1003` | Intro blocking | Remove `await` on `startEarlyIntroGeneration` |

---

## Copilot Instructions Updated

Added to `.github/copilot-instructions.md`:
```markdown
# ⚠️ MANDATORY DIRECTIVE - NO ARBITRARY LIMITS OR SYSTEM SETTINGS
NEVER IMPOSE ARTIFICIAL LIMITS, CAPS, THRESHOLDS, OR DEFAULT VALUES...
```

**Consider adding** a directive about not fabricating algorithms or behavior patterns that don't exist in the data model.

---

## Quick Start for Next Session

```
1. Open VoiceLibri workspace
2. Branch: feature/soundscape-refactor (already on it)
3. Read this handoff
4. Step 1 — Dead code & old pipeline cleanup
5. Step 2 — Implement subchunk-level soundscape pipeline (2.0-2.7)
```
