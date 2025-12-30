/**
 * Temp Chunk Manager - Generate and save TTS audio to temp files
 * 
 * Implements Phase 3B strategy:
 * - Generate once → Save to temp → Play from temp → Consolidate to chapter
 * - Zero duplicate generation (1x token cost, not 2x)
 * - Disk caching for resume capability
 * - Parallel chunk generation (2 at once)
 * 
 * Part of Phase 3: Audiobook Library & File-Based Generation
 * 
 * UPDATE: Now uses TRUE multi-speaker TTS via Gemini's multiSpeakerVoiceConfig
 * - Max 2 speakers per API call (Gemini TTS limitation)
 * - Uses twoSpeakerChunker for smart chunking
 * - Single API call per chunk instead of multiple parallel calls
 * 
 * PIPELINE ARCHITECTURE (for uninterrupted playback):
 * - Pre-dramatization runs ahead of TTS in background
 * - Dramatized text cached in memory
 * - TTS checks cache first → instant if pre-dramatized
 * - 3 parallel processes: dramatization → TTS → playback
 */

import fs from 'fs';
import path from 'path';
import { synthesizeText, synthesizeMultiSpeaker, SpeakerConfig } from './ttsClient.js';
import { extractVoiceSegments, removeVoiceTags } from './dramatizedChunkerSimple.js';
import { concatenateWavBuffers, addSilence } from './audioUtils.js';
import { validateVoiceSegment, GEMINI_TTS_HARD_LIMIT } from './chapterChunker.js';
import { 
  getTempChunkPath, 
  getChapterPath, 
  getTempFolder,
  createAudiobookFolder,
  sanitizeChapterTitle
} from './audiobookManager.js';
import { Chapter } from './bookChunker.js';
import { formatForMultiSpeakerTTS, getUniqueSpeakers, chunkForTwoSpeakers } from './twoSpeakerChunker.js';

// ========================================
// Pre-Dramatization Pipeline Cache
// ========================================

/**
 * In-memory cache for pre-dramatized chunk text
 * Key: chunkIndex, Value: dramatized text with voice tags
 */
const dramatizationCache = new Map<number, string>();

/**
 * Track which chunks are currently being dramatized (to avoid duplicates)
 */
const dramatizationInProgress = new Set<number>();

/**
 * Flag to control pre-dramatization pipeline
 */
let preDramatizationRunning = false;
let preDramatizationAbort: AbortController | null = null;

/**
 * Clear dramatization cache (called when loading new book)
 */
export function clearDramatizationCache(): void {
  dramatizationCache.clear();
  dramatizationInProgress.clear();
  if (preDramatizationAbort) {
    preDramatizationAbort.abort();
    preDramatizationAbort = null;
  }
  preDramatizationRunning = false;
  console.log('🧹 Dramatization cache cleared');
}

/**
 * Check if a chunk has been pre-dramatized
 */
export function isDramatized(chunkIndex: number): boolean {
  return dramatizationCache.has(chunkIndex);
}

/**
 * Get pre-dramatized text from cache
 */
export function getDramatizedText(chunkIndex: number): string | undefined {
  return dramatizationCache.get(chunkIndex);
}

/**
 * Store dramatized text in cache
 */
export function cacheDramatizedText(chunkIndex: number, taggedText: string): void {
  dramatizationCache.set(chunkIndex, taggedText);
}

/**
 * Get cache statistics for debugging
 */
export function getDramatizationCacheStats(): { cached: number; inProgress: number; running: boolean } {
  return {
    cached: dramatizationCache.size,
    inProgress: dramatizationInProgress.size,
    running: preDramatizationRunning,
  };
}

// ========================================
// Core Dramatization Logic (shared)
// ========================================

/**
 * Core dramatization logic - used by both on-demand and pre-dramatization
 * @param plainText - Raw text without voice tags
 * @returns Tagged text with [VOICE=] tags
 */
async function dramatizeTextCore(plainText: string): Promise<string> {
  const characters = (global as any).DRAMATIZATION_CHARACTERS;
  const geminiConfig = (global as any).DRAMATIZATION_CONFIG;
  
  if (!characters || !geminiConfig) {
    return `[VOICE=NARRATOR]\n${plainText}`;
  }
  
  try {
    const { GeminiCharacterAnalyzer } = await import('./llmCharacterAnalyzer.js');
    const { hasDialogue, applyRuleBasedTagging, calculateConfidence, extractDialogueParagraphs, mergeWithNarration } = await import('./hybridTagger.js');
    
    // Check if this chunk has any dialogue
    if (!hasDialogue(plainText)) {
      return `[VOICE=NARRATOR]\n${plainText}`;
    }
    
    // Try rule-based first (free, instant)
    const { taggedText: ruleTagged } = applyRuleBasedTagging(plainText, characters);
    const finalConfidence = calculateConfidence(ruleTagged, characters);
    
    if (finalConfidence >= 0.85) {
      return ruleTagged;
    }
    
    // LLM fallback for complex dialogue
    const analyzer = new GeminiCharacterAnalyzer(geminiConfig);
    const dialogueParagraphs = extractDialogueParagraphs(plainText);
    const dialogueText = dialogueParagraphs.length > 0 ? dialogueParagraphs.join('\n\n') : plainText;
    
    const llmTagged = await analyzer.tagChapterWithVoices(dialogueText, characters);
    const mergedText = mergeWithNarration(plainText, llmTagged, characters);
    
    return mergedText;
    
  } catch (error) {
    console.error('  ❌ Dramatization failed:', error);
    return `[VOICE=NARRATOR]\n${plainText}`;
  }
}

// ========================================
// Pre-Dramatization Pipeline
// ========================================

/**
 * Start pre-dramatization pipeline in background
 * Dramatizes chunks ahead of playback for uninterrupted audio
 * 
 * @param chunks - All book chunks (plain text)
 * @param startIndex - Index to start from (usually current playback + 1)
 * @param lookAhead - How many chunks to dramatize ahead (default: 5)
 */
export async function startPreDramatization(
  chunks: string[],
  startIndex: number = 0,
  lookAhead: number = 5
): Promise<void> {
  if (preDramatizationRunning) {
    console.log('  ⏩ Pre-dramatization already running');
    return;
  }
  
  const dramatizationEnabled = (global as any).DRAMATIZATION_ENABLED;
  if (!dramatizationEnabled) {
    console.log('  📝 Dramatization not enabled, skipping pre-dramatization');
    return;
  }
  
  preDramatizationRunning = true;
  preDramatizationAbort = new AbortController();
  
  console.log(`🎭 Starting pre-dramatization pipeline from chunk ${startIndex} (look-ahead: ${lookAhead})`);
  
  try {
    let currentIndex = startIndex;
    
    while (currentIndex < chunks.length && !preDramatizationAbort.signal.aborted) {
      // Only dramatize up to lookAhead chunks ahead
      const cachedCount = dramatizationCache.size;
      if (cachedCount - startIndex >= lookAhead) {
        // Wait a bit and check again
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      
      // Skip if already cached or in progress
      if (dramatizationCache.has(currentIndex) || dramatizationInProgress.has(currentIndex)) {
        currentIndex++;
        continue;
      }
      
      // Skip if chunk already has voice tags
      if (/\[VOICE=.*?\]/.test(chunks[currentIndex])) {
        currentIndex++;
        continue;
      }
      
      // Mark as in progress
      dramatizationInProgress.add(currentIndex);
      
      console.log(`  🔮 Pre-dramatizing chunk ${currentIndex}...`);
      const startTime = Date.now();
      
      try {
        const taggedText = await dramatizeTextCore(chunks[currentIndex]);
        dramatizationCache.set(currentIndex, taggedText);
        
        const elapsed = Date.now() - startTime;
        console.log(`  ✅ Pre-dramatized chunk ${currentIndex} (${elapsed}ms, cache: ${dramatizationCache.size})`);
      } catch (error) {
        console.error(`  ❌ Pre-dramatization failed for chunk ${currentIndex}:`, error);
        // Store fallback narrator-only text
        dramatizationCache.set(currentIndex, `[VOICE=NARRATOR]\n${chunks[currentIndex]}`);
      } finally {
        dramatizationInProgress.delete(currentIndex);
      }
      
      currentIndex++;
    }
    
    if (!preDramatizationAbort.signal.aborted) {
      console.log(`🎭 Pre-dramatization complete: ${dramatizationCache.size} chunks cached`);
    }
  } catch (error) {
    console.error('❌ Pre-dramatization pipeline error:', error);
  } finally {
    preDramatizationRunning = false;
    preDramatizationAbort = null;
  }
}

/**
 * Stop pre-dramatization pipeline
 */
export function stopPreDramatization(): void {
  if (preDramatizationAbort) {
    console.log('🛑 Stopping pre-dramatization pipeline');
    preDramatizationAbort.abort();
  }
}

// ========================================
// On-Demand Dramatization Helper
// ========================================

/**
 * Dramatize a plain text chunk on-demand using LLM
 * First checks cache from pre-dramatization pipeline
 * 
 * @param chunkIndex - Index of the chunk (for cache lookup)
 * @param plainText - Raw text without voice tags
 * @returns Tagged text with [VOICE=] tags
 */
async function dramatizeChunkOnDemand(chunkIndex: number, plainText: string): Promise<string> {
  // Check pre-dramatization cache first
  const cached = dramatizationCache.get(chunkIndex);
  if (cached) {
    console.log(`  ⚡ Using pre-dramatized text from cache (chunk ${chunkIndex})`);
    return cached;
  }
  
  // Wait if this chunk is currently being pre-dramatized
  if (dramatizationInProgress.has(chunkIndex)) {
    console.log(`  ⏳ Waiting for pre-dramatization of chunk ${chunkIndex}...`);
    const maxWait = 30000; // 30s max wait
    const startWait = Date.now();
    
    while (dramatizationInProgress.has(chunkIndex) && Date.now() - startWait < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const cached = dramatizationCache.get(chunkIndex);
    if (cached) {
      console.log(`  ⚡ Pre-dramatization completed, using cached text`);
      return cached;
    }
  }
  
  // On-demand dramatization (cache miss)
  console.log(`  🎭 On-demand dramatization for chunk ${chunkIndex}...`);
  const startTime = Date.now();
  
  const taggedText = await dramatizeTextCore(plainText);
  
  // Cache for future use
  dramatizationCache.set(chunkIndex, taggedText);
  
  const elapsed = Date.now() - startTime;
  console.log(`  ✓ On-demand dramatization complete (${elapsed}ms)`);
  
  return taggedText;
}

// ========================================
// Voice Map Lookup Helper
// ========================================

/**
 * Look up voice for a speaker, handling name format differences
 * 
 * Voice tags use UPPERCASE_WITH_UNDERSCORES (e.g., "JOSEPH_RAGOWSKI")
 * VoiceMap uses normal case with spaces (e.g., "Joseph Ragowski" or just "Ragowski")
 * 
 * Matching strategy (in order):
 * 1. Exact match
 * 2. Normalized name (JOSEPH_RAGOWSKI → Joseph Ragowski)
 * 3. Case-insensitive match
 * 4. Partial match - any word in speaker matches any word in voiceMap key
 *    (handles "JOSEPH_RAGOWSKI" matching "Ragowski" or "Joseph")
 * 
 * @param speaker - Speaker name from voice tag (e.g., "JOSEPH_RAGOWSKI")
 * @param voiceMap - Character to voice mapping (uses normal names)
 * @param defaultVoice - Fallback voice if no match found
 * @returns Voice name for TTS
 */
function lookupVoice(speaker: string, voiceMap: Record<string, string>, defaultVoice: string): string {
  // NARRATOR always uses default voice
  if (speaker === 'NARRATOR') {
    return defaultVoice;
  }
  
  // Direct lookup (exact match)
  if (voiceMap[speaker]) {
    return voiceMap[speaker];
  }
  
  // Convert UPPERCASE_WITH_UNDERSCORES to Title Case with spaces
  // e.g., "JOSEPH_RAGOWSKI" → "Joseph Ragowski"
  const normalizedName = speaker
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  if (voiceMap[normalizedName]) {
    return voiceMap[normalizedName];
  }
  
  // Try case-insensitive exact match
  const lowerSpeaker = speaker.toLowerCase().replace(/_/g, ' ');
  for (const [name, voice] of Object.entries(voiceMap)) {
    if (name.toLowerCase() === lowerSpeaker) {
      return voice;
    }
  }
  
  // Partial match: any word in speaker matches any word in voiceMap key
  // This handles "JOSEPH_RAGOWSKI" matching "Ragowski" or "Joseph Ragowski" matching "Joe"
  const speakerWords = lowerSpeaker.split(' ');
  for (const [name, voice] of Object.entries(voiceMap)) {
    const nameWords = name.toLowerCase().split(' ');
    // Check if any speaker word matches any name word (partial match)
    for (const sw of speakerWords) {
      for (const nw of nameWords) {
        // Match if one contains the other (handles "Joe" matching "Joseph")
        if (sw.length >= 3 && nw.length >= 3 && (sw.includes(nw) || nw.includes(sw))) {
          console.log(`  🔗 Partial match: "${speaker}" → "${name}" → ${voice}`);
          return voice;
        }
        // Exact word match
        if (sw === nw && sw.length >= 3) {
          console.log(`  🔗 Word match: "${speaker}" → "${name}" → ${voice}`);
          return voice;
        }
      }
    }
  }
  
  // Last resort: check if speaker's last word (likely surname) matches any key
  const lastName = speakerWords[speakerWords.length - 1];
  if (lastName.length >= 3) {
    for (const [name, voice] of Object.entries(voiceMap)) {
      if (name.toLowerCase().includes(lastName)) {
        console.log(`  🔗 Surname match: "${speaker}" → "${name}" → ${voice}`);
        return voice;
      }
    }
  }
  
  // Fallback to default voice
  console.warn(`  ⚠️ No voice mapping found for "${speaker}" (normalized: "${normalizedName}"), using default`);
  return defaultVoice;
}

// ========================================
// Temp Chunk Generation
// ========================================

/**
 * Result of temp chunk generation
 */
export interface TempChunkResult {
  audioBuffer: Buffer;
  tempFilePath: string;
  fromCache: boolean;
  duration: number; // seconds (estimated)
}

/**
 * Generate TTS audio for a chunk and save to temp file
 * 
 * KEY FEATURES:
 * - Checks if temp file already exists (disk cache)
 * - Uses TRUE multi-speaker TTS for multi-voice chunks (max 2 speakers per call)
 * - Falls back to single-voice for chunks without voice tags
 * - Saves to temp file immediately after generation
 * 
 * @param chunkIndex - Global chunk index
 * @param chunkText - Text to synthesize (with [VOICE=] tags for multi-voice)
 * @param bookTitle - Sanitized book title
 * @param voiceMap - Character to voice mapping
 * @param defaultVoice - Default voice for narrator (default: 'Algieba')
 * @returns Temp chunk result with audio buffer and metadata
 */
export async function generateAndSaveTempChunk(
  chunkIndex: number,
  chunkText: string,
  bookTitle: string,
  voiceMap: Record<string, string> = {},
  defaultVoice: string = 'Algieba'
): Promise<TempChunkResult> {
  const tempFile = getTempChunkPath(bookTitle, chunkIndex);
  
  // 1. Check if temp file already exists (resume capability)
  if (fs.existsSync(tempFile)) {
    console.log(`💾 Temp chunk ${chunkIndex} already exists, loading from disk`);
    const audioBuffer = fs.readFileSync(tempFile);
    const duration = estimateAudioDuration(audioBuffer);
    
    return {
      audioBuffer,
      tempFilePath: tempFile,
      fromCache: true,
      duration,
    };
  }
  
  const startTime = Date.now();
  console.log(`🎤 Generating chunk ${chunkIndex}...`);
  
  // 2. Generate TTS audio
  const voiceSegments = extractVoiceSegments(chunkText);
  let audioBuffer: Buffer;
  
  if (voiceSegments.length > 0) {
    // MULTI-VOICE MODE: Chunk has voice tags
    // Using TRUE multi-speaker TTS via Gemini's multiSpeakerVoiceConfig
    const uniqueSpeakers = [...new Set(voiceSegments.map(s => s.speaker))];
    console.log(`  Multi-voice chunk: ${voiceSegments.length} segments, ${uniqueSpeakers.length} speakers`);
    
    // CRITICAL: Gemini TTS multi-speaker requires EXACTLY 2 speakers
    if (uniqueSpeakers.length === 1) {
      // Only 1 speaker - use single-voice synthesis
      const speaker = uniqueSpeakers[0];
      const voice = lookupVoice(speaker, voiceMap, defaultVoice);
      console.log(`  📢 Single speaker chunk: ${speaker} → ${voice}`);
      
      // Concatenate all segment texts (they're all from the same speaker)
      const combinedText = voiceSegments.map(s => s.text).join(' ');
      audioBuffer = await synthesizeText(combinedText, voice);
      
    } else if (uniqueSpeakers.length > 2) {
      // More than 2 speakers - use twoSpeakerChunker to split and generate multiple audio pieces
      console.log(`  📦 ${uniqueSpeakers.length} speakers in pre-tagged chunk - using twoSpeakerChunker`);
      console.log(`     Speakers: ${uniqueSpeakers.join(', ')}`);
      
      // Split into 2-speaker sub-chunks
      const twoSpeakerChunks = chunkForTwoSpeakers(chunkText);
      console.log(`     Split into ${twoSpeakerChunks.length} sub-chunks`);
      
      // Generate audio for each sub-chunk and concatenate
      const audioBuffers: Buffer[] = [];
      for (const subChunk of twoSpeakerChunks) {
        let subAudio: Buffer;
        
        if (subChunk.speakers.length === 1) {
          // Single speaker
          const voice = lookupVoice(subChunk.speakers[0], voiceMap, defaultVoice);
          const text = subChunk.segments.map(s => s.text).join(' ');
          subAudio = await synthesizeText(text, voice);
        } else {
          // 2 speakers - true multi-speaker
          const speakerConfigs: SpeakerConfig[] = subChunk.speakers.map(speaker => ({
            speaker,
            voiceName: lookupVoice(speaker, voiceMap, defaultVoice),
          }));
          subAudio = await synthesizeMultiSpeaker(subChunk.formattedText, speakerConfigs);
        }
        
        audioBuffers.push(subAudio);
      }
      
      // Concatenate all audio buffers
      audioBuffer = concatenateWavBuffers(audioBuffers);
      console.log(`     ✓ Generated and concatenated ${audioBuffers.length} audio pieces`);
    } else {
      // TRUE MULTI-SPEAKER: Exactly 2 speakers - use Gemini's native multiSpeakerVoiceConfig
      console.log(`  ✅ Using TRUE multi-speaker TTS (2 speakers)`);
      
      // Build speaker configs for this chunk
      const speakerConfigs: SpeakerConfig[] = uniqueSpeakers.map(speaker => ({
        speaker,
        voiceName: lookupVoice(speaker, voiceMap, defaultVoice),
      }));
      
      console.log(`     Speakers: ${speakerConfigs.map(s => `${s.speaker} → ${s.voiceName}`).join(', ')}`);
      
      // Format text for multi-speaker TTS: "Speaker: text" format
      const formattedText = formatForMultiSpeakerTTS(voiceSegments);
      const textBytes = Buffer.byteLength(formattedText, 'utf8');
      console.log(`     Formatted text: ${textBytes} bytes`);
      
      // Single API call for all segments
      audioBuffer = await synthesizeMultiSpeaker(formattedText, speakerConfigs);
    }
    
    console.log(`  ✓ Generated ${audioBuffer.length} bytes`);
    
  } else {
    // SINGLE-VOICE MODE: No voice tags detected
    // Check if on-demand dramatization is enabled
    const dramatizationEnabled = (global as any).DRAMATIZATION_ENABLED;
    
    if (dramatizationEnabled) {
      // ON-DEMAND DRAMATIZATION: Convert plain text to multi-voice
      // Uses pre-dramatization cache if available (for uninterrupted playback)
      console.log(`  🎭 Dramatization for chunk ${chunkIndex}...`);
      
      const dramatizedText = await dramatizeChunkOnDemand(chunkIndex, chunkText);
      const dramatizedSegments = extractVoiceSegments(dramatizedText);
      
      if (dramatizedSegments.length > 0) {
        // Successfully dramatized - now generate multi-voice audio
        const uniqueSpeakers = [...new Set(dramatizedSegments.map(s => s.speaker))];
        console.log(`    ✓ Dramatized: ${dramatizedSegments.length} segments, ${uniqueSpeakers.length} speakers`);
        
        if (uniqueSpeakers.length === 1) {
          // Single speaker after dramatization
          const speaker = uniqueSpeakers[0];
          const voice = lookupVoice(speaker, voiceMap, defaultVoice);
          const combinedText = dramatizedSegments.map(s => s.text).join(' ');
          audioBuffer = await synthesizeText(combinedText, voice);
          
        } else if (uniqueSpeakers.length === 2) {
          // Perfect! True multi-speaker
          const speakerConfigs: SpeakerConfig[] = uniqueSpeakers.map(speaker => ({
            speaker,
            voiceName: lookupVoice(speaker, voiceMap, defaultVoice),
          }));
          const formattedText = formatForMultiSpeakerTTS(dramatizedSegments);
          audioBuffer = await synthesizeMultiSpeaker(formattedText, speakerConfigs);
          
        } else {
          // More than 2 speakers - use twoSpeakerChunker to split and generate multiple audio pieces
          console.log(`    📦 ${uniqueSpeakers.length} speakers - using twoSpeakerChunker`);
          
          // Split into 2-speaker sub-chunks
          const twoSpeakerChunks = chunkForTwoSpeakers(dramatizedText);
          console.log(`       Split into ${twoSpeakerChunks.length} sub-chunks`);
          
          // Generate audio for each sub-chunk and concatenate
          const audioBuffers: Buffer[] = [];
          for (const subChunk of twoSpeakerChunks) {
            let subAudio: Buffer;
            
            if (subChunk.speakers.length === 1) {
              // Single speaker
              const voice = lookupVoice(subChunk.speakers[0], voiceMap, defaultVoice);
              const text = subChunk.segments.map(s => s.text).join(' ');
              subAudio = await synthesizeText(text, voice);
            } else {
              // 2 speakers - true multi-speaker
              const speakerConfigs: SpeakerConfig[] = subChunk.speakers.map(speaker => ({
                speaker,
                voiceName: lookupVoice(speaker, voiceMap, defaultVoice),
              }));
              subAudio = await synthesizeMultiSpeaker(subChunk.formattedText, speakerConfigs);
            }
            
            audioBuffers.push(subAudio);
          }
          
          // Concatenate all audio buffers
          audioBuffer = concatenateWavBuffers(audioBuffers);
          console.log(`       ✓ Generated and concatenated ${audioBuffers.length} audio pieces`);
        }
      } else {
        // Dramatization didn't produce voice tags - use single voice
        console.log(`    📝 No dialogue found, using narrator voice`);
        const cleanText = removeVoiceTags(chunkText);
        audioBuffer = await synthesizeText(cleanText, defaultVoice);
      }
      
    } else {
      // SINGLE-VOICE MODE: No dramatization
      console.log(`  Single-voice chunk (${chunkText.length} chars)`);
      
      // Remove any stray voice tags (safety)
      const cleanText = removeVoiceTags(chunkText);
      const textBytes = Buffer.byteLength(cleanText, 'utf8');
      
      // Validate size
      if (textBytes > GEMINI_TTS_HARD_LIMIT) {
        throw new Error(
          `Chunk ${chunkIndex} exceeds ${GEMINI_TTS_HARD_LIMIT}-byte limit: ${textBytes} bytes`
        );
      }
      
      audioBuffer = await synthesizeText(cleanText, defaultVoice);
    }
  }
  
  // 3. Save to temp file immediately
  const tempDir = getTempFolder(bookTitle);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  fs.writeFileSync(tempFile, audioBuffer);
  
  const elapsedMs = Date.now() - startTime;
  const duration = estimateAudioDuration(audioBuffer);
  
  console.log(`✅ Saved temp chunk ${chunkIndex}: ${tempFile} (${audioBuffer.length} bytes, ~${duration.toFixed(1)}s audio, ${elapsedMs}ms generation)`);
  
  return {
    audioBuffer,
    tempFilePath: tempFile,
    fromCache: false,
    duration,
  };
}

/**
 * SMART BATCHING: Generate multi-voice audio by batching into optimal API calls
 * 
 * Instead of making one API call per segment, this groups consecutive segments
 * into batches that can use:
 * - True multi-speaker TTS (when batch has exactly 2 speakers)
 * - Single-voice TTS (when batch has 1 speaker)
 * 
 * Example: [A, A, B, A, C, C] → [[A,A,B,A], [C,C]] → multi-speaker(A,B) + single(C)
 * 
 * @param voiceSegments - Voice segments to synthesize
 * @param voiceMap - Character to voice mapping
 * @param defaultVoice - Default voice for narrator
 * @returns Concatenated audio buffer
 */
async function generateMultiVoiceSimulated(
  voiceSegments: Array<{ speaker: string; text: string }>,
  voiceMap: Record<string, string>,
  defaultVoice: string
): Promise<Buffer> {
  console.log(`  🔄 Smart batching: ${voiceSegments.length} segments`);
  
  // Group consecutive segments into batches where each batch has ≤2 unique speakers
  const batches: Array<Array<{ speaker: string; text: string }>> = [];
  let currentBatch: Array<{ speaker: string; text: string }> = [];
  let currentSpeakers = new Set<string>();
  
  for (const segment of voiceSegments) {
    // Check if adding this segment would exceed 2 speakers
    const wouldExceed = !currentSpeakers.has(segment.speaker) && currentSpeakers.size >= 2;
    
    if (wouldExceed && currentBatch.length > 0) {
      // Finalize current batch and start new one
      batches.push([...currentBatch]);
      currentBatch = [segment];
      currentSpeakers = new Set([segment.speaker]);
    } else {
      currentBatch.push(segment);
      currentSpeakers.add(segment.speaker);
    }
  }
  
  // Don't forget the last batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }
  
  console.log(`     Created ${batches.length} batches from ${voiceSegments.length} segments`);
  
  // Process each batch with the appropriate TTS method
  const audioBuffers: Buffer[] = [];
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchSpeakers = [...new Set(batch.map(s => s.speaker))];
    
    let batchAudio: Buffer;
    
    if (batchSpeakers.length === 1) {
      // Single speaker - use single-voice TTS
      const speaker = batchSpeakers[0];
      const voice = lookupVoice(speaker, voiceMap, defaultVoice);
      const combinedText = batch.map(s => s.text).join(' ');
      
      console.log(`     Batch ${i + 1}/${batches.length}: Single-voice (${speaker} → ${voice})`);
      batchAudio = await synthesizeText(combinedText, voice);
      
    } else {
      // 2 speakers - use true multi-speaker TTS
      const speakerConfigs: SpeakerConfig[] = batchSpeakers.map(speaker => ({
        speaker,
        voiceName: lookupVoice(speaker, voiceMap, defaultVoice),
      }));
      
      const formattedText = formatForMultiSpeakerTTS(batch);
      
      console.log(`     Batch ${i + 1}/${batches.length}: Multi-speaker (${speakerConfigs.map(s => `${s.speaker}→${s.voiceName}`).join(', ')})`);
      batchAudio = await synthesizeMultiSpeaker(formattedText, speakerConfigs);
    }
    
    // Add small pause between batches (not after the last one)
    if (i < batches.length - 1) {
      batchAudio = addSilence(batchAudio, 300, 'end');
    }
    
    audioBuffers.push(batchAudio);
  }
  
  // Concatenate all batch audio
  return concatenateWavBuffers(audioBuffers);
}

/**
 * Generate multiple chunks in parallel
 * 
 * Optimizes first-play experience by generating chunks 0 & 1 together
 * 
 * @param chunkIndices - Array of chunk indices to generate
 * @param chunkTexts - Array of chunk texts (must match indices length)
 * @param bookTitle - Sanitized book title
 * @param voiceMap - Character to voice mapping
 * @param defaultVoice - Default voice for narrator
 * @returns Array of temp chunk results
 */
export async function generateMultipleTempChunks(
  chunkIndices: number[],
  chunkTexts: string[],
  bookTitle: string,
  voiceMap: Record<string, string> = {},
  defaultVoice: string = 'Algieba'
): Promise<TempChunkResult[]> {
  if (chunkIndices.length !== chunkTexts.length) {
    throw new Error('chunkIndices and chunkTexts must have the same length');
  }
  
  console.log(`🚀 Parallel generation of ${chunkIndices.length} chunks: ${chunkIndices.join(', ')}`);
  const startTime = Date.now();
  
  const results = await Promise.all(
    chunkIndices.map((index, i) =>
      generateAndSaveTempChunk(index, chunkTexts[i], bookTitle, voiceMap, defaultVoice)
    )
  );
  
  const elapsedMs = Date.now() - startTime;
  const fromCacheCount = results.filter(r => r.fromCache).length;
  
  console.log(`✅ Parallel generation complete: ${chunkIndices.length} chunks in ${elapsedMs}ms (${fromCacheCount} from cache)`);
  
  return results;
}

// ========================================
// Chapter Consolidation
// ========================================

/**
 * Consolidate temp chunks into a single chapter WAV file
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterIndex - Chapter index (0-based)
 * @param chunkIndices - Array of global chunk indices for this chapter
 * @returns Path to consolidated chapter file
 */
export async function consolidateChapterFromTemps(
  bookTitle: string,
  chapterIndex: number,
  chunkIndices: number[]
): Promise<string> {
  const outputPath = getChapterPath(bookTitle, chapterIndex);
  
  // Check if chapter file already exists
  if (fs.existsSync(outputPath)) {
    console.log(`✓ Chapter ${chapterIndex} already consolidated: ${outputPath}`);
    return outputPath;
  }
  
  console.log(`📦 Consolidating Chapter ${chapterIndex} from ${chunkIndices.length} temp chunks...`);
  
  // 1. Load all temp chunk files and track boundaries
  const chunkBuffers: Buffer[] = [];
  const chunkBoundaries: Array<{ chunkIndex: number; startByte: number; endByte: number; duration: number }> = [];
  let currentByte = 44; // WAV header is 44 bytes
  
  for (const chunkIndex of chunkIndices) {
    const tempFile = getTempChunkPath(bookTitle, chunkIndex);
    
    if (!fs.existsSync(tempFile)) {
      throw new Error(`Temp chunk ${chunkIndex} not found: ${tempFile}`);
    }
    
    const buffer = fs.readFileSync(tempFile);
    chunkBuffers.push(buffer);
    
    // Track chunk boundaries (excluding WAV header for each chunk)
    const pcmDataSize = buffer.length - 44;
    const duration = estimateAudioDuration(buffer);
    
    chunkBoundaries.push({
      chunkIndex,
      startByte: currentByte,
      endByte: currentByte + pcmDataSize,
      duration,
    });
    
    currentByte += pcmDataSize;
  }
  
  // 2. Concatenate into single WAV
  const chapterAudio = concatenateWavBuffers(chunkBuffers);
  
  // 3. Save consolidated chapter file
  fs.writeFileSync(outputPath, chapterAudio);
  const duration = estimateAudioDuration(chapterAudio);
  
  // 4. Save chunk boundaries metadata for extraction
  const boundariesPath = outputPath.replace('.wav', '_boundaries.json');
  fs.writeFileSync(boundariesPath, JSON.stringify({
    chapterIndex,
    totalChunks: chunkIndices.length,
    totalBytes: chapterAudio.length,
    totalDuration: duration,
    chunks: chunkBoundaries,
  }, null, 2));
  
  console.log(`✅ Consolidated Chapter ${chapterIndex}: ${outputPath} (${chapterAudio.length} bytes, ~${duration.toFixed(1)}s audio)`);
  console.log(`  📊 Chunk boundaries saved: ${boundariesPath}`);
  
  // NOTE: We intentionally KEEP temp chunks for now to avoid race condition:
  // - User may still be playing from temp files
  // - Deleting them while in use causes errors
  // - Temps will be cleaned up on next book load or explicit cleanup
  console.log(`  📦 Temp chunks preserved (${chunkIndices.length} files) - will be cleaned up later`);
  
  return outputPath;
}

/**
 * Consolidate temp chunks for a chapter with intelligent splitting
 * Splits long chapters (>30 min) into multiple parts at natural boundaries
 * 
 * @param bookTitle - Sanitized book title
 * @param chapter - Chapter object with title and metadata
 * @param chunkIndices - Array of global chunk indices for this chapter
 * @returns Array of paths to consolidated chapter file(s)
 */
export async function consolidateChapterSmart(
  bookTitle: string,
  chapter: Chapter,
  chunkIndices: number[]
): Promise<string[]> {
  const MAX_DURATION_SECONDS = 30 * 60; // 30 minutes
  const MIN_PART_DURATION = 15 * 60; // 15 minutes (don't create tiny parts)
  
  console.log(`📦 Smart consolidation: Chapter ${chapter.index + 1} "${chapter.title}" (${chunkIndices.length} chunks)`);
  
  // Load all chunks and calculate total duration
  const chunkBuffers: Buffer[] = [];
  const chunkDurations: number[] = [];
  let totalDuration = 0;
  
  for (const chunkIndex of chunkIndices) {
    const tempFile = getTempChunkPath(bookTitle, chunkIndex);
    
    if (!fs.existsSync(tempFile)) {
      throw new Error(`Temp chunk ${chunkIndex} not found: ${tempFile}`);
    }
    
    const buffer = fs.readFileSync(tempFile);
    const duration = estimateAudioDuration(buffer);
    
    chunkBuffers.push(buffer);
    chunkDurations.push(duration);
    totalDuration += duration;
  }
  
  console.log(`  Total duration: ${(totalDuration / 60).toFixed(1)} minutes`);
  
  // Decision: Split or not?
  if (totalDuration <= MAX_DURATION_SECONDS) {
    // Single file - no split needed
    console.log(`  ✅ Single file (under 30 min)`);
    const outputPath = getChapterPath(bookTitle, chapter.index, chapter.title);
    
    // Check if already exists
    if (fs.existsSync(outputPath)) {
      console.log(`  ✓ Already consolidated: ${outputPath}`);
      return [outputPath];
    }
    
    const chapterAudio = concatenateWavBuffers(chunkBuffers);
    fs.writeFileSync(outputPath, chapterAudio);
    
    console.log(`  ✅ Created: ${path.basename(outputPath)} (${(totalDuration / 60).toFixed(1)} min)`);
    return [outputPath];
  }
  
  // Need to split into parts
  const numParts = Math.ceil(totalDuration / MAX_DURATION_SECONDS);
  const targetPartDuration = totalDuration / numParts;
  
  console.log(`  📂 Splitting into ${numParts} parts (~${(targetPartDuration / 60).toFixed(1)} min each)`);
  
  const outputPaths: string[] = [];
  let currentPartBuffers: Buffer[] = [];
  let currentPartDuration = 0;
  let partIndex = 0;
  
  for (let i = 0; i < chunkBuffers.length; i++) {
    currentPartBuffers.push(chunkBuffers[i]);
    currentPartDuration += chunkDurations[i];
    
    // Check if we should finalize this part
    const shouldFinalize = 
      currentPartDuration >= targetPartDuration ||  // Reached target duration
      i === chunkBuffers.length - 1;                // Last chunk
    
    if (shouldFinalize && currentPartDuration >= MIN_PART_DURATION) {
      const outputPath = getChapterPath(bookTitle, chapter.index, chapter.title, partIndex);
      
      if (!fs.existsSync(outputPath)) {
        const partAudio = concatenateWavBuffers(currentPartBuffers);
        fs.writeFileSync(outputPath, partAudio);
        console.log(`  ✅ Part ${partIndex + 1}: ${path.basename(outputPath)} (${(currentPartDuration / 60).toFixed(1)} min)`);
      } else {
        console.log(`  ✓ Part ${partIndex + 1} already exists: ${path.basename(outputPath)}`);
      }
      
      outputPaths.push(outputPath);
      
      // Reset for next part
      currentPartBuffers = [];
      currentPartDuration = 0;
      partIndex++;
    }
  }
  
  // Handle any remaining chunks (shouldn't happen, but safety check)
  if (currentPartBuffers.length > 0) {
    const outputPath = getChapterPath(bookTitle, chapter.index, chapter.title, partIndex);
    const partAudio = concatenateWavBuffers(currentPartBuffers);
    fs.writeFileSync(outputPath, partAudio);
    console.log(`  ✅ Part ${partIndex + 1} (final): ${path.basename(outputPath)} (${(currentPartDuration / 60).toFixed(1)} min)`);
    outputPaths.push(outputPath);
  }
  
  console.log(`  ✅ Chapter split into ${outputPaths.length} parts`);
  return outputPaths;
}

/**
 * Consolidate all chapters from temp chunks
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterChunkMapping - Map of chapterIndex -> chunk indices
 * @returns Array of consolidated chapter file paths
 */
export async function consolidateAllChapters(
  bookTitle: string,
  chapterChunkMapping: Map<number, number[]>
): Promise<string[]> {
  console.log(`\n📚 Consolidating ${chapterChunkMapping.size} chapters...`);
  
  const chapterPaths: string[] = [];
  
  for (const [chapterIndex, chunkIndices] of chapterChunkMapping.entries()) {
    const chapterPath = await consolidateChapterFromTemps(bookTitle, chapterIndex, chunkIndices);
    chapterPaths.push(chapterPath);
  }
  
  console.log(`✅ All chapters consolidated successfully`);
  return chapterPaths;
}

// ========================================
// Helper Functions
// ========================================

/**
 * Estimate audio duration from WAV buffer
 * 
 * Formula: duration = data_size / (sample_rate * channels * bytes_per_sample)
 * Gemini TTS defaults: 24000 Hz, mono, 16-bit
 * 
 * @param wavBuffer - WAV audio buffer
 * @returns Estimated duration in seconds
 */
export function estimateAudioDuration(wavBuffer: Buffer): number {
  // WAV header is 44 bytes, rest is PCM data
  const pcmDataSize = wavBuffer.length - 44;
  
  // Gemini TTS defaults
  const sampleRate = 24000;
  const channels = 1; // mono
  const bytesPerSample = 2; // 16-bit
  
  const duration = pcmDataSize / (sampleRate * channels * bytesPerSample);
  return duration;
}

/**
 * Check if temp chunk exists
 * 
 * @param bookTitle - Sanitized book title
 * @param chunkIndex - Chunk index
 * @returns True if temp file exists
 */
export function tempChunkExists(bookTitle: string, chunkIndex: number): boolean {
  const tempFile = getTempChunkPath(bookTitle, chunkIndex);
  return fs.existsSync(tempFile);
}

/**
 * Load existing temp chunk from disk
 * 
 * @param bookTitle - Sanitized book title
 * @param chunkIndex - Chunk index
 * @returns Audio buffer or null if not found
 */
export function loadTempChunk(bookTitle: string, chunkIndex: number): Buffer | null {
  const tempFile = getTempChunkPath(bookTitle, chunkIndex);
  
  if (!fs.existsSync(tempFile)) {
    return null;
  }
  
  return fs.readFileSync(tempFile);
}

/**
 * Extract a specific chunk from consolidated chapter file
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterIndex - Chapter index
 * @param chunkIndex - Global chunk index to extract
 * @returns Audio buffer for the specific chunk, or null if not found
 */
export function extractChunkFromConsolidated(
  bookTitle: string,
  chapterIndex: number,
  chunkIndex: number
): Buffer | null {
  const chapterPath = getChapterPath(bookTitle, chapterIndex);
  const boundariesPath = chapterPath.replace('.wav', '_boundaries.json');
  
  // Check if consolidated file and boundaries exist
  if (!fs.existsSync(chapterPath) || !fs.existsSync(boundariesPath)) {
    return null;
  }
  
  try {
    // Load chunk boundaries metadata
    const boundariesData = JSON.parse(fs.readFileSync(boundariesPath, 'utf8'));
    const chunkInfo = boundariesData.chunks.find((c: any) => c.chunkIndex === chunkIndex);
    
    if (!chunkInfo) {
      console.error(`Chunk ${chunkIndex} not found in boundaries metadata`);
      return null;
    }
    
    // Load consolidated file
    const consolidatedAudio = fs.readFileSync(chapterPath);
    
    // Extract PCM data for this chunk (boundaries are relative to PCM data, after WAV header)
    const pcmData = consolidatedAudio.slice(chunkInfo.startByte, chunkInfo.endByte);
    
    // Create new WAV file with header for this chunk
    const wavHeader = consolidatedAudio.slice(0, 44); // Copy header from consolidated file
    
    // Update header with correct chunk size
    const newWavBuffer = Buffer.concat([wavHeader, pcmData]);
    
    // Fix WAV header sizes
    const dataSize = pcmData.length;
    const fileSize = 36 + dataSize; // Total file size - 8 bytes
    
    // Update RIFF chunk size (bytes 4-7)
    newWavBuffer.writeUInt32LE(fileSize, 4);
    
    // Update data chunk size (bytes 40-43)
    newWavBuffer.writeUInt32LE(dataSize, 40);
    
    console.log(`📚 Extracted chunk ${chunkIndex} from consolidated file: ${pcmData.length} bytes PCM → ${newWavBuffer.length} bytes WAV`);
    
    return newWavBuffer;
  } catch (error) {
    console.error(`Failed to extract chunk ${chunkIndex} from consolidated file:`, error);
    return null;
  }
}

/**
 * Delete all temp chunks for a book
 * 
 * @param bookTitle - Sanitized book title
 * @returns Number of files deleted
 */
export function deleteAllTempChunks(bookTitle: string): number {
  const tempDir = getTempFolder(bookTitle);
  
  if (!fs.existsSync(tempDir)) {
    return 0;
  }
  
  const files = fs.readdirSync(tempDir);
  const chunkFiles = files.filter(f => f.match(/^chunk_\d{3}\.wav$/));
  
  for (const file of chunkFiles) {
    fs.unlinkSync(path.join(tempDir, file));
  }
  
  console.log(`✓ Deleted ${chunkFiles.length} temp chunks for ${bookTitle}`);
  
  // Delete temp folder if empty
  const remainingFiles = fs.readdirSync(tempDir);
  if (remainingFiles.length === 0) {
    fs.rmdirSync(tempDir);
    console.log(`✓ Removed empty temp folder`);
  }
  
  return chunkFiles.length;
}

/**
 * Delete temp chunks for a specific chapter after consolidation
 * 
 * @param bookTitle - Sanitized book title
 * @param chunkIndices - Array of chunk indices to delete
 * @returns Number of files deleted
 */
export function deleteChapterTempChunks(bookTitle: string, chunkIndices: number[]): number {
  const tempDir = getTempFolder(bookTitle);
  
  if (!fs.existsSync(tempDir)) {
    return 0;
  }
  
  let deletedCount = 0;
  
  for (const chunkIndex of chunkIndices) {
    const tempFile = getTempChunkPath(bookTitle, chunkIndex);
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
      deletedCount++;
    }
  }
  
  if (deletedCount > 0) {
    console.log(`  🗑️  Deleted ${deletedCount} temp chunks`);
  }
  
  // Check if temp folder is now empty and delete it
  const remainingFiles = fs.readdirSync(tempDir);
  if (remainingFiles.length === 0) {
    fs.rmdirSync(tempDir);
    console.log(`  🗑️  Removed empty temp folder`);
  }
  
  return deletedCount;
}
