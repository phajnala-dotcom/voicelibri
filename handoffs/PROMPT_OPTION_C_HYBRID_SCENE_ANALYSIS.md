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

  Step 3: Ambient matching (embedding API, deterministic)
    → Sliding window of 3-5 sentences → embed → match ambient catalog
    → Best ambient asset per segment + environment label (from asset description)
    → Both embedding vectors stored for reuse (no re-embedding)

  Step 4: SFX matching (embedding API, deterministic)
    → Embed each WHOLE SENTENCE → match SFX catalog
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
| Ambient asset matching | Sentence-window embedding vs catalog (Layer 1, Step 3) | `text-embedding-004` is multilingual — no translation needed |
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

**3. Different Granularity for Ambient vs SFX**

- **Ambient matching**: Wide context — sliding window of 3-5 consecutive sentences captures the environment described across multiple sentences
- **SFX matching**: Sentence-level — each sentence is one SFX opportunity (max 1 SFX per sentence, dominant sound wins)

**4. Embedding Reuse**

The current pipeline embeds twice: LLM generates searchSnippets → embed → match. The new pipeline embeds once: raw text fragments → embed → match both ambient and SFX catalogs directly. The multilingual embedding model (`text-embedding-004` / `gemini-embedding-001`) natively maps Czech/Slovak/English text to the same semantic space as English catalog descriptions.

**Net effect: ~2-5 seconds FASTER per chapter** (LLM call eliminated), **100% deterministic** (same input → always same output).

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
├── soundscapeCompat.ts   # MODIFY: Wire new pipeline (replace analyzeChapterScene calls)
└── index.ts              # NO CHANGE (orchestration unchanged)

NEW FILES:
├── soundscape/src/textSplitter.ts              # Step 1: Sentence + fragment splitting
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
  /** All sentences with char offsets — used for both ambient windows and SFX matching */
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

**Step 3: Ambient matching** (async, uses embedding API):

1. For each segment, create an **ambient search window** by concatenating sentences within the segment's char range (use 3-5 consecutive sentences, or all sentences if fewer)
2. Embed each window using `embedTexts()` (batch all segments together for efficiency)
3. Match each window's embedding against the ambient index using `searchEmbeddingsWithVector()` — return top-5 candidates
4. Select the best ambient asset per segment (highest cosine score ≥ `ambientThreshold`)
5. Derive `environment` label: use the winning asset's description (truncate to first 60 chars if longer)
6. Populate `searchSnippets` field: use the actual sentence texts from the window (for backward compatibility with existing code that reads searchSnippets)
7. Store embedding vectors for reuse by asset resolver (avoids re-embedding)

**Step 4: SFX matching** (async, uses embedding API):

1. Embed all sentences from `splitResult.sentences` using `embedTexts()` (batched, concurrent)
2. Match each sentence's embedding against the SFX index using `searchEmbeddingsWithVector()` — return top-1 best candidate per sentence
3. Filter: keep only matches where `score >= sfxThreshold` (default 0.72)
4. For each qualifying match, create an `SfxEvent`:
   - `query`: the sentence's raw text (used for downstream SFX asset resolution via `resolveSfxEvents()`)
   - `charIndex`: the sentence's `charIndex` (exact, from text splitting)
   - `description`: the matching SFX asset's description
5. **Max 1 SFX per sentence** — multi-SFX sentences produce a blended embedding that naturally picks the dominant sound. This is by design: rapid successive SFX within one sentence sounds artificial.
6. **Threshold retry**: if total `sfxEvents.length < minSfxCount`, lower threshold from 0.72 to 0.65 and re-filter (same embeddings, no re-computation)

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

**`resolveSfxEvents()` (existing)**: The `query` field will contain raw sentence text instead of LLM-generated English queries. The multilingual embedding model handles this natively. **The function itself needs no code change** — it embeds the query strings and matches against the SFX index. The only difference is the input strings are raw sentences instead of LLM-generated English snippets.

### MODIFIED FILE: `soundscape/src/embeddings.ts`

**One change**: Export `embedTexts()` which is currently private:

```typescript
// Currently: async function embedTexts(texts: string[]): Promise<number[][]>
// Change to: export async function embedTexts(texts: string[]): Promise<number[][]>
```

No other changes. All other functions already have the right exports.

### NOT MODIFIED: `soundscape/src/types.ts`

The `SceneAnalysis` interface is **NOT changed**. The new pipeline produces identical output. No new types need to be added to this file — all new types are defined in their own modules (`textSplitter.ts`, `deterministicAnalyzer.ts`, `sceneValidator.ts`).

### MODIFIED FILE: `apps/backend/src/soundscapeCompat.ts`

**Wire the new pipeline** in both `prepareEarlyAmbient()` and `applySoundscapeToChapter()`:

**Current flow:**
```
loadFrozenSceneAnalysis() || analyzeChapterScene() → resolveSceneSegmentAssets() → ambient/SFX
```

**New flow:**
```
loadFrozenSceneAnalysis() || {
  splitText()                      → Step 1 (sync, <1ms)
  analyzeSceneDeterministic()      → Steps 2-5 (async, ~600ms embedding calls)
  validateScene()                  → Layer 2 (sync, <1ms)
} → resolveAmbientAssetFromVector() + resolveSfxEvents() → ambient/SFX
```

**Key changes:**
1. Import new modules: `splitText`, `analyzeSceneDeterministic`, `validateScene`
2. Replace `analyzeChapterScene()` calls with the new pipeline
3. Pass pre-computed embedding vectors to asset resolution
4. Keep `loadFrozenSceneAnalysis()` unchanged (G1-A freeze still works — bypasses entire pipeline)
5. Keep `buildFallbackScene()` as ultimate fallback (existing, no LLM)

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
- `sfxSimilarity` — **key metric to watch**: raw text fragments vs LLM-generated English queries. May be slightly different. The multilingual embedding model should handle this well.
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
- Config: `EMBEDDING_MODEL = 'gemini-embedding-001'`, `EMBEDDING_DIMENSIONS = 768`, `EMBEDDING_BATCH_SIZE = 1`, `EMBEDDING_CONCURRENCY = 5`
- Pre-built indexes on disk: `soundscape/assets/ambient_embeddings.json`, `sfx_embeddings.json`

### LLM infrastructure (DEPRECATED for scene analysis):
- `llmDirector.ts`: `analyzeChapterScene()` — no longer called from main pipeline
- `llmDirector.ts`: `buildFallbackScene()` — kept as ultimate fallback
- Config: `SCENE_ANALYSIS_MODEL = 'gemini-2.5-flash'`

### Pipeline integration (MODIFY — rewire):
- `soundscapeCompat.ts`: `prepareEarlyAmbient()` calls `analyzeChapterScene()` → replace with `analyzeSceneDeterministic()`
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

## Future Enhancement: Audio-Language Evaluation (Post-MVP)

After the deterministic pipeline is stable and scoring well, add an AI-powered evaluation layer:

**Option A: Gemini 2.5 Flash Audio Input** — Send generated `_soundscape.ogg` + chapter text excerpt to Gemini. Ask it to rate audio-text alignment 1-10. Use as additional eval criterion. Already have API access.

**Option B: CLAP (Contrastive Language-Audio Pretraining)** — Embeds audio and text into same vector space. Cosine similarity between actual audio clip and text description measures real audio-text alignment (not just catalog-description-to-text). Requires hosting a model.

Both are evaluation-only enhancements (NOT in the generation pipeline) to measure actual audio quality beyond the current proxy metrics.
