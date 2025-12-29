/**
 * Chapter Chunker - Chapter-aware chunking with Gemini TTS limits
 * 
 * Implements chunking that:
 * 1. Respects chapter boundaries (chunks never span chapters)
 * 2. Enforces Gemini TTS 4000-byte hard limit per voice segment
 * 3. Targets 2500 bytes per chunk (max 3500 bytes for safety margin)
 * 4. Breaks at sentence boundaries
 * 5. Validates voice segments individually for dramatized text
 * 
 * Part of Phase 3: Audiobook Library & File-Based Generation
 */

import { Chapter } from './bookChunker.js';
import { extractVoiceSegments, VoiceSegment } from './dramatizedChunkerSimple.js';

// ========================================
// Gemini TTS Limits (CRITICAL)
// ========================================

/**
 * Gemini TTS hard limit - absolute maximum bytes per API request
 * Source: https://ai.google.dev/gemini-api/docs/text-to-speech
 */
export const GEMINI_TTS_HARD_LIMIT = 4000;

/**
 * Target bytes per chunk (for optimal generation time vs buffer)
 * ~2500 bytes = ~60s generation time, ~3-4 min audio
 */
export const SAFE_CHUNK_TARGET = 2500;

/**
 * Maximum bytes per chunk (safety margin below hard limit)
 * Accounts for:
 * - Multiple voice segments within one chunk
 * - UTF-8 encoding differences
 * - Edge cases in segment boundaries
 */
export const SAFE_CHUNK_MAX = 3500;

// ========================================
// Chunk Metadata
// ========================================

export interface ChunkInfo {
  chapterIndex: number;
  chunkIndexInChapter: number;
  globalChunkIndex: number;
  text: string;
  byteLength: number;
  isMultiVoice: boolean;
  voiceSegmentCount?: number;
}

export interface ChunkingResult {
  chunks: ChunkInfo[];
  totalChunks: number;
  chapterChunkCounts: number[]; // Number of chunks per chapter
}

// ========================================
// Helper Functions
// ========================================

/**
 * Check if a word ends with sentence-ending punctuation
 * 
 * @param word - Word to check
 * @returns True if word ends a sentence
 */
function isSentenceEnding(word: string): boolean {
  return /[.!?…]$/.test(word.trim());
}

/**
 * Validate that a voice segment doesn't exceed Gemini TTS hard limit
 * If it does, split it into smaller segments
 * 
 * @param segment - Voice segment to validate
 * @returns Array of valid segments (may be split if too large)
 */
export function validateAndSplitVoiceSegment(segment: VoiceSegment): VoiceSegment[] {
  const bytes = Buffer.byteLength(segment.text, 'utf8');
  
  if (bytes <= GEMINI_TTS_HARD_LIMIT) {
    return [segment]; // Segment is valid, return as-is
  }
  
  console.log(`  ⚠️ Splitting large ${segment.speaker} segment: ${bytes} bytes → multiple chunks`);
  
  // Split large segment into smaller ones at sentence boundaries
  const splitSegments: VoiceSegment[] = [];
  const sentences = segment.text.split(/(?<=[.!?…])\s+/);
  
  let currentText = '';
  let currentBytes = 0;
  
  for (const sentence of sentences) {
    const sentenceBytes = Buffer.byteLength(sentence, 'utf8');
    
    // If single sentence exceeds limit, split by words
    if (sentenceBytes > SAFE_CHUNK_TARGET && currentText === '') {
      const words = sentence.split(/\s+/);
      let wordChunk = '';
      
      for (const word of words) {
        const testChunk = wordChunk ? `${wordChunk} ${word}` : word;
        const testBytes = Buffer.byteLength(testChunk, 'utf8');
        
        if (testBytes >= SAFE_CHUNK_TARGET && wordChunk) {
          splitSegments.push({
            speaker: segment.speaker,
            text: wordChunk.trim(),
            startIndex: segment.startIndex,
            endIndex: segment.endIndex,
          });
          wordChunk = word;
        } else {
          wordChunk = testChunk;
        }
      }
      
      if (wordChunk) {
        currentText = wordChunk;
        currentBytes = Buffer.byteLength(wordChunk, 'utf8');
      }
      continue;
    }
    
    // Normal case: accumulate sentences
    const testText = currentText ? `${currentText} ${sentence}` : sentence;
    const testBytes = Buffer.byteLength(testText, 'utf8');
    
    if (testBytes >= SAFE_CHUNK_TARGET && currentText) {
      // Save current chunk and start new one
      splitSegments.push({
        speaker: segment.speaker,
        text: currentText.trim(),
        startIndex: segment.startIndex,
        endIndex: segment.endIndex,
      });
      currentText = sentence;
      currentBytes = sentenceBytes;
    } else {
      currentText = testText;
      currentBytes = testBytes;
    }
  }
  
  // Add remaining text
  if (currentText.trim()) {
    splitSegments.push({
      speaker: segment.speaker,
      text: currentText.trim(),
      startIndex: segment.startIndex,
      endIndex: segment.endIndex,
    });
  }
  
  console.log(`    → Split into ${splitSegments.length} segments`);
  return splitSegments;
}

/**
 * Legacy validation function - throws error for oversized segments
 * @deprecated Use validateAndSplitVoiceSegment instead for automatic splitting
 * 
 * @param segment - Voice segment to validate
 * @throws Error if segment exceeds 4000 bytes
 */
export function validateVoiceSegment(segment: VoiceSegment): void {
  const bytes = Buffer.byteLength(segment.text, 'utf8');
  if (bytes > GEMINI_TTS_HARD_LIMIT) {
    throw new Error(
      `Voice segment for ${segment.speaker} exceeds ${GEMINI_TTS_HARD_LIMIT}-byte Gemini TTS limit: ${bytes} bytes. ` +
      `This will cause TTS API failure. Split the text into smaller chunks.`
    );
  }
}

/**
 * Build chunk text from voice segments (preserves voice tags)
 * 
 * @param segments - Array of voice segments
 * @returns Chunk text with voice tags
 */
function buildChunkFromSegments(segments: VoiceSegment[]): string {
  return segments.map(seg => `[VOICE=${seg.speaker}]\n${seg.text}\n[/VOICE]`).join('\n');
}

// ========================================
// Main Chunking Functions
// ========================================

/**
 * Chunk a single chapter (plain text, no voice tags)
 * 
 * Algorithm:
 * 1. Split chapter into words
 * 2. Accumulate words until reaching target size
 * 3. Look for sentence ending
 * 4. Break at sentence boundary (or max size if no sentence found)
 * 
 * @param chapter - Chapter to chunk
 * @param targetBytes - Target chunk size in bytes (default: 2500)
 * @param maxBytes - Maximum chunk size in bytes (default: 3500)
 * @returns Array of chunk texts
 */
export function chunkChapter(
  chapter: Chapter,
  targetBytes: number = SAFE_CHUNK_TARGET,
  maxBytes: number = SAFE_CHUNK_MAX
): string[] {
  const chunks: string[] = [];
  const words = chapter.text.split(/\s+/).filter(w => w.length > 0);
  
  let currentChunk = '';
  
  for (const word of words) {
    const testChunk = currentChunk ? `${currentChunk} ${word}` : word;
    const byteLength = Buffer.byteLength(testChunk, 'utf8');
    
    // Once we reach target size, look for sentence ending
    if (byteLength >= targetBytes) {
      if (isSentenceEnding(word)) {
        // End chunk at sentence boundary
        chunks.push(testChunk);
        currentChunk = '';
        continue;
      }
      
      // Safety: if we exceed max size, break anyway (even mid-sentence)
      if (byteLength >= maxBytes) {
        chunks.push(currentChunk);
        currentChunk = word; // Start new chunk with current word
        continue;
      }
    }
    
    currentChunk = testChunk;
  }
  
  // Add remaining text as final chunk
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  console.log(`  Chapter ${chapter.index} chunked: ${chunks.length} chunks`);
  return chunks;
}

/**
 * Chunk a dramatized chapter (with voice tags)
 * 
 * Algorithm:
 * 1. Extract voice segments
 * 2. Split any oversized segments (>4000 bytes) into smaller pieces
 * 3. Group segments into chunks ≤ 3500 bytes total
 * 4. Don't split voice segments (keep [VOICE=X]...[/VOICE] intact)
 * 
 * @param chapter - Chapter with voice tags
 * @returns Array of chunk texts with voice tags preserved
 */
export function chunkDramatizedChapter(chapter: Chapter): string[] {
  const rawSegments = extractVoiceSegments(chapter.text);
  
  if (rawSegments.length === 0) {
    // No voice tags found - fallback to regular chunking
    console.warn(`  Chapter ${chapter.index}: Expected voice tags but none found, using regular chunking`);
    return chunkChapter(chapter);
  }
  
  // Validate and split oversized segments
  const segments: VoiceSegment[] = [];
  for (const segment of rawSegments) {
    const validSegments = validateAndSplitVoiceSegment(segment);
    segments.push(...validSegments);
  }
  
  const chunks: string[] = [];
  let currentChunkSegments: VoiceSegment[] = [];
  let currentByteCount = 0;
  
  for (const segment of segments) {
    // Calculate segment bytes (including voice tags)
    const segmentWithTags = `[VOICE=${segment.speaker}]\n${segment.text}\n[/VOICE]\n`;
    const segmentBytes = Buffer.byteLength(segmentWithTags, 'utf8');
    
    // Check if adding this segment would exceed chunk limit
    if (currentByteCount > 0 && currentByteCount + segmentBytes > SAFE_CHUNK_MAX) {
      // Finalize current chunk
      chunks.push(buildChunkFromSegments(currentChunkSegments));
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
    chunks.push(buildChunkFromSegments(currentChunkSegments));
  }
  
  console.log(`  Chapter ${chapter.index} (dramatized) chunked: ${chunks.length} chunks from ${segments.length} voice segments`);
  return chunks;
}

/**
 * Chunk entire book by chapters
 * 
 * This is the main entry point for chapter-aware chunking.
 * 
 * Key features:
 * - Chunks never span chapter boundaries
 * - Respects voice tags in dramatized text
 * - Validates all segments against Gemini TTS limits
 * - Returns metadata for each chunk
 * 
 * @param chapters - Array of chapters from book
 * @param isDramatized - Whether book contains voice tags
 * @returns Chunking result with metadata
 */
export function chunkBookByChapters(
  chapters: Chapter[],
  isDramatized: boolean = false
): ChunkingResult {
  const allChunks: ChunkInfo[] = [];
  const chapterChunkCounts: number[] = [];
  let globalChunkIndex = 0;
  
  console.log(`\n📚 Chunking ${chapters.length} chapters (dramatized: ${isDramatized})...`);
  
  for (const chapter of chapters) {
    // Choose chunking strategy based on content
    const chunkTexts = isDramatized 
      ? chunkDramatizedChapter(chapter)
      : chunkChapter(chapter);
    
    chapterChunkCounts.push(chunkTexts.length);
    
    // Build chunk metadata
    for (let i = 0; i < chunkTexts.length; i++) {
      const chunkText = chunkTexts[i];
      const byteLength = Buffer.byteLength(chunkText, 'utf8');
      const voiceSegments = extractVoiceSegments(chunkText);
      
      allChunks.push({
        chapterIndex: chapter.index,
        chunkIndexInChapter: i,
        globalChunkIndex,
        text: chunkText,
        byteLength,
        isMultiVoice: voiceSegments.length > 0,
        voiceSegmentCount: voiceSegments.length || undefined,
      });
      
      globalChunkIndex++;
    }
  }
  
  console.log(`✓ Chunking complete: ${allChunks.length} total chunks across ${chapters.length} chapters`);
  console.log(`  Average chunks per chapter: ${(allChunks.length / chapters.length).toFixed(1)}`);
  console.log(`  Chapter chunk counts: ${chapterChunkCounts.join(', ')}`);
  
  return {
    chunks: allChunks,
    totalChunks: allChunks.length,
    chapterChunkCounts,
  };
}

/**
 * Get chunk-to-chapter mapping
 * 
 * Useful for consolidating temp chunks into chapter files
 * 
 * @param chapterChunkCounts - Number of chunks per chapter
 * @returns Map of chapterIndex -> array of global chunk indices
 */
export function getChapterChunkMapping(chapterChunkCounts: number[]): Map<number, number[]> {
  const mapping = new Map<number, number[]>();
  let globalIndex = 0;
  
  for (let chapterIndex = 0; chapterIndex < chapterChunkCounts.length; chapterIndex++) {
    const chunkCount = chapterChunkCounts[chapterIndex];
    const chunkIndices: number[] = [];
    
    for (let i = 0; i < chunkCount; i++) {
      chunkIndices.push(globalIndex);
      globalIndex++;
    }
    
    mapping.set(chapterIndex, chunkIndices);
  }
  
  return mapping;
}
