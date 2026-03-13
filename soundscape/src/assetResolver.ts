/**
 * Soundscape Module — Asset Resolver
 *
 * Resolves SceneAnalysis objects to concrete SoundAsset files
 * using the ambient catalog + embedding similarity search.
 *
 * Flow:
 *   1. Load ambient catalog (catalogLoader)
 *   2. Build or load ambient embedding index (description-only)
 *   3. For each chapter's SceneAnalysis.searchSnippets, embed concurrently
 *      and find best matching asset across all snippets
 *   4. Verify file existence before returning
 */

import fs from 'fs';
import { AMBIENT_EMBEDDINGS_PATH, SFX_EMBEDDINGS_PATH } from './config.js';
import { loadCatalog, loadSfxCatalog } from './catalogLoader.js';
import {
  buildEmbeddingIndex,
  saveEmbeddingIndex,
  loadEmbeddingIndex,
  getAmbientIndex,
  setAmbientIndex,
  getSfxIndex,
  setSfxIndex,
  searchEmbeddingsBatch,
} from './embeddings.js';
import type {
  SoundAsset,
  SceneAnalysis,
  SceneSegment,
  ChapterSoundscapePlan,
  EmbeddingIndex,
  SfxEvent,
} from './types.js';

// ========================================
// Ambient index management
// ========================================

/**
 * Ensure the ambient embedding index exists.
 * Builds from catalog descriptions if not cached on disk.
 */
export async function ensureAmbientEmbeddingIndex(): Promise<EmbeddingIndex> {
  // Try in-memory cache
  const cached = getAmbientIndex();
  if (cached) return cached;

  // Try loading from disk
  const fromDisk = loadEmbeddingIndex(AMBIENT_EMBEDDINGS_PATH);
  if (fromDisk && fromDisk.entries.length > 0) {
    console.log(`🔊 Loaded ambient embedding index from disk (${fromDisk.entries.length} entries)`);
    setAmbientIndex(fromDisk);
    return fromDisk;
  }

  // Build from catalog (ambient assets only)
  console.log('🔊 Building ambient embedding index (first run — this takes a while)...');
  const catalog = loadCatalog().filter((a) => a.type === 'ambient');

  if (catalog.length === 0) {
    throw new Error('No ambient assets in catalog — cannot build embedding index');
  }

  // Use description-only for clean semantic embedding
  const items = catalog.map((asset) => ({
    id: asset.id,
    text: buildEmbeddingText(asset),
  }));

  const index = await buildEmbeddingIndex(items, (batch, total) => {
    if (batch % 500 === 0 || batch === total) {
      console.log(`  📊 Ambient embedding ${batch}/${total}`);
    }
  });

  // Persist and cache
  saveEmbeddingIndex(index, AMBIENT_EMBEDDINGS_PATH);
  setAmbientIndex(index);
  return index;
}

/**
 * Get embedding text for an asset — description only.
 * Descriptions are already clean and semantically rich from the catalog.
 * Adding category/subcategory/keywords worsens semantic clarity for cosine search.
 */
function buildEmbeddingText(asset: SoundAsset): string {
  return asset.description || asset.id;
}

// ========================================
// Scene → Asset resolution
// ========================================

/**
 * Resolve the best matching ambient asset for an array of English search snippets.
 *
 * Embeds all snippets concurrently, collects top-K results from each, then picks
 * the asset with the highest score. Prefers longer-duration assets among top
 * candidates (within score delta ≤0.02) to reduce audible looping.
 *
 * @param searchSnippets - English search queries describing the ambient soundscape
 * @param logContext     - Human-readable label for log messages (e.g. "chapter 3 seg 0")
 * @param topK           - Candidates to consider per snippet
 * @returns Best matching SoundAsset with score, or null if nothing suitable
 */
export async function resolveAmbientAsset(
  searchSnippets: string[],
  logContext: string = 'unknown',
  topK: number = 5
): Promise<{ asset: SoundAsset; score: number } | null> {
  const index = await ensureAmbientEmbeddingIndex();
  const catalog = loadCatalog();

  if (searchSnippets.length === 0) {
    console.warn(`⚠️ No search snippets for ${logContext}`);
    return null;
  }

  // Embed all snippets concurrently and search
  const batchResults = await searchEmbeddingsBatch(index, searchSnippets, topK);

  // Aggregate: find the best-scoring asset across all snippets
  const assetScores = new Map<string, number>();
  for (const br of batchResults) {
    for (const result of br.results) {
      const existing = assetScores.get(result.id) ?? 0;
      // Keep the maximum score seen for this asset across all snippets
      if (result.score > existing) {
        assetScores.set(result.id, result.score);
      }
    }
  }

  // Sort by score descending
  const ranked = [...assetScores.entries()].sort((a, b) => b[1] - a[1]);

  // Find the best result that actually has an existing file,
  // with duration-aware preference: among top candidates within Δ≤0.02
  // of the best score, prefer one with duration ≥1.5× longer to reduce
  // looping artifacts (shorter loops sound more repetitive).
  const SCORE_DELTA = 0.02;
  const DURATION_FACTOR = 1.5;

  // First pass: collect top candidates within score delta that have existing files
  type RankedCandidate = { asset: SoundAsset; score: number };
  let bestCandidate: RankedCandidate | null = null;
  const topCandidates: RankedCandidate[] = [];

  for (const [assetId, score] of ranked) {
    const asset = catalog.find((a) => a.id === assetId);
    if (!asset) continue;

    if (!fs.existsSync(asset.filePath)) {
      console.warn(`⚠️ Asset file missing: ${asset.filePath}`);
      continue;
    }

    if (!bestCandidate) {
      bestCandidate = { asset, score };
      topCandidates.push(bestCandidate);
      continue;
    }

    // Only consider candidates within score delta of the best
    if (bestCandidate.score - score <= SCORE_DELTA) {
      topCandidates.push({ asset, score });
    } else {
      break; // scores are sorted descending, no more within delta
    }
  }

  if (!bestCandidate) {
    console.warn(`⚠️ All matched assets have missing files for ${logContext}`);
    return null;
  }

  // Among top candidates, prefer the longest one to reduce looping
  if (topCandidates.length > 1) {
    const bestDuration = bestCandidate.asset.durationSec ?? 0;
    for (const candidate of topCandidates) {
      const candidateDuration = candidate.asset.durationSec ?? 0;
      if (candidateDuration >= bestDuration * DURATION_FACTOR) {
        console.log(
          `🔄 Duration preference: swapping "${bestCandidate.asset.description.substring(0, 50)}" ` +
          `(${bestDuration.toFixed(0)}s, score=${bestCandidate.score.toFixed(3)}) → ` +
          `"${candidate.asset.description.substring(0, 50)}" ` +
          `(${candidateDuration.toFixed(0)}s, score=${candidate.score.toFixed(3)})`
        );
        bestCandidate = candidate;
        break; // take the first (highest-scored) longer candidate
      }
    }
  }

  return { asset: bestCandidate.asset, score: bestCandidate.score };
}

/**
 * Resolve ambient assets for all chapters at once.
 *
 * @param scenes - Array of SceneAnalysis from llmDirector
 * @param defaultVolumeDb - Default ambient volume (from config AMBIENT_DEFAULT_DB)
 * @returns ChapterSoundscapePlan[] ready for ambientLayer processing
 */
export async function resolveAllChapterAssets(
  scenes: SceneAnalysis[],
  defaultVolumeDb: number = -6
): Promise<ChapterSoundscapePlan[]> {
  // Ensure index is built once
  await ensureAmbientEmbeddingIndex();

  const plans: ChapterSoundscapePlan[] = [];

  for (const scene of scenes) {
    // Use the dominant segment (first) for chapter-level plan
    const dominantSegment = scene.sceneSegments[0];
    const snippets = dominantSegment?.searchSnippets ?? [];
    console.log(`🔍 Resolving ambient for chapter ${scene.chapterIndex}: ${snippets.length} snippet(s)`);

    const match = await resolveAmbientAsset(snippets, `chapter ${scene.chapterIndex}`);

    if (match) {
      console.log(`  ✓ Matched: ${match.asset.description.substring(0, 80)} (score=${match.score.toFixed(3)})`);
    } else {
      console.log(`  ✗ No suitable ambient found`);
    }

    // Adjust volume based on intensity
    const volumeDb = match
      ? defaultVolumeDb - (1 - scene.intensity) * 3 // quieter for calm scenes
      : defaultVolumeDb;

    plans.push({
      chapterIndex: scene.chapterIndex,
      scene,
      ambientAsset: match?.asset ?? null,
      ambientVolumeDb: volumeDb,
    });
  }

  return plans;
}

/**
 * Quick keyword-based fallback resolution (no embeddings needed).
 * Used when embedding index is unavailable or for rapid prototyping.
 */
export function resolveByKeyword(
  searchSnippets: string[],
  catalog: SoundAsset[]
): SoundAsset | null {
  console.warn(`⚠️ resolveByKeyword() activated — embedding resolution failed, falling back to keyword matching. Snippets: ${JSON.stringify(searchSnippets).substring(0, 200)}`);
  // Collect all words from all snippets
  const queryWords = new Set(
    searchSnippets.flatMap((s) => s.toLowerCase().split(/\s+/))
  );

  let bestAsset: SoundAsset | null = null;
  let bestOverlap = 0;

  for (const asset of catalog) {
    // Count keyword overlap
    let overlap = 0;
    for (const kw of asset.keywords) {
      if (queryWords.has(kw)) overlap++;
    }

    // Also check description words
    const descWords = asset.description.toLowerCase().split(/\s+/);
    for (const dw of descWords) {
      if (queryWords.has(dw)) overlap += 0.5;
    }

    if (overlap > bestOverlap && fs.existsSync(asset.filePath)) {
      bestOverlap = overlap;
      bestAsset = asset;
    }
  }

  return bestAsset;
}

// ========================================
// SFX embedding index + resolution
// ========================================

/**
 * Resolve an ambient asset for each scene segment.
 *
 * Reuses `resolveAmbientAsset()` per segment. Segments that cannot be matched
 * above the embedding threshold return `asset: null` (silence for that segment).
 *
 * @param sceneSegments - Ordered scene segments from SceneAnalysis.sceneSegments
 * @returns Per-segment results: `{ segment, asset, score }` — asset may be null
 */
export async function resolveSceneSegmentAssets(
  sceneSegments: SceneSegment[]
): Promise<Array<{ segment: SceneSegment; asset: SoundAsset | null; score: number }>> {
  if (sceneSegments.length === 0) return [];

  // Ensure index is ready
  await ensureAmbientEmbeddingIndex();

  const results: Array<{ segment: SceneSegment; asset: SoundAsset | null; score: number }> = [];

  for (let i = 0; i < sceneSegments.length; i++) {
    const segment = sceneSegments[i];
    const logContext = `segment ${i} (env: ${segment.environment.substring(0, 40)})`;

    if (segment.searchSnippets.length === 0) {
      console.warn(`⚠️ No search snippets for ${logContext} — skipping ambient`);
      results.push({ segment, asset: null, score: 0 });
      continue;
    }

    try {
      const match = await resolveAmbientAsset(segment.searchSnippets, logContext);
      if (match) {
        console.log(`  ✓ Segment ${i}: "${match.asset.description.substring(0, 60)}" (score=${match.score.toFixed(3)})`);
        results.push({ segment, asset: match.asset, score: match.score });
      } else {
        console.log(`  ✗ Segment ${i}: no match above threshold — silence for this segment`);
        results.push({ segment, asset: null, score: 0 });
      }
    } catch (err) {
      console.warn(`⚠️ Segment ${i} ambient resolution failed:`, err instanceof Error ? err.message : err);
      results.push({ segment, asset: null, score: 0 });
    }
  }

  return results;
}


/**
 * Ensure the SFX embedding index exists.
 * Builds from SFX catalog descriptions if not cached on disk.
 */
export async function ensureSfxEmbeddingIndex(): Promise<EmbeddingIndex> {
  const cached = getSfxIndex();
  if (cached) return cached;

  const fromDisk = loadEmbeddingIndex(SFX_EMBEDDINGS_PATH);
  if (fromDisk && fromDisk.entries.length > 0) {
    console.log(`🔊 Loaded SFX embedding index from disk (${fromDisk.entries.length} entries)`);
    setSfxIndex(fromDisk);
    return fromDisk;
  }

  console.log('🔊 Building SFX embedding index (first run — this takes a while)...');
  const catalog = loadSfxCatalog();

  if (catalog.length === 0) {
    throw new Error('No SFX assets in catalog — cannot build SFX embedding index');
  }

  const items = catalog.map((asset) => ({
    id: asset.id,
    text: asset.description || asset.id,
  }));

  const index = await buildEmbeddingIndex(items, (batch, total) => {
    if (batch % 200 === 0 || batch === total) {
      console.log(`  📊 SFX embedding ${batch}/${total}`);
    }
  });

  saveEmbeddingIndex(index, SFX_EMBEDDINGS_PATH);
  setSfxIndex(index);
  return index;
}

/**
 * Resolve a SoundAsset from the SFX catalog for each SfxEvent.
 *
 * Each event's `query` string is embedded and matched against the SFX catalog.
 * Events that score below the relevance threshold or whose file is missing are
 * returned with `asset: null` so callers can skip them cleanly.
 *
 * @param sfxEvents - SFX events from SceneAnalysis (each carrying a `query` and `charIndex`)
 * @returns Per-event results: `{ sfxEvent, asset, score }` — asset may be null if unresolved
 */
export async function resolveSfxEvents(
  sfxEvents: SfxEvent[]
): Promise<Array<{ sfxEvent: SfxEvent; asset: SoundAsset | null; score: number }>> {
  if (sfxEvents.length === 0) return [];

  const index = await ensureSfxEmbeddingIndex();
  const catalog = loadSfxCatalog();

  // Batch-embed all unique queries in one call
  const queries = sfxEvents.map((e) => e.query);
  const batchResults = await searchEmbeddingsBatch(index, queries, 3);

  return sfxEvents.map((sfxEvent, i) => {
    // Top-1 result for this query — reject below 0.72 (no sound better than wrong sound)
    const topResult = batchResults[i]?.results[0];
    if (!topResult || topResult.score < 0.72) {
      return { sfxEvent, asset: null, score: 0 };
    }

    const asset = catalog.find((a) => a.id === topResult.id) ?? null;
    if (!asset || !fs.existsSync(asset.filePath)) {
      return { sfxEvent, asset: null, score: topResult.score };
    }

    return { sfxEvent, asset, score: topResult.score };
  });
}
