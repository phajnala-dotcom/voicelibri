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
import path from 'path';
import crypto from 'crypto';
import {
  AMBIENT_EMBEDDINGS_PATH,
  SFX_EMBEDDINGS_PATH,
  CROPPED_SFX_CACHE_DIR,
  AUDIO_SAMPLE_RATE,
  AUDIO_CHANNELS,
  AUDIO_CODEC,
} from './config.js';
import { loadCatalog, loadSfxCatalog } from './catalogLoader.js';
import { runFfmpeg, getAudioDuration } from './ffmpegRunner.js';
import {
  buildEmbeddingIndex,
  saveEmbeddingIndex,
  loadEmbeddingIndex,
  getAmbientIndex,
  setAmbientIndex,
  getSfxIndex,
  setSfxIndex,
  searchEmbeddingsBatch,
  searchEmbeddingsWithVector,
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
 * Resolve the best matching ambient asset using a pre-computed embedding vector.
 * Avoids re-embedding — uses the vector already computed by deterministicAnalyzer.
 *
 * Prefers longer-duration assets among top candidates (within score delta ≤0.02)
 * to reduce audible looping, same strategy as resolveAmbientAsset().
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
): Promise<{ asset: SoundAsset; score: number } | null> {
  const index = await ensureAmbientEmbeddingIndex();
  const catalog = loadCatalog();

  // Pure in-memory cosine similarity, no API calls, <1ms
  const results = searchEmbeddingsWithVector(index, embeddingVector, topK);

  if (results.length === 0) {
    console.warn(`⚠️ No ambient matches for ${logContext}`);
    return null;
  }

  // Same duration-aware preference logic as resolveAmbientAsset()
  const SCORE_DELTA = 0.02;
  const DURATION_FACTOR = 1.5;

  type RankedCandidate = { asset: SoundAsset; score: number };
  let bestCandidate: RankedCandidate | null = null;
  const topCandidates: RankedCandidate[] = [];

  for (const result of results) {
    const asset = catalog.find((a) => a.id === result.id);
    if (!asset) continue;

    if (!fs.existsSync(asset.filePath)) {
      console.warn(`⚠️ Asset file missing: ${asset.filePath}`);
      continue;
    }

    if (!bestCandidate) {
      bestCandidate = { asset, score: result.score };
      topCandidates.push(bestCandidate);
      continue;
    }

    if (bestCandidate.score - result.score <= SCORE_DELTA) {
      topCandidates.push({ asset, score: result.score });
    } else {
      break;
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
        break;
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
 * Dual-index search: each event's `query` is embedded and matched against
 * BOTH the SFX catalog and the ambient (realistic) catalog. The winner is
 * selected by highest cosine similarity, with a small preference boost for
 * SFX assets (+0.03) since they are already the correct length/dynamics for
 * one-shot sound effects.
 *
 * If the winning asset comes from the ambient catalog, it is automatically
 * cropped to ~5 seconds centered on the loudest peak (with 250ms fades)
 * and cached for reuse.
 *
 * Events that score below the relevance threshold or whose file is missing are
 * returned with `asset: null` so callers can skip them cleanly.
 *
 * @param sfxEvents - SFX events from SceneAnalysis (each carrying a `query` and `charIndex`)
 * @returns Per-event results: `{ sfxEvent, asset, score, fromAmbient }` — asset may be null
 */
export async function resolveSfxEvents(
  sfxEvents: SfxEvent[]
): Promise<Array<{ sfxEvent: SfxEvent; asset: SoundAsset | null; score: number; fromAmbient: boolean }>> {
  if (sfxEvents.length === 0) return [];

  /** SFX assets get a small preference boost — they have correct length/dynamics for one-shots */
  const SFX_PREFERENCE_BOOST = 0.03;
  /** Minimum cosine similarity for any match to be used */
  const MIN_THRESHOLD = 0.65;
  /** Crop duration for ambient assets used as SFX (seconds) */
  const CROP_DURATION_SEC = 5;
  /** Fade in/out for cropped ambient SFX (ms) */
  const CROP_FADE_MS = 250;

  const [sfxIndex, ambientIndex] = await Promise.all([
    ensureSfxEmbeddingIndex(),
    ensureAmbientEmbeddingIndex(),
  ]);
  const sfxCatalog = loadSfxCatalog();
  const ambientCatalog = loadCatalog();

  // Embed all queries and search both indexes in parallel
  const queries = sfxEvents.map((e) => e.query);
  const [sfxBatch, ambientBatch] = await Promise.all([
    searchEmbeddingsBatch(sfxIndex, queries, 3),
    searchEmbeddingsBatch(ambientIndex, queries, 3),
  ]);

  const results: Array<{ sfxEvent: SfxEvent; asset: SoundAsset | null; score: number; fromAmbient: boolean }> = [];

  for (let i = 0; i < sfxEvents.length; i++) {
    const sfxTop = sfxBatch[i]?.results[0];
    const ambientTop = ambientBatch[i]?.results[0];

    const sfxScore = sfxTop?.score ?? 0;
    const ambientScore = ambientTop?.score ?? 0;
    const sfxScoreBoosted = sfxScore + SFX_PREFERENCE_BOOST;

    // Determine winner: highest effective score
    const sfxWins = sfxScoreBoosted >= ambientScore;
    const winningScore = sfxWins ? sfxScore : ambientScore;

    // Below minimum threshold — no match
    if (winningScore < MIN_THRESHOLD) {
      console.log(`  🎯 SFX[${i}]: "${sfxEvents[i].query.substring(0, 50)}" — no match above ${MIN_THRESHOLD} (sfx=${sfxScore.toFixed(3)}, ambient=${ambientScore.toFixed(3)})`);
      results.push({ sfxEvent: sfxEvents[i], asset: null, score: 0, fromAmbient: false });
      continue;
    }

    if (sfxWins && sfxTop) {
      // SFX catalog wins (with preference boost)
      const asset = sfxCatalog.find((a) => a.id === sfxTop.id) ?? null;
      if (asset && fs.existsSync(asset.filePath)) {
        console.log(`  🎯 SFX[${i}]: "${sfxEvents[i].query.substring(0, 40)}" → SFX "${asset.description?.substring(0, 40)}" (score=${sfxScore.toFixed(3)}, ambient=${ambientScore.toFixed(3)})`);
        results.push({ sfxEvent: sfxEvents[i], asset, score: sfxScore, fromAmbient: false });
        continue;
      }
    }

    if (ambientTop) {
      // Ambient catalog wins — need to crop to SFX-length clip
      const asset = ambientCatalog.find((a) => a.id === ambientTop.id) ?? null;
      if (asset && fs.existsSync(asset.filePath)) {
        try {
          const croppedPath = await cropAmbientForSfx(asset.filePath, CROP_DURATION_SEC, CROP_FADE_MS);
          if (croppedPath) {
            // Create a modified asset pointing to the cropped file
            const croppedAsset: SoundAsset = {
              ...asset,
              filePath: croppedPath,
              loopable: false,
            };
            console.log(`  🎯 SFX[${i}]: "${sfxEvents[i].query.substring(0, 40)}" → AMBIENT(cropped) "${asset.description?.substring(0, 40)}" (score=${ambientScore.toFixed(3)}, sfx=${sfxScore.toFixed(3)})`);
            results.push({ sfxEvent: sfxEvents[i], asset: croppedAsset, score: ambientScore, fromAmbient: true });
            continue;
          }
        } catch (cropErr) {
          console.warn(`  ⚠️ SFX[${i}]: Ambient crop failed:`, cropErr instanceof Error ? cropErr.message : cropErr);
        }
      }
    }

    // Fallback: try SFX without boost if it was above threshold
    if (sfxTop && sfxScore >= MIN_THRESHOLD) {
      const asset = sfxCatalog.find((a) => a.id === sfxTop.id) ?? null;
      if (asset && fs.existsSync(asset.filePath)) {
        results.push({ sfxEvent: sfxEvents[i], asset, score: sfxScore, fromAmbient: false });
        continue;
      }
    }

    results.push({ sfxEvent: sfxEvents[i], asset: null, score: 0, fromAmbient: false });
  }

  return results;
}

// ========================================
// Ambient-to-SFX cropping
// ========================================

/**
 * Crop an ambient asset to a short SFX-length clip centered on the loudest moment.
 *
 * Uses ffmpeg `ebur128` filter to find the peak momentary loudness timestamp,
 * then crops `cropDurationSec` seconds around it with fade in/out.
 *
 * Results are cached in CROPPED_SFX_CACHE_DIR keyed by MD5 hash of the source
 * file path + crop parameters, so the same ambient asset is only cropped once.
 *
 * @param ambientFilePath - Path to the full ambient OGG file
 * @param cropDurationSec - Target crop length in seconds (default: 5)
 * @param fadeMs - Fade in/out duration in milliseconds (default: 250)
 * @returns Path to the cropped OGG file, or null if cropping failed
 */
async function cropAmbientForSfx(
  ambientFilePath: string,
  cropDurationSec: number = 5,
  fadeMs: number = 250,
): Promise<string | null> {
  // Ensure cache directory exists
  if (!fs.existsSync(CROPPED_SFX_CACHE_DIR)) {
    fs.mkdirSync(CROPPED_SFX_CACHE_DIR, { recursive: true });
  }

  // Cache key: hash of source path + crop params
  const cacheKey = crypto
    .createHash('md5')
    .update(`${ambientFilePath}|${cropDurationSec}|${fadeMs}`)
    .digest('hex');
  const cachedPath = path.join(CROPPED_SFX_CACHE_DIR, `${cacheKey}.ogg`);

  // Return cached version if it exists
  if (fs.existsSync(cachedPath)) {
    return cachedPath;
  }

  // Get total duration
  const totalDur = await getAudioDuration(ambientFilePath);
  if (totalDur <= 0) return null;

  const fadeSec = fadeMs / 1000;

  // If file is already shorter than crop duration, just copy with fades
  if (totalDur <= cropDurationSec) {
    const fadeOutStart = Math.max(totalDur - fadeSec, 0);
    const result = await runFfmpeg([
      '-i', ambientFilePath,
      '-af', `afade=t=in:st=0:d=${fadeSec},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeSec}`,
      '-ar', AUDIO_SAMPLE_RATE.toString(),
      '-ac', AUDIO_CHANNELS.toString(),
      '-c:a', AUDIO_CODEC,
      cachedPath,
    ]);
    return result.code === 0 ? cachedPath : null;
  }

  // Find loudest moment using ebur128 momentary loudness
  let peakTimeSec = totalDur / 2; // fallback: center of file
  try {
    const analyzeResult = await runFfmpeg([
      '-i', ambientFilePath,
      '-af', 'ebur128=peak=true',
      '-f', 'null', '-',
    ]);

    // Parse momentary loudness (M:) values from ebur128 stderr output
    // Format: "t: 1.2      TARGET:-23 LUFS  M: -18.5 S: ..."
    let maxM = -Infinity;
    const lines = analyzeResult.stderr.split('\n');
    for (const line of lines) {
      const match = line.match(/t:\s*([\d.]+)\s.*M:\s*(-?[\d.]+)/);
      if (match) {
        const t = parseFloat(match[1]);
        const m = parseFloat(match[2]);
        if (m > maxM) {
          maxM = m;
          peakTimeSec = t;
        }
      }
    }
  } catch { /* use fallback center */ }

  // Calculate crop window centered on peak
  const halfCrop = cropDurationSec / 2;
  let cropStart = Math.max(0, peakTimeSec - halfCrop);
  // Ensure crop doesn't extend past file end
  if (cropStart + cropDurationSec > totalDur) {
    cropStart = Math.max(0, totalDur - cropDurationSec);
  }

  // Crop with fade in/out
  const fadeOutStart = Math.max(cropDurationSec - fadeSec, 0);
  const result = await runFfmpeg([
    '-i', ambientFilePath,
    '-ss', cropStart.toFixed(3),
    '-t', cropDurationSec.toString(),
    '-af', `afade=t=in:st=0:d=${fadeSec},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeSec}`,
    '-ar', AUDIO_SAMPLE_RATE.toString(),
    '-ac', AUDIO_CHANNELS.toString(),
    '-c:a', AUDIO_CODEC,
    cachedPath,
  ]);

  if (result.code === 0) {
    console.log(`  ✂️ Cropped ambient→SFX: ${path.basename(ambientFilePath)} → ${cacheKey}.ogg (${cropDurationSec}s @ ${cropStart.toFixed(1)}s)`);
    return cachedPath;
  }

  console.warn(`  ⚠️ Ambient crop failed: ${result.stderr.substring(0, 200)}`);
  return null;
}
