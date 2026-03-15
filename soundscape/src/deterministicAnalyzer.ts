/**
 * Soundscape Module — Deterministic Scene Analyzer
 *
 * Replaces the LLM-based scene analysis with a fully deterministic pipeline:
 *   Step 2: Segment detection (rule-based, sync)
 *   Step 2b: Multi-scale embedding (embedding API, concurrent)
 *   Step 3: Ambient matching (in-memory cosine, deterministic)
 *   Step 4: SFX matching (in-memory cosine, deterministic)
 *   Step 5: Assemble SceneAnalysis
 *
 * 100% reproducible: same input → always same output.
 * No LLM calls. Uses the multilingual embedding model (gemini-embedding-001)
 * to directly match raw chapter text against pre-embedded asset catalogs.
 *
 * @see PROMPT_OPTION_C_HYBRID_SCENE_ANALYSIS.md for full design rationale
 */

import type { SceneAnalysis, SceneSegment, SfxEvent, EmbeddingIndex } from './types.js';
import type { TextSplitResult, SentenceInfo } from './textSplitter.js';
import { embedTexts, searchEmbeddingsWithVector } from './embeddings.js';
import { validateScene } from './sceneValidator.js';

/** Minimum segment size in characters (~20 seconds of narration) */
const MIN_SEGMENT_CHARS = 200;

// ========================================
// Types
// ========================================

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

/** Internal: embedding result for a text (sentence or pair) */
interface EmbeddedText {
  /** Original text */
  text: string;
  /** Character index of start in original chapter text */
  charIndex: number;
  /** Character index of end (exclusive) */
  charEnd: number;
  /** Embedding vector */
  vector: number[];
  /** Whether this is a sentence pair (true) or individual sentence (false) */
  isPair: boolean;
  /** Index into the sentences array (for individual sentences) or first sentence index (for pairs) */
  sentenceIndex: number;
  /** Paragraph index (for single sentences) or -1 for cross-paragraph (should not exist) */
  paragraphIndex: number;
}

// ========================================
// Public API
// ========================================

/**
 * Deterministic scene analysis — no LLM, 100% reproducible.
 * Produces a SceneAnalysis identical in interface to the LLM-based version.
 * SFX matching is sentence-level (max 1 SFX per sentence, dominant sound wins).
 *
 * Steps 2b (embedding) is the only async operation — Steps 3-4 are in-memory cosine.
 *
 * @param options - Analysis configuration including split text and embedding indexes
 * @returns SceneAnalysis conforming to the same interface as the LLM-based version
 */
export async function analyzeSceneDeterministic(
  options: AnalyzerOptions
): Promise<SceneAnalysis> {
  const {
    chapterIndex,
    chapterText,
    splitResult,
    ambientIndex,
    sfxIndex,
    sfxThreshold = 0.72,
    ambientThreshold = 0.65,
    minSfxCount = 3,
  } = options;

  const { paragraphs, sentences } = splitResult;

  console.log(`  🔬 Deterministic analyzer: chapter ${chapterIndex}, ${paragraphs.length} paragraphs, ${sentences.length} sentences`);

  // ── Step 2b: Multi-scale embedding (BEFORE segment detection — needed for content-aware segmentation) ──
  const embeddedTexts = await embedMultiScale(sentences);
  console.log(`  🔬 Embedded: ${embeddedTexts.length} texts (${sentences.length} sentences + ${embeddedTexts.length - sentences.length} pairs)`);

  // Separate individual sentence embeddings and pair embeddings
  const sentenceEmbeddings = embeddedTexts.filter((e) => !e.isPair);
  const pairEmbeddings = embeddedTexts.filter((e) => e.isPair);

  // ── Step 2: Content-aware segment detection (uses sentence embeddings + ambient index) ──
  const segmentBoundaries = detectSegmentsContentAware(
    sentenceEmbeddings,
    ambientIndex,
    paragraphs,
    chapterText.length,
  );
  console.log(`  🔬 Segments: ${segmentBoundaries.length} detected (content-aware, min ${MIN_SEGMENT_CHARS} chars)`);

  // ── Step 3: Ambient matching ──
  const sceneSegments = matchAmbient(
    segmentBoundaries,
    sentenceEmbeddings,
    pairEmbeddings,
    ambientIndex,
    chapterText.length,
    ambientThreshold,
  );
  console.log(`  🔬 Ambient: ${sceneSegments.length} segments matched`);

  // ── Step 4: SFX matching ──
  let sfxEvents = matchSfx(sentenceEmbeddings, sfxIndex, sfxThreshold);
  console.log(`  🔬 SFX: ${sfxEvents.length} events at threshold ${sfxThreshold}`);

  // Threshold retry: if below minSfxCount, lower threshold to 0.65
  if (sfxEvents.length < minSfxCount && sfxThreshold > 0.65) {
    const retryThreshold = 0.65;
    sfxEvents = matchSfx(sentenceEmbeddings, sfxIndex, retryThreshold);
    console.log(`  🔬 SFX retry: ${sfxEvents.length} events at lowered threshold ${retryThreshold}`);
  }

  // ── Step 5: Assemble SceneAnalysis ──
  const scene: SceneAnalysis = {
    chapterIndex,
    timeOfDay: 'unknown',
    weather: 'none',
    moods: [],
    soundElements: [],
    intensity: 0.7,
    sceneSegments,
    sfxEvents,
  };

  // ── Layer 2: Validation ──
  const minSegments = segmentBoundaries.length; // content-aware detection already optimal
  const validation = validateScene(scene, chapterText.length, minSegments, minSfxCount);

  if (validation.corrections.length > 0) {
    console.log(`  🔬 Validation corrections: ${validation.corrections.join('; ')}`);
  }

  return validation.scene;
}

// ========================================
// Step 2: Content-Aware Segment Detection
// ========================================

/**
 * Detect segment boundaries by tracking where the dominant ambient environment
 * changes between paragraphs. Uses pre-computed sentence embeddings matched
 * against the ambient catalog to determine each paragraph's best ambient match.
 *
 * Algorithm:
 *   1. For each sentence, find the best ambient catalog match (top-1 cosine).
 *   2. For each paragraph, pick the highest-scoring sentence's ambient match
 *      as the paragraph's "dominant ambient".
 *   3. Walk paragraphs in order — when the dominant ambient asset changes,
 *      insert a segment boundary at that paragraph start.
 *   4. Merge segments shorter than MIN_SEGMENT_CHARS (~200 chars ≈ 20s) into
 *      the previous segment.
 *
 * No maximum segment cap — the text's actual environment changes drive the count.
 * A chapter set entirely in one room produces 1 segment; a chapter crossing
 * forest → stream → meadow → storm produces 4.
 *
 * @param sentenceEmbeddings - Individual sentence embeddings with paragraphIndex
 * @param ambientIndex - Pre-built ambient embedding index
 * @param paragraphs - Paragraphs from text splitting (for snapping boundaries)
 * @param chapterLength - Total chapter text length
 * @returns Array of charIndex values for segment boundaries (first is always 0)
 */
function detectSegmentsContentAware(
  sentenceEmbeddings: EmbeddedText[],
  ambientIndex: EmbeddingIndex,
  paragraphs: Array<{ text: string; charIndex: number; charEnd: number }>,
  chapterLength: number,
): number[] {
  if (sentenceEmbeddings.length === 0 || paragraphs.length <= 1) return [0];

  // Step 1: For each sentence, find top-1 ambient asset ID via in-memory cosine
  const sentenceMatches: Array<{
    paragraphIndex: number;
    ambientId: string;
    score: number;
  }> = [];

  for (const emb of sentenceEmbeddings) {
    const results = searchEmbeddingsWithVector(ambientIndex, emb.vector, 1);
    if (results.length > 0) {
      sentenceMatches.push({
        paragraphIndex: emb.paragraphIndex,
        ambientId: results[0].id,
        score: results[0].score,
      });
    }
  }

  if (sentenceMatches.length === 0) return [0];

  // Step 2: For each paragraph, determine dominant ambient by highest-scoring sentence
  const paragraphAmbientId = new Map<number, string>();
  const paragraphBestScore = new Map<number, number>();

  for (const m of sentenceMatches) {
    const currentBest = paragraphBestScore.get(m.paragraphIndex) ?? -1;
    if (m.score > currentBest) {
      paragraphAmbientId.set(m.paragraphIndex, m.ambientId);
      paragraphBestScore.set(m.paragraphIndex, m.score);
    }
  }

  // Step 3: Walk paragraphs in order; boundary where dominant ambient changes
  const rawBoundaries: number[] = [0];
  let currentAmbId = paragraphAmbientId.get(0) ?? '';

  for (let pi = 1; pi < paragraphs.length; pi++) {
    const paraAmbId = paragraphAmbientId.get(pi);
    if (paraAmbId && paraAmbId !== currentAmbId) {
      rawBoundaries.push(paragraphs[pi].charIndex);
      currentAmbId = paraAmbId;
    }
  }

  // Step 4: Merge segments shorter than MIN_SEGMENT_CHARS
  const merged: number[] = [0];
  for (let i = 1; i < rawBoundaries.length; i++) {
    const segSize = rawBoundaries[i] - merged[merged.length - 1];
    if (segSize >= MIN_SEGMENT_CHARS) {
      merged.push(rawBoundaries[i]);
    }
  }

  // Check last segment isn't too short — merge into previous
  if (merged.length > 1) {
    const lastSize = chapterLength - merged[merged.length - 1];
    if (lastSize < MIN_SEGMENT_CHARS) {
      merged.pop();
    }
  }

  // Fallback: ensure at least 1 boundary
  if (merged.length === 0) merged.push(0);

  return merged;
}

// ========================================
// Step 2b: Multi-Scale Embedding
// ========================================

/**
 * Embed texts at two granularities: individual sentences and consecutive 2-sentence pairs.
 * All texts are embedded via a shared worker pool (concurrency=5 in embeddings.ts).
 *
 * Pairs are only created within the same paragraph (cross-paragraph pairs are excluded).
 *
 * @param sentences - Sentences from text splitting
 * @returns Array of EmbeddedText with vectors
 */
async function embedMultiScale(
  sentences: SentenceInfo[],
): Promise<EmbeddedText[]> {
  if (sentences.length === 0) return [];

  // Build the list of texts to embed
  const textsToEmbed: string[] = [];
  const textMetadata: Array<{
    isPair: boolean;
    sentenceIndex: number;
    charIndex: number;
    charEnd: number;
    paragraphIndex: number;
  }> = [];

  // Individual sentences (N texts)
  for (let i = 0; i < sentences.length; i++) {
    textsToEmbed.push(sentences[i].text);
    textMetadata.push({
      isPair: false,
      sentenceIndex: i,
      charIndex: sentences[i].charIndex,
      charEnd: sentences[i].charEnd,
      paragraphIndex: sentences[i].paragraphIndex,
    });
  }

  // Consecutive 2-sentence pairs within the same paragraph (N-1 at most)
  for (let i = 0; i < sentences.length - 1; i++) {
    // Only pair sentences within the same paragraph
    if (sentences[i].paragraphIndex !== sentences[i + 1].paragraphIndex) continue;

    const pairText = sentences[i].text + ' ' + sentences[i + 1].text;
    textsToEmbed.push(pairText);
    textMetadata.push({
      isPair: true,
      sentenceIndex: i,
      charIndex: sentences[i].charIndex,
      charEnd: sentences[i + 1].charEnd,
      paragraphIndex: sentences[i].paragraphIndex,
    });
  }

  console.log(`  🔬 Embedding ${textsToEmbed.length} texts (${sentences.length} sentences + ${textsToEmbed.length - sentences.length} pairs)...`);

  // Embed all texts via shared worker pool
  // embedTexts processes one text per API call (EMBEDDING_BATCH_SIZE=1),
  // with EMBEDDING_CONCURRENCY=5 concurrent workers
  const vectors = await embedAllTexts(textsToEmbed);

  // Assemble results
  const results: EmbeddedText[] = [];
  for (let i = 0; i < textsToEmbed.length; i++) {
    results.push({
      text: textsToEmbed[i],
      charIndex: textMetadata[i].charIndex,
      charEnd: textMetadata[i].charEnd,
      vector: vectors[i],
      isPair: textMetadata[i].isPair,
      sentenceIndex: textMetadata[i].sentenceIndex,
      paragraphIndex: textMetadata[i].paragraphIndex,
    });
  }

  return results;
}

/**
 * Embed all texts using the embedTexts function with concurrency control.
 * embedTexts() in embeddings.ts accepts arrays but the API only supports 1 text
 * per request (EMBEDDING_BATCH_SIZE=1). We batch and use the existing worker pool.
 */
async function embedAllTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Use buildEmbeddingIndex-style concurrent embedding:
  // Process texts with EMBEDDING_CONCURRENCY parallel calls
  const vectors: number[][] = new Array(texts.length);
  const queue = texts.map((text, idx) => ({ text, idx }));
  const CONCURRENCY = 5; // matches EMBEDDING_CONCURRENCY from config
  const workers: Promise<void>[] = [];

  async function processQueue(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      const [vector] = await embedTexts([item.text]);
      vectors[item.idx] = vector;
    }
  }

  const workerCount = Math.min(CONCURRENCY, texts.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(processQueue());
  }

  await Promise.all(workers);

  return vectors;
}

// ========================================
// Step 3: Ambient Matching
// ========================================

/**
 * Match embedded texts against the ambient catalog to determine the best
 * ambient asset for each segment.
 *
 * For each segment, both individual sentence embeddings AND 2-sentence pair
 * embeddings are matched against the ambient index. The best-scoring text
 * (sentence or pair) determines the ambient asset and environment label.
 *
 * @param segmentBoundaries - Segment start charIndex values
 * @param sentenceEmbeddings - Individual sentence embeddings
 * @param pairEmbeddings - 2-sentence pair embeddings
 * @param ambientIndex - Pre-built ambient embedding index
 * @param chapterLength - Total chapter text length
 * @param ambientThreshold - Minimum cosine similarity threshold
 * @returns SceneSegment array with ambient matches
 */
function matchAmbient(
  segmentBoundaries: number[],
  sentenceEmbeddings: EmbeddedText[],
  pairEmbeddings: EmbeddedText[],
  ambientIndex: EmbeddingIndex,
  chapterLength: number,
  ambientThreshold: number,
): SceneSegment[] {
  const allEmbeddings = [...sentenceEmbeddings, ...pairEmbeddings];
  const sceneSegments: SceneSegment[] = [];

  for (let si = 0; si < segmentBoundaries.length; si++) {
    const segStart = segmentBoundaries[si];
    const segEnd = si < segmentBoundaries.length - 1
      ? segmentBoundaries[si + 1]
      : chapterLength;

    // Find all embedded texts (sentences + pairs) that fall within this segment
    const textsInSegment = allEmbeddings.filter(
      (e) => e.charIndex >= segStart && e.charIndex < segEnd,
    );

    let bestScore = -1;
    let bestEnvironment = 'unknown';
    let bestSnippet = '';

    for (const embeddedText of textsInSegment) {
      // Match against ambient index — top-1 per text
      const results = searchEmbeddingsWithVector(ambientIndex, embeddedText.vector, 1);
      if (results.length === 0) continue;

      const topResult = results[0];
      if (topResult.score > bestScore) {
        bestScore = topResult.score;
        // Environment label: winning ambient asset's description (truncated to 60 chars)
        bestEnvironment = topResult.text.length > 60
          ? topResult.text.substring(0, 60)
          : topResult.text;
        // searchSnippets: the winning text's content (backward compatibility)
        bestSnippet = embeddedText.text;
      }
    }

    // If no text scored above threshold, use highest anyway (every segment needs ambient)
    if (bestScore < ambientThreshold && textsInSegment.length > 0) {
      console.log(`  🔬 Ambient segment ${si}: best score ${bestScore.toFixed(3)} below threshold ${ambientThreshold} — using anyway`);
    }

    // Fallback: if segment has no texts at all (shouldn't happen with proper splitting)
    if (textsInSegment.length === 0) {
      console.warn(`  ⚠️ Ambient segment ${si}: no texts in range [${segStart}, ${segEnd}) — using empty match`);
      bestEnvironment = 'unknown';
      bestSnippet = '';
    }

    sceneSegments.push({
      charIndex: segStart,
      environment: bestEnvironment,
      searchSnippets: bestSnippet ? [bestSnippet] : [],
      moods: [],
    });
  }

  return sceneSegments;
}

// ========================================
// Step 4: SFX Matching
// ========================================

/**
 * Match individual sentence embeddings against the SFX catalog.
 * Max 1 SFX per sentence. Multi-SFX sentences produce a blended embedding
 * that naturally picks the dominant sound.
 *
 * @param sentenceEmbeddings - Individual sentence embeddings (NOT pairs)
 * @param sfxIndex - Pre-built SFX embedding index
 * @param threshold - Minimum cosine similarity threshold
 * @returns SfxEvent array sorted by charIndex
 */
function matchSfx(
  sentenceEmbeddings: EmbeddedText[],
  sfxIndex: EmbeddingIndex,
  threshold: number,
): SfxEvent[] {
  const sfxEvents: SfxEvent[] = [];

  for (const embedded of sentenceEmbeddings) {
    // Match against SFX index — top-1 per sentence
    const results = searchEmbeddingsWithVector(sfxIndex, embedded.vector, 1);
    if (results.length === 0) continue;

    const topResult = results[0];
    if (topResult.score < threshold) continue;

    sfxEvents.push({
      query: embedded.text,
      charIndex: embedded.charIndex,
      description: topResult.text,
    });
  }

  // Sort by charIndex ascending
  sfxEvents.sort((a, b) => a.charIndex - b.charIndex);

  return sfxEvents;
}
