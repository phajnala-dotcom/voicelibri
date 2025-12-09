/**
 * Dramatized Book Chunker
 * 
 * Phase 1 - PoC Implementation
 * Predictive chunking with dialogue-aware boundaries
 * Ensures smooth playback by pre-synthesizing next chunk before current finishes
 */

import { DialogueSegment } from './dialogueParser.js';

export interface ChunkingConfig {
  /**
   * Average character reading speed for TTS
   * Default: 15 chars/second (conservative estimate)
   */
  chars_per_second: number;
  
  /**
   * TTS generation time multiplier
   * 1.0 = real-time, 1.5 = 50% slower than real-time
   * Default: 1.5 (based on current system ~25s for 500 words)
   */
  approx_tts_factor: number;
  
  /**
   * Safety margin for next chunk synthesis
   * 0.7 = next chunk must be synthesizable in 70% of current chunk playback time
   * Default: 0.7
   */
  safety_ratio: number;
  
  /**
   * Maximum characters per chunk (safety limit)
   * Prevents extremely long chunks
   * Default: 2000 chars (~500 words)
   */
  max_chunk_chars: number;
  
  /**
   * Minimum characters per chunk
   * Too small chunks create too many API calls
   * Default: 200 chars (~50 words)
   */
  min_chunk_chars: number;
}

export interface DramatizedChunk {
  index: number;
  segments: DialogueSegment[];
  text: string; // Text WITH voice tags
  plainText: string; // Text WITHOUT voice tags (for TTS)
  estimatedAudioSeconds: number;
  estimatedTtsSeconds: number;
  voicesUsed: string[];
  characterCount: number;
  wordCount: number;
}

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  chars_per_second: 15,
  approx_tts_factor: 1.5, // Real-world value from current system
  safety_ratio: 0.7,
  max_chunk_chars: 2000,
  min_chunk_chars: 200,
};

/**
 * Estimates audio duration from character count
 * 
 * @param characterCount - Number of characters
 * @param config - Chunking configuration
 * @returns Estimated audio duration in seconds
 */
export function estimateAudioDuration(
  characterCount: number,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): number {
  return characterCount / config.chars_per_second;
}

/**
 * Estimates TTS synthesis time
 * 
 * @param characterCount - Number of characters
 * @param config - Chunking configuration
 * @returns Estimated synthesis time in seconds
 */
export function estimateTtsDuration(
  characterCount: number,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): number {
  const audioSeconds = estimateAudioDuration(characterCount, config);
  return audioSeconds * config.approx_tts_factor;
}

/**
 * Checks if next chunk (B) can be synthesized before current chunk (A) finishes
 * 
 * Predictive rule:
 * estimated_tts_seconds(B) <= playback_duration(A) * safety_ratio
 * 
 * @param chunkA - Current chunk
 * @param chunkB - Next chunk
 * @param config - Chunking configuration
 * @returns True if chunk B will be ready in time
 */
export function canPreloadNextChunk(
  chunkA: DramatizedChunk,
  chunkB: DramatizedChunk,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): boolean {
  const allowedTtsTime = chunkA.estimatedAudioSeconds * config.safety_ratio;
  return chunkB.estimatedTtsSeconds <= allowedTtsTime;
}

/**
 * Chunks dramatized text with dialogue-aware boundaries
 * 
 * Algorithm:
 * 1. Start with empty chunk A
 * 2. Add segments until:
 *    - Reached max_chunk_chars OR
 *    - Next segment would violate predictive preload rule
 * 3. End chunk only at segment boundary (never split dialogue/narrator)
 * 4. Validate chunk is within min/max bounds
 * 5. Calculate estimates for preloading
 * 
 * @param segments - Dialogue segments from dialogueParser
 * @param taggedText - Full text with voice tags
 * @param config - Chunking configuration
 * @returns Array of dramatized chunks
 */
export function chunkDramatizedText(
  segments: DialogueSegment[],
  taggedText: string,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): DramatizedChunk[] {
  const chunks: DramatizedChunk[] = [];
  
  let currentChunkSegments: DialogueSegment[] = [];
  let currentCharCount = 0;
  
  const finalizeChunk = (index: number): DramatizedChunk | null => {
    if (currentChunkSegments.length === 0) {
      return null;
    }
    
    // Build chunk text with voice tags
    const chunkTextParts: string[] = [];
    const voicesUsed = new Set<string>();
    
    for (const segment of currentChunkSegments) {
      chunkTextParts.push(`[VOICE=${segment.speaker}]`);
      chunkTextParts.push(segment.text);
      chunkTextParts.push(`[/VOICE]`);
      voicesUsed.add(segment.speaker);
    }
    
    const chunkText = chunkTextParts.join('\n');
    
    // Build plain text (without tags) for TTS
    const plainTextParts = currentChunkSegments.map(s => s.text);
    const plainText = plainTextParts.join(' ');
    
    const charCount = plainText.length;
    const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length;
    
    const chunk: DramatizedChunk = {
      index,
      segments: [...currentChunkSegments],
      text: chunkText,
      plainText: plainText,
      estimatedAudioSeconds: estimateAudioDuration(charCount, config),
      estimatedTtsSeconds: estimateTtsDuration(charCount, config),
      voicesUsed: Array.from(voicesUsed),
      characterCount: charCount,
      wordCount: wordCount,
    };
    
    return chunk;
  };
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const segmentCharCount = segment.text.length;
    
    // Check if adding this segment would exceed max chunk size
    if (currentCharCount + segmentCharCount > config.max_chunk_chars) {
      // Finalize current chunk if it meets minimum size
      if (currentCharCount >= config.min_chunk_chars) {
        const chunk = finalizeChunk(chunks.length);
        if (chunk) {
          chunks.push(chunk);
        }
        
        // Start new chunk with current segment
        currentChunkSegments = [segment];
        currentCharCount = segmentCharCount;
      } else {
        // Current chunk too small, add segment anyway (safety)
        currentChunkSegments.push(segment);
        currentCharCount += segmentCharCount;
      }
      continue;
    }
    
    // Predictive check: Can next chunk be preloaded?
    if (currentChunkSegments.length > 0 && currentCharCount >= config.min_chunk_chars) {
      // Create temporary next chunk to test preload timing
      const testNextSegments = [segment];
      const testNextCharCount = segmentCharCount;
      
      const currentAudioTime = estimateAudioDuration(currentCharCount, config);
      const nextTtsTime = estimateTtsDuration(testNextCharCount, config);
      const allowedTtsTime = currentAudioTime * config.safety_ratio;
      
      // If next chunk would take too long to synthesize, finalize current chunk
      if (nextTtsTime > allowedTtsTime) {
        const chunk = finalizeChunk(chunks.length);
        if (chunk) {
          chunks.push(chunk);
        }
        
        // Start new chunk
        currentChunkSegments = [segment];
        currentCharCount = segmentCharCount;
        continue;
      }
    }
    
    // Add segment to current chunk
    currentChunkSegments.push(segment);
    currentCharCount += segmentCharCount;
  }
  
  // Finalize last chunk
  if (currentChunkSegments.length > 0) {
    const chunk = finalizeChunk(chunks.length);
    if (chunk) {
      chunks.push(chunk);
    }
  }
  
  return chunks;
}

/**
 * Validates chunking quality
 * 
 * Checks:
 * - No chunk exceeds max size
 * - No chunk below min size (except possibly last)
 * - All chunks meet preload requirements
 * 
 * @param chunks - Array of chunks to validate
 * @param config - Chunking configuration
 * @returns Validation result with warnings
 */
export function validateChunks(
  chunks: DramatizedChunk[],
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Check max size
    if (chunk.characterCount > config.max_chunk_chars) {
      warnings.push(
        `Chunk ${i} exceeds max size: ${chunk.characterCount} > ${config.max_chunk_chars}`
      );
    }
    
    // Check min size (except last chunk)
    if (i < chunks.length - 1 && chunk.characterCount < config.min_chunk_chars) {
      warnings.push(
        `Chunk ${i} below min size: ${chunk.characterCount} < ${config.min_chunk_chars}`
      );
    }
    
    // Check preload requirement for next chunk
    if (i < chunks.length - 1) {
      const nextChunk = chunks[i + 1];
      if (!canPreloadNextChunk(chunk, nextChunk, config)) {
        warnings.push(
          `Chunk ${i + 1} may not preload in time: ` +
          `TTS=${nextChunk.estimatedTtsSeconds.toFixed(1)}s > ` +
          `allowed=${(chunk.estimatedAudioSeconds * config.safety_ratio).toFixed(1)}s`
        );
      }
    }
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Generates metadata summary for chunks
 * 
 * @param chunks - Array of chunks
 * @returns Metadata object
 */
export function generateChunksMetadata(chunks: DramatizedChunk[]) {
  const totalCharacters = chunks.reduce((sum, c) => sum + c.characterCount, 0);
  const totalWords = chunks.reduce((sum, c) => sum + c.wordCount, 0);
  const totalAudioSeconds = chunks.reduce((sum, c) => sum + c.estimatedAudioSeconds, 0);
  const totalTtsSeconds = chunks.reduce((sum, c) => sum + c.estimatedTtsSeconds, 0);
  
  const allVoices = new Set<string>();
  chunks.forEach(c => c.voicesUsed.forEach(v => allVoices.add(v)));
  
  return {
    totalChunks: chunks.length,
    totalCharacters,
    totalWords,
    estimatedAudioDuration: totalAudioSeconds,
    estimatedTtsDuration: totalTtsSeconds,
    uniqueVoices: Array.from(allVoices),
    averageChunkSize: Math.round(totalCharacters / chunks.length),
    averageChunkDuration: totalAudioSeconds / chunks.length,
  };
}
