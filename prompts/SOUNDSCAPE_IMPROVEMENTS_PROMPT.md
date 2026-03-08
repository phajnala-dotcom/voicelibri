# Soundscape Pipeline Improvements — Implementation Prompt

## Context

You are working on VoiceLibri, a commercial-grade AI-powered multi-voice dramatized audiobook platform. The soundscape module generates an ambient+SFX audio layer that plays alongside the voice track (dual-track architecture — voice and soundscape are never mixed server-side).

Read `.github/copilot-instructions.md` for full project context and mandatory directives.

**Branch**: `feature/soundscape-refactor`

## Current Architecture Summary

1. **TTS pipeline** generates subchunk WAV files (~10–240 seconds each)
2. **LLM Director** (`soundscape/src/llmDirector.ts`) analyzes full chapter text → `SceneAnalysis` with ambient queries + SFX events (each SFX carries a `charIndex` in the chapter text)
3. **Asset Resolver** (`soundscape/src/assetResolver.ts`) matches queries to catalog assets via embedding cosine search
4. **Subchunk Soundscape** (`soundscape/src/subchunkSoundscape.ts`) maps chapter-level `charIndex` → subchunk-level `localCharIndex`, then calculates `offsetMs = (localCharIndex / charCount) × durationMs`
5. **Ambient Layer** (`soundscape/src/ambientLayer.ts`) generates per-subchunk ambient OGG (looped ambient + timed SFX overlays via ffmpeg adelay), then concatenates into chapter ambient OGG
6. **Soundscape Compat** (`apps/backend/src/soundscapeCompat.ts`) orchestrates the pipeline, called after chapter consolidation
7. **PWA player** (`apps/pwa-v2/src/hooks/useProgressiveAudioPlayback.ts`) plays voice (master) + ambient (follower) with drift correction

## Five Issues to Fix

All five issues share a **single design principle**: use silence gaps detected in the generated TTS audio as the universal timing grid for all soundscape events (ambient changes and SFX placement).

**Quality rule that applies everywhere**: No soundscape element is better than a poorly matched one. If an ambient or SFX asset can't be confidently matched, skip it entirely.

---

### Issue 1: SFX Timing — Replace Proportional Formula with Silence-Gap Placement

**Problem**: Current formula `offsetMs = (localCharIndex / charCount) × durationMs` assumes uniform speech rate. Real TTS varies significantly. SFX can be displaced by 5–20 seconds.

**Solution**: Silence-gap detection + nearest-gap placement.

**Implementation**:

1. **Add `detectSilenceGaps()` to `soundscape/src/ffmpegRunner.ts`**:
   - Run `ffmpeg -i {subchunkPath} -af silencedetect=noise=-30dB:d=0.15 -f null -` on each subchunk WAV
   - Parse stderr for `silence_start` / `silence_end` lines
   - Return `Array<{ startSec: number; endSec: number; midpointMs: number }>` — ordered list of silence gaps
   - The `midpointMs` of each gap is the SFX placement point

2. **Replace `calculateSfxOffsetMs()` in `soundscape/src/subchunkSoundscape.ts`**:
   - New function: `calculateSfxOffsetFromGaps(localCharIndex, subchunkCharCount, subchunkDurationMs, silenceGaps)`
   - Divide the subchunk duration into N+1 proportional segments (where N = number of gaps)
   - Use `localCharIndex / subchunkCharCount` to find which segment the event falls in
   - Return the `midpointMs` of the gap **immediately after** that segment
   - If no gaps exist in the subchunk → return `null` (skip this SFX — don't guess)

3. **Update `generateChapterSoundscapeFromSubchunks()` in `apps/backend/src/soundscapeCompat.ts`**:
   - After getting subchunk duration via ffprobe, also call `detectSilenceGaps()` on the same WAV
   - Pass gaps to the placement function
   - Skip SFX events that return `null` offset

---

### Issue 2: Multi-Scene Ambient per Subchunk (Unified Timing)

**Problem**: Currently one ambient asset loops for the entire chapter. A single subchunk (up to 4 minutes) can span 2–5 environment changes (tavern → street → forest).

**Solution**: The LLM Director produces multiple scene segments per chapter, each with a `charIndex` marking where the environment changes. These map to silence gaps using the **same mechanism** as SFX.

**Implementation**:

1. **Update `SceneAnalysis` in `soundscape/src/types.ts`**:
   ```typescript
   // Replace single environment/searchSnippets with scene segments
   sceneSegments: Array<{
     /** Character offset where this scene begins (0 for first segment) */
     charIndex: number;
     /** Primary environment description */
     environment: string;
     /** English search queries for ambient asset matching */
     searchSnippets: string[];
     /** Mood descriptors */
     moods: string[];
   }>;
   ```
   Keep existing top-level `environment`, `timeOfDay`, `weather`, `moods`, `soundElements`, `intensity`, `searchSnippets` for backward compatibility — they describe the chapter's **dominant** scene. The `sceneSegments` array provides fine-grained ambient timeline.

2. **Update LLM Director prompt in `soundscape/src/llmDirector.ts`**:
   - Instruct the LLM to produce `sceneSegments` array (1–6 segments per chapter)
   - First segment always has `charIndex: 0`
   - Each segment needs its own `searchSnippets` for ambient matching
   - Parsing: validate `charIndex` ordering, ensure first is 0, clamp to text length

3. **Update `soundscape/src/assetResolver.ts`**:
   - New function `resolveSceneSegmentAssets(sceneSegments)` — resolves an ambient asset per segment (reuse existing embedding search logic)
   - If a segment can't be matched above threshold → that segment has no ambient (silence)

4. **Update ambient generation in `soundscape/src/ambientLayer.ts`** — `generateSubchunkAmbientTrack()`:
   - Accept multiple ambient assets with their timing offsets (mapped to silence gaps)
   - At each ambient change point: crossfade out current ambient (500ms), crossfade in new ambient (500ms) — the crossfade happens at/around the silence gap
   - Only 1 ambient plays at any time (except during the 500ms crossfade overlap)
   - ffmpeg filter: chain ambient segments with `atrim`, `adelay`, volume fades

5. **Update `apps/backend/src/soundscapeCompat.ts`**:
   - Map scene segment `charIndex` values to silence gaps (same function as SFX)
   - Pass per-segment ambient assets + gap timestamps to `generateSubchunkAmbientTrack()`

---

### Issue 3: Remove SFX Count Limit, Add Constraints

**Problem**: LLM is prompted for only 0–4 SFX per chapter. Typical chapters have many more sound moments.

**Solution**: Remove the limit; add quality constraints instead.

**Implementation**:

1. **Update LLM Director prompt in `soundscape/src/llmDirector.ts`**:
   - Remove "Write 0-4 SFX events" instruction
   - Replace with: "Write as many SFX events as the text naturally warrants. Only include events where the text clearly describes a specific sound-producing action. Each SFX must be a short discrete sound (1–10 seconds). No SFX is better than a poorly matched SFX."

2. **Add SFX constraints in `soundscape/src/subchunkSoundscape.ts`** or in `ambientLayer.ts`:
   - **No SFX layering**: If two SFX events map to the same silence gap, keep only the one with the higher asset match score; drop the other
   - **No SFX crossing subchunk boundary**: Each SFX must end before the subchunk ends. If `offsetMs + sfxDurationMs > subchunkDurationMs`, skip it. Get SFX duration via `getAudioDuration()` on the SFX asset file (can be cached since catalog assets are static)
   - **No SFX during ambient crossfade**: If an SFX gap overlaps with an ambient change gap (within ±500ms), skip the SFX

3. **Update `resolveSfxEvents()` in `soundscape/src/assetResolver.ts`**:
   - Return match score alongside asset so the de-duplication logic can pick the best one

---

### Issue 5: Inter-Chapter Ambient Crossfade

**Problem**: Chapter ambient tracks start and stop abruptly at chapter boundaries.

**Solution**: Add fade-in at start and fade-out at end of each chapter ambient track.

**Implementation**:

1. **Update `concatenateSubchunkAmbientTracks()` in `soundscape/src/ambientLayer.ts`**:
   - After concatenation, apply a post-processing pass:
     - Fade-in first 2 seconds of the chapter ambient
     - Fade-out last 2 seconds of the chapter ambient
   - Use ffmpeg `afade=t=in:st=0:d=2,afade=t=out:st={totalDur-2}:d=2`
   - This is simpler than true inter-chapter crossfade (which would require knowing the next chapter's ambient at concatenation time) and achieves a smooth listening experience

---

### Issue 6: Ambient During Progressive (Subchunk) Playback

**Problem**: `loadAmbientForChapter()` in the PWA is only called in chapter mode. During progressive subchunk playback (while TTS generation is running), there is no ambient at all.

**Solution**: Generate and serve per-subchunk ambient tracks alongside the voice subchunks, and load them in progressive mode.

**Implementation**:

1. **Backend — generate subchunk ambient immediately after TTS**:
   - In `apps/backend/src/soundscapeCompat.ts`, add `applySoundscapeToSubchunk()` function
   - Called immediately after each subchunk WAV is written (in the TTS pipeline, `apps/backend/src/index.ts` where subchunks are generated)
   - Generates `chapter_N_sub_M_ambient.ogg` file
   - Uses cached scene analysis (run once per chapter, reuse for all subchunks)

2. **Backend — serve subchunk ambient**:
   - Add endpoint: `GET /api/audiobooks/:bookTitle/subchunks/:chapterIndex/:subChunkIndex/ambient`
   - In `apps/backend/src/index.ts`, next to the existing subchunk serving endpoint
   - Returns the per-subchunk ambient OGG, or 404 if not yet generated

3. **PWA API service** (`apps/pwa-v2/src/services/api.ts`):
   - Add `getSubChunkAmbientUrl(bookTitle, chapterIndex, subChunkIndex)` — returns URL for subchunk ambient
   - Add `isSubChunkAmbientReady(bookTitle, chapterIndex, subChunkIndex)` — HEAD check

4. **PWA playback hook** (`apps/pwa-v2/src/hooks/useProgressiveAudioPlayback.ts`):
   - In `loadSubChunkAudio()`: after loading voice subchunk, also try to load the matching ambient subchunk (fire-and-forget, non-blocking)
   - Set ambient `src` to subchunk ambient URL, sync playback start
   - When switching to next subchunk: also switch ambient source

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `soundscape/src/types.ts` | Add `sceneSegments` to `SceneAnalysis` |
| `soundscape/src/ffmpegRunner.ts` | Add `detectSilenceGaps()` |
| `soundscape/src/llmDirector.ts` | Update prompt: scene segments, remove SFX limit |
| `soundscape/src/subchunkSoundscape.ts` | Replace `calculateSfxOffsetMs()` with gap-based placement, add no-layering constraint |
| `soundscape/src/assetResolver.ts` | Add `resolveSceneSegmentAssets()`, return scores from `resolveSfxEvents()` |
| `soundscape/src/ambientLayer.ts` | Multi-ambient support in `generateSubchunkAmbientTrack()`, chapter fade-in/out |
| `soundscape/src/index.ts` | Update barrel exports |
| `apps/backend/src/soundscapeCompat.ts` | Silence gap integration, scene segment mapping, `applySoundscapeToSubchunk()` |
| `apps/backend/src/index.ts` | Subchunk ambient endpoint, hook soundscape after subchunk TTS |
| `apps/pwa-v2/src/services/api.ts` | Subchunk ambient URL helpers |
| `apps/pwa-v2/src/hooks/useProgressiveAudioPlayback.ts` | Load ambient during progressive mode |

## Implementation Order

1. `detectSilenceGaps()` in ffmpegRunner — foundation for everything
2. Updated types (`sceneSegments` in `SceneAnalysis`)
3. Updated LLM Director prompt (scene segments + unlimited SFX)
4. Gap-based SFX placement (replace proportional formula)
5. Multi-scene ambient asset resolution + generation
6. SFX constraints (no layering, no boundary crossing)
7. Chapter ambient fade-in/out
8. Subchunk ambient endpoint + PWA progressive ambient

## Dead Code Cleanup

After implementing all changes, the following must be **removed entirely** — no commented-out code, no "deprecated" wrappers, no unused imports. Verify with `grep -rn` that zero references remain in `soundscape/src/` and `apps/backend/src/`.

### Functions to Remove

| Function | File | Reason |
|----------|------|--------|
| `calculateSfxOffsetMs()` | `soundscape/src/subchunkSoundscape.ts` | Replaced by gap-based placement |
| Old single-ambient path in `generateSubchunkAmbientTrack()` | `soundscape/src/ambientLayer.ts` | The function is rewritten for multi-ambient; remove the old single-ambient-only code path entirely |
| `generateAmbientTrack()` (chapter-level single-ambient) | `soundscape/src/ambientLayer.ts` | Replaced by per-subchunk multi-scene generation; the legacy chapter-level function is no longer called |
| `generateAllAmbientTracks()` | `soundscape/src/ambientLayer.ts` | Was the chapter-level batch wrapper for `generateAmbientTrack()`; no longer used |
| Legacy fallback path in `applySoundscapeToChapter()` | `apps/backend/src/soundscapeCompat.ts` | The `else` branch that calls `generateAmbientTrack()` when `subChunks` is absent — all callers now provide subChunks |
| `getSoundscapeThemeOptions()` | `apps/backend/src/soundscapeCompat.ts` | Already deprecated, returns empty array — remove entirely |

### Types to Remove

| Type/Field | File | Reason |
|------------|------|--------|
| Top-level `searchSnippets` on `SceneAnalysis` | `soundscape/src/types.ts` | Replaced by `sceneSegments[].searchSnippets` — remove only after confirming all consumers use `sceneSegments` |
| Top-level `environment` on `SceneAnalysis` | `soundscape/src/types.ts` | Same — replaced by `sceneSegments[0].environment` |

**Important**: Only remove top-level fields from `SceneAnalysis` after ALL code paths have been migrated to use `sceneSegments`. If any fallback code still reads `scene.searchSnippets` or `scene.environment`, update it first, then remove.

### Barrel Export Cleanup

Update `soundscape/src/index.ts` to:
- Remove exports for deleted functions (`generateAmbientTrack`, `generateAllAmbientTracks`, `calculateSfxOffsetMs`)
- Add exports for new functions (`detectSilenceGaps`, `resolveSceneSegmentAssets`, etc.)
- Export new types (`sceneSegments` related interfaces)

### Import Cleanup

After all changes, check every modified file for unused imports. Remove any import that is no longer referenced. Do not leave commented-out imports.

### Verification

After implementation, run:
```bash
grep -rn "generateAmbientTrack\|generateAllAmbientTracks\|calculateSfxOffsetMs\|getSoundscapeThemeOptions" soundscape/src/ apps/backend/src/ apps/pwa-v2/src/
```
This must return **zero matches** (excluding the grep command itself and any test files documenting the removal).

---

## Constraints

- Follow existing code patterns and conventions throughout the codebase
- No new dependencies — only ffmpeg (already used) and existing Node.js APIs
- All audio output remains OGG Opus, 48kHz, stereo
- Never mix voice and soundscape server-side — they are always separate tracks
- Quality rule: skip any soundscape element that cannot be confidently matched. Silence is always acceptable; wrong sounds are not.
- Only 1 ambient + 1 SFX can play at any moment (no layering of multiple ambients or multiple SFX)
- Each SFX must end before its subchunk boundary
- **No dead code**: Do not leave commented-out code, deprecated wrappers, or unused functions/types/imports. If something is replaced, delete the old version entirely.
