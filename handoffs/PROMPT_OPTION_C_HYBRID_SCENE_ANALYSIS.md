# Option C: Hybrid Scene Analysis Pipeline — Implementation Prompt

## ⚠️ IMPORTANT: Prerequisites Before Starting This Work

This prompt is for a FUTURE session. Before implementing Option C, the following must be completed and verified on the `feature/soundscape-refactor` branch:

1. ✅ G1-A: Scene analysis freeze mechanism (already committed `9b125178`)
2. ⬜ G1-B: LUFS normalization (ambient volume relative to voice)
3. ⬜ Option B: Prompt engineering sprint (structured output schema, topK=1, few-shot examples, min constraints)
4. ⬜ Gate evaluation confirming Option B improvements

Only after Option B is stable and evaluated should Option C be started — ideally on a new branch (e.g., `feature/hybrid-scene-analysis`) off the latest `feature/soundscape-refactor`.

---

## Context & Motivation

### The Problem

The current soundscape pipeline uses an LLM (Gemini 2.5 Flash) to analyze chapter text and produce a `SceneAnalysis` JSON containing:
- Scene segments (1–6 per chapter) with environment descriptions and English search queries
- SFX events with character offsets and English search queries
- Metadata (time of day, weather, moods, intensity)

The LLM then generates **English search snippets** (e.g., `"quiet forest at dusk with distant owl hooting"`) which are separately embedded and cosine-matched against the pre-embedded asset catalog.

**Critical issues with this approach:**
1. **Extreme non-determinism** — Identical inputs produce wildly different outputs across runs (1 segment/0 SFX vs 6 segments/12 SFX)
2. **Unnecessary LLM intermediary** — The LLM "translates" raw text into English search snippets, then those snippets are embedded. This adds LLM hallucination risk, latency (2-5s), and cost, while the embedding model (`text-embedding-004`) is already multilingual and could match raw text directly against the catalog
3. **The English searchSnippets layer was NOT the original design intent** — it was added during implementation without explicit approval. The original intent was raw text → embedding → direct catalog match

### The Solution: Hybrid 3-Layer Architecture

Replace the monolithic LLM scene analysis with a 3-layer pipeline:

```
Layer 1a: STRUCTURAL ANALYSIS (pure code, offline, 100% deterministic, language-agnostic)
  → Paragraph-level text segmentation
  → Scene boundary detection via structural heuristics
  → Minimum segment/SFX count guarantees
  → Character offset positions for segment boundaries
  Output: StructuralSceneBase (deterministic skeleton)

Layer 1b: SEMANTIC CLASSIFICATION (embedding API, deterministic, language-agnostic)
  → Embed raw paragraph text directly (any language)
  → Cosine-match against pre-embedded catalog descriptions
  → Classify environment per segment
  → These SAME embeddings are reused for asset matching (no separate embed step)
  Output: SemanticSceneBase (environment classification + asset candidates per segment)
  KEY: This REPLACES the current LLM searchSnippet → embed → match flow

Layer 2: LLM ENRICHMENT (constrained, optional enhancement)
  → Receives Layer 1a+1b output as INPUT (pre-built segments, pre-matched assets)
  → Only adds: SFX events with charIndex placement, mood refinement, intensity
  → CANNOT change segment count, boundaries, or ambient asset assignments
  → Uses structured output (response_json_schema) with strict constraints
  Output: EnrichedSceneAnalysis

Layer 3: VALIDATION GATE (pure code, deterministic)
  → Validates: segments ≥ min, SFX ≥ min, charIndexes within bounds
  → On failure: retry LLM (max 2x), then fall back to Layer 1a+1b output
  Output: FinalSceneAnalysis (guaranteed quality floor)
```

### Key Architectural Insight: Embedding Reuse

The current pipeline has two separate embedding operations:
1. LLM generates English searchSnippets → embed snippets → match against catalog
2. Asset catalog descriptions are pre-embedded on first run

**In the new architecture, paragraph embeddings serve DUAL purpose:**
- Environment classification (cosine vs concept vectors)
- Direct asset matching (cosine vs catalog vectors)

This eliminates the LLM as intermediary for ambient matching. The multilingual embedding model (`text-embedding-004` / `gemini-embedding-001`) natively maps Czech/Slovak/English text to the same semantic space as the English catalog descriptions.

**Net latency effect: ~2-5 seconds FASTER per chapter** (LLM call eliminated for ambient matching).

---

## Repository Structure (Relevant Files)

```
soundscape/src/
├── llmDirector.ts        # MODIFY: Layer 2 (constrained LLM for SFX only)
├── assetResolver.ts      # MODIFY: Replace searchSnippet-based matching with direct paragraph embedding matching
├── embeddings.ts         # MODIFY: Add paragraph embedding + concept classification functions
├── types.ts              # MODIFY: Add StructuralSceneBase, SemanticSceneBase types
├── config.ts             # MODIFY: Add concept vector config, structural analysis constants
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
├── soundscape/src/structuralAnalyzer.ts   # Layer 1a: Pure code structural analysis
├── soundscape/src/semanticClassifier.ts   # Layer 1b: Embedding-based classification
├── soundscape/src/sceneValidator.ts       # Layer 3: Validation gate
```

---

## Detailed Implementation Spec

### NEW FILE: `soundscape/src/structuralAnalyzer.ts` — Layer 1a

**Purpose**: Pure deterministic code that analyzes text structure to produce segment boundaries and minimum counts. 100% language-agnostic (operates on text structure, not content).

```typescript
export interface StructuralSceneBase {
  chapterIndex: number;
  /** Paragraph boundaries (char offsets) */
  paragraphBoundaries: number[];
  /** Computed segment boundaries — char offsets where environment likely changes */
  segmentBoundaries: number[];
  /** Number of segments (guaranteed ≥ 2 for chapters > 2000 chars, else ≥ 1) */
  segmentCount: number;
  /** Minimum SFX count based on text activity indicators */
  minSfxCount: number;
  /** Per-segment text slices for embedding */
  segmentTexts: string[];
}
```

**Implementation requirements:**

1. **Paragraph detection**: Split on `\n\n` (or `\r\n\r\n`). Handle edge cases: single newlines within dialogue, markdown-style formatting.

2. **Segment boundary computation**:
   - Base count: `Math.max(2, Math.min(6, Math.ceil(chapterText.length / 3000)))` — at least 2 segments for any non-trivial chapter
   - Place boundaries at paragraph breaks nearest to equal-length splits
   - Heuristic boost: paragraphs with significant whitespace density changes, or after long dialogue sequences followed by narration, suggest scene changes

3. **Minimum SFX count**:
   - Count exclamation marks (`!`) — action indicators
   - Count very short paragraphs (< 50 chars) in narration — often sound-producing actions
   - Count quotation-terminated paragraphs followed by action narration
   - Formula: `Math.max(3, Math.min(15, Math.ceil(actionIndicators / 3)))` — at least 3 SFX per chapter

4. **Segment text extraction**: For each segment, concatenate the paragraphs within that segment's char range. These raw text slices will be embedded by Layer 1b.

**Critical constraints:**
- NO language-specific keywords or dictionaries
- NO imports of any external NLP library
- Operates only on: character offsets, whitespace patterns, punctuation, paragraph structure
- Must be synchronous (no async, no API calls)
- Must be pure function (no side effects, no state)

### NEW FILE: `soundscape/src/semanticClassifier.ts` — Layer 1b

**Purpose**: Embed raw paragraph text (any language) directly against the pre-embedded asset catalog. Classify environments and pre-select asset candidates per segment. These embeddings are then REUSED by the asset resolver — no separate embedding step needed.

```typescript
export interface SemanticSceneBase {
  chapterIndex: number;
  /** Per-segment semantic classification */
  segments: Array<{
    charIndex: number;
    /** Best-matching catalog asset and its cosine score */
    topAssetCandidates: Array<{ assetId: string; score: number }>;
    /** Dominant environment label (derived from top asset's description) */
    environment: string;
    /** The raw embedding vector for this segment's text — reused for asset matching */
    embeddingVector: number[];
  }>;
}
```

**Implementation requirements:**

1. **Embed segment texts**: Take `segmentTexts` from Layer 1a, call `embedTexts()` for each segment. Use existing `EMBEDDING_CONCURRENCY` for parallelism.

2. **Match against ambient catalog**: Use existing `searchEmbeddingsWithVector()` against the ambient embedding index. Return top-5 candidates per segment.

3. **Derive environment label**: Extract from the top-matching asset's description. E.g., if top match is "rain in a dark forest with thunder", environment = "dark forest" (simple: take the asset description, or first N words of it).

4. **Store embedding vectors**: The per-segment embedding vectors must be accessible for later reuse by `resolveSceneSegmentAssets()` — this eliminates the need to embed LLM-generated searchSnippets.

**Critical constraints:**
- Uses EXISTING `embedTexts()`, `searchEmbeddingsWithVector()`, `ensureAmbientEmbeddingIndex()` from `embeddings.ts` and `assetResolver.ts`
- NO new embedding API endpoint — reuses exact same infrastructure
- Deterministic: same input text → same embedding → same cosine scores → same results

### MODIFIED FILE: `soundscape/src/llmDirector.ts` — Layer 2 (Constrained)

**Purpose**: LLM is now ONLY used for SFX event identification (narrative comprehension that embeddings cannot do). Ambient environment analysis is fully handled by Layer 1b.

**Changes to `analyzeChapterScene()`:**

1. **New function signature**: Receives `StructuralSceneBase` + `SemanticSceneBase` as input (the pre-built skeleton)

2. **Reduced prompt scope**: Only asks LLM for:
   - SFX events with charIndex placement (requires narrative comprehension)
   - Mood refinement per segment (nice-to-have, not critical)
   - Time of day, weather, intensity metadata
   - Does NOT ask for scene segments, environments, or searchSnippets

3. **Structured output**: Add `response_json_schema` to the Gemini API call with:
   - `sfxEvents`: array with `minItems` matching `StructuralSceneBase.minSfxCount`
   - Strict field types and constraints

4. **Reduced temperature**: Set `topK: 1`, keep `temperature: 0.3`, `topP: 0.5` for maximum determinism

5. **The prompt must include the pre-computed segment boundaries** so the LLM knows WHERE each segment starts/ends and can place SFX charIndexes correctly within the right segments

**Key prompt structure:**
```
You are a sound effects designer. The scene segments and ambient environments
have already been determined. Your ONLY job is to identify discrete sound
effects (SFX) events in the chapter text.

Pre-determined segments:
- Segment 0 (chars 0-3200): [environment from Layer 1b]
- Segment 1 (chars 3201-6500): [environment from Layer 1b]
...

Chapter text:
---
[full chapter text]
---

Identify SFX events: short, discrete sounds (1-10 seconds) that occur as
one-shot events. For each, provide:
- query: English search query for SFX catalog
- charIndex: exact character offset where the sound occurs
- description: brief description

Minimum {minSfxCount} events required. Every chapter with human activity has
footsteps, door sounds, object handling, etc.
```

### NEW FILE: `soundscape/src/sceneValidator.ts` — Layer 3

**Purpose**: Deterministic validation gate. Ensures the final SceneAnalysis meets quality floor requirements.

```typescript
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  /** If invalid, the corrected SceneAnalysis (auto-fixed where possible) */
  corrected?: SceneAnalysis;
}

export function validateSceneAnalysis(
  scene: SceneAnalysis,
  structural: StructuralSceneBase,
  textLength: number
): ValidationResult;
```

**Validation rules:**
1. `sceneSegments.length >= structural.segmentCount` — cannot have fewer segments than Layer 1a determined
2. `sceneSegments[0].charIndex === 0` — first segment must start at 0
3. All `charIndex` values strictly increasing and within `[0, textLength)`
4. `sfxEvents.length >= structural.minSfxCount` — minimum SFX count enforced
5. All SFX `charIndex` values within `[0, textLength)`
6. No duplicate SFX at same charIndex (within ±50 chars)

**Auto-correction**: Where possible, fix rather than reject:
- Clamp out-of-bounds charIndexes
- Deduplicate SFX events
- If segments are missing, restore from Layer 1a boundaries

**Retry logic** (in the caller, not in validator):
- If validation fails and LLM was used: retry LLM call (max 2 retries)
- If still failing after retries: use Layer 1a+1b output only (no LLM enrichment) — this is the guaranteed quality floor

### MODIFIED FILE: `soundscape/src/assetResolver.ts`

**Key change**: `resolveSceneSegmentAssets()` must accept pre-computed embedding vectors from Layer 1b instead of embedding LLM-generated searchSnippets.

**Current flow (REMOVE):**
```
searchSnippets → searchEmbeddingsBatch() → cosine match → asset
```

**New flow:**
```
Layer 1b embeddingVector (already computed) → searchEmbeddingsWithVector() → asset
```

Add a new function or overload:
```typescript
export async function resolveSceneSegmentAssetsFromVectors(
  segments: Array<{
    segment: SceneSegment;
    embeddingVector: number[];
  }>
): Promise<Array<{ segment: SceneSegment; asset: SoundAsset | null; score: number }>>;
```

This uses `searchEmbeddingsWithVector()` (already exists in `embeddings.ts` line 236) — pure in-memory cosine similarity, no API calls, <1ms per segment.

**`resolveSfxEvents()` remains unchanged** — it embeds the LLM-generated English SFX queries (which are short, specific, and appropriate for LLM generation since they require narrative comprehension).

### MODIFIED FILE: `soundscape/src/types.ts`

Add new types:
- `StructuralSceneBase` (from Layer 1a)
- `SemanticSceneBase` (from Layer 1b)
- `ValidationResult` (from Layer 3)

The existing `SceneAnalysis` interface MUST NOT CHANGE — it is the contract consumed by `subchunkSoundscape.ts`, `ambientLayer.ts`, and `soundscapeCompat.ts`. The new pipeline must produce the same `SceneAnalysis` output.

### MODIFIED FILE: `apps/backend/src/soundscapeCompat.ts`

**Wire the new pipeline** in both `prepareEarlyAmbient()` and `applySoundscapeToChapter()`:

**Current flow:**
```
loadFrozenSceneAnalysis() || analyzeChapterScene() → resolveSceneSegmentAssets() → ambient/SFX
```

**New flow:**
```
loadFrozenSceneAnalysis() || {
  structuralAnalyze() →              // Layer 1a (sync, ~1ms)
  semanticClassify() →               // Layer 1b (async, ~600ms for ~30 paragraphs)
  enrichWithLlm() →                  // Layer 2 (async, ~2s, SFX only)
  validateScene()                     // Layer 3 (sync, ~1ms)
} → resolveSceneSegmentAssetsFromVectors() → ambient/SFX
```

The frozen scene analysis mechanism (G1-A) continues to work as-is — it loads a pre-computed `SceneAnalysis` JSON from disk, bypassing the entire pipeline.

---

## Testing & Evaluation Strategy

### Unit Tests (vitest)

1. **Layer 1a tests** (`structuralAnalyzer.test.ts`):
   - English text: verify segment count, boundaries at paragraph breaks
   - Czech text: verify SAME structural output (language-agnostic proof)
   - Short text (< 500 chars): verify minimum 1 segment
   - Long text (> 10000 chars): verify 3-6 segments
   - Edge cases: no paragraph breaks, single paragraph, empty text

2. **Layer 3 tests** (`sceneValidator.test.ts`):
   - Valid input → passes
   - Too few segments → fails with error
   - Out-of-bounds charIndex → auto-corrected
   - Zero SFX → fails

### Integration Test

Use the existing `soundscape_test_story` with 2 chapters:
1. Run new pipeline on both chapters
2. Compare output `SceneAnalysis` structure against expected `ideal_template.json`
3. Verify determinism: run 3x → identical Layer 1a+1b output every time
4. Verify LLM variance is contained: Layer 2 SFX may vary but segment structure is locked

### Gate Evaluation

Use existing `scripts/soundscape_eval/evaluate.py` — the 7-criteria eval system:
- `ambientOccurrence` — should IMPROVE (deterministic segment count)
- `sfxOccurrence` — should stabilize (minSfxCount floor)
- `ambientSimilarity` — should IMPROVE (direct text→catalog embedding, no LLM hallucination intermediary)
- `ambientCoverage` — unchanged (depends on FFmpeg mixing, not scene analysis)
- `ambientVolume` — unchanged (depends on LUFS normalization, not scene analysis)
- `sfxAudibility` — unchanged (depends on mixing, not scene analysis)

---

## Implementation Order

1. **Types** (`types.ts`) — add new interfaces
2. **Layer 1a** (`structuralAnalyzer.ts`) — pure code, with unit tests
3. **Layer 1b** (`semanticClassifier.ts`) — embedding classification, depends on existing `embeddings.ts`
4. **Layer 3** (`sceneValidator.ts`) — validation gate, with unit tests
5. **Layer 2** (`llmDirector.ts`) — modify existing `analyzeChapterScene()` to constrained SFX-only
6. **Asset resolver** (`assetResolver.ts`) — add `resolveSceneSegmentAssetsFromVectors()`
7. **Bridge** (`soundscapeCompat.ts`) — wire the new pipeline
8. **Test** — run against soundscape_test_story, verify determinism, run eval

---

## Constraints & Rules

1. **DO NOT change the `SceneAnalysis` output interface** — downstream consumers (`ambientLayer.ts`, `subchunkSoundscape.ts`, `soundscapeCompat.ts`) depend on it
2. **DO NOT remove the frozen scene analysis mechanism** — `loadFrozenSceneAnalysis()` in `soundscapeCompat.ts` must continue to work
3. **DO NOT add any new npm dependencies** — use existing embedding infrastructure
4. **DO NOT change `embeddings.ts` API surface** — only add new utility functions alongside existing ones
5. **Existing `buildFallbackScene()` in `llmDirector.ts` should be updated** to use Layer 1a output instead of its current English-only keyword matching
6. **All Layer 1a code must be pure synchronous functions** — no async, no API calls, no side effects
7. **The LLM (Layer 2) must use `response_json_schema`** per [Gemini structured output docs](https://ai.google.dev/gemini-api/docs/structured-output) — not just `responseMimeType: 'application/json'`
8. **Use `topK: 1` for Layer 2 LLM calls** for maximum determinism. NOTE: Gemini docs warn against low temperature on Gemini 3 models, but we use `gemini-2.5-flash` where this is valid
9. **Follow existing code patterns** — same error handling, same console.log emoji prefixes, same TypeScript style
10. **This is a commercial codebase** — production-quality error handling, no shortcuts

---

## Current Codebase Reference

### Embedding infrastructure (DO NOT REBUILD — reuse):
- `embeddings.ts`: `embedTexts()`, `searchEmbeddingsWithVector()`, `searchEmbeddingsBatch()`, `buildEmbeddingIndex()`, `cosineSimilarity()` (private)
- Config: `EMBEDDING_MODEL = 'gemini-embedding-001'`, `EMBEDDING_DIMENSIONS = 768`, `EMBEDDING_BATCH_SIZE = 1`, `EMBEDDING_CONCURRENCY = 5`
- Pre-built indexes on disk: `soundscape/assets/ambient_embeddings.json`, `sfx_embeddings.json`

### LLM infrastructure (MODIFY — constrain):
- `llmDirector.ts`: `callGemini()` (private), `analyzeChapterScene()`, `buildFallbackScene()`
- Config: `SCENE_ANALYSIS_MODEL = 'gemini-2.5-flash'`
- Current: `temperature: 0.3`, `topP: 0.8`, `responseMimeType: 'application/json'` — NO `response_json_schema`

### Pipeline integration (MODIFY — rewire):
- `soundscapeCompat.ts`: `prepareEarlyAmbient()` calls `analyzeChapterScene()` + `resolveSceneSegmentAssets()`
- `soundscapeCompat.ts`: `applySoundscapeToChapter()` checks `earlyAmbientCache`, else calls `analyzeChapterScene()` + asset resolution
- `soundscapeCompat.ts`: `loadFrozenSceneAnalysis()` loads scene JSON from disk (G1-A freeze)

### Test book for validation:
- `audiobooks/soundscape_test_story/` — 2 chapters
- `scripts/soundscape_eval/ideal_template.json` — expected segment/SFX counts
- `scripts/soundscape_eval/evaluate.py` — 7-criteria evaluation
- `scripts/soundscape_eval/tracking.csv` — historical gate results
