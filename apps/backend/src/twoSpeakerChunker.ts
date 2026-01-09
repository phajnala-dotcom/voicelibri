/**
 * Two-Speaker Chunker - Smart chunking for Gemini TTS multi-speaker API
 * 
 * Gemini TTS multiSpeakerVoiceConfig supports maximum 2 speakers per API call.
 * This module chunks dramatized text into segments that:
 * 1. Contain at most 2 unique speakers (NARRATOR + 1 character, or 2 characters)
 * 2. Stay within 3600 bytes limit (Gemini TTS hard limit is 4000 bytes, leaving 400 bytes allowance for finishing sentences)
 * 3. Don't break mid-sentence
 * 4. Stay within chapter boundaries
 * 5. Format text as "Speaker: text" for the TTS API
 */

import { VoiceSegment, extractVoiceSegments } from './dramatizedChunkerSimple.js';

/**
 * Two-speaker chunk result
 */
export interface TwoSpeakerChunk {
  /** Chunk index within the book */
  index: number;
  /** Text formatted for multi-speaker TTS (Speaker: text format) */
  formattedText: string;
  /** The two speakers in this chunk */
  speakers: string[];
  /** Original voice segments */
  segments: VoiceSegment[];
  /** Byte count of the text */
  byteCount: number;
  /** Character chapter index (if applicable) */
  chapterIndex?: number;
}

/**
 * Configuration for two-speaker chunking
 */
export interface TwoSpeakerChunkConfig {
  /** Maximum bytes per chunk (Gemini TTS hard limit is 4000 bytes, use 3600 to leave 400 byte allowance for sentence completion) */
  maxBytes: number;
  /** Preferred minimum bytes per chunk (avoid tiny chunks) */
  minBytes: number;
}

const DEFAULT_CONFIG: TwoSpeakerChunkConfig = {
  maxBytes: 3300,   // 4000 byte hard limit - 700 byte sentence completion allowance
  minBytes: 0,      // No minimum - allow small chunks when 3rd speaker forces a split
};

/**
 * Format voice segments into TTS-compatible text
 * 
 * Outputs SPEAKER: text format that Gemini TTS multiSpeakerVoiceConfig expects.
 * 
 * @param segments - Voice segments to format (only speaker and text required)
 * @returns Formatted text for TTS API
 */
export function formatForMultiSpeakerTTS(segments: Array<{ speaker: string; text: string }>): string {
  return segments
    .map(seg => `${seg.speaker}: ${seg.text}`)
    .join('\n');
}

/**
 * Get unique speakers from segments
 */
export function getUniqueSpeakers(segments: VoiceSegment[]): string[] {
  return [...new Set(segments.map(s => s.speaker))];
}

/**
 * Check if adding a segment would exceed 2 speakers
 */
function wouldExceedTwoSpeakers(currentSpeakers: string[], newSpeaker: string): boolean {
  // Always count NARRATOR as a unique voice
  if (currentSpeakers.includes(newSpeaker)) {
    return false;
  }
  // If adding this speaker would make 3 unique voices, return true
  return currentSpeakers.length >= 2;
}

/**
 * Find a sentence boundary near the end of text
 * Returns the index after the sentence-ending punctuation
 */
function findSentenceBoundary(text: string, maxLength: number): number {
  // Look for sentence endings (. ! ?) followed by space or end
  const sentenceEndPattern = /[.!?]["']?\s/g;
  let lastMatch = -1;
  let match;
  
  while ((match = sentenceEndPattern.exec(text)) !== null) {
    if (match.index + match[0].length <= maxLength) {
      lastMatch = match.index + match[0].length;
    } else {
      break;
    }
  }
  
  // If no sentence boundary found, try at the end of text
  if (lastMatch === -1 && text.length <= maxLength) {
    const endMatch = text.match(/[.!?]["']?$/);
    if (endMatch) {
      lastMatch = text.length;
    }
  }
  
  return lastMatch;
}

/**
 * Split a voice segment at sentence boundary
 * Returns [before, after] where 'before' fits within maxBytes
 */
function splitSegmentAtSentence(
  segment: VoiceSegment,
  maxBytes: number
): [VoiceSegment | null, VoiceSegment | null] {
  const text = segment.text;
  const textBytes = Buffer.byteLength(text, 'utf8');
  
  if (textBytes <= maxBytes) {
    return [segment, null];
  }

  // 1. Try to split at sentence boundary
  const approxCharLimit = Math.floor(maxBytes * 0.9); // Leave some margin
  const splitPoint = findSentenceBoundary(text, approxCharLimit);
  if (splitPoint > 0) {
    const beforeText = text.slice(0, splitPoint).trim();
    const afterText = text.slice(splitPoint).trim();
    return [
      { ...segment, text: beforeText, endIndex: segment.startIndex + beforeText.length },
      afterText ? { ...segment, text: afterText, startIndex: segment.startIndex + splitPoint } : null
    ];
  }

  // Fallback: try to split at last word boundary within maxBytes
  let lastSpace = -1;
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    bytes += Buffer.byteLength(text[i], 'utf8');
    if (bytes > maxBytes) break;
    if (text[i] === ' ') lastSpace = i;
  }
  if (lastSpace > 0) {
    const beforeText = text.slice(0, lastSpace).trim();
    const afterText = text.slice(lastSpace).trim();
    return [
      { ...segment, text: beforeText, endIndex: segment.startIndex + beforeText.length },
      afterText ? { ...segment, text: afterText, startIndex: segment.startIndex + lastSpace } : null
    ];
  }
  // If no word boundary, throw error
  throw new Error(`Segment too large and cannot be split at a sentence or word boundary. Speaker: ${segment.speaker}, text: "${segment.text}"`);
}

/**
 * Chunk tagged text into two-speaker chunks
 * 
 * Algorithm:
 * 1. Extract all voice segments
 * 2. Group segments into chunks where each chunk has max 2 speakers
 * 3. Respect byte limits and don't break mid-sentence
 * 4. Format output for Gemini TTS multiSpeakerVoiceConfig
 * 
 * @param taggedText - Text with SPEAKER: format tags
 * @param config - Chunking configuration
 * @param chapterIndex - Optional chapter index for metadata
 * @returns Array of two-speaker chunks
 */
export function chunkForTwoSpeakers(
  taggedText: string,
  config: TwoSpeakerChunkConfig = DEFAULT_CONFIG,
  chapterIndex?: number
): TwoSpeakerChunk[] {
  const allSegments = extractVoiceSegments(taggedText);
  
  if (allSegments.length === 0) {
    // No voice tags, treat entire text as NARRATOR
    const plainText = taggedText.replace(/^[A-Z][A-Z0-9]*:\s*/gm, '').trim();
    if (!plainText) {
      return [];
    }
    
    return [{
      index: 0,
      formattedText: `NARRATOR: ${plainText}`,
      speakers: ['NARRATOR'],
      segments: [{ speaker: 'NARRATOR', text: plainText, startIndex: 0, endIndex: plainText.length }],
      byteCount: Buffer.byteLength(`NARRATOR: ${plainText}`, 'utf8'),
      chapterIndex,
    }];
  }
  
  const chunks: TwoSpeakerChunk[] = [];
  let currentSegments: VoiceSegment[] = [];
  let currentSpeakers: string[] = [];
  let currentBytes = 0;
  let pendingSegments: VoiceSegment[] = [...allSegments];
  
  // Use a queue to ensure all segments are processed and split as needed
  while (pendingSegments.length > 0) {
    const segment = pendingSegments.shift()!;
    const segmentText = `${segment.speaker}: ${segment.text}`;
    const segmentBytes = Buffer.byteLength(segmentText, 'utf8') + 1; // +1 for newline

    // If the segment is too large to fit in a chunk, split it at sentence boundary only
    if (segmentBytes > config.maxBytes) {
      try {
        const [before, after] = splitSegmentAtSentence(segment, config.maxBytes);
        if (before) pendingSegments.unshift(before);
        if (after) pendingSegments.splice(1, 0, after); // preserve order
        continue;
      } catch (err) {
        // If a single sentence is too long, throw error
        throw new Error(`Cannot split segment for speaker ${segment.speaker}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // If adding this segment would exceed 2 speakers, finalize current chunk and process segment in next chunk
    const wouldExceedSpeakers = wouldExceedTwoSpeakers(currentSpeakers, segment.speaker);
    if (currentSegments.length > 0 && wouldExceedSpeakers) {
      chunks.push({
        index: chunks.length,
        formattedText: formatForMultiSpeakerTTS(currentSegments),
        speakers: [...currentSpeakers],
        segments: [...currentSegments],
        byteCount: currentBytes,
        chapterIndex,
      });
      currentSegments = [];
      currentSpeakers = [];
      currentBytes = 0;
      // Re-queue this segment for the next chunk
      pendingSegments.unshift(segment);
      continue;
    }

    // If adding this segment would exceed byte limit, finalize current chunk and process segment in next chunk
    const wouldExceedBytes = currentBytes + segmentBytes > config.maxBytes;
    if (currentSegments.length > 0 && wouldExceedBytes) {
      chunks.push({
        index: chunks.length,
        formattedText: formatForMultiSpeakerTTS(currentSegments),
        speakers: [...currentSpeakers],
        segments: [...currentSegments],
        byteCount: currentBytes,
        chapterIndex,
      });
      currentSegments = [];
      currentSpeakers = [];
      currentBytes = 0;
      // Re-queue this segment for the next chunk
      pendingSegments.unshift(segment);
      continue;
    }

    // Add segment to current chunk
    currentSegments.push(segment);
    if (!currentSpeakers.includes(segment.speaker)) {
      currentSpeakers.push(segment.speaker);
    }
    currentBytes += segmentBytes;
  }
  
  // Finalize last chunk
  if (currentSegments.length > 0) {
    // Failsafe: If more than 2 speakers, log error and trim to first 2
    if (currentSpeakers.length > 2) {
      console.error(
        `Chunk with >2 speakers detected! Speakers: ${currentSpeakers.join(", ")}. Trimming to first 2.`,
        { segments: currentSegments }
      );
      // Only keep segments with first 2 speakers
      const allowedSpeakers = currentSpeakers.slice(0, 2);
      const filteredSegments = currentSegments.filter(s => allowedSpeakers.includes(s.speaker));
      chunks.push({
        index: chunks.length,
        formattedText: formatForMultiSpeakerTTS(filteredSegments),
        speakers: [...allowedSpeakers],
        segments: [...filteredSegments],
        byteCount: filteredSegments.reduce((sum, s) => sum + Buffer.byteLength(`${s.speaker}: ${s.text}`, 'utf8') + 1, 0),
        chapterIndex,
      });
    } else {
      chunks.push({
        index: chunks.length,
        formattedText: formatForMultiSpeakerTTS(currentSegments),
        speakers: [...currentSpeakers],
        segments: [...currentSegments],
        byteCount: currentBytes,
        chapterIndex,
      });
    }
  }
  
  // Re-index chunks
  chunks.forEach((chunk, i) => {
    chunk.index = i;
  });
  
  return chunks;
}

/**
 * Chunk a full book (multiple chapters) for two-speaker TTS
 * 
 * @param chapters - Array of chapter texts with SPEAKER: format tags
 * @param config - Chunking configuration
 * @returns Array of all chunks across all chapters with global indices
 */
export function chunkBookForTwoSpeakers(
  chapters: string[],
  config: TwoSpeakerChunkConfig = DEFAULT_CONFIG
): TwoSpeakerChunk[] {
  const allChunks: TwoSpeakerChunk[] = [];
  let globalIndex = 0;
  
  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
    const chapterChunks = chunkForTwoSpeakers(chapters[chapterIndex], config, chapterIndex);
    
    for (const chunk of chapterChunks) {
      allChunks.push({
        ...chunk,
        index: globalIndex++,
      });
    }
  }
  
  return allChunks;
}

/**
 * Estimate token count from text
 * Rough estimate: 1 token ≈ 4 characters for English
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get chunk statistics for debugging
 */
export function getChunkStats(chunks: TwoSpeakerChunk[]): {
  totalChunks: number;
  avgBytes: number;
  maxBytes: number;
  minBytes: number;
  totalSpeakers: string[];
  chunksPerSpeakerCount: Record<number, number>;
} {
  if (chunks.length === 0) {
    return {
      totalChunks: 0,
      avgBytes: 0,
      maxBytes: 0,
      minBytes: 0,
      totalSpeakers: [],
      chunksPerSpeakerCount: {},
    };
  }
  
  const bytes = chunks.map(c => c.byteCount);
  const allSpeakers = new Set<string>();
  const speakerCounts: Record<number, number> = { 1: 0, 2: 0 };
  
  for (const chunk of chunks) {
    chunk.speakers.forEach(s => allSpeakers.add(s));
    speakerCounts[chunk.speakers.length] = (speakerCounts[chunk.speakers.length] || 0) + 1;
  }
  
  return {
    totalChunks: chunks.length,
    avgBytes: Math.round(bytes.reduce((a, b) => a + b, 0) / chunks.length),
    maxBytes: Math.max(...bytes),
    minBytes: Math.min(...bytes),
    totalSpeakers: [...allSpeakers],
    chunksPerSpeakerCount: speakerCounts,
  };
}
