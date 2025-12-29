/**
 * Streaming Dramatizer - Chunk-level streaming for fast time-to-first-audio
 * 
 * Architecture:
 * 1. Character scan (blocking, ~5s) - needed for voice assignment
 * 2. Split text into pre-chunks (~3000 bytes each)
 * 3. Stream: dramatize pre-chunk → yield → next pre-chunk
 * 4. Audio generation can start after FIRST chunk is dramatized
 * 
 * Benefits:
 * - Time to first audio: ~10s (vs ~25s+ for chapter-level)
 * - Memory efficient: process small pieces at a time
 * - Better progress feedback
 */

import { GeminiCharacterAnalyzer, CharacterProfile, GeminiConfig } from './llmCharacterAnalyzer.js';
import { 
  hasDialogue, 
  countDialogues, 
  applyRuleBasedTagging, 
  calculateConfidence,
  extractDialogueParagraphs,
  mergeWithNarration,
} from './hybridTagger.js';
import { Chapter } from './bookChunker.js';

// Pre-chunk target size (before dramatization)
// Slightly smaller than final chunk limit to account for voice tags
const PRE_CHUNK_TARGET_BYTES = 2800;
const PRE_CHUNK_MAX_BYTES = 3200;

export interface StreamingChunk {
  chapterIndex: number;
  chunkIndex: number;       // Global chunk index
  chunkInChapter: number;   // Chunk index within chapter
  taggedText: string;
  method: 'auto-narrator' | 'rule-based' | 'llm-fallback';
  confidence: number;
  isLastInChapter: boolean;
  isLastInBook: boolean;
}

export interface StreamingProgress {
  phase: 'character-scan' | 'dramatizing';
  currentChapter?: number;
  totalChapters?: number;
  currentChunk?: number;
  estimatedTotalChunks?: number;
}

/**
 * Split text into pre-chunks at sentence boundaries
 * These are the pieces we'll dramatize individually
 */
function splitIntoPreChunks(text: string): string[] {
  const preChunks: string[] = [];
  
  // Split into sentences (preserve sentence endings)
  const sentences = text.split(/(?<=[.!?…])\s+/);
  
  let currentChunk = '';
  let currentBytes = 0;
  
  for (const sentence of sentences) {
    const sentenceBytes = Buffer.byteLength(sentence, 'utf8');
    const testBytes = currentBytes + (currentChunk ? 1 : 0) + sentenceBytes; // +1 for space
    
    if (testBytes >= PRE_CHUNK_TARGET_BYTES && currentChunk) {
      // Save current chunk
      preChunks.push(currentChunk.trim());
      currentChunk = sentence;
      currentBytes = sentenceBytes;
    } else if (testBytes >= PRE_CHUNK_MAX_BYTES && !currentChunk) {
      // Single huge sentence - split by words
      const words = sentence.split(/\s+/);
      let wordChunk = '';
      let wordBytes = 0;
      
      for (const word of words) {
        const wb = Buffer.byteLength(word, 'utf8');
        if (wordBytes + wb + 1 >= PRE_CHUNK_TARGET_BYTES && wordChunk) {
          preChunks.push(wordChunk.trim());
          wordChunk = word;
          wordBytes = wb;
        } else {
          wordChunk = wordChunk ? `${wordChunk} ${word}` : word;
          wordBytes += wb + 1;
        }
      }
      if (wordChunk) {
        currentChunk = wordChunk;
        currentBytes = Buffer.byteLength(wordChunk, 'utf8');
      }
    } else {
      currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      currentBytes = testBytes;
    }
  }
  
  // Add remaining text
  if (currentChunk.trim()) {
    preChunks.push(currentChunk.trim());
  }
  
  return preChunks;
}

/**
 * Dramatize a single pre-chunk using hybrid approach
 */
async function dramatizePreChunk(
  preChunkText: string,
  characters: CharacterProfile[],
  analyzer: GeminiCharacterAnalyzer,
  confidenceThreshold: number = 0.85
): Promise<{ taggedText: string; method: 'auto-narrator' | 'rule-based' | 'llm-fallback'; confidence: number }> {
  
  // Strategy 1: No dialogue → Auto-tag as NARRATOR
  if (!hasDialogue(preChunkText)) {
    return {
      taggedText: `[VOICE=NARRATOR]\n${preChunkText}`,
      method: 'auto-narrator',
      confidence: 1.0,
    };
  }
  
  // Strategy 2: Try rule-based tagging
  const { taggedText: ruleBasedTagged, confidence: ruleConfidence } = applyRuleBasedTagging(
    preChunkText,
    characters
  );
  
  const finalConfidence = calculateConfidence(ruleBasedTagged, characters);
  
  // High confidence → Use rule-based
  if (finalConfidence >= confidenceThreshold) {
    return {
      taggedText: ruleBasedTagged,
      method: 'rule-based',
      confidence: finalConfidence,
    };
  }
  
  // Strategy 3: LLM fallback
  const dialogueParagraphs = extractDialogueParagraphs(preChunkText);
  const dialogueText = dialogueParagraphs.join('\n\n');
  
  const llmTagged = await analyzer.tagChapterWithVoices(
    dialogueText.length > 0 ? dialogueText : preChunkText,
    characters
  );
  
  const mergedText = mergeWithNarration(preChunkText, llmTagged, characters);
  
  return {
    taggedText: mergedText,
    method: 'llm-fallback',
    confidence: 0.98,
  };
}

/**
 * Streaming Dramatization Pipeline - Chunk Level
 * 
 * Yields chunks one-by-one as they're dramatized, enabling:
 * 1. Character scan (blocking)
 * 2. Dramatize first pre-chunk → yield → generate audio → start playback
 * 3. Continue dramatizing remaining pre-chunks in background
 * 
 * @param chapters - Array of book chapters
 * @param fullBookText - Full book text for character analysis
 * @param geminiConfig - Gemini API config
 * @param onProgress - Optional progress callback
 * @param onCharactersFound - Callback when character analysis completes
 */
export async function* streamingDramatize(
  chapters: Chapter[],
  fullBookText: string,
  geminiConfig: GeminiConfig,
  onProgress?: (progress: StreamingProgress) => void,
  onCharactersFound?: (characters: CharacterProfile[]) => void,
): AsyncGenerator<StreamingChunk, { characters: CharacterProfile[]; totalChunks: number }, undefined> {
  
  console.log('🚀 Starting CHUNK-LEVEL streaming dramatization...');
  console.log(`📚 Book: ${fullBookText.length} chars, ${chapters.length} chapters`);
  
  // Phase 1: Character scan (blocking - needed for voice assignment)
  console.log('🔍 Phase 1: Quick character scan...');
  onProgress?.({ phase: 'character-scan' });
  
  const analyzer = new GeminiCharacterAnalyzer(geminiConfig);
  const characters = await analyzer.analyzeFullBook(fullBookText);
  
  console.log(`✅ Found ${characters.length} characters: ${characters.map(c => c.name).join(', ')}`);
  
  // Notify caller immediately so voice map can be created
  onCharactersFound?.(characters);
  
  // Phase 2: Stream chunks
  console.log('🏷️ Phase 2: Streaming chunk dramatization...');
  
  // Pre-calculate total chunks for progress
  let estimatedTotalChunks = 0;
  const chapterPreChunks: string[][] = [];
  
  for (const chapter of chapters) {
    const preChunks = splitIntoPreChunks(chapter.text);
    chapterPreChunks.push(preChunks);
    estimatedTotalChunks += preChunks.length;
  }
  
  console.log(`📊 Estimated ${estimatedTotalChunks} chunks across ${chapters.length} chapters`);
  
  let globalChunkIndex = 0;
  
  for (let chapterIdx = 0; chapterIdx < chapters.length; chapterIdx++) {
    const preChunks = chapterPreChunks[chapterIdx];
    const isLastChapter = chapterIdx === chapters.length - 1;
    
    for (let chunkInChapter = 0; chunkInChapter < preChunks.length; chunkInChapter++) {
      const preChunk = preChunks[chunkInChapter];
      const isLastInChapter = chunkInChapter === preChunks.length - 1;
      const isLastInBook = isLastChapter && isLastInChapter;
      
      onProgress?.({
        phase: 'dramatizing',
        currentChapter: chapterIdx + 1,
        totalChapters: chapters.length,
        currentChunk: globalChunkIndex + 1,
        estimatedTotalChunks,
      });
      
      // Dramatize this pre-chunk
      const result = await dramatizePreChunk(preChunk, characters, analyzer);
      
      console.log(`  ✓ Chunk ${globalChunkIndex + 1}/${estimatedTotalChunks} (Ch${chapterIdx + 1}) - ${result.method}`);
      
      yield {
        chapterIndex: chapterIdx,
        chunkIndex: globalChunkIndex,
        chunkInChapter,
        taggedText: result.taggedText,
        method: result.method,
        confidence: result.confidence,
        isLastInChapter,
        isLastInBook,
      };
      
      globalChunkIndex++;
    }
  }
  
  console.log('\n✅ Streaming dramatization complete!');
  console.log(`📊 Total chunks: ${globalChunkIndex}`);
  
  return { characters, totalChunks: globalChunkIndex };
}

/**
 * Quick first-chunk dramatization for fastest time-to-audio
 * 
 * @param firstChapterText - Text of first chapter
 * @param fullBookText - Full book for character scan
 * @param geminiConfig - API config
 * @returns First chunk ready for TTS
 */
export async function dramatizeFirstChunk(
  firstChapterText: string,
  fullBookText: string,
  geminiConfig: GeminiConfig,
): Promise<{
  chunk: StreamingChunk;
  characters: CharacterProfile[];
  remainingPreChunks: string[];
}> {
  console.log('⚡ Fast-start: First chunk dramatization...');
  
  // Character scan
  const analyzer = new GeminiCharacterAnalyzer(geminiConfig);
  const characters = await analyzer.analyzeFullBook(fullBookText);
  
  console.log(`✅ Found ${characters.length} characters`);
  
  // Split first chapter and dramatize first pre-chunk only
  const preChunks = splitIntoPreChunks(firstChapterText);
  const firstPreChunk = preChunks[0];
  
  const result = await dramatizePreChunk(firstPreChunk, characters, analyzer);
  
  console.log(`⚡ First chunk ready! Method: ${result.method}`);
  
  return {
    chunk: {
      chapterIndex: 0,
      chunkIndex: 0,
      chunkInChapter: 0,
      taggedText: result.taggedText,
      method: result.method,
      confidence: result.confidence,
      isLastInChapter: preChunks.length === 1,
      isLastInBook: false, // Assume more content
    },
    characters,
    remainingPreChunks: preChunks.slice(1),
  };
}
