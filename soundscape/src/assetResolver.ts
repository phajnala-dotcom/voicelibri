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
  ChapterSoundscapePlan,
  EmbeddingIndex,
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
 * Resolve a single SceneAnalysis to the best matching ambient asset.
 *
 * Embeds all searchSnippets concurrently, collects top-K results from each,
 * then picks the asset with the highest score across all snippets.
 *
 * @param scene - LLM-generated scene analysis with direct text snippets
 * @param topK - Number of candidates to consider per snippet
 * @returns Best matching SoundAsset or null if nothing suitable
 */
export async function resolveAmbientAsset(
  scene: SceneAnalysis,
  topK: number = 5
): Promise<{ asset: SoundAsset; score: number } | null> {
  const index = await ensureAmbientEmbeddingIndex();
  const catalog = loadCatalog();

  if (scene.searchSnippets.length === 0) {
    console.warn(`⚠️ No search snippets for chapter ${scene.chapterIndex}`);
    return null;
  }

  // Embed all snippets concurrently and search
  const batchResults = await searchEmbeddingsBatch(index, scene.searchSnippets, topK);

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
    console.warn(`⚠️ All matched assets have missing files for chapter ${scene.chapterIndex}`);
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
    console.log(`🔍 Resolving ambient for chapter ${scene.chapterIndex}: ${scene.searchSnippets.length} snippet(s)`);

    const match = await resolveAmbientAsset(scene);

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
  scene: SceneAnalysis,
  catalog: SoundAsset[]
): SoundAsset | null {
  // Collect all words from all snippets
  const queryWords = new Set(
    scene.searchSnippets.flatMap((s) => s.toLowerCase().split(/\s+/))
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
 * Resolve up to N SFX assets from the scene's sfxQueries.
 * Uses the same embedding search approach as ambient, but against SFX catalog.
 * No duration preference (SFX are short one-shot sounds).
 *
 * @param scene - Scene analysis with sfxQueries
 * @param maxResults - Maximum SFX assets to return (default 2)
 * @returns Array of matching SFX assets with scores
 */
export async function resolveSfxAssets(
  scene: SceneAnalysis
): Promise<Array<{ asset: SoundAsset; score: number }>> {
  if (!scene.sfxQueries || scene.sfxQueries.length === 0) {
    return [];
  }

  const index = await ensureSfxEmbeddingIndex();
  const catalog = loadSfxCatalog();

  const batchResults = await searchEmbeddingsBatch(index, scene.sfxQueries, 3);

  // Aggregate: best score per asset across all queries
  const assetScores = new Map<string, number>();
  for (const br of batchResults) {
    for (const result of br.results) {
      const existing = assetScores.get(result.id) ?? 0;
      if (result.score > existing) {
        assetScores.set(result.id, result.score);
      }
    }
  }

  // Sort by score descending — return ALL assets above score threshold (no artificial limit)
  const ranked = [...assetScores.entries()].sort((a, b) => b[1] - a[1]);
  const results: Array<{ asset: SoundAsset; score: number }> = [];

  for (const [assetId, score] of ranked) {
    const asset = catalog.find((a) => a.id === assetId);
    if (!asset) continue;
    if (!fs.existsSync(asset.filePath)) continue;

    // Minimum score threshold for SFX relevance
    if (score < 0.5) break;

    results.push({ asset, score });
  }

  return results;
}
