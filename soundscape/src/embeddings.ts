/**
 * Soundscape Module — Embedding Engine
 *
 * In-memory vector search using Gemini embedding-001 (384 dimensions).
 * Builds, persists, and queries embedding indices for:
 *   - Ambient asset descriptions (from XLSX catalog)
 *   - Music filenames (from soundscape/assets/music/)
 *
 * No external vector DB — brute-force cosine similarity is sufficient
 * for our scale (~22K ambient + ~200 music entries).
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-text-embeddings
 */

import fs from 'fs';
import { GoogleAuth } from 'google-auth-library';
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_BATCH_SIZE,
  AMBIENT_EMBEDDINGS_PATH,
  MUSIC_EMBEDDINGS_PATH,
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

// ========================================
// Vertex AI Embedding API
// ========================================

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

/**
 * Embed a batch of texts via Vertex AI Gemini embedding-001.
 *
 * Uses the official batchEmbedContents endpoint per Google docs:
 * https://cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-text-embeddings#get-text-embeddings-sample-drest
 */
async function embedTexts(texts: string[]): Promise<number[][]> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'calmbridge-2';
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${EMBEDDING_MODEL}:batchEmbedContents`;

  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Failed to get access token for embeddings');

  const requests = texts.map((text) => ({
    model: `publishers/google/models/${EMBEDDING_MODEL}`,
    content: { parts: [{ text }] },
    outputDimensionality: EMBEDDING_DIMENSIONS,
  }));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding API ${response.status}: ${err.substring(0, 500)}`);
  }

  const json: any = await response.json();
  const embeddings: number[][] = json.embeddings.map(
    (e: any) => e.values as number[]
  );

  return embeddings;
}

// ========================================
// Index building
// ========================================

/**
 * Build an embedding index from id+text pairs.
 * Batches requests to stay within API limits.
 *
 * @param items - Array of { id, text } to embed
 * @param onProgress - Optional progress callback (batchIndex, totalBatches)
 */
export async function buildEmbeddingIndex(
  items: Array<{ id: string; text: string }>,
  onProgress?: (batch: number, total: number) => void
): Promise<EmbeddingIndex> {
  const entries: EmbeddingEntry[] = [];
  const totalBatches = Math.ceil(items.length / EMBEDDING_BATCH_SIZE);

  for (let i = 0; i < items.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = items.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchNum = Math.floor(i / EMBEDDING_BATCH_SIZE) + 1;

    if (onProgress) onProgress(batchNum, totalBatches);

    const texts = batch.map((b) => b.text);
    const vectors = await embedTexts(texts);

    for (let j = 0; j < batch.length; j++) {
      entries.push({
        id: batch[j].id,
        text: batch[j].text,
        vector: vectors[j],
      });
    }

    // Small delay between batches to avoid rate limiting
    if (i + EMBEDDING_BATCH_SIZE < items.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    createdAt: new Date().toISOString(),
    entries,
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
