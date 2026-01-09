/**
 * Dramatized Chunker Simple - Chunking with Voice Tags (PoC)
 * 
 * Simple chunking approach for PoC that:
 * 1. Preserves voice segments within chunks
 * 2. Ensures chunks don't split in the middle of a voice segment
 * 3. Maintains voice tag structure
 * 4. Generates metadata with speaker information
 * 
 * Part of Dramatized TTS implementation (PoC Phase)
 * 
 * FORMAT: Uses official Gemini TTS multi-speaker format:
 *   SPEAKER: text content on same line
 * 
 * Character alias rules (per Gemini TTS docs):
 * - Only alphanumeric characters (A-Z, a-z, 0-9)
 * - ALL CAPS for speaker names
 * - No spaces, underscores, hyphens, dots, emojis or diacritics
 * - Multi-word names are CONCATENATED (e.g., JOSEPHRAGOWSKI)
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Voice segment within text
 */
export interface VoiceSegment {
  speaker: string;
  text: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Chunk metadata
 */
export interface ChunkMetadata {
  id: string;
  characterCount: number;
  voiceSegments: number;
  estimatedDuration: number; // seconds (rough estimate: 150 words/min)
  speakers: string[];
}

/**
 * Chunking result
 */
export interface ChunkingResult {
  chunks: string[];
  metadata: ChunkMetadata[];
  totalChunks: number;
}

/**
 * Extract voice segments from tagged text
 * 
 * Parses the official Gemini TTS multi-speaker format:
 *   SPEAKER: text content
 * 
 * Each line starting with "SPEAKER: " is a new voice segment.
 * Speaker names are ALL CAPS alphanumeric only.
 * 
 * @param text - Tagged text with "SPEAKER: text" format
 * @returns Array of voice segments
 */
export function extractVoiceSegments(text: string): VoiceSegment[] {
  const segments: VoiceSegment[] = [];
  
  // Pattern: Line starts with ALLCAPS speaker name followed by colon and space
  // Speaker names: only A-Z and 0-9, no spaces/underscores/diacritics
  const speakerLinePattern = /^([A-Z][A-Z0-9]*): (.+)$/;
  
  const lines = text.split('\n');
  let currentSpeaker: string | null = null;
  let currentText: string[] = [];
  let startIndex = 0;
  let currentLineStart = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const speakerMatch = line.match(speakerLinePattern);
    
    if (speakerMatch) {
      // Save previous segment if exists
      if (currentSpeaker && currentText.length > 0) {
        const segmentText = currentText.join(' ').trim();
        if (segmentText) {
          segments.push({
            speaker: currentSpeaker,
            text: segmentText,
            startIndex,
            endIndex: currentLineStart
          });
        }
      }
      
      // Start new segment with speaker from this line
      currentSpeaker = speakerMatch[1];
      currentText = [speakerMatch[2]]; // Text after "SPEAKER: "
      startIndex = currentLineStart;
    } else if (currentSpeaker && line.trim()) {
      // Continuation line - append to current segment
      currentText.push(line.trim());
    }
    
    currentLineStart += line.length + 1; // +1 for newline
  }
  
  // Save final segment
  if (currentSpeaker && currentText.length > 0) {
    const segmentText = currentText.join(' ').trim();
    if (segmentText) {
      segments.push({
        speaker: currentSpeaker,
        text: segmentText,
        startIndex,
        endIndex: currentLineStart
      });
    }
  }
  
  return segments;
}

/**
 * Estimate audio duration from text
 * 
 * Rough estimate: 150 words per minute (average reading speed)
 * 
 * @param text - Plain text (without tags)
 * @returns Estimated duration in seconds
 */
function estimateDuration(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  const wordsPerMinute = 150;
  return (words / wordsPerMinute) * 60;
}

/**
 * Remove speaker labels from text to get plain content
 * 
 * @param text - Text with "SPEAKER: text" format
 * @returns Plain text without speaker labels
 */
export function removeVoiceTags(text: string): string {
  // Remove "SPEAKER: " prefix from each line (ALLCAPS followed by colon+space)
  return text
    .split('\n')
    .map(line => {
      const match = line.match(/^[A-Z][A-Z0-9]*: (.+)$/);
      return match ? match[1] : line;
    })
    .join('\n')
    .trim();
}

/**
 * Chunk tagged text while preserving voice segments
 * 
 * Algorithm:
 * 1. Extract all voice segments
 * 2. Group segments into chunks (target ~200 bytes plain text per chunk)
 * 3. Keep voice segments intact (don't split)
 * 4. Generate metadata for each chunk
 * 
 * @param taggedText - Text with voice tags
 * @param targetBytesPerChunk - Target size in bytes (default 200)
 * @returns Chunking result with chunks and metadata
 */
export function chunkTaggedText(
  taggedText: string,
  targetBytesPerChunk: number = 3500
): ChunkingResult {
  const segments = extractVoiceSegments(taggedText);
  
  if (segments.length === 0) {
    throw new Error('No voice segments found in tagged text');
  }
  
  const chunks: string[] = [];
  const metadata: ChunkMetadata[] = [];
  
  let currentChunkSegments: VoiceSegment[] = [];
  let currentByteCount = 0;
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const segmentBytes = Buffer.byteLength(segment.text, 'utf-8');
    
    // Check if adding this segment would exceed target
    if (currentByteCount > 0 && currentByteCount + segmentBytes > targetBytesPerChunk) {
      // Finalize current chunk
      const chunkText = buildChunkFromSegments(currentChunkSegments);
      const chunkMeta = buildChunkMetadata(chunks.length + 1, currentChunkSegments);
      
      chunks.push(chunkText);
      metadata.push(chunkMeta);
      
      // Start new chunk with current segment
      currentChunkSegments = [segment];
      currentByteCount = segmentBytes;
    } else {
      // Add segment to current chunk
      currentChunkSegments.push(segment);
      currentByteCount += segmentBytes;
    }
  }
  
  // Add final chunk
  if (currentChunkSegments.length > 0) {
    const chunkText = buildChunkFromSegments(currentChunkSegments);
    const chunkMeta = buildChunkMetadata(chunks.length + 1, currentChunkSegments);
    
    chunks.push(chunkText);
    metadata.push(chunkMeta);
  }
  
  console.log(`[DramatizedChunkerSimple] Created ${chunks.length} chunks from ${segments.length} voice segments`);
  
  return {
    chunks,
    metadata,
    totalChunks: chunks.length
  };
}

/**
 * Build chunk text from voice segments
 * 
 * Reconstructs text in official Gemini TTS format: "SPEAKER: text"
 * 
 * @param segments - Voice segments to include
 * @returns Formatted chunk text for TTS API
 */
function buildChunkFromSegments(segments: VoiceSegment[]): string {
  return segments
    .map(seg => `${seg.speaker}: ${seg.text}`)
    .join('\n');
}

/**
 * Build chunk metadata
 * 
 * @param chunkIndex - 1-based chunk index
 * @param segments - Voice segments in chunk
 * @returns Chunk metadata
 */
function buildChunkMetadata(chunkIndex: number, segments: VoiceSegment[]): ChunkMetadata {
  const plainText = segments.map(s => s.text).join(' ');
  const speakers = Array.from(new Set(segments.map(s => s.speaker)));
  
  return {
    id: String(chunkIndex).padStart(3, '0'),
    characterCount: plainText.length,
    voiceSegments: segments.length,
    estimatedDuration: Number(estimateDuration(plainText).toFixed(2)),
    speakers
  };
}

/**
 * Save chunks to files
 * 
 * Creates:
 * - chunks/chunk_001.txt, chunk_002.txt, ...
 * - chunks_metadata.json
 * 
 * @param chunks - Array of chunk texts
 * @param metadata - Array of chunk metadata
 * @param outputDir - Directory for output files
 */
export async function saveChunks(
  chunks: string[],
  metadata: ChunkMetadata[],
  outputDir: string
): Promise<void> {
  // Create chunks directory
  const chunksDir = path.join(outputDir, 'chunks');
  await fs.mkdir(chunksDir, { recursive: true });
  
  // Save individual chunk files
  for (let i = 0; i < chunks.length; i++) {
    const chunkPath = path.join(chunksDir, `chunk_${metadata[i].id}.txt`);
    await fs.writeFile(chunkPath, chunks[i], 'utf-8');
  }
  
  // Save metadata
  const metadataPath = path.join(outputDir, 'chunks_metadata.json');
  const metadataObj = {
    chunks: metadata,
    totalChunks: chunks.length,
    totalDuration: metadata.reduce((sum, m) => sum + m.estimatedDuration, 0)
  };
  
  await fs.writeFile(
    metadataPath,
    JSON.stringify(metadataObj, null, 2),
    'utf-8'
  );
  
  console.log(`[DramatizedChunkerSimple] Saved ${chunks.length} chunks to: ${chunksDir}`);
  console.log(`[DramatizedChunkerSimple] Metadata saved to: ${metadataPath}`);
}

/**
 * Process tagged text file into chunks
 * 
 * End-to-end chunking:
 * 1. Load tagged text
 * 2. Chunk with voice preservation
 * 3. Save chunks and metadata
 * 
 * @param taggedTextPath - Path to tagged text file
 * @param outputDir - Directory for output (defaults to same as input)
 * @param targetBytesPerChunk - Target chunk size (default 200)
 * @returns Chunking result
 */
export async function processTaggedTextFile(
  taggedTextPath: string,
  outputDir?: string,
  targetBytesPerChunk: number = 3500
): Promise<ChunkingResult> {
  console.log('[DramatizedChunkerSimple] Loading tagged text...');
  const taggedText = await fs.readFile(taggedTextPath, 'utf-8');
  
  console.log('[DramatizedChunkerSimple] Chunking text...');
  const result = chunkTaggedText(taggedText, targetBytesPerChunk);
  
  const outDir = outputDir || path.dirname(taggedTextPath);
  await saveChunks(result.chunks, result.metadata, outDir);
  
  console.log('[DramatizedChunkerSimple] ✅ Chunking complete!');
  return result;
}
