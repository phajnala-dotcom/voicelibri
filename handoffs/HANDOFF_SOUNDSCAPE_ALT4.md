# Soundscape Pipeline — Alt 4 Implementation Handoff

## Context

You are continuing work on branch `feature/soundscape-refactor`. The soundscape pipeline was refactored across Steps 1–8 from `prompts/SOUNDSCAPE_IMPROVEMENTS_PROMPT.md`. All 8 steps are implemented and compile with 0 TypeScript errors.

After architectural review, the **per-subchunk ambient approach was rejected** in favor of **Alt 4**: chapter-level ambient bed (no SFX) for chapter 1 during progressive TTS, with silent upgrade to full ambient+SFX after consolidation. Chapters 2+ always get full ambient+SFX because they consolidate before playback reaches them.

**This handoff contains the complete, ordered implementation plan. Follow it exactly. Do not add features, refactor code, or change UI design beyond what is specified.**

---

## Architecture Decision Record

### Why subchunks are wrong for soundscape
- Subchunks exist for TTS constraints (2 speakers max, 4000 bytes, progressive playback)
- Soundscape has none of these constraints — it uses local ffmpeg on pre-recorded assets
- Per-subchunk ambient produces audible seams at boundaries, race conditions, and double work
- Scene segments (1–6 per chapter from LLM Director) are the natural soundscape unit

### Alt 4 architecture
```
Chapter 1 (progressive voice playback):
  1. Scene analysis fires during TTS (cached)
  2. Ambient assets resolved once per chapter (cached)
  3. Ambient-bed-only chapter_1_ambient.ogg generated immediately
     (estimated duration from text, ambient segments with crossfades, NO SFX)
  4. Voice subchunks play progressively; ambient bed plays in parallel
  5. PWA shows brief toast: "✨ Creating your soundscape..."
  6. After chapter WAV consolidates: regenerate chapter_1_ambient.ogg
     with silence-gap-based SFX (full quality)
  7. PWA hot-swaps ambient source to the upgraded file

Chapter 2+ (consolidated before playback):
  1. detectSilenceGaps() on consolidated chapter WAV
  2. Full chapter_N_ambient.ogg (ambient + SFX) in one ffmpeg pass
  3. Both voice + ambient ready before playback reaches this chapter
```

---

## Implementation Steps (execute in this exact order)

### Step 1: Fix Bug B1 — dead `scene.environment` reference

**File**: `apps/backend/src/soundscapeCompat.ts`
**Line ~233**: `console.log(... scene.environment ...)` references a property that no longer exists on `SceneAnalysis` (it was moved into `sceneSegments[].environment`).

**Action**: Replace `scene.environment` with `scene.sceneSegments[0]?.environment ?? 'unknown'` in that log line.

---

### Step 2: Fix Issue I1 — stale docstring

**File**: `apps/backend/src/soundscapeCompat.ts`
**Lines 14–20**: The file header comment lists `getSoundscapeThemeOptions()` as an export. This function was removed.

**Action**: Update the Exports list in the docstring to reflect current exports:
```
 *   - applySoundscapeToChapter()
 *   - resolveChapterAudioPath()
 *   - getAmbientAudioPath()
 *   - getIntroAudioPath()
 *   - startEarlyIntroGeneration()
 *   - generateAmbientBed()     ← will be added in Step 6
```

---

### Step 3: Fix Issue I2 — missing `SfxEvent` barrel export

**File**: `soundscape/src/index.ts`
**In the `// Types` export block** (around line 21–41): `SfxEvent` is not exported from the barrel even though all other soundscape types are.

**Action**: Add `SfxEvent` to the type export list from `'./types.js'`.

---

### Step 4: Fix Issue I3 — `SilenceGap` type location

**File**: `soundscape/src/types.ts`
Move the `SilenceGap` interface from `soundscape/src/subchunkSoundscape.ts` to `soundscape/src/types.ts` (next to `SfxEvent`), so both `ffmpegRunner.ts` and `subchunkSoundscape.ts` can import it from the canonical location.

**Actions**:
1. Add to `soundscape/src/types.ts`:
```typescript
/** A detected silence gap from ffmpeg silencedetect */
export interface SilenceGap {
  startSec: number;
  endSec: number;
  midpointMs: number;
}
```
2. In `soundscape/src/subchunkSoundscape.ts`: remove the `SilenceGap` interface definition, add `import type { SilenceGap } from './types.js';` and keep the re-export: `export type { SilenceGap };` (so existing consumers of subchunkSoundscape.ts don't break)
3. In `soundscape/src/ffmpegRunner.ts`: change `detectSilenceGaps` return type to use `SilenceGap` — add `import type { SilenceGap } from './types.js';` and change the return type from the inline `Promise<Array<{ startSec: number; endSec: number; midpointMs: number }>>` to `Promise<SilenceGap[]>`
4. In `soundscape/src/index.ts`: Add `SilenceGap` to the types export block from `'./types.js'`. Keep the re-export from `subchunkSoundscape.ts` as well (both resolve to the same interface).

---

### Step 5: Fix Issue I4 — skip amix when single input

**File**: `soundscape/src/ambientLayer.ts`
In `generateSubchunkAmbientTrack`, when `allMixLabels.length === 1` (1 ambient + 0 SFX), the `amix=inputs=1` filter is wasteful. 

**Action**: Before building the final `amix` line, add a conditional: if only 1 label, rename it directly to `[out]` instead of piping through amix. Example:
```typescript
if (allMixLabels.length === 1) {
  // Single stream — rename directly to output, no amix needed
  // Replace the trailing label in filterComplex from e.g. [amb0] to [out]
  filterComplex = filterComplex.replace(/\[amb0\];$/, '[out];');
  // Remove trailing semicolon
  filterComplex = filterComplex.replace(/;\s*$/, '');
} else {
  filterComplex +=
    `${allMixLabels.join('')}amix=inputs=${allMixLabels.length}:duration=first:dropout_transition=2[out]`;
}
```
Be careful with the label name — it could be `amb0` or `sfx0`. Use the actual `allMixLabels[0]` value to determine what to replace.

---

### Step 6: Remove per-subchunk ambient infrastructure

These removals must all happen. The subchunk ambient concept is replaced by Alt 4.

#### 6a. `apps/backend/src/soundscapeCompat.ts`
- **Delete** the entire `applySoundscapeToSubchunk()` function (the block starting with `// ========================================` / `// applySoundscapeToSubchunk` through the closing `}` of the function)
- **Delete** the `getSubChunkAmbientPath()` function
- **Remove** from imports: any imports that were ONLY used by `applySoundscapeToSubchunk` and `getSubChunkAmbientPath`. Check each import carefully — many are shared with `generateChapterSoundscapeFromSubchunks`. Do NOT remove shared imports.

#### 6b. `apps/backend/src/index.ts`
- **Delete** the entire `GET /api/audiobooks/:bookTitle/subchunks/:chapterIndex/:subChunkIndex/ambient` endpoint (the `app.get(...)` block around line 2999)
- **Remove** `getSubChunkAmbientPath` from the import line: `import { ..., getSubChunkAmbientPath } from './soundscapeCompat.js';`

#### 6c. `apps/pwa-v2/src/services/api.ts`
- **Delete** `getSubChunkAmbientUrl()` function
- **Delete** `isSubChunkAmbientReady()` function

#### 6d. `apps/pwa-v2/src/hooks/useProgressiveAudioPlayback.ts`
- **Delete** `loadAmbientForSubChunk` callback (the entire `useCallback` block)
- **Remove** the fire-and-forget call `loadAmbientForSubChunk(chapterIndex, subChunkIndex);` from inside `loadSubChunkAudio`
- **Remove** `getSubChunkAmbientUrl` and `isSubChunkAmbientReady` from the import line

---

### Step 7: Implement `generateAmbientBed()` in soundscapeCompat.ts

This is the core of Alt 4 — generate a chapter ambient track using **estimated duration** (no WAV needed), **ambient segments with crossfades** (from scene analysis), and **no SFX**.

**Add this exported function** in `soundscapeCompat.ts` (in the section after `startEarlyIntroGeneration`, before `applySoundscapeToChapter`):

```typescript
/**
 * Generate an ambient-bed-only OGG track for a chapter using estimated duration.
 * No silence gaps or SFX — just the ambient environment with scene crossfades.
 *
 * Used for chapter 1 during progressive TTS: the ambient bed plays alongside
 * voice subchunks. After chapter consolidation, applySoundscapeToChapter()
 * regenerates the full ambient with gap-based SFX placement.
 *
 * Duration estimation: ~150ms per character (average TTS speech rate).
 *
 * @param options.bookTitle     - Book title
 * @param options.chapterIndex  - Chapter index
 * @param options.chapterPath   - Expected chapter OGG path (used to derive ambient path)
 * @param options.chapterText   - Full chapter text (for duration estimation + segment mapping)
 * @param options.scene         - Pre-computed SceneAnalysis
 * @param options.segmentAssets - Pre-resolved per-segment ambient assets
 * @returns Path to generated ambient OGG, or null if generation failed
 */
export async function generateAmbientBed(options: {
  bookTitle: string;
  chapterIndex: number;
  chapterPath: string;
  chapterText: string;
  scene: SceneAnalysis;
  segmentAssets: Array<{ asset: SoundAsset | null; score: number }>;
}): Promise<string | null> {
```

**Implementation logic**:
1. Check `isSoundscapeEnabled()`, return null if not
2. Compute `ambientPath` using `getAmbientTrackPath(options.chapterPath)` (the private helper already in the file)
3. If `ambientPath` already exists, return it (already generated — either bed or full)
4. Estimate duration: `const estimatedDurationMs = options.chapterText.length * 150;`
5. Build `ambientSegments` array from `options.scene.sceneSegments` + `options.segmentAssets`:
   - First segment with valid asset → `{ asset, startMs: 0 }`
   - Subsequent segments: map `charIndex` proportionally to estimated duration: `startMs = Math.round((seg.charIndex / chapterText.length) * estimatedDurationMs)`
   - Skip segments where `asset` is null
6. If no ambient segments → return null
7. Call `generateSubchunkAmbientTrack(ambientSegments, estimatedDurationMs, -6, ambientPath, null)` — note: no SFX (last arg is null)
8. If result.code === 0, log success and return `ambientPath`
9. On error, log warning and return null

**Important**: This function takes `segmentAssets` as a parameter (pre-resolved by caller), NOT resolving them internally. This is the design principle established in the architectural review — ambient assets are chapter-level data, resolved once, reused everywhere.

---

### Step 8: Wire ambient bed generation into TTS pipeline

**File**: `apps/backend/src/soundscapeCompat.ts`

Add a new exported function that orchestrates the "early ambient" flow — called once per chapter as soon as chapter text is available:

```typescript
/**
 * Prepare ambient bed for a chapter during progressive TTS.
 * Runs scene analysis + asset resolution + ambient bed generation.
 * Designed to be called fire-and-forget as soon as chapter text is known.
 *
 * Caches scene analysis and resolved assets for later use by
 * applySoundscapeToChapter() (which will regenerate with full SFX).
 *
 * @returns The cached scene analysis (for passing to applySoundscapeToChapter later)
 */
export async function prepareEarlyAmbient(options: {
  bookTitle: string;
  chapterIndex: number;
  chapterPath: string;
  chapterText: string;
}): Promise<void> {
```

**Implementation logic**:
1. Check `isSoundscapeEnabled()`, return if not
2. `ensureInitialized()`
3. Build `bookInfo` from character registry (same pattern as in `applySoundscapeToChapter`)
4. Run `analyzeChapterScene()` with try/catch fallback to `buildFallbackScene()`
5. Run `resolveSceneSegmentAssets(scene.sceneSegments)` with try/catch
6. Store both in a module-level cache: `const earlyAmbientCache = new Map<string, { scene: SceneAnalysis; segmentAssets: ... }>();` keyed by `${bookTitle}:${chapterIndex}`
7. Call `generateAmbientBed({ ..., scene, segmentAssets })`
8. Log result

**Then in `applySoundscapeToChapter()`**: Before running scene analysis, check the cache. If a cached scene exists for this chapter, reuse it (and the resolved segment assets) instead of re-running the LLM + embeddings.

**Important**: `applySoundscapeToChapter` must **delete the existing ambient bed file** before regenerating with full SFX. The bed file occupies the same path (`_ambient.ogg`) that the full version will write to. Add `if (fs.existsSync(ambientPath)) fs.unlinkSync(ambientPath);` before the generation block.

---

### Step 9: Call `prepareEarlyAmbient` from the TTS pipeline

**File**: `apps/backend/src/tempChunkManager.ts` or wherever chapter TTS generation begins.

Find the point where chapter text is first available and TTS subchunk generation is about to start. Add a fire-and-forget call:

```typescript
// Fire-and-forget: prepare ambient bed for progressive playback
prepareEarlyAmbient({
  bookTitle,
  chapterIndex,
  chapterPath: getChapterPath(bookTitle, chapterIndex),
  chapterText,
}).catch(err => console.warn('⚠️ Early ambient prep failed (non-critical):', err));
```

Import `prepareEarlyAmbient` from `'./soundscapeCompat.js'`.

**Critical**: This must be non-blocking (fire-and-forget with `.catch()`). It must NOT delay TTS generation.

---

### Step 10: PWA toast notification

**File**: `apps/pwa-v2/src/hooks/useProgressiveAudioPlayback.ts`

When progressive playback starts for a chapter that doesn't have its full ambient ready yet, show a brief toast.

**Implementation**: In the existing `loadSubChunkAudio` function, after the voice source is set and before play:
1. Check `isAmbientReady(bookTitle, chapterIndex)` — if ambient is NOT ready, trigger a toast
2. The toast text: `"✨ Creating your soundscape..."`
3. Auto-dismiss after 5 seconds
4. Use whatever toast/notification mechanism already exists in the PWA (check for existing toast components or Zustand notification state). If none exists, a simple state variable + CSS transition is sufficient. Do NOT install a toast library.
5. Show this toast only once per chapter (track shown chapters in a `useRef<Set<number>>`)

---

### Step 11: Ambient hot-swap during progressive playback

**File**: `apps/pwa-v2/src/hooks/useProgressiveAudioPlayback.ts`

Extend the existing chapter readiness polling (the `useEffect` that runs `checkChapterReadiness` every 3 seconds) to also check for ambient availability:

**Implementation**: Inside the same polling interval (or a parallel one):
1. If `playbackMode === 'progressive'` and `currentSubChunk` exists:
   - Call `isAmbientReady(bookTitle, currentSubChunk.chapterIndex)`
   - If ready AND `ambientRef.current.src` does NOT already point to the chapter ambient URL:
     - Set `ambientRef.current.src = getChapterAmbientUrl(bookTitle, chapterIndex)`
     - Sync time: `ambientRef.current.currentTime = audioRef.current.currentTime`
     - If voice is playing and ambient is enabled: `ambientRef.current.play()`
     - Log: `console.log('🔊 Ambient upgraded to full soundscape')`
2. This naturally stops polling once the ambient is loaded (the URL check prevents re-loading)

**Important**: The hot-swap replaces the ambient bed with the full ambient+SFX version. The chapter-level ambient URL is the same in both cases (`/chapters/:chapterIndex/ambient`). The backend serves whatever file exists at the `_ambient.ogg` path — first the bed, then the full version after `applySoundscapeToChapter` regenerates it.

---

### Step 12: Verify — 0 TypeScript errors

Run error check on all modified files:
- `soundscape/src/types.ts`
- `soundscape/src/ffmpegRunner.ts`
- `soundscape/src/subchunkSoundscape.ts`
- `soundscape/src/ambientLayer.ts`
- `soundscape/src/index.ts`
- `apps/backend/src/soundscapeCompat.ts`
- `apps/backend/src/index.ts`
- `apps/pwa-v2/src/services/api.ts`
- `apps/pwa-v2/src/hooks/useProgressiveAudioPlayback.ts`

All must show 0 errors.

---

## What NOT to do

- **Do NOT** add new npm dependencies
- **Do NOT** change any UI layout, styling, or design
- **Do NOT** modify TTS generation logic, chunking, or voice pipeline
- **Do NOT** change the LLM Director prompt or scene analysis format
- **Do NOT** add new API endpoints beyond what is specified (the subchunk ambient endpoint is being REMOVED, not replaced)
- **Do NOT** modify `generateChapterSoundscapeFromSubchunks` — it remains the full-quality path for chapters 2+
- **Do NOT** refactor or rename existing functions unless this handoff explicitly says to
- **Do NOT** create documentation files summarizing your changes

## Files modified (expected)

| File | Changes |
|------|---------|
| `soundscape/src/types.ts` | Add `SilenceGap` interface, add `SfxEvent` if not already exported properly |
| `soundscape/src/ffmpegRunner.ts` | Import + use `SilenceGap` type |
| `soundscape/src/subchunkSoundscape.ts` | Remove `SilenceGap` definition, import from types |
| `soundscape/src/ambientLayer.ts` | Skip amix for single-input case |
| `soundscape/src/index.ts` | Add `SfxEvent`, `SilenceGap` to type exports |
| `apps/backend/src/soundscapeCompat.ts` | Fix B1, fix I1, delete subchunk ambient funcs, add `generateAmbientBed`, add `prepareEarlyAmbient`, cache logic in `applySoundscapeToChapter` |
| `apps/backend/src/index.ts` | Remove subchunk ambient endpoint + import |
| `apps/backend/src/tempChunkManager.ts` | Add `prepareEarlyAmbient` call |
| `apps/pwa-v2/src/services/api.ts` | Remove subchunk ambient functions |
| `apps/pwa-v2/src/hooks/useProgressiveAudioPlayback.ts` | Remove subchunk ambient loading, add toast trigger, add ambient hot-swap poll |

## Quality improvements to apply (from review)

Apply these small improvements during implementation where they naturally fit:

- **L1** (if encountered): In `ambientLayer.ts`, if `loudnorm` is on the ambient/SFX filter chains, replace with simple `volume` correction using catalog `loudnessLUFS` where available. Fall back to `volume=0dB` for assets without LUFS data. *Only do this if you see `loudnorm` in the filter_complex construction.*
- **Q1**: When building `ambientSegments` arrays (in both `generateAmbientBed` and `generateChapterSoundscapeFromSubchunks`), skip pushing a new segment if its `asset.filePath` equals the previous segment's — avoids dip-and-return crossfade artifact on same-asset transitions.
- **Q2**: In `buildPlacedSfxEvents` Phase 3, after building the `placed` array but before the final sort, add a 2-second minimum spacing filter: iterate sorted by offsetMs, drop any event within 2000ms of the previous kept event.
- **Q3**: In `generateAmbientBed`, use intensity-adjusted volume: `const volumeDb = -6 - (1 - scene.intensity) * 3;` instead of hardcoded -6.
- **Q4**: After every `detectSilenceGaps()` call in `soundscapeCompat.ts`, filter out gaps shorter than 200ms: `gaps = gaps.filter(g => (g.endSec - g.startSec) >= 0.2);`
