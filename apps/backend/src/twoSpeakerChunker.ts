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
  maxBytes: 3600,   // 4000 byte hard limit - 400 byte sentence completion allowance
  minBytes: 0,      // No minimum - allow small chunks when 3rd speaker forces a split
};

/**
 * Format voice segments into TTS-compatible text
 * 
 * Converts [VOICE=SPEAKER] format to "Speaker: text" format
 * that Gemini TTS multiSpeakerVoiceConfig expects.
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
  if (currentSpeakers.includes(newSpeaker)) {
    return false;
  }
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
  
  // Find a sentence boundary that fits
  // Start looking from approximate character position (bytes ≈ chars for ASCII)
  const approxCharLimit = Math.floor(maxBytes * 0.9); // Leave some margin
  const splitPoint = findSentenceBoundary(text, approxCharLimit);
  
  if (splitPoint <= 0) {
    // No good split point found, fall back to word boundary
    const words = text.split(/\s+/);
    let currentLength = 0;
    let wordIndex = 0;
    
    for (let i = 0; i < words.length; i++) {
      const wordBytes = Buffer.byteLength(words[i] + ' ', 'utf8');
      if (currentLength + wordBytes > maxBytes) {
        break;
      }
      currentLength += wordBytes;
      wordIndex = i + 1;
    }
    
    if (wordIndex === 0) {
      // Can't even fit one word, just return the segment
      return [segment, null];
    }
    
    const beforeText = words.slice(0, wordIndex).join(' ');
    const afterText = words.slice(wordIndex).join(' ');
    
    return [
      { ...segment, text: beforeText, endIndex: segment.startIndex + beforeText.length },
      afterText ? { ...segment, text: afterText, startIndex: segment.startIndex + beforeText.length + 1 } : null
    ];
  }
  
  const beforeText = text.slice(0, splitPoint).trim();
  const afterText = text.slice(splitPoint).trim();
  
  return [
    { ...segment, text: beforeText, endIndex: segment.startIndex + beforeText.length },
    afterText ? { ...segment, text: afterText, startIndex: segment.startIndex + splitPoint } : null
  ];
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
 * @param taggedText - Text with [VOICE=SPEAKER] tags
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
    const plainText = taggedText.replace(/\[VOICE=.*?\]|\[\/VOICE\]/g, '').trim();
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
  
  while (pendingSegments.length > 0) {
    const segment = pendingSegments.shift()!;
    const segmentText = `${segment.speaker}: ${segment.text}`;
    const segmentBytes = Buffer.byteLength(segmentText, 'utf8') + 1; // +1 for newline
    
    // Check if this segment would exceed limits
    const wouldExceedSpeakers = wouldExceedTwoSpeakers(currentSpeakers, segment.speaker);
    const wouldExceedBytes = currentBytes + segmentBytes > config.maxBytes;
    
    if (currentSegments.length > 0 && (wouldExceedSpeakers || wouldExceedBytes)) {
      // Finalize current chunk
      chunks.push({
        index: chunks.length,
        formattedText: formatForMultiSpeakerTTS(currentSegments),
        speakers: [...currentSpeakers],
        segments: [...currentSegments],
        byteCount: currentBytes,
        chapterIndex,
      });
      
      // Reset for new chunk
      currentSegments = [];
      currentSpeakers = [];
      currentBytes = 0;
    }
    
    // Check if segment itself is too large
    if (segmentBytes > config.maxBytes) {
      // Split the segment at sentence boundary
      const remainingBytes = config.maxBytes - currentBytes;
      const [before, after] = splitSegmentAtSentence(segment, remainingBytes > config.minBytes ? remainingBytes : config.maxBytes);
      
      if (before) {
        // Add the 'before' part to current or new chunk
        if (currentSegments.length === 0 || !wouldExceedTwoSpeakers(currentSpeakers, before.speaker)) {
          currentSegments.push(before);
          if (!currentSpeakers.includes(before.speaker)) {
            currentSpeakers.push(before.speaker);
          }
          currentBytes += Buffer.byteLength(`${before.speaker}: ${before.text}`, 'utf8') + 1;
        } else {
          // Finalize current chunk first
          chunks.push({
            index: chunks.length,
            formattedText: formatForMultiSpeakerTTS(currentSegments),
            speakers: [...currentSpeakers],
            segments: [...currentSegments],
            byteCount: currentBytes,
            chapterIndex,
          });
          
          currentSegments = [before];
          currentSpeakers = [before.speaker];
          currentBytes = Buffer.byteLength(`${before.speaker}: ${before.text}`, 'utf8') + 1;
        }
      }
      
      if (after) {
        // Put 'after' back to process
        pendingSegments.unshift(after);
      }
      
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
    chunks.push({
      index: chunks.length,
      formattedText: formatForMultiSpeakerTTS(currentSegments),
      speakers: [...currentSpeakers],
      segments: [...currentSegments],
      byteCount: currentBytes,
      chapterIndex,
    });
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
 * @param chapters - Array of chapter texts with [VOICE=] tags
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
