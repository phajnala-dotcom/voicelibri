/**
 * Soundscape Module — Music Selector
 *
 * LLM-powered music selection:
 *   1. LLM generates an ideal-track description from bookInfo + character registry
 *   2. Embedding search across ALL music assets using the LLM description
 *
 * No static genre-to-folder mapping. The LLM has full creative control
 * over what music style suits the book, producing a rich natural-language
 * query that is embedded and cosine-compared against all 80 music track
 * descriptions in the catalog.
 *
 * Music assets are loaded from the CSV catalog (Type='music').
 * Rich descriptions from the catalog provide high-quality semantic matching.
 */

import {
  MUSIC_EMBEDDINGS_PATH,
  SCENE_ANALYSIS_MODEL,
} from './config.js';
import { GoogleAuth } from 'google-auth-library';
import { loadMusicCatalog } from './catalogLoader.js';
import {
  buildEmbeddingIndex,
  saveEmbeddingIndex,
  loadEmbeddingIndex,
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
// Gemini LLM for music query generation
// ========================================

const llmAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

async function generateMusicQuery(bookInfo: BookInfo): Promise<string> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'calmbridge-2';
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${SCENE_ANALYSIS_MODEL}:generateContent`;

  const client = await llmAuth.getClient();
  const token = await client.getAccessToken();

  const prompt = `You are an audiobook music director. Based on the following book metadata, write a 2-3 sentence description of the IDEAL background music track for this audiobook's intro. Be specific about instrumentation, tempo, mood, and style. Do NOT mention the book title or characters — describe only the music itself.

Book genre: ${bookInfo.genre || 'unknown'}
Book tone: ${bookInfo.tone || 'neutral'}
Book voice tone: ${bookInfo.voiceTone || 'neutral'}
Book period: ${bookInfo.period || 'modern'}
Book title: ${bookInfo.title || 'unknown'}
Book author: ${bookInfo.author || 'unknown'}

Respond with ONLY the music description, no other text. Example:
"A sweeping orchestral piece with deep cellos and gentle woodwinds, building from a quiet mysterious opening to a majestic crescendo. Medieval atmosphere with modal harmonies and occasional harp arpeggios."`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 256,
        topP: 0.8,
      },
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini music query error (${response.status}): ${err.substring(0, 300)}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('No text in Gemini music query response');

  return text;
}

// ========================================
// Music asset loading (from catalog)
// ========================================

/**
 * Load music assets from the catalog, optionally filtered by folder (Category).
 *
 * Category in the catalog corresponds to the music folder name
 * (e.g. 'Orchestral', 'Celtic', 'Medieval').
 *
 * @param folderFilter - If provided, only return assets whose category matches
 */
export function scanMusicAssets(folderFilter?: string[]): SoundAsset[] {
  const allMusic = loadMusicCatalog();

  if (!folderFilter) return allMusic;

  const filterLower = new Set(folderFilter.map((f) => f.toLowerCase()));
  return allMusic.filter((a) => filterLower.has((a.category ?? '').toLowerCase()));
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

  // Try loading from disk
  const fromDisk = loadEmbeddingIndex(MUSIC_EMBEDDINGS_PATH);
  if (fromDisk && fromDisk.entries.length > 0) {
    console.log(`🎵 Loaded music embedding index from disk (${fromDisk.entries.length} entries)`);
    setMusicIndex(fromDisk);
    return fromDisk;
  }

  // Build fresh
  console.log('🎵 Building music embedding index...');
  const allAssets = scanMusicAssets();

  if (allAssets.length === 0) {
    throw new Error('No music assets found to build embedding index');
  }

  const items = allAssets.map((a) => ({
    id: a.id,
    text: a.description || a.id,
  }));

  const index = await buildEmbeddingIndex(items, (batch, total) => {
    console.log(`  📊 Music embedding ${batch}/${total}`);
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
 * Select the best music track for a book intro using LLM-powered search.
 *
 * Approach:
 *   1. LLM generates an ideal-track description from bookInfo
 *   2. Embedding search across ALL music assets (no genre-map filtering)
 *
 * @param bookInfo - Book metadata (genre, tone, period, title, author)
 * @param moodQuery - Optional override query (skips LLM call)
 * @returns Best matching music track with reason
 */
export async function selectMusicTrack(
  bookInfo: BookInfo,
  moodQuery?: string
): Promise<MusicSelectionResult> {
  // Get all music assets (no folder filtering)
  const allAssets = scanMusicAssets();

  if (allAssets.length === 0) {
    throw new Error('No music assets available');
  }

  // If only one asset, return it
  if (allAssets.length === 1) {
    return {
      asset: allAssets[0],
      matchReason: 'only music track available',
    };
  }

  // Ensure embedding index
  const index = await ensureMusicEmbeddingIndex();

  // Generate query: use LLM if no explicit query provided
  let query: string;
  let querySource: string;

  if (moodQuery) {
    query = moodQuery;
    querySource = 'explicit';
  } else {
    try {
      query = await generateMusicQuery(bookInfo);
      querySource = 'LLM';
      console.log(`🎵 LLM music query: "${query.substring(0, 120)}..."`);
    } catch (llmErr) {
      console.warn(`🎵 LLM music query failed, using metadata fallback:`, llmErr instanceof Error ? llmErr.message : llmErr);
      query = buildMoodQuery(bookInfo);
      querySource = 'metadata-fallback';
    }
  }

  console.log(`🔍 Music embedding search (${querySource}): "${query.substring(0, 100)}..."`);
  const results = await searchEmbeddings(index, query, 3);

  if (results.length === 0) {
    // Embedding search returned nothing → pick random
    const random = allAssets[Math.floor(Math.random() * allAssets.length)];
    return {
      asset: random,
      matchReason: `random fallback (embedding search empty)`,
    };
  }

  // Find the SoundAsset for the top result
  const bestId = results[0].id;
  const bestAsset = allAssets.find((a) => a.id === bestId);

  if (!bestAsset) {
    const random = allAssets[Math.floor(Math.random() * allAssets.length)];
    return {
      asset: random,
      matchReason: 'fallback (asset not found after search)',
    };
  }

  // Log top 3 for debugging
  for (let i = 0; i < Math.min(3, results.length); i++) {
    const a = allAssets.find((x) => x.id === results[i].id);
    console.log(`  🎵 #${i + 1}: score=${results[i].score.toFixed(3)} — ${a?.description?.substring(0, 80) || results[i].id}`);
  }

  return {
    asset: bestAsset,
    matchReason: `LLM-guided embedding match (score=${results[0].score.toFixed(3)}, query=${querySource})`,
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

