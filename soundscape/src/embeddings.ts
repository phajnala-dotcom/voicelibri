/**
 * Soundscape Module — Embedding Engine
 *
 * In-memory vector search using Gemini embedding-001 (768 truncated dimensions).
 * Builds, persists, and queries embedding indices for:
 *   - Ambient asset descriptions (from CSV catalog, description-only)
 *   - Music filenames (from soundscape/assets/music/)
 *
 * No external vector DB — brute-force cosine similarity is sufficient
 * for our asset library scale.
 *
 * Runtime search: searchEmbeddingsBatch() embeds multiple chapter text
 * snippets concurrently (EMBEDDING_CONCURRENCY workers) for throughput.
 *
 * Uses the official Vertex AI :predict endpoint per:
 * @see https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/text-embeddings-api
 */

import fs from 'fs';
import { GoogleAuth } from 'google-auth-library';
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_CONCURRENCY,
  AMBIENT_EMBEDDINGS_PATH,
  MUSIC_EMBEDDINGS_PATH,
  SFX_EMBEDDINGS_PATH,
} from './config.js';
import type {
  EmbeddingEntry,
  EmbeddingIndex,
  EmbeddingSearchResult,
} from './types.js';

// ========================================
// In-memory index
// ========================================

let ambientIndex: EmbeddingIndex | null = null;
let musicIndex: EmbeddingIndex | null = null;
let sfxIndex: EmbeddingIndex | null = null;

// ========================================
// Vertex AI Embedding API
// ========================================

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

/**
 * Embed a batch of texts via Vertex AI :predict endpoint.
 *
 * Uses the official Vertex AI predict endpoint per Google docs:
 * https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/text-embeddings-api
 *
 * Request format: { instances: [{ content }], parameters: { outputDimensionality } }
 * Response format: { predictions: [{ embeddings: { values: number[] } }] }
 */
async function embedTexts(texts: string[]): Promise<number[][]> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'calmbridge-2';
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${EMBEDDING_MODEL}:predict`;

  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Failed to get access token for embeddings');

  const instances = texts.map((text) => ({ content: text }));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances,
      parameters: { outputDimensionality: EMBEDDING_DIMENSIONS },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding API ${response.status}: ${err.substring(0, 500)}`);
  }

  const json: any = await response.json();
  const embeddings: number[][] = json.predictions.map(
    (p: any) => p.embeddings.values as number[]
  );

  return embeddings;
}

// ========================================
// Index building
// ========================================

/**
 * Build an embedding index from id+text pairs.
 * Sends requests with EMBEDDING_CONCURRENCY parallel calls,
 * each containing EMBEDDING_BATCH_SIZE texts (1 for gemini-embedding-001).
 *
 * @param items - Array of { id, text } to embed
 * @param onProgress - Optional progress callback (completed, total)
 */
export async function buildEmbeddingIndex(
  items: Array<{ id: string; text: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<EmbeddingIndex> {
  const entries: EmbeddingEntry[] = new Array(items.length);
  let completed = 0;

  // Process items with concurrency limit
  const queue = items.map((item, idx) => ({ item, idx }));
  const workers: Promise<void>[] = [];

  async function processQueue(): Promise<void> {
    while (queue.length > 0) {
      const batch = queue.splice(0, EMBEDDING_BATCH_SIZE);
      if (batch.length === 0) break;

      const texts = batch.map((b) => b.item.text);
      const vectors = await embedTexts(texts);

      for (let j = 0; j < batch.length; j++) {
        entries[batch[j].idx] = {
          id: batch[j].item.id,
          text: batch[j].item.text,
          vector: vectors[j],
        };
      }

      completed += batch.length;
      if (onProgress) onProgress(completed, items.length);
    }
  }

  // Launch concurrent workers
  const workerCount = Math.min(EMBEDDING_CONCURRENCY, items.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(processQueue());
  }

  await Promise.all(workers);

  return {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    createdAt: new Date().toISOString(),
    entries: entries.filter(Boolean), // filter out any gaps from race conditions
  };
}

// ========================================
// Persistence
// ========================================

/** Save an embedding index to a JSON file */
export function saveEmbeddingIndex(index: EmbeddingIndex, filePath: string): void {
  fs.writeFileSync(filePath, JSON.stringify(index), 'utf-8');
  console.log(`💾 Embedding index saved: ${filePath} (${index.entries.length} entries)`);
}

/** Load an embedding index from a JSON file */
export function loadEmbeddingIndex(filePath: string): EmbeddingIndex | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as EmbeddingIndex;
  } catch (err) {
    console.warn(`⚠️ Failed to load embedding index: ${filePath}`, err);
    return null;
  }
}

// ========================================
// Similarity search
// ========================================

/** Cosine similarity between two vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Search an embedding index for the most similar entries to a query.
 *
 * @param index - The embedding index to search
 * @param queryText - Natural language query
 * @param topK - Number of results to return
 * @param filterIds - Optional set of IDs to restrict search to
 * @returns Top-K results sorted by descending similarity
 */
export async function searchEmbeddings(
  index: EmbeddingIndex,
  queryText: string,
  topK: number = 5,
  filterIds?: Set<string>
): Promise<EmbeddingSearchResult[]> {
  // Embed the query
  const [queryVector] = await embedTexts([queryText]);

  // Brute-force cosine search
  const scored: EmbeddingSearchResult[] = [];
  for (const entry of index.entries) {
    if (filterIds && !filterIds.has(entry.id)) continue;
    const score = cosineSimilarity(queryVector, entry.vector);
    scored.push({ id: entry.id, text: entry.text, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Search using a pre-computed query vector (avoids re-embedding).
 */
export function searchEmbeddingsWithVector(
  index: EmbeddingIndex,
  queryVector: number[],
  topK: number = 5,
  filterIds?: Set<string>
): EmbeddingSearchResult[] {
  const scored: EmbeddingSearchResult[] = [];
  for (const entry of index.entries) {
    if (filterIds && !filterIds.has(entry.id)) continue;
    const score = cosineSimilarity(queryVector, entry.vector);
    scored.push({ id: entry.id, text: entry.text, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Embed multiple query texts concurrently and search for best matches.
 *
 * Used at runtime to embed all search snippets extracted from chapters.
 * Runs EMBEDDING_CONCURRENCY parallel embedding calls for throughput.
 *
 * @param index - The embedding index to search against
 * @param queryTexts - Array of snippet texts to embed and search
 * @param topK - Number of results per snippet
 * @param filterIds - Optional set of IDs to restrict search to
 * @returns Array of { snippetIndex, snippet, results[] } for each input text
 */
export async function searchEmbeddingsBatch(
  index: EmbeddingIndex,
  queryTexts: string[],
  topK: number = 5,
  filterIds?: Set<string>
): Promise<Array<{ snippetIndex: number; snippet: string; results: EmbeddingSearchResult[] }>> {
  if (queryTexts.length === 0) return [];

  // Embed all snippets concurrently with EMBEDDING_CONCURRENCY workers
  const queryVectors: Array<{ idx: number; vector: number[] }> = [];
  const queue = queryTexts.map((text, idx) => ({ text, idx }));
  const workers: Promise<void>[] = [];

  async function processQueue(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      const [vector] = await embedTexts([item.text]);
      queryVectors.push({ idx: item.idx, vector });
    }
  }

  const workerCount = Math.min(EMBEDDING_CONCURRENCY, queryTexts.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(processQueue());
  }
  await Promise.all(workers);

  // Sort back to original order
  queryVectors.sort((a, b) => a.idx - b.idx);

  // Run cosine search for each embedded snippet (brute-force, <1ms per query)
  return queryVectors.map((qv) => ({
    snippetIndex: qv.idx,
    snippet: queryTexts[qv.idx],
    results: searchEmbeddingsWithVector(index, qv.vector, topK, filterIds),
  }));
}

// ========================================
// Ambient index management
// ========================================

/** Get or load the ambient embedding index */
export function getAmbientIndex(): EmbeddingIndex | null {
  if (ambientIndex) return ambientIndex;
  const loaded = loadEmbeddingIndex(AMBIENT_EMBEDDINGS_PATH);
  if (loaded) ambientIndex = loaded;
  return ambientIndex;
}

/** Set the ambient embedding index (after building) */
export function setAmbientIndex(index: EmbeddingIndex): void {
  ambientIndex = index;
}

/** Get or load the music embedding index */
export function getMusicIndex(): EmbeddingIndex | null {
  if (musicIndex) return musicIndex;
  const loaded = loadEmbeddingIndex(MUSIC_EMBEDDINGS_PATH);
  if (loaded) musicIndex = loaded;
  return musicIndex;
}

/** Set the music embedding index (after building) */
export function setMusicIndex(index: EmbeddingIndex): void {
  musicIndex = index;
}

/** Get or load the SFX embedding index */
export function getSfxIndex(): EmbeddingIndex | null {
  if (sfxIndex) return sfxIndex;
  const loaded = loadEmbeddingIndex(SFX_EMBEDDINGS_PATH);
  if (loaded) sfxIndex = loaded;
  return sfxIndex;
}

/** Set the SFX embedding index (after building) */
export function setSfxIndex(index: EmbeddingIndex): void {
  sfxIndex = index;
}
