/**
 * Soundscape Module — Music Selector
 *
 * Hybrid two-pass music selection:
 *   1. Genre mapping: bookInfo.genre/tone/period → candidate music folders
 *   2. Embedding search: filename embedding similarity within candidates
 *
 * Music assets live in soundscape/assets/music/{genre}/*.ogg
 * They are NOT in the XLSX catalog — matching uses OGG filenames only.
 */

import fs from 'fs';
import path from 'path';
import {
  MUSIC_ASSETS_DIR,
  GENRE_MUSIC_MAP,
  DEFAULT_MUSIC_FOLDERS,
  MUSIC_EMBEDDINGS_PATH,
} from './config.js';
import {
  buildEmbeddingIndex,
  saveEmbeddingIndex,
  getMusicIndex,
  setMusicIndex,
  searchEmbeddings,
} from './embeddings.js';
import type {
  SoundAsset,
  BookInfo,
  MusicSelectionResult,
  EmbeddingIndex,
} from './types.js';

// ========================================
// Music asset scanning
// ========================================

/**
 * Scan music folders and build SoundAsset entries from OGG files.
 * Parses the filename to extract a human-readable description.
 *
 * @param folderFilter - If provided, only scan these specific folder names
 */
export function scanMusicAssets(folderFilter?: string[]): SoundAsset[] {
  const assets: SoundAsset[] = [];

  if (!fs.existsSync(MUSIC_ASSETS_DIR)) {
    console.warn(`⚠️ Music assets directory not found: ${MUSIC_ASSETS_DIR}`);
    return assets;
  }

  const folders = fs.readdirSync(MUSIC_ASSETS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => !folderFilter || folderFilter.includes(d.name));

  for (const folder of folders) {
    const folderPath = path.join(MUSIC_ASSETS_DIR, folder.name);
    const files = fs.readdirSync(folderPath)
      .filter((f) => f.toLowerCase().endsWith('.ogg'));

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const label = filenameToLabel(file);
      assets.push({
        id: `music/${folder.name}/${file}`,
        type: 'music',
        filePath,
        description: label,
        keywords: label.split(' '),
        genre: [folder.name.toLowerCase()],
        mood: [],
      });
    }
  }

  return assets;
}

/**
 * Convert OGG filename to readable label for embedding.
 *
 * E.g. "autumn-leaves-ambient-harp-117800.ogg"
 *    → "autumn leaves ambient harp"
 */
function filenameToLabel(filename: string): string {
  return filename
    .replace(/\.ogg$/i, '')     // remove extension
    .replace(/[-_]/g, ' ')       // dashes/underscores → spaces
    .replace(/\d{4,}/g, '')      // remove long numeric IDs
    .replace(/\s+/g, ' ')        // collapse whitespace
    .trim();
}

// ========================================
// Genre-based folder selection (pass 1)
// ========================================

/**
 * Determine candidate music folders based on book metadata.
 * Checks genre, then tone, then period for matches.
 */
export function resolveMusicFolders(bookInfo: BookInfo): string[] {
  const candidates = new Set<string>();

  // Try genre first
  const genreKey = bookInfo.genre?.toLowerCase().replace(/\s+/g, ' ');
  if (genreKey && GENRE_MUSIC_MAP[genreKey]) {
    for (const f of GENRE_MUSIC_MAP[genreKey]) candidates.add(f);
  }

  // Try tone
  const toneKey = bookInfo.tone?.toLowerCase();
  if (toneKey && GENRE_MUSIC_MAP[toneKey]) {
    for (const f of GENRE_MUSIC_MAP[toneKey]) candidates.add(f);
  }

  // Try period
  const periodKey = bookInfo.period?.toLowerCase();
  if (periodKey && GENRE_MUSIC_MAP[periodKey]) {
    for (const f of GENRE_MUSIC_MAP[periodKey]) candidates.add(f);
  }

  // Fall back to defaults if nothing matched
  if (candidates.size === 0) {
    for (const f of DEFAULT_MUSIC_FOLDERS) candidates.add(f);
  }

  return Array.from(candidates);
}

// ========================================
// Music embedding index management
// ========================================

/**
 * Ensure the music embedding index exists.
 * Builds it from all music assets if not cached on disk.
 */
export async function ensureMusicEmbeddingIndex(): Promise<EmbeddingIndex> {
  // Try in-memory first
  const cached = getMusicIndex();
  if (cached) return cached;

  // Build fresh
  console.log('🎵 Building music embedding index...');
  const allAssets = scanMusicAssets();

  if (allAssets.length === 0) {
    throw new Error('No music assets found to build embedding index');
  }

  const items = allAssets.map((a) => ({
    id: a.id,
    text: `${a.genre.join(' ')} ${a.description}`,
  }));

  const index = await buildEmbeddingIndex(items, (batch, total) => {
    console.log(`  📊 Embedding batch ${batch}/${total}`);
  });

  // Persist and cache
  saveEmbeddingIndex(index, MUSIC_EMBEDDINGS_PATH);
  setMusicIndex(index);
  return index;
}

// ========================================
// Music selection (pass 2)
// ========================================

/**
 * Select the best music track for a book intro.
 *
 * Two-pass approach:
 *   1. resolveMusicFolders() narrows candidate folders by genre/tone/period
 *   2. embeddings search within candidates using a mood-based query
 *
 * @param bookInfo - Book metadata (genre, tone, period)
 * @param moodQuery - Optional natural language query (e.g. "dark epic orchestral")
 *                    If not provided, auto-generated from bookInfo.
 * @returns Best matching music track with reason
 */
export async function selectMusicTrack(
  bookInfo: BookInfo,
  moodQuery?: string
): Promise<MusicSelectionResult> {
  // Pass 1: narrow folders
  const folders = resolveMusicFolders(bookInfo);
  console.log(`🎵 Music selection — candidate folders: [${folders.join(', ')}]`);

  // Get all assets in candidate folders
  const candidateAssets = scanMusicAssets(folders);

  if (candidateAssets.length === 0) {
    // Extreme fallback: pick any music file
    const allAssets = scanMusicAssets();
    if (allAssets.length === 0) {
      throw new Error('No music assets available');
    }
    const random = allAssets[Math.floor(Math.random() * allAssets.length)];
    return {
      asset: random,
      matchReason: 'random fallback (no genre match)',
    };
  }

  // If only one candidate, just return it
  if (candidateAssets.length === 1) {
    return {
      asset: candidateAssets[0],
      matchReason: `only track in [${folders.join(', ')}]`,
    };
  }

  // Pass 2: embedding search within candidates
  const index = await ensureMusicEmbeddingIndex();

  // Build filter set of candidate IDs
  const candidateIds = new Set(candidateAssets.map((a) => a.id));

  // Auto-generate query from book metadata if not provided
  const query =
    moodQuery ||
    buildMoodQuery(bookInfo);

  console.log(`🔍 Music embedding search: "${query}"`);
  const results = await searchEmbeddings(index, query, 3, candidateIds);

  if (results.length === 0) {
    // Embedding search returned nothing → pick random from candidates
    const random = candidateAssets[Math.floor(Math.random() * candidateAssets.length)];
    return {
      asset: random,
      matchReason: `random from [${folders.join(', ')}] (embedding search empty)`,
    };
  }

  // Find the SoundAsset for the top result
  const bestId = results[0].id;
  const bestAsset = candidateAssets.find((a) => a.id === bestId);

  if (!bestAsset) {
    // Should not happen, but fallback
    const random = candidateAssets[Math.floor(Math.random() * candidateAssets.length)];
    return {
      asset: random,
      matchReason: 'fallback (asset not found after search)',
    };
  }

  return {
    asset: bestAsset,
    matchReason: `embedding match (score=${results[0].score.toFixed(3)}) in [${folders.join(', ')}]`,
    score: results[0].score,
  };
}

/**
 * Build a natural language mood query from book metadata.
 * Used as the embedding search query when no explicit mood is provided.
 */
function buildMoodQuery(bookInfo: BookInfo): string {
  const parts: string[] = [];

  if (bookInfo.genre) parts.push(bookInfo.genre);
  if (bookInfo.tone) parts.push(bookInfo.tone);
  if (bookInfo.voiceTone) parts.push(bookInfo.voiceTone);
  if (bookInfo.period) parts.push(bookInfo.period);

  // Add descriptive words for better embedding match
  parts.push('background music instrumental theme');

  return parts.join(' ');
}

/**
 * Select a different music track for a specific chapter intro,
 * potentially varying from the book-level theme.
 *
 * @param bookInfo - Book metadata
 * @param chapterTitle - Chapter title for contextual matching
 * @param excludeIds - IDs to exclude (e.g. already-used tracks)
 */
export async function selectChapterMusic(
  bookInfo: BookInfo,
  chapterTitle: string,
  excludeIds?: Set<string>
): Promise<MusicSelectionResult> {
  const folders = resolveMusicFolders(bookInfo);
  const candidateAssets = scanMusicAssets(folders)
    .filter((a) => !excludeIds || !excludeIds.has(a.id));

  if (candidateAssets.length === 0) {
    // Fall back to full selection
    return selectMusicTrack(bookInfo, chapterTitle);
  }

  const index = await ensureMusicEmbeddingIndex();
  const candidateIds = new Set(candidateAssets.map((a) => a.id));

  // Use chapter title as query for contextual matching
  const query = `${chapterTitle} ${bookInfo.genre} ${bookInfo.tone} instrumental`;
  const results = await searchEmbeddings(index, query, 1, candidateIds);

  if (results.length === 0) {
    const random = candidateAssets[Math.floor(Math.random() * candidateAssets.length)];
    return {
      asset: random,
      matchReason: `random for chapter "${chapterTitle}"`,
    };
  }

  const bestAsset = candidateAssets.find((a) => a.id === results[0].id)!;
  return {
    asset: bestAsset,
    matchReason: `chapter match "${chapterTitle}" (score=${results[0].score.toFixed(3)})`,
    score: results[0].score,
  };
}
