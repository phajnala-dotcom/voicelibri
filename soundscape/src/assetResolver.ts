/**
 * Soundscape Module — Asset Resolver
 *
 * Resolves SceneAnalysis objects to concrete SoundAsset files
 * using the ambient catalog + embedding similarity search.
 *
 * Flow:
 *   1. Load ambient catalog (catalogLoader)
 *   2. Build or load ambient embedding index
 *   3. For each chapter's SceneAnalysis.searchQuery, find best match
 *   4. Verify file existence before returning
 */

import fs from 'fs';
import { AMBIENT_EMBEDDINGS_PATH } from './config.js';
import { loadCatalog } from './catalogLoader.js';
import {
  buildEmbeddingIndex,
  saveEmbeddingIndex,
  getAmbientIndex,
  setAmbientIndex,
  searchEmbeddings,
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

  // Build from catalog
  console.log('🔊 Building ambient embedding index...');
  const catalog = loadCatalog();

  if (catalog.length === 0) {
    throw new Error('No ambient assets in catalog — cannot build embedding index');
  }

  // Use description + keywords for rich embedding text
  const items = catalog.map((asset) => ({
    id: asset.id,
    text: buildEmbeddingText(asset),
  }));

  const index = await buildEmbeddingIndex(items, (batch, total) => {
    console.log(`  📊 Ambient embedding batch ${batch}/${total}`);
  });

  // Persist and cache
  saveEmbeddingIndex(index, AMBIENT_EMBEDDINGS_PATH);
  setAmbientIndex(index);
  return index;
}

/**
 * Build a rich text representation of an asset for embedding.
 * Combines description, category, subcategory, and keywords.
 */
function buildEmbeddingText(asset: SoundAsset): string {
  const parts: string[] = [];

  if (asset.category) parts.push(asset.category);
  if (asset.subcategory) parts.push(asset.subcategory);
  if (asset.description) parts.push(asset.description);
  if (asset.keywords.length > 0) parts.push(asset.keywords.join(' '));

  return parts.join(' — ');
}

// ========================================
// Scene → Asset resolution
// ========================================

/**
 * Resolve a single SceneAnalysis to the best matching ambient asset.
 *
 * @param scene - LLM-generated scene analysis
 * @param topK - Number of candidates to consider
 * @returns Best matching SoundAsset or null if nothing suitable
 */
export async function resolveAmbientAsset(
  scene: SceneAnalysis,
  topK: number = 5
): Promise<{ asset: SoundAsset; score: number } | null> {
  const index = await ensureAmbientEmbeddingIndex();
  const catalog = loadCatalog();

  // Search using the LLM's search query
  const results = await searchEmbeddings(index, scene.searchQuery, topK);

  if (results.length === 0) {
    console.warn(`⚠️ No ambient match for: "${scene.searchQuery}"`);
    return null;
  }

  // Find the best result that actually has an existing file
  for (const result of results) {
    const asset = catalog.find((a) => a.id === result.id);
    if (!asset) continue;

    // Verify file exists on disk
    if (fs.existsSync(asset.filePath)) {
      return { asset, score: result.score };
    } else {
      console.warn(`⚠️ Asset file missing: ${asset.filePath}`);
    }
  }

  console.warn(`⚠️ All matched assets have missing files for: "${scene.searchQuery}"`);
  return null;
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
    console.log(`🔍 Resolving ambient for chapter ${scene.chapterIndex}: "${scene.searchQuery}"`);

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
  const queryWords = new Set(
    scene.searchQuery.toLowerCase().split(/\s+/)
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
