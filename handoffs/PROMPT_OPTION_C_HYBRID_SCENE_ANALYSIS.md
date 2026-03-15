# Deterministic Scene Analysis Pipeline — Implementation Prompt

## Status

- **Branch**: `feature/hybrid-scene-analysis` (branched from `feature/soundscape-refactor` at `48db1e34`)
- **Prerequisites**: All completed on `feature/soundscape-refactor`:
  - ✅ G1-A: Scene analysis freeze mechanism (`9b125178`)
  - ✅ G1-B: LUFS normalization (`2e2fc4d2`)
  - ✅ Eval LUFS fix + `_ambient` → `_soundscape` rename (`5e4c9ace`)
  - ✅ Eval spike detection parsing fix (`2f6560ed`)
- **Baseline score**: 61.8/100 (Ch1=76.8, Ch2=46.9) — with frozen scenes, no cherry-picking
- **Option B (prompt engineering)**: Skipped — effort wasted since LLM is eliminated entirely

---

## Context & Motivation

### The Problem

The current soundscape pipeline uses an LLM (Gemini 2.5 Flash) to analyze chapter text and produce a `SceneAnalysis` JSON containing:
- Scene segments (1–6 per chapter) with environment descriptions and English search queries (`searchSnippets`)
- SFX events with character offsets and English search queries
- Metadata (time of day, weather, moods, intensity)

The LLM generates **English search snippets** (e.g., `"quiet forest at dusk with distant owl hooting"`) which are separately embedded and cosine-matched against the pre-embedded asset catalog.

**Critical issues with this approach:**
1. **Extreme non-determinism** — Identical inputs produce wildly different outputs across runs (Ch1: 6 segments/12 SFX vs Ch2: 1 segment/0 SFX for similar-quality text)
2. **Unnecessary LLM intermediary** — The LLM "translates" raw text into English search snippets, then those snippets are embedded. This adds hallucination risk, latency (2-5s), and cost, while the embedding model (`text-embedding-004`) is already multilingual and matches raw text directly
3. **Metadata waste** — `timeOfDay`, `weather`, `moods` are **never consumed** downstream. `intensity` adjusts ambient volume by 0-3 dB — negligible vs LUFS normalization
4. **Every function the LLM performs can be replaced** with deterministic code + embeddings (proven by analysis of all downstream consumers)

### The Solution: Deterministic 2-Layer Pipeline (No LLM)

Replace the monolithic LLM scene analysis with a fully deterministic pipeline:

```
Layer 1: DETERMINISTIC ANALYSIS (code + embedding API, 100% reproducible)

  Step 1: Text splitting (rule-based, sync)
    → Sentences (split on .!?) with char offsets
    → Paragraph boundaries (split on \n\n)
    → No sub-sentence fragmentation (language-agnostic, see Decision #2)

  Step 2: Segment detection (rule-based, sync)
    → Segment boundaries at paragraph breaks
    → Min 2 segments for chapters > 2000 chars, max 6
    → Segment boundaries ARE ambience start/end points

  Step 2b: Multi-scale embedding (embedding API, concurrent calls)
    → Embed at 2 granularities: individual sentences (N) + consecutive 2-sentence pairs (N-1)
    → Total texts: 2N-1, all processed via shared worker pool (concurrency=5)
    → Vectors reused by BOTH Step 3 (ambient) and Step 4 (SFX)
    → No redundant re-embedding; runs parallel to voice dramatization+TTS

  Step 3: Ambient matching (in-memory cosine, deterministic)
    → Reuse embeddings from shared Step 2b
    → Match BOTH individual sentences AND 2-sentence pairs against ambient catalog
    → Best-scoring text (single or pair) per segment → determines ambient asset + environment label
    → Multi-scale captures both single-sentence and multi-sentence scenery descriptions

  Step 4: SFX matching (in-memory cosine, deterministic)
    → Reuse individual sentence embeddings from Step 2b (NOT pairs)
    → Match each sentence against SFX catalog (in-memory, <1ms each)
    → Keep SFX matches ≥ 0.72 threshold (max 1 SFX per sentence)
    → charIndex = sentence start offset (exact, from text splitting)
    → Multi-SFX sentences: embedding blends → dominant sound wins naturally

  Step 5: Assemble SceneAnalysis
    → Populate interface with defaults for unused metadata fields
    → Output identical SceneAnalysis interface as today

  Output: SceneAnalysis (same interface — all downstream code unchanged)

Layer 2: VALIDATION (code, sync, lightweight)
  → Min segment count, min SFX count, dedup, bounds check
  → If 0 SFX found: lower threshold to 0.65 and retry matching
  → Guaranteed quality floor (no LLM fallback needed — deterministic input)
```

### Key Architectural Decisions

**1. LLM Completely Eliminated**

Every function the LLM performed has a deterministic replacement:

| LLM Function | Replacement | Why LLM is unnecessary |
|---|---|---|
| Segment boundaries | Paragraph-break analysis (Layer 1, Step 2) | Structural, not semantic |
| Environment labels | Top ambient asset description (Layer 1, Step 3) | Embedding match is direct |
| Ambient asset matching | Per-sentence embedding vs catalog, best per segment (Layer 1, Step 3) | `text-embedding-004` is multilingual — no translation needed |
| SFX identification | Whole sentence embedding vs SFX catalog (Layer 1, Step 4) | Cosine match finds sound-producing text; max 1 SFX per sentence |
| SFX charIndex | Sentence char offset — known from splitting (Layer 1, Step 1) | Text position is structural data |
| SFX query string | Eliminated — direct sentence embedding replaces it | No intermediary needed |
| intensity | Fixed 0.7 (only adjusts volume by 0-3 dB, negligible vs LUFS normalization) | Not worth any computation |
| timeOfDay, weather, moods | Fixed defaults (`'unknown'`, `'none'`, `[]`) | **Never consumed downstream** — verified |

**2. Sentence-Level SFX Matching (No Sub-Sentence Fragmentation)**

Fragment splitting (on `, and `, `, but `, `; `, etc.) was considered and rejected for two reasons:

1. **Language dependency** — English uses `, and ` but Czech uses `, a `, Slovak `, a ` / `, ale `. Punctuation-only splitting (`, `) is too aggressive: Czech prose uses commas heavily for subordinate clauses (*"Muž, který stál u okna, se otočil"*) creating noisy non-sound fragments.

2. **Audio quality** — Two SFX events within one sentence (2-5 seconds of speech) sound artificial. Professional audiobooks never layer multiple one-shot SFX in rapid succession without careful manual mixing. Our automated pipeline cannot achieve that precision.

**Solution**: Embed whole sentences against the SFX catalog. For multi-SFX sentences like *"Lightning cracked across the sky and thunder rumbled"*, the embedding vector blends both concepts but still scores ~0.78 against the dominant SFX asset — above the 0.72 threshold. The pipeline picks the **strongest single match** naturally. One SFX per sentence maximum.

**When it fails**: Sentences with 4+ sound references (*"Birds sang, rain fell, thunder crashed, and horses galloped"*) produce diffuse embeddings → score drops below threshold → no SFX. This is acceptable — adding noisy SFX to such dense sentences would be worse than silence.

**3. Multi-Scale Embedding for Ambient, Sentence-Level for SFX**

Step 2b embeds texts at **two granularities** into ONE shared pool:
- **Individual sentences** (N texts): Each sentence embedded separately (~80 chars avg)
- **Consecutive 2-sentence pairs** (N-1 texts): Each pair of adjacent sentences concatenated and embedded (~160 chars avg)
- **Total**: 2N-1 texts embedded via shared worker pool (concurrency=5)

**Why multi-scale?** Catalog descriptions average ~139 chars. 77% are 1-sentence, but 22% are 2+ sentences (4,917 entries). Single sentences (~80 chars) capture specific sounds well but may miss broader scenery. 2-sentence pairs (~160 chars) better match multi-sentence catalog descriptions. Both granularities compete — best score wins.

**Ambient matching**: Match BOTH individual sentences AND 2-sentence pairs against ambient catalog → best-scoring text per segment determines ambient asset. This captures both *"A fire crackled in the hearth."* (single) and *"The wind howled outside. Rain lashed against the glass."* (pair) equally well.

**SFX matching**: Uses ONLY individual sentence embeddings — SFX assets are short, specific sounds that match single sentences. Pairs would dilute SFX signal.

**4. Embedding Reuse & Early-Start Optimization**

The current pipeline embeds twice: LLM generates searchSnippets → embed → match. The new pipeline embeds once: all texts (sentences + pairs) → embed (Step 2b) → match against both ambient and SFX catalogs via in-memory cosine. The multilingual embedding model (`gemini-embedding-001`) natively maps Czech/Slovak/English text to the same semantic space as English catalog descriptions.

**Early-start optimization**: The entire Option C pipeline starts immediately after raw chapter text is available — **parallel to voice dramatization and TTS generation**. Since Option C operates on raw text (not dramatized text), it doesn't need to wait for the LLM dramatization step. The soundscape map is ready before the first voice subchunk finishes TTS.

**Net effect**: LLM call eliminated, ~3-7s of embedding runs hidden behind the ~15-25s voice TTS pipeline. **100% deterministic** (same input → always same output). Zero added latency to user's time-to-first-listen.

**5. Segment Boundaries = Ambience Boundaries**

Layer 1, Step 2 places segment boundaries at paragraph breaks. These charIndex values ARE the ambience start/end points. The existing mixing code in `soundscapeCompat.ts` already uses `(seg.charIndex / chapterText.length) * estimatedDurationMs` for proportional timing. No change needed downstream.

**6. Silence Gap Detection Unchanged**

FFmpeg silence gap detection (`detectSilenceGaps()`) remains in the mixing layer (`subchunkSoundscape.ts`). The new pipeline only replaces how we analyze text → `SceneAnalysis` JSON. Everything downstream (silence gaps, SFX timing, crossfading, LUFS normalization) stays unchanged.

---

## Repository Structure (Relevant Files)

```
soundscape/src/
├── llmDirector.ts        # KEEP (buildFallbackScene only, analyzeChapterScene deprecated)
├── assetResolver.ts      # MODIFY: Add resolveAmbientAssetFromVector(), keep resolveSfxEvents()
├── embeddings.ts         # MINOR: Export embedTexts() (currently private)
├── types.ts              # NO CHANGE (SceneAnalysis interface preserved exactly)
├── config.ts             # MINOR: Add text splitting constants
├── subchunkSoundscape.ts # NO CHANGE (consumes SceneAnalysis — interface stays same)
├── ambientLayer.ts       # NO CHANGE (consumes resolved assets — interface stays same)
├── catalogLoader.ts      # NO CHANGE
├── ffmpegRunner.ts       # NO CHANGE
├── introGenerator.ts     # NO CHANGE
├── musicSelector.ts      # NO CHANGE
└── index.ts              # NO CHANGE (public API)

apps/backend/src/
├── soundscapeCompat.ts   # MODIFY: Wire new pipeline, early-start before dramatization
└── index.ts              # MODIFY: Move prepareEarlyAmbient() launch before dramatization

NEW FILES:
├── soundscape/src/textSplitter.ts              # Step 1: Paragraph + sentence splitting
├── soundscape/src/deterministicAnalyzer.ts     # Steps 2-5: Full deterministic pipeline
├── soundscape/src/sceneValidator.ts            # Layer 2: Lightweight validation
```

---

## Detailed Implementation Spec

### NEW FILE: `soundscape/src/textSplitter.ts` — Step 1

**Purpose**: Pure deterministic text splitting into paragraphs and sentences with character offsets. 100% language-agnostic (operates on punctuation and whitespace structure). No sub-sentence fragmentation — sentences are the smallest unit for SFX matching.

```typescript
export interface TextSplitResult {
  /** All paragraphs with char offsets */
  paragraphs: Array<{ text: string; charIndex: number; charEnd: number }>;
  /** All sentences with char offsets — used for both ambient matching and SFX matching */
  sentences: Array<{ text: string; charIndex: number; charEnd: number; paragraphIndex: number }>;
}

/**
 * Split chapter text into paragraphs and sentences.
 * Pure synchronous function, language-agnostic.
 * Sentences are the smallest unit — no sub-sentence fragmentation.
 */
export function splitText(chapterText: string): TextSplitResult;
```

**Implementation requirements:**

1. **Paragraph splitting**: Split on `\n\n` (or `\r\n\r\n`). Trim whitespace. Track char offsets.

2. **Sentence splitting**: Within each paragraph, split on sentence-ending punctuation:
   - Primary delimiters: `. `, `! `, `? ` (period/exclamation/question followed by space)
   - Handle edge cases: abbreviations (Mr., Dr., etc.), ellipsis (`...`), quotes ending sentences
   - Keep dialogue quotes with their sentence
   - Minimum sentence length: 10 chars (merge shorter with preceding sentence)

**Critical constraints:**
- NO sub-sentence fragmentation (no clause/comma splitting — language-dependent and produces noisy results)
- NO language-specific keywords or dictionaries
- NO imports of any external NLP library
- Must be synchronous (no async, no API calls)
- Must be pure function (no side effects, no state)
- Handles empty text, single paragraph, no punctuation gracefully

### NEW FILE: `soundscape/src/deterministicAnalyzer.ts` — Steps 2-5

**Purpose**: The main analysis pipeline. Takes split text + embedding indexes and produces a complete `SceneAnalysis` without any LLM calls.

```typescript
import type { SceneAnalysis } from './types.js';
import type { TextSplitResult } from './textSplitter.js';
import type { EmbeddingIndex } from './types.js';

export interface AnalyzerOptions {
  chapterIndex: number;
  chapterText: string;
  splitResult: TextSplitResult;
  ambientIndex: EmbeddingIndex;
  sfxIndex: EmbeddingIndex;
  /** Cosine similarity threshold for SFX matches (default: 0.72) */
  sfxThreshold?: number;
  /** Cosine similarity threshold for ambient matches (default: 0.65) */
  ambientThreshold?: number;
  /** Minimum SFX count — if not met, retry at lower threshold (default: 3) */
  minSfxCount?: number;
}

/**
 * Deterministic scene analysis — no LLM, 100% reproducible.
 * Produces a SceneAnalysis identical in interface to the LLM-based version.
 * SFX matching is sentence-level (max 1 SFX per sentence, dominant sound wins).
 * Step 2b (embedding) is the only async operation — Steps 3-4 are in-memory cosine.
 */
export async function analyzeSceneDeterministic(
  options: AnalyzerOptions
): Promise<SceneAnalysis>;
```

**Step 2: Segment detection** (sync, within the function):

1. Compute segment count: `Math.max(2, Math.min(6, Math.ceil(chapterText.length / 3000)))` — at least 2 for non-trivial chapters
2. Place boundaries at paragraph breaks nearest to equal-length splits:
   - Divide total char length by segment count → ideal split points
   - For each split point, find the nearest paragraph boundary (from `splitResult.paragraphs`)
   - Ensure no two segments share the same boundary (minimum 1 paragraph per segment)
3. First segment always starts at charIndex 0

**Step 2b: Multi-scale embedding** (async, concurrent embedding API calls):

1. Collect all individual sentence texts from `splitResult.sentences` (N texts)
2. Build consecutive 2-sentence pairs: for each sentence[i] and sentence[i+1] within the same paragraph, concatenate with space separator (N-1 texts)
3. Call `embedTexts([...sentences, ...pairs])` — processes 2N-1 texts via shared worker pool (concurrency=5)
4. Store the resulting vectors: first N vectors parallel to sentences, remaining N-1 vectors parallel to pairs
5. **Ambient matching** (Step 3) uses BOTH sentence and pair vectors
6. **SFX matching** (Step 4) uses ONLY individual sentence vectors

**Cross-paragraph pairs**: Do NOT create pairs that span paragraph boundaries — they would blend unrelated scenes.

**Step 3: Ambient matching** (sync, in-memory cosine):

1. For each segment, identify which sentences AND 2-sentence pairs fall within that segment's char range
2. For each text (sentence or pair), match its pre-computed embedding vector against the ambient index using `searchEmbeddingsWithVector()` — top-1 result per text
3. The **best-scoring text** (sentence or pair) across the segment determines the ambient asset:
   - `environment` label: the winning ambient asset's description (truncate to first 60 chars if longer)
   - `searchSnippets` field: the winning text's content (for backward compatibility with `resolveSceneSegmentAssets()` which re-embeds searchSnippets)
4. Store the winning text's embedding vector for reuse by `resolveAmbientAssetFromVector()` (avoids re-embedding)
5. If no text in the segment scores ≥ `ambientThreshold` (0.65): use the highest-scoring one anyway (every segment needs ambient — silence is worse than a weak match)

**Step 4: SFX matching** (sync, in-memory cosine — reuses embeddings from Step 2b):

1. For each sentence, match its pre-computed embedding vector against the SFX index using `searchEmbeddingsWithVector()` — top-1 result per sentence
2. Filter: keep only matches where `score >= sfxThreshold` (default 0.72)
3. For each qualifying match, create an `SfxEvent`:
   - `query`: the sentence's raw text (used for downstream SFX asset resolution via `resolveSfxEvents()`)
   - `charIndex`: the sentence's `charIndex` (exact, from text splitting)
   - `description`: the matching SFX asset's description
4. **Max 1 SFX per sentence** — multi-SFX sentences produce a blended embedding that naturally picks the dominant sound. This is by design: rapid successive SFX within one sentence sounds artificial.
5. **Threshold retry**: if total `sfxEvents.length < minSfxCount`, lower threshold from 0.72 to 0.65 and re-filter (same embeddings, no re-computation)

**Step 5: Assemble SceneAnalysis** (sync):

```typescript
const sceneAnalysis: SceneAnalysis = {
  chapterIndex: options.chapterIndex,
  timeOfDay: 'unknown',     // NOT consumed downstream
  weather: 'none',           // NOT consumed downstream
  moods: [],                 // NOT consumed downstream
  soundElements: [],         // NOT consumed downstream
  intensity: 0.7,            // Fixed — only adjusts volume by -0.9 dB
  sceneSegments,             // From Steps 2+3
  sfxEvents,                 // From Step 4
};
```

### NEW FILE: `soundscape/src/sceneValidator.ts` — Layer 2

**Purpose**: Lightweight validation and auto-correction. Since the pipeline is fully deterministic (no LLM), validation mainly handles edge cases and enforces minimums.

```typescript
import type { SceneAnalysis } from './types.js';

export interface ValidationResult {
  valid: boolean;
  corrections: string[];  // Human-readable list of corrections applied
  scene: SceneAnalysis;   // Corrected scene (same as input if valid)
}

/**
 * Validate and auto-correct a SceneAnalysis.
 * Since the pipeline is deterministic, this is a lightweight sanity check.
 */
export function validateScene(
  scene: SceneAnalysis,
  chapterTextLength: number,
  minSegments: number,
  minSfxCount: number
): ValidationResult;
```

**Validation rules:**
1. `sceneSegments.length >= minSegments` — if too few, add segments at equal intervals
2. `sceneSegments[0].charIndex === 0` — force to 0 if not
3. All `charIndex` values strictly increasing and within `[0, chapterTextLength)` — clamp out-of-bounds
4. No duplicate SFX at same charIndex (within ±200 chars — sentence-level dedup) — deduplicate, keep higher score
5. If `sfxEvents.length < minSfxCount` — **do NOT silently fail**: log a note, return what we have (the threshold can be lowered and retried by the caller)

**Auto-correction** (fix rather than reject):
- Clamp out-of-bounds charIndexes to valid range
- Deduplicate SFX events
- Ensure first segment charIndex = 0
- Sort segments and SFX by charIndex ascending

**Retry logic** (in the caller, `deterministicAnalyzer.ts`):
- If SFX count < minSfxCount after Step 4: lower threshold from 0.72 to 0.65 and retry SFX matching
- This is deterministic — same result every time, no LLM retry randomness

### MODIFIED FILE: `soundscape/src/assetResolver.ts`

**Add one new function** for resolving ambient assets from pre-computed embedding vectors:

```typescript
/**
 * Resolve the best matching ambient asset using a pre-computed embedding vector.
 * Avoids re-embedding — uses the vector already computed by deterministicAnalyzer.
 *
 * @param embeddingVector - Pre-computed embedding vector for the segment text
 * @param logContext - Human-readable label for log messages
 * @param topK - Candidates to consider
 * @returns Best matching SoundAsset with score, or null if nothing suitable
 */
export async function resolveAmbientAssetFromVector(
  embeddingVector: number[],
  logContext: string = 'unknown',
  topK: number = 5
): Promise<{ asset: SoundAsset; score: number } | null>;
```

This uses `searchEmbeddingsWithVector()` (already exists in `embeddings.ts`) — pure in-memory cosine similarity, no API calls, <1ms.

**`resolveAmbientAsset()` (existing)**: Keep unchanged — used when embedding vector is not pre-computed.

**`resolveSfxEvents()` (existing)**: The `query` field will contain raw sentence text instead of LLM-generated English queries. The multilingual embedding model handles this natively. **The function itself needs no code change** — it embeds the query strings and matches against the SFX index. Note: `resolveSfxEvents()` internally re-embeds `query` via `searchEmbeddingsBatch()` — this is a second embedding of the same text (first in Step 2b, second here). This redundancy is acceptable (<50ms per sentence, <5 sentences typically qualify as SFX) and avoids changing the `SfxEvent` interface to carry pre-computed vectors.

### MODIFIED FILE: `soundscape/src/embeddings.ts`

**Changes**:

1. Export `embedTexts()` which is currently private:
```typescript
// Currently: async function embedTexts(texts: string[]): Promise<number[][]>
// Change to: export async function embedTexts(texts: string[]): Promise<number[][]>
```

2. ✅ **Already done**: Removed hardcoded 50ms rate-limiting delays from both `buildEmbeddingIndex()` and `searchEmbeddingsBatch()` worker loops. With measured API latency of ~467ms per call, the artificial delays were unnecessary — `EMBEDDING_CONCURRENCY=5` already caps parallelism.

No other changes. All other functions already have the right exports.

### NOT MODIFIED: `soundscape/src/types.ts`

The `SceneAnalysis` interface is **NOT changed**. The new pipeline produces identical output. No new types need to be added to this file — all new types are defined in their own modules (`textSplitter.ts`, `deterministicAnalyzer.ts`, `sceneValidator.ts`).

### MODIFIED FILE: `apps/backend/src/soundscapeCompat.ts`

**Wire the new pipeline** in both `prepareEarlyAmbient()` and `applySoundscapeToChapter()`:

**Current flow:**
```
loadFrozenSceneAnalysis() || analyzeChapterScene() → resolveSceneSegmentAssets() → ambient/SFX
```

**New flow (early-start — parallel to dramatization+TTS):**
```
loadFrozenSceneAnalysis() || {
  splitText()                      → Step 1 (sync, <1ms)
  analyzeSceneDeterministic()      → Steps 2-5 (async, ~3-7s embedding calls)
  validateScene()                  → Layer 2 (sync, <1ms)
} → resolveAmbientAssetFromVector() + resolveSfxEvents() → ambient/SFX
```

**Early-start optimization**: The Option C pipeline (`prepareEarlyAmbient`) is launched as fire-and-forget immediately after raw chapter text is available — **before** voice dramatization starts. Since Option C operates on raw (undramatized) text, it doesn't depend on the dramatization LLM output. This means the entire soundscape map computation runs hidden behind the voice pipeline:

```
  Chapter text ready
       │
       ├──► Option C pipeline (fire-and-forget)     ← STARTS HERE (parallel)
       │      splitText() → embed 2N-1 texts → match → SceneAnalysis
       │      Total: ~3-7s (hidden behind voice pipeline)
       │
       ├──► Voice dramatization (LLM)               ← ALSO STARTS HERE
       │      ~2-5s
       │      │
       │      └──► chunkForTwoSpeakers() → TTS generation
       │             subchunk[0]: ~5s (first-listen gate)
       │             subchunk[1..N]: batches of 3 × ~5s
       │             Total voice: ~15-25s
       │
       └──► Option C result ready (~3-7s)  ✓ DONE before first subchunk
```

**Key changes:**
1. Import new modules: `splitText`, `analyzeSceneDeterministic`, `validateScene`
2. Replace `analyzeChapterScene()` calls with the new pipeline
3. Move `prepareEarlyAmbient()` launch point earlier — right after raw text extraction, before dramatization
4. Pass pre-computed embedding vectors to asset resolution
5. Keep `loadFrozenSceneAnalysis()` unchanged (G1-A freeze still works — bypasses entire pipeline)
6. Keep `buildFallbackScene()` as ultimate fallback (existing, no LLM)

The `intensity` field is now fixed at 0.7, so the volume adjustment `0 - (1 - 0.7) * 3 = -0.9 dB` is effectively constant. The LUFS normalization (G1-B) handles real volume balancing.

---

## Testing & Evaluation Strategy

### Unit Tests (vitest)

1. **Text splitter tests** (`textSplitter.test.ts`):
   - English text: verify paragraph and sentence splitting with correct char offsets
   - Czech text: verify SAME structural splitting (language-agnostic proof — punctuation-based)
   - Edge cases: no punctuation, single sentence, empty text, dialogue-heavy text
   - Char offset accuracy: sentence.charIndex must match actual position in original text
   - No sub-sentence output: verify only paragraphs and sentences are returned

2. **Deterministic analyzer tests** (`deterministicAnalyzer.test.ts`):
   - Verify segment count formula (short text → 2, long text → 6)
   - Verify segment boundaries fall on paragraph breaks
   - Verify output conforms to `SceneAnalysis` interface exactly
   - **Determinism proof**: run 3x with same input → identical output every time

3. **Validator tests** (`sceneValidator.test.ts`):
   - Valid input → no corrections
   - Out-of-bounds charIndex → clamped
   - Duplicate SFX → deduplicated
   - Missing first segment at 0 → auto-corrected

### Integration Test

Use the existing `soundscape_test_story` with 2 chapters:
1. Run new pipeline on both chapters (unfrozen — to test the deterministic pipeline itself)
2. Verify output `SceneAnalysis` has ≥2 segments and ≥3 SFX per chapter
3. **Determinism proof**: Run 5x → identical scene JSON every time (this was impossible with LLM)
4. Compare output quality against the frozen LLM-generated `scene_analysis_chapter_1.json` (Ch1, good quality)

### Gate Evaluation

Use existing `scripts/soundscape_eval/evaluate.py` — the 7-criteria eval system:

- `ambientOccurrence` — should **IMPROVE** (deterministic segment count ≥ 2, no more 1-segment chapters)
- `sfxOccurrence` — should **IMPROVE** (minSfxCount floor ≥ 3, no more 0-SFX chapters)
- `ambientSimilarity` — should be **COMPARABLE or BETTER** (direct text→catalog embedding vs LLM intermediary)
- `sfxSimilarity` — **key metric to watch**: raw sentences vs LLM-generated English queries. May be slightly different. The multilingual embedding model should handle this well.
- `ambientCoverage` — unchanged (depends on FFmpeg mixing duration, not scene analysis)
- `ambientVolume` — unchanged (depends on LUFS normalization, not scene analysis)
- `sfxAudibility` — unchanged (depends on mixing spike detection, not scene analysis)

**Expected score improvement**: Primarily from Ch2 consistency — no more 1-segment/0-SFX chapters. Ch1 should maintain similar quality. Target: **70+** total score (from 61.8 baseline).

---

## Implementation Order

1. **Text splitter** (`textSplitter.ts`) — pure sync code, with unit tests
2. **Deterministic analyzer** (`deterministicAnalyzer.ts`) — main pipeline, depends on embeddings.ts + textSplitter.ts
3. **Validator** (`sceneValidator.ts`) — lightweight validation, with unit tests
4. **Export embedTexts** (`embeddings.ts`) — one-line change
5. **Asset resolver addition** (`assetResolver.ts`) — add `resolveAmbientAssetFromVector()`
6. **Bridge** (`soundscapeCompat.ts`) — wire the new pipeline, replace `analyzeChapterScene()` calls
7. **Integration test** — run against soundscape_test_story, verify determinism
8. **Gate evaluation** — run eval, compare against 61.8 baseline

---

## Constraints & Rules

1. **DO NOT change the `SceneAnalysis` output interface** — downstream consumers depend on it
2. **DO NOT remove the frozen scene analysis mechanism** — `loadFrozenSceneAnalysis()` must continue to work
3. **DO NOT add any new npm dependencies** — use existing embedding infrastructure
4. **DO NOT modify `embeddings.ts` API surface** — only export `embedTexts()` (currently private)
5. **DO NOT remove `llmDirector.ts`** — keep `buildFallbackScene()` as ultimate fallback; `analyzeChapterScene()` can remain but is no longer called from the main pipeline
6. **All text splitting code must be pure synchronous functions** — no async, no API calls, no side effects
7. **Follow existing code patterns** — same error handling, same `console.log` emoji prefixes, same TypeScript style
8. **This is a commercial codebase** — production-quality error handling, no shortcuts
9. **Embedding calls use existing infrastructure** — `embedTexts()`, `searchEmbeddingsWithVector()`, `ensureAmbientEmbeddingIndex()`, `ensureSfxEmbeddingIndex()`
10. **Sentence-level SFX matching**: max 1 SFX per sentence, threshold starts at 0.72 (same as current `resolveSfxEvents()` line 402), retries at 0.65 if below minSfxCount

---

## Current Codebase Reference

### Embedding infrastructure (DO NOT REBUILD — reuse):
- `embeddings.ts`: `embedTexts()` (MAKE PUBLIC), `searchEmbeddingsWithVector()`, `searchEmbeddingsBatch()`, `buildEmbeddingIndex()`, `cosineSimilarity()` (private)
- Config: `EMBEDDING_MODEL = 'gemini-embedding-001'`, `EMBEDDING_DIMENSIONS = 768`, `EMBEDDING_BATCH_SIZE = 1` (API only supports 1 text per request), `EMBEDDING_CONCURRENCY = 5`
- Pre-built indexes on disk: `soundscape/assets/ambient_embeddings.json` (22,457 entries), `sfx_embeddings.json` (2,596 entries)
- ✅ Hardcoded 50ms worker-loop delays removed (unnecessary with ~467ms natural API latency)

### LLM infrastructure (DEPRECATED for scene analysis):
- `llmDirector.ts`: `analyzeChapterScene()` — no longer called from main pipeline
- `llmDirector.ts`: `buildFallbackScene()` — kept as ultimate fallback
- Config: `SCENE_ANALYSIS_MODEL = 'gemini-2.5-flash'`

### Pipeline integration (MODIFY — rewire):
- `soundscapeCompat.ts`: `prepareEarlyAmbient()` calls `analyzeChapterScene()` → replace with `analyzeSceneDeterministic()`
- `soundscapeCompat.ts`: Move `prepareEarlyAmbient()` launch point to fire immediately after raw chapter text is available — **before** voice dramatization — since Option C operates on raw text
- `soundscapeCompat.ts`: `applySoundscapeToChapter()` checks `earlyAmbientCache` → same, but fallback uses new pipeline
- `soundscapeCompat.ts`: `loadFrozenSceneAnalysis()` — UNCHANGED (G1-A freeze still works)

### Downstream consumers (NO CHANGES — interface preserved):
- `subchunkSoundscape.ts`: `mapSfxEventsToSubchunks()` — uses `sfxEvent.charIndex` (same field, same values)
- `subchunkSoundscape.ts`: `calculateSfxOffsetFromGaps()` — uses proportional charIndex mapping (unchanged)
- `soundscapeCompat.ts`: ambient segment mixing — uses `seg.charIndex / chapterText.length` (unchanged)
- `assetResolver.ts`: `resolveSfxEvents()` — embeds `sfxEvent.query` strings (now raw sentence text instead of LLM English, but embedding model is multilingual)

### Test book for validation:
- `audiobooks/soundscape_test_story/` — 2 chapters
- `audiobooks/.frozen_scenes/soundscape_test_story/` — frozen scene JSONs (baseline)
- `scripts/soundscape_eval/ideal_template.json` — expected segment/SFX counts
- `scripts/soundscape_eval/evaluate.py` — 7-criteria evaluation
- `scripts/soundscape_eval/tracking.csv` — historical gate results (baseline: 61.8)

---

## Measured Benchmark Data

### Embedding API (gemini-embedding-001)

| Metric | Value |
|--------|-------|
| Sequential avg (10 calls) | **467ms** per call (range 276–697ms, bimodal ~300ms/~620ms) |
| Concurrent 5-at-once Round 1 | **1032ms** (connection setup, warm-up) |
| Concurrent 5-at-once Round 2+ | **~304ms** (HTTP keep-alive) |
| Warm-up (first call ever) | 1020ms |
| API quota | 5,000,000 tokens/min/region (token-based, no RPM limit) |
| Batch support | **1 text per request** only (EMBEDDING_BATCH_SIZE=1) |

### TTS API (gemini-2.5-flash-tts)

| Metric | Value |
|--------|-------|
| Sequential avg (10 calls, ~50 char texts) | **4,827ms** per call |
| Concurrent 3-at-once per round | **~5,200ms** per round |
| Real subchunk (~2000 chars) | **~5-8s** estimated |
| Pipeline concurrency | 3 (interactive path) |

### Latency Projections for Typical Chapters

Test story chapters: ~24 sentences, ~2000 chars.
Multi-scale total: 2N-1 = ~47 texts to embed.

| Strategy | API calls | Rounds@5 | Conservative (668ms/rnd) | Optimistic (1032+304ms) |
|----------|-----------|----------|--------------------------|-------------------------|
| Sentences-only | 24 | 5 | 3.3s | 2.2s |
| **Multi-scale** (chosen) | **47** | **10** | **6.7s** | **3.8s** |
| Old LLM pipeline | 1 call | — | 2–5s | 2–5s |

### Bottleneck Analysis: Option C is NOT the bottleneck

```
Timeline for typical chapter:

  0s        3s        5s        10s       15s       20s
  │─────────│─────────│─────────│─────────│─────────│
  ├── Option C (3.8-6.7s) ──────┤
  ├── Voice dramatization (2-5s) ──┤
  │                                ├── TTS subchunk[0] (~5s) ──┤
  │                                │                            ├── TTS [1..N] ──── ...
  │                                │                            │
  │                          FIRST LISTEN ◄─────────────────────┘ (~10-12s from start)
  │
  └── Option C done (~4-7s) ✓  Hidden behind voice pipeline
```

Voice TTS is **10× slower** per API call than embedding. Option C completes its entire soundscape map (~47 embedding calls) in less time than a single TTS subchunk takes. With the early-start optimization (launching Option C before dramatization), the soundscape map is ready long before any voice audio exists.

## Future Optimization Levers (if needed — not implemented now)

The following optimizations are available if real-world usage reveals bottlenecks with very long chapters (60+ sentences, 5000+ chars). **None are needed for typical chapters.**

1. **Increase embedding concurrency to 10+**: Google's quota is token-based (5M tokens/min), with **no RPM limit** per official docs. Concurrency can safely increase from 5 to 10 or 20. This would halve the number of rounds and cut embedding time proportionally. Change: single constant in `config.ts` (`EMBEDDING_CONCURRENCY`).

2. **Pre-pipeline embeddings before dramatization**: Currently Step 1 (text splitting) runs after chapter text is extracted. It could run even earlier — during book upload processing — to pre-compute all sentence embeddings before any chapter generation begins. This front-loads the entire embedding cost.

3. **Embedding result caching**: Since the pipeline is deterministic, embedding vectors for a given chapter text never change. Cache them to disk alongside the book. On re-generation, skip Step 2b entirely if cached vectors exist.

4. **Reduce multi-scale scope**: If 2-sentence pairs prove to not significantly improve ambient matching quality (verified via eval scores), drop back to sentences-only — halves the embedding count from 2N-1 to N.

---

## Future Enhancement: Audio-Language Evaluation (Post-MVP)

After the deterministic pipeline is stable and scoring well, add an AI-powered evaluation layer:

**Option A: Gemini 2.5 Flash Audio Input** — Send generated `_soundscape.ogg` + chapter text excerpt to Gemini. Ask it to rate audio-text alignment 1-10. Use as additional eval criterion. Already have API access.

**Option B: CLAP (Contrastive Language-Audio Pretraining)** — Embeds audio and text into same vector space. Cosine similarity between actual audio clip and text description measures real audio-text alignment (not just catalog-description-to-text). Requires hosting a model.

Both are evaluation-only enhancements (NOT in the generation pipeline) to measure actual audio quality beyond the current proxy metrics.
