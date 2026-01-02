import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { synthesizeText } from './ttsClient.js';
import { 
  chunkBookText, 
  getBookInfo, 
  parseBookMetadata, 
  formatDuration,
  extractTextFromEpub,
  type BookMetadata 
} from './bookChunker.js';
import { processDramatizedText } from './dramatizedProcessor.js';
import { processTaggedTextFile } from './dramatizedChunkerSimple.js';
import { extractVoiceSegments, removeVoiceTags } from './dramatizedChunkerSimple.js';
import { loadVoiceMap, assignVoices, type Character } from './voiceAssigner.js';
import { concatenateWavBuffers, addSilence } from './audioUtils.js';
import { 
  generateAndSaveTempChunk,
  generateMultipleTempChunks, 
  tempChunkExists, 
  loadTempChunk,
  consolidateChapterFromTemps,
  consolidateChapterSmart,
  deleteAllTempChunks,
  deleteChapterTempChunks,
  extractChunkFromConsolidated,
  // Pre-dramatization pipeline
  clearDramatizationCache,
  startPreDramatization,
  stopPreDramatization,
  getDramatizationCacheStats,
  // NEW: Sub-chunk generation (parallel pipeline)
  generateSubChunk,
  generateSubChunksParallel,
  consolidateChapterFromSubChunks,
  deleteChapterSubChunks,
  subChunkExists,
  loadSubChunk,
  findSubChunkByGlobalIndex,
  type SubChunkResult
} from './tempChunkManager.js';
import { 
  sanitizeBookTitle,
  sanitizeChapterTitle,
  listAudiobooks,
  loadAudiobookMetadata,
  saveAudiobookMetadata,
  createAudiobookFolder,
  countTempChunks,
  getChapterPath,
  getAudiobooksDir,
  getSubChunkPath,
  countChapterSubChunks,
  isChapterConsolidated,
  extractSubChunkFromChapter,
  loadChapterBoundaries,
  type AudiobookMetadata,
  type ChapterBoundaries
} from './audiobookManager.js';
import { 
  extractEpubChapters, 
  detectTextChapters, 
  createSingleChapter,
  type Chapter 
} from './bookChunker.js';
import { chunkBookByChapters, type ChunkInfo } from './chapterChunker.js';
import { chunkForTwoSpeakers, type TwoSpeakerChunk } from './twoSpeakerChunker.js';
import { dramatizeBookHybrid, tagChapterHybrid } from './hybridDramatizer.js';
import { streamingDramatize, StreamingChunk } from './streamingDramatizer.js';
import { GeminiConfig, CharacterProfile } from './llmCharacterAnalyzer.js';
import { audiobookWorker } from './audiobookWorker.js';
import { dramatizeBook, checkCache } from './geminiDramatizer.js';
// NEW: Parallel pipeline manager
import {
  resetPipeline,
  getPipelineState,
  initializePipeline,
  enrichFromChapter,
  splitChapterToSubChunks,
  getSubChunk,
  getChapterSubChunkCount,
  isReadyForPlayback,
  markSubChunkGenerated,
  getVoiceAssignments,
  getCharacterDB,
  globalToLocalIndex,
  localToGlobalIndex,
  getTotalSubChunkCount,
  type PipelineConfig,
  type ChapterState
} from './parallelPipelineManager.js';

// ES modules dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Book state variables (initialized empty, loaded on demand)
let BOOK_TEXT: string = '';
// REMOVED: BOOK_CHUNKS - chunk layer eliminated, now using sub-chunks directly
// REMOVED: CHUNK_INFOS - chunk layer eliminated
// BOOK_CHAPTERS uses 1-based indexing: BOOK_CHAPTERS[1] = first chapter, BOOK_CHAPTERS[0] = undefined
let BOOK_CHAPTERS: Chapter[] = []; // Store extracted chapters (1-based: index 0 unused)
let BOOK_METADATA: BookMetadata | null = null;
let BOOK_INFO: ReturnType<typeof getBookInfo> | null = null;
let BOOK_FORMAT: 'txt' | 'epub' | 'pdf' = 'txt';
let CURRENT_BOOK_FILE: string = '';
let ASSETS_DIR: string;
let VOICE_MAP: Record<string, string> = {}; // Global voice map for dramatized books
let NARRATOR_VOICE: string = 'Achird'; // Global narrator voice selection (default: Achird)

// Helper: Get actual chapter count (BOOK_CHAPTERS.length - 1 because index 0 is unused)
function getChapterCount(): number {
  return BOOK_CHAPTERS.length > 0 ? BOOK_CHAPTERS.length - 1 : 0;
}

// NEW: Sub-chunk tracking (parallel pipeline)
// Map: chapterNum (1-based) -> array of sub-chunks
let CHAPTER_SUBCHUNKS: Map<number, TwoSpeakerChunk[]> = new Map();
// Map: chapterNum (1-based) -> dramatized text
let CHAPTER_DRAMATIZED: Map<number, string> = new Map();
// Total sub-chunks count (for backward compatibility with frontend)
let TOTAL_SUBCHUNKS: number = 0;

// NEW: Chapter playback tracking (for cleanup)
// Map: chapterNum (1-based) -> Set of played sub-chunk indices
let CHAPTER_PLAYED_SUBCHUNKS: Map<number, Set<number>> = new Map();
// Map: chapterNum (1-based) -> true if chapter was consolidated before playback started
let CHAPTER_WAS_READY_BEFORE_PLAY: Map<number, boolean> = new Map();

/**
 * Track that a sub-chunk was played and trigger cleanup if chapter is complete
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterNum - Chapter number (1-based)
 * @param subChunkIndex - Sub-chunk index within chapter
 * @param wasFromChapterFile - True if served from consolidated chapter file
 */
function trackSubChunkPlayed(
  bookTitle: string,
  chapterNum: number,
  subChunkIndex: number,
  wasFromChapterFile: boolean
): void {
  // Initialize tracking for this chapter if needed
  if (!CHAPTER_PLAYED_SUBCHUNKS.has(chapterNum)) {
    CHAPTER_PLAYED_SUBCHUNKS.set(chapterNum, new Set());
  }
  
  // Track this sub-chunk as played
  CHAPTER_PLAYED_SUBCHUNKS.get(chapterNum)!.add(subChunkIndex);
  
  // Track if chapter was ready before playback started (for cleanup decision)
  if (!CHAPTER_WAS_READY_BEFORE_PLAY.has(chapterNum)) {
    CHAPTER_WAS_READY_BEFORE_PLAY.set(chapterNum, wasFromChapterFile);
  }
  
  // Get expected sub-chunk count for this chapter
  const chapterSubChunks = CHAPTER_SUBCHUNKS.get(chapterNum) || [];
  const expectedCount = chapterSubChunks.length;
  const playedCount = CHAPTER_PLAYED_SUBCHUNKS.get(chapterNum)!.size;
  
  // If all sub-chunks played, trigger cleanup
  if (expectedCount > 0 && playedCount >= expectedCount) {
    console.log(`✓ Chapter ${chapterNum} fully played (${playedCount}/${expectedCount} sub-chunks)`);
    
    // Delete sub-chunks if chapter is consolidated
    const chapterTitle = BOOK_CHAPTERS[chapterNum]?.title;
    if (isChapterConsolidated(bookTitle, chapterNum, chapterTitle)) {
      console.log(`🗑️  Cleaning up sub-chunks for chapter ${chapterNum}...`);
      deleteChapterSubChunks(bookTitle, chapterNum);
    } else {
      console.log(`⏳ Chapter ${chapterNum} not yet consolidated, keeping sub-chunks`);
    }
    
    // Clear tracking for this chapter
    CHAPTER_PLAYED_SUBCHUNKS.delete(chapterNum);
    CHAPTER_WAS_READY_BEFORE_PLAY.delete(chapterNum);
  }
}

// Audio cache for generated chunks - key format: "chunkIndex:voiceName"
const audioCache = new Map<string, Buffer>();

// Background generation state
let isGeneratingInBackground = false;
let backgroundGenerationAbort: AbortController | null = null;

// Global state for background consolidation watcher
let consolidationWatcherInterval: NodeJS.Timeout | null = null;
const CONSOLIDATION_CHECK_INTERVAL = 30000; // Check every 30 seconds

/**
 * Helper function to load a book by filename
 * @param filename - Name of the book file in assets/
 */
async function loadBookFile(filename: string, enableDramatization: boolean = false): Promise<void> {
  const bookPath = path.join(ASSETS_DIR, filename);
  
  if (!fs.existsSync(bookPath)) {
    throw new Error(`Book file not found: ${filename}`);
  }
  
  // Clear voice map from previous book
  VOICE_MAP = {};
  
  // Clear dramatization cache from previous book
  clearDramatizationCache();
  
  // Stop any ongoing background generation and dramatization
  stopContinuousGeneration();
  stopBackgroundDramatization();
  
  // Determine format from extension
  const ext = path.extname(filename).toLowerCase();
  
  if (ext === '.epub') {
    BOOK_FORMAT = 'epub';
    console.log(`📚 Loading EPUB: ${filename}`);
    
    // Load EPUB as buffer
    const epubBuffer = fs.readFileSync(bookPath);
    
    // Parse metadata from EPUB
    BOOK_METADATA = parseBookMetadata(epubBuffer, 'epub', bookPath);
    
    // Extract text from EPUB
    BOOK_TEXT = extractTextFromEpub(epubBuffer);
    
    // Extract chapters from EPUB (returns 0-indexed array with 1-based .index property)
    const chaptersArray = extractEpubChapters(epubBuffer);
    
    // Store chapters at 1-based array positions: BOOK_CHAPTERS[1] = first chapter
    // This eliminates all index conversion confusion throughout the codebase
    BOOK_CHAPTERS = [];
    for (const chapter of chaptersArray) {
      BOOK_CHAPTERS[chapter.index] = chapter; // chapter.index is 1-based
    }
    console.log(`✓ Extracted ${chaptersArray.length} chapters from EPUB (1-based indexing)`);
    
  } else if (ext === '.txt') {
    BOOK_FORMAT = 'txt';
    console.log(`📄 Loading TXT: ${filename}`);
    
    // Load TXT
    BOOK_TEXT = fs.readFileSync(bookPath, 'utf-8');
    
    // Parse metadata from TXT
    BOOK_METADATA = parseBookMetadata(BOOK_TEXT, 'txt');
    
    // Detect chapters in TXT (returns 0-indexed array)
    const chaptersArray = detectTextChapters(BOOK_TEXT);
    
    // Store chapters at 1-based array positions
    BOOK_CHAPTERS = [];
    for (let i = 0; i < chaptersArray.length; i++) {
      const chapterNum = i + 1;
      BOOK_CHAPTERS[chapterNum] = { ...chaptersArray[i], index: chapterNum };
    }
    console.log(`✓ Detected ${chaptersArray.length} chapters in TXT (1-based indexing)`);
    
  } else if (ext === '.pdf') {
    BOOK_FORMAT = 'pdf';
    console.log(`📕 Loading PDF: ${filename}`);
    
    // TODO: Implement PDF loading
    throw new Error('PDF format not yet supported');
    
  } else {
    throw new Error(`Unsupported book format: ${ext}`);
  }
  
  // Check for voice tags (existing or from dramatization)
  let hasVoiceTags = /\[VOICE=.*?\]/.test(BOOK_TEXT);
  
  // HYBRID DRAMATIZATION: Auto-tag dialogue with LLM
  // For short books (<10k chars): do immediate full dramatization
  // For longer books: scan characters now, dramatize chunks on-demand during TTS
  const isShortBook = BOOK_TEXT.length < 10000; // ~2000 words
  
  if (enableDramatization && !hasVoiceTags) {
    console.log(`\n🎭 ${isShortBook ? 'IMMEDIATE' : 'ON-DEMAND'} DRAMATIZATION`);
    console.log('==========================================');
    
    try {
      const geminiConfig: GeminiConfig = {
        projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      };
      
      if (!geminiConfig.projectId) {
        throw new Error('GOOGLE_CLOUD_PROJECT environment variable not set');
      }
      
      console.log('⚡ Quick character scan (dramatization happens on-demand during TTS)...');
      console.log(`   Book: ${BOOK_TEXT.length} chars, ${BOOK_CHAPTERS.length} chapters`);
      
      // Import analyzer for character scan only
      const { GeminiCharacterAnalyzer } = await import('./llmCharacterAnalyzer.js');
      const analyzer = new GeminiCharacterAnalyzer(geminiConfig);
      
      // Phase 1: Character scan from FIRST 3 CHAPTERS only (fast, ~5s)
      // This is much faster than scanning entire 800k char book
      console.log('🔍 Scanning first 3 chapters for characters...');
      const chaptersForScan = Math.min(3, BOOK_CHAPTERS.length);
      const textForScan = BOOK_CHAPTERS.slice(0, chaptersForScan).map(ch => ch.text).join('\n\n');
      console.log(`   Using ${chaptersForScan} chapters (${textForScan.length} chars) for initial scan`);
      
      const characters = await analyzer.analyzeFullBook(textForScan);
      
      console.log(`✅ Found ${characters.length} characters: ${characters.map(c => c.name).join(', ')}`);
      
      // Create voice map immediately
      const charactersForVoiceMap: Character[] = characters
        .filter(cp => cp.name !== 'NARRATOR')
        .map(cp => ({
          name: cp.name,
          gender: cp.gender === 'unknown' ? 'neutral' : cp.gender,
          traits: cp.traits || []
        }));
      
      VOICE_MAP = assignVoices(charactersForVoiceMap, NARRATOR_VOICE);
      console.log(`🎙️  Voice assignments (narrator: ${NARRATOR_VOICE}):`);
      for (const [character, voice] of Object.entries(VOICE_MAP)) {
        console.log(`   ${character} → ${voice}`);
      }
      console.log('');
      
      // Store characters and analyzer for on-demand dramatization
      (global as any).DRAMATIZATION_CHARACTERS = characters;
      (global as any).DRAMATIZATION_CONFIG = geminiConfig;
      (global as any).DRAMATIZATION_ANALYZER = analyzer;
      
      // SHORT BOOKS: Do immediate full dramatization
      if (isShortBook) {
        console.log('📝 Short book - dramatizing immediately...');
        
        // Use tagChapterHybrid for quick tagging
        const dramatizedChapters: string[] = [];
        const chapterCount = getChapterCount();
        for (let chapterNum = 1; chapterNum < BOOK_CHAPTERS.length; chapterNum++) {
          const chapter = BOOK_CHAPTERS[chapterNum];
          console.log(`   Dramatizing chapter ${chapterNum}/${chapterCount}...`);
          
          // Use tagChapterHybrid which handles dialogue tagging
          const result = await tagChapterHybrid(
            chapter.text,
            characters,
            analyzer,
            chapterNum  // chapter number (1-based)
          );
          
          dramatizedChapters.push(result.taggedText);
          
          // Update chapter with dramatized text
          BOOK_CHAPTERS[chapterNum] = {
            ...chapter,
            text: result.taggedText
          };
        }
        
        // Update BOOK_TEXT with all dramatized chapters
        BOOK_TEXT = dramatizedChapters.join('\n\n');
        hasVoiceTags = true; // Now it's tagged!
        
        (global as any).DRAMATIZATION_ENABLED = false; // No need for on-demand
        BOOK_METADATA.isDramatized = true;
        BOOK_METADATA.dramatizationType = 'hybrid-optimized';
        BOOK_METADATA.charactersFound = characters.length;
        
        console.log('✅ Short book dramatization complete!\n');
      } else {
        // LONGER BOOKS: Background parallel dramatization (non-blocking)
        (global as any).DRAMATIZATION_ENABLED = true;
        
        // Update metadata
        BOOK_METADATA.isDramatized = false; // Will be true after chunks are dramatized
        BOOK_METADATA.dramatizationType = 'parallel-background';
        BOOK_METADATA.charactersFound = characters.length;
        
        console.log('✅ Character scan complete\n');
        console.log('🚀 Starting PARALLEL BACKGROUND DRAMATIZATION...');
        console.log('   This runs independently - playback starts immediately!\n');
        
        // Start background dramatization (non-blocking)
        // This will dramatize chapters in parallel while user can start playback
        startBackgroundDramatization(characters, analyzer).catch(err => 
          console.error('❌ Background dramatization failed:', err)
        );
      }
      
    } catch (error) {
      console.error('\n❌ CHARACTER SCAN FAILED');
      console.error('========================');
      console.error(error);
      console.error('\n⚠️ Falling back to single-voice narration\n');
      (global as any).DRAMATIZATION_ENABLED = false;
      hasVoiceTags = false;
    }
  }
  
  // For pre-tagged books: Extract characters from existing tags and create voice map
  if (hasVoiceTags && Object.keys(VOICE_MAP).length === 0) {
    console.log('\n🎭 PRE-TAGGED BOOK DETECTED');
    console.log('============================');
    console.log('   Extracting characters from existing voice tags...');
    
    try {
      // Import gender inference utility
      const { inferGender } = await import('./hybridTagger.js');
      
      // Extract all unique character names from voice tags in the book text
      const voiceTagRegex = /\[VOICE=([^:\]]+)(?::[^\]]+)?\]/g;
      const characterNames = new Set<string>();
      let match;
      
      while ((match = voiceTagRegex.exec(BOOK_TEXT)) !== null) {
        characterNames.add(match[1]);
      }
      
      console.log(`   Found ${characterNames.size} unique voices: ${Array.from(characterNames).join(', ')}`);
      
      // Create character profiles with intelligent gender detection
      const charactersForVoiceMap: Character[] = Array.from(characterNames)
        .filter(name => name !== 'NARRATOR') // NARRATOR handled separately
        .map(name => {
          // Extract context around this character's mentions for gender inference
          const contextRegex = new RegExp(`[^.]*${name}[^.]*\\.`, 'gi');
          const contextMatches = BOOK_TEXT.match(contextRegex) || [];
          const context = contextMatches.slice(0, 5).join(' '); // First 5 sentences with character
          
          const gender = inferGender(name, context);
          console.log(`   ${name}: detected gender = ${gender}`);
          
          return {
            name,
            gender,
            traits: []
          };
        });
      
      // Use global narrator voice (set by frontend via /api/tts/chunk)
      VOICE_MAP = assignVoices(charactersForVoiceMap, NARRATOR_VOICE);
      console.log(`🎙️  Voice assignments for pre-tagged book (narrator: ${NARRATOR_VOICE}):`);
      for (const [character, voice] of Object.entries(VOICE_MAP)) {
        console.log(`   ${character} → ${voice}`);
      }
      console.log('');
      
      // Mark as dramatized
      BOOK_METADATA.isDramatized = true;
      BOOK_METADATA.dramatizationType = 'llm-only'; // Pre-tagged, not hybrid
      BOOK_METADATA.charactersFound = characterNames.size;
      
    } catch (error) {
      console.error('❌ Failed to extract characters from pre-tagged book:', error);
      console.error('⚠️  Falling back to single-voice narration\n');
      VOICE_MAP = {};
    }
  }
  
  // Chunk the book using chapter-aware chunking
  // NEW: Direct chapter → sub-chunk flow (no intermediate chunk layer)
  console.log(hasVoiceTags ? '📢 Detected voice tags - splitting to sub-chunks' : '📄 Using regular chapter chunking');
  
  // Clear previous sub-chunk data
  CHAPTER_SUBCHUNKS.clear();
  CHAPTER_DRAMATIZED.clear();
  TOTAL_SUBCHUNKS = 0;
  
  // Clear playback tracking state
  CHAPTER_PLAYED_SUBCHUNKS.clear();
  CHAPTER_WAS_READY_BEFORE_PLAY.clear();
  
  // Reset parallel pipeline state
  resetPipeline();
  
  // For each chapter, split directly into sub-chunks (1-based: skip index 0)
  const chapterCount = getChapterCount();
  for (let chapterNum = 1; chapterNum < BOOK_CHAPTERS.length; chapterNum++) {
    const chapter = BOOK_CHAPTERS[chapterNum];
    const chapterText = chapter.text;
    
    // Check if chapter has voice tags (either pre-tagged or needs dramatization)
    const chapterHasVoiceTags = /\[VOICE=.*?\]/.test(chapterText);
    
    if (chapterHasVoiceTags) {
      // Pre-tagged: split directly to sub-chunks
      const subChunks = chunkForTwoSpeakers(chapterText, undefined, chapterNum);
      CHAPTER_SUBCHUNKS.set(chapterNum, subChunks);
      CHAPTER_DRAMATIZED.set(chapterNum, chapterText);
      TOTAL_SUBCHUNKS += subChunks.length;
      
      console.log(`   Chapter ${chapterNum}: ${subChunks.length} sub-chunks (pre-tagged)`);
    } else if ((global as any).DRAMATIZATION_ENABLED) {
      // Will be dramatized on-demand - create placeholder
      // Sub-chunks will be generated when chapter is dramatized during TTS
      CHAPTER_SUBCHUNKS.set(chapterNum, []);
      console.log(`   Chapter ${chapterNum}: pending dramatization`);
    } else {
      // No voice tags, no dramatization - treat as single NARRATOR voice
      const narratorText = `[VOICE=NARRATOR]\n${chapterText}`;
      const subChunks = chunkForTwoSpeakers(narratorText, undefined, chapterNum);
      CHAPTER_SUBCHUNKS.set(chapterNum, subChunks);
      CHAPTER_DRAMATIZED.set(chapterNum, narratorText);
      TOTAL_SUBCHUNKS += subChunks.length;
      
      console.log(`   Chapter ${chapterNum}: ${subChunks.length} sub-chunks (narrator only)`);
    }
  }
  
  console.log(`✓ Sub-chunk splitting complete:`);
  console.log(`   ${chapterCount} chapters`);
  console.log(`   ${TOTAL_SUBCHUNKS} total sub-chunks`);
  
  // Create book info from chapters (for backward compatibility)
  const allChapterText = BOOK_CHAPTERS.map(ch => ch.text).join('\n\n');
  BOOK_INFO = getBookInfo([allChapterText]); // Pass as single chunk for word count
  BOOK_INFO.totalChunks = TOTAL_SUBCHUNKS; // Override with sub-chunk count
  
  // Clear audio cache when switching books
  audioCache.clear();
  
  CURRENT_BOOK_FILE = filename;
  
  console.log('✓ Book loaded and chunked successfully');
  console.log(`  Format: ${BOOK_FORMAT.toUpperCase()}`);
  console.log(`  Title: ${BOOK_METADATA.title}`);
  console.log(`  Author: ${BOOK_METADATA.author}`);
  console.log(`  Language: ${BOOK_METADATA.language || 'auto-detect'}`);
  console.log(`  Total sub-chunks: ${TOTAL_SUBCHUNKS}`);
  console.log(`  Total words: ${BOOK_INFO.totalWords}`);
  console.log(`  Estimated duration: ${formatDuration(BOOK_INFO.estimatedDuration)}`);
}

// Initialize assets directory
ASSETS_DIR = path.join(__dirname, '..', 'assets');

// Verify assets directory exists
if (!fs.existsSync(ASSETS_DIR)) {
  console.error('✗ Assets directory not found:', ASSETS_DIR);
  process.exit(1);
}

console.log('✓ Backend initialized');
console.log(`  Assets directory: ${ASSETS_DIR}`);
console.log('  Waiting for book selection from frontend...');

/**
 * Format file size in bytes to human-readable format
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    bookLoaded: !!BOOK_TEXT && !!BOOK_METADATA,
    totalChunks: BOOK_INFO?.totalChunks || 0
  });
});

/**
 * Continuously generate sub-chunks in background
 * NEW: Works with sub-chunks directly (no intermediate chunk layer)
 * 
 * @param bookTitle - Sanitized book title
 * @param voiceMap - Character to voice mapping
 * @param defaultVoice - Default voice for narrator
 * @param parallelism - Number of parallel TTS calls (default: 3)
 */
async function startContinuousGeneration(
  bookTitle: string,
  voiceMap: Record<string, string> = {},
  defaultVoice: string = 'Algieba',
  parallelism: number = 3
): Promise<void> {
  if (isGeneratingInBackground) {
    console.log('🔄 Background generation already running');
    return;
  }

  isGeneratingInBackground = true;
  backgroundGenerationAbort = new AbortController();
  
  console.log(`🚀 Starting continuous sub-chunk generation (parallelism: ${parallelism})...`);
  
  try {
    // Process chapters sequentially (1-based), sub-chunks in parallel
    for (let chapterNum = 1; chapterNum < BOOK_CHAPTERS.length; chapterNum++) {
      if (backgroundGenerationAbort.signal.aborted) {
        console.log('🛑 Background generation aborted');
        break;
      }
      
      let subChunks = CHAPTER_SUBCHUNKS.get(chapterNum) || [];
      
      // ON-DEMAND DRAMATIZATION: If no sub-chunks, dramatize the chapter first
      if (subChunks.length === 0 && (global as any).DRAMATIZATION_ENABLED) {
        console.log(`🎭 Background: dramatizing chapter ${chapterNum}...`);
        
        const chapter = BOOK_CHAPTERS[chapterNum];
        const characters = (global as any).DRAMATIZATION_CHARACTERS || [];
        const analyzer = (global as any).DRAMATIZATION_ANALYZER;
        
        if (analyzer && characters.length > 0) {
          try {
            // Dramatize the chapter
            const result = await tagChapterHybrid(
              chapter.text,
              characters,
              analyzer,
              chapterNum  // chapter number (1-based)
            );
            
            // Update chapter with dramatized text
            BOOK_CHAPTERS[chapterNum] = {
              ...chapter,
              text: result.taggedText
            };
            
            // Split into sub-chunks
            const newSubChunks = chunkForTwoSpeakers(result.taggedText, undefined, chapterNum);
            CHAPTER_SUBCHUNKS.set(chapterNum, newSubChunks);
            CHAPTER_DRAMATIZED.set(chapterNum, result.taggedText);
            TOTAL_SUBCHUNKS += newSubChunks.length;
            
            console.log(`   ✅ Chapter ${chapterNum}: ${newSubChunks.length} sub-chunks created (${result.method})`);
            
            subChunks = newSubChunks;
          } catch (error) {
            console.error(`   ❌ Chapter ${chapterNum} dramatization failed:`, error);
            // Fallback: wrap in NARRATOR voice
            const narratorText = `[VOICE=NARRATOR]\n${chapter.text}`;
            const newSubChunks = chunkForTwoSpeakers(narratorText, undefined, chapterNum);
            CHAPTER_SUBCHUNKS.set(chapterNum, newSubChunks);
            CHAPTER_DRAMATIZED.set(chapterNum, narratorText);
            TOTAL_SUBCHUNKS += newSubChunks.length;
            
            console.log(`   ⚠️ Chapter ${chapterNum}: ${newSubChunks.length} sub-chunks (narrator fallback)`);
            
            subChunks = newSubChunks;
          }
        } else {
          // No analyzer - wrap in NARRATOR voice
          const narratorText = `[VOICE=NARRATOR]\n${chapter.text}`;
          const newSubChunks = chunkForTwoSpeakers(narratorText, undefined, chapterNum);
          CHAPTER_SUBCHUNKS.set(chapterNum, newSubChunks);
          CHAPTER_DRAMATIZED.set(chapterNum, narratorText);
          TOTAL_SUBCHUNKS += newSubChunks.length;
          
          console.log(`   ⚠️ Chapter ${chapterNum}: ${newSubChunks.length} sub-chunks (no analyzer)`);
          
          subChunks = newSubChunks;
        }
      }
      
      if (subChunks.length === 0) {
        console.log(`⏭️ Chapter ${chapterNum}: no sub-chunks (empty chapter?)`);
        continue;
      }
      
      // Check how many sub-chunks need generation
      const pendingSubChunks = subChunks.filter(
        sc => !subChunkExists(bookTitle, chapterNum, sc.index)
      );
      
      if (pendingSubChunks.length === 0) {
        console.log(`⏭️ Chapter ${chapterNum}: all ${subChunks.length} sub-chunks cached`);
        continue;
      }
      
      console.log(`📦 Chapter ${chapterNum}: generating ${pendingSubChunks.length}/${subChunks.length} sub-chunks`);
      
      // Generate in parallel batches
      await generateSubChunksParallel(
        bookTitle,
        chapterNum,
        pendingSubChunks,
        voiceMap,
        defaultVoice,
        parallelism
      );
      
      // Check if this chapter can be consolidated
      const generatedCount = countChapterSubChunks(bookTitle, chapterNum);
      if (generatedCount === subChunks.length) {
        console.log(`✅ Chapter ${chapterNum}: all sub-chunks ready, consolidating...`);
        await consolidateChapterFromSubChunks(
          bookTitle,
          chapterNum,
          BOOK_CHAPTERS[chapterNum]?.title
        );
      }
    }
    
    if (!backgroundGenerationAbort.signal.aborted) {
      console.log('🎉 All sub-chunks generated!');
    }
  } catch (error) {
    console.error('❌ Background generation error:', error);
  } finally {
    isGeneratingInBackground = false;
    backgroundGenerationAbort = null;
  }
}

/**
 * Stop continuous background generation
 */
function stopContinuousGeneration(): void {
  if (backgroundGenerationAbort) {
    console.log('🛑 Stopping background generation...');
    backgroundGenerationAbort.abort();
  }
}

// Background dramatization state
let isDramatizingInBackground = false;
let backgroundDramatizationAbort: AbortController | null = null;

/**
 * Stop background dramatization
 */
function stopBackgroundDramatization(): void {
  if (backgroundDramatizationAbort) {
    console.log('🛑 Stopping background dramatization...');
    backgroundDramatizationAbort.abort();
  }
}

/**
 * Start parallel background dramatization
 * Dramatizes chapters in background while user can start playback immediately
 * This is a NON-BLOCKING operation that runs independently
 */
async function startBackgroundDramatization(
  characters: CharacterProfile[],
  analyzer: any
): Promise<void> {
  if (isDramatizingInBackground) {
    console.log('🔄 Background dramatization already running');
    return;
  }
  
  isDramatizingInBackground = true;
  backgroundDramatizationAbort = new AbortController();
  
  const parallelism = 3; // Number of chapters to dramatize in parallel
  const chapterCount = getChapterCount();
  
  console.log(`\n🎭 BACKGROUND DRAMATIZATION STARTED`);
  console.log(`   Chapters: ${chapterCount}`);
  console.log(`   Parallelism: ${parallelism}`);
  console.log(`   Characters: ${characters.map(c => c.name).join(', ')}\n`);
  
  try {
    // Process chapters in parallel batches (1-based: chapter 1, 2, 3, ...)
    for (let batchStart = 1; batchStart < BOOK_CHAPTERS.length; batchStart += parallelism) {
      if (backgroundDramatizationAbort.signal.aborted) {
        console.log('🛑 Background dramatization aborted');
        break;
      }
      
      const batchEnd = Math.min(batchStart + parallelism, BOOK_CHAPTERS.length);
      const batchChapterNums = Array.from({ length: batchEnd - batchStart }, (_, i) => batchStart + i);
      
      // Skip already-dramatized chapters
      const pendingChapterNums = batchChapterNums.filter(chapterNum => {
        const subChunks = CHAPTER_SUBCHUNKS.get(chapterNum) || [];
        return subChunks.length === 0; // Not yet dramatized
      });
      
      if (pendingChapterNums.length === 0) {
        continue; // All chapters in batch already dramatized
      }
      
      console.log(`📝 Dramatizing chapters ${pendingChapterNums.join(', ')}...`);
      
      // Dramatize chapters in parallel
      await Promise.all(pendingChapterNums.map(async (chapterNum) => {
        if (backgroundDramatizationAbort?.signal.aborted) return;
        
        try {
          const chapter = BOOK_CHAPTERS[chapterNum];
          
          // Dramatize the chapter
          const result = await tagChapterHybrid(
            chapter.text,
            characters,
            analyzer,
            chapterNum  // chapter number (1-based)
          );
          
          // Update chapter with dramatized text
          BOOK_CHAPTERS[chapterNum] = {
            ...chapter,
            text: result.taggedText
          };
          
          // Split into sub-chunks
          const newSubChunks = chunkForTwoSpeakers(result.taggedText, undefined, chapterNum);
          CHAPTER_SUBCHUNKS.set(chapterNum, newSubChunks);
          CHAPTER_DRAMATIZED.set(chapterNum, result.taggedText);
          TOTAL_SUBCHUNKS += newSubChunks.length;
          
          console.log(`   ✅ Chapter ${chapterNum}: ${newSubChunks.length} sub-chunks (${result.method})`);
          
        } catch (error) {
          console.error(`   ❌ Chapter ${chapterNum} dramatization failed:`, error);
          
          // Fallback: wrap in NARRATOR voice
          const chapter = BOOK_CHAPTERS[chapterNum];
          const narratorText = `[VOICE=NARRATOR]\n${chapter.text}`;
          const newSubChunks = chunkForTwoSpeakers(narratorText, undefined, chapterNum);
          CHAPTER_SUBCHUNKS.set(chapterNum, newSubChunks);
          CHAPTER_DRAMATIZED.set(chapterNum, narratorText);
          TOTAL_SUBCHUNKS += newSubChunks.length;
          
          console.log(`   ⚠️ Chapter ${chapterNum}: ${newSubChunks.length} sub-chunks (narrator fallback)`);
        }
      }));
    }
    
    if (!backgroundDramatizationAbort.signal.aborted) {
      console.log(`\n🎉 BACKGROUND DRAMATIZATION COMPLETE!`);
      console.log(`   Total sub-chunks: ${TOTAL_SUBCHUNKS}`);
      (global as any).DRAMATIZATION_ENABLED = false; // All chapters dramatized
      if (BOOK_METADATA) {
        BOOK_METADATA.isDramatized = true;
      }
    }
  } catch (error) {
    console.error('❌ Background dramatization error:', error);
  } finally {
    isDramatizingInBackground = false;
    backgroundDramatizationAbort = null;
  }
}

/**
 * Background consolidation watcher
 * Runs independently every 30 seconds to consolidate ready chapters
 * Works even when playback is not active - perfect for production
 */
async function runConsolidationWatcher(): Promise<void> {
  try {
    // Check current book if loaded
    if (CURRENT_BOOK_FILE && BOOK_METADATA) {
      const bookTitle = sanitizeBookTitle(BOOK_METADATA.title);
      const metadata = loadAudiobookMetadata(bookTitle);
      
      // Only check if generation is in progress
      if (metadata && metadata.generationStatus === 'in-progress') {
        const tempCount = countTempChunks(bookTitle);
        if (tempCount > 0) {
          console.log(`🔍 Background consolidation check: "${bookTitle}" (${tempCount} temp chunks)`);
          await checkAndConsolidateReadyChapters(bookTitle);
        }
      }
    }
  } catch (error) {
    console.error('❌ Consolidation watcher error:', error);
  }
}

/**
 * Start background consolidation watcher
 * Checks every 30 seconds for chapters ready to consolidate
 */
function startConsolidationWatcher(): void {
  if (consolidationWatcherInterval) {
    return; // Already running
  }
  
  console.log('👁️ Background consolidation watcher started (checks every 30s)');
  consolidationWatcherInterval = setInterval(() => {
    runConsolidationWatcher().catch(err => 
      console.error('❌ Consolidation watcher error:', err)
    );
  }, CONSOLIDATION_CHECK_INTERVAL);
}

/**
 * Stop background consolidation watcher
 */
function stopConsolidationWatcher(): void {
  if (consolidationWatcherInterval) {
    console.log('🛑 Stopping background consolidation watcher...');
    clearInterval(consolidationWatcherInterval);
    consolidationWatcherInterval = null;
  }
}

/**
 * Check all chapters and consolidate any that have all their sub-chunks ready
 * UPDATED: Now uses CHAPTER_SUBCHUNKS instead of CHUNK_INFOS
 * @param bookTitle - Sanitized book title
 */
async function checkAndConsolidateReadyChapters(bookTitle: string): Promise<void> {
  try {
    console.log(`🔍 Consolidation check for "${bookTitle}"...`);
    console.log(`   BOOK_CHAPTERS: ${BOOK_CHAPTERS?.length || 0}`);
    console.log(`   CHAPTER_SUBCHUNKS: ${CHAPTER_SUBCHUNKS.size} chapters`);
    
    if (!BOOK_CHAPTERS || BOOK_CHAPTERS.length === 0 || CHAPTER_SUBCHUNKS.size === 0) {
      console.log(`   ⚠️ Skipping: No chapter info available`);
      return; // Can't consolidate without chapter info
    }
    
    // Check each chapter to see if it's ready for consolidation (1-based)
    const chapterCount = getChapterCount();
    console.log(`   Checking ${chapterCount} chapters for consolidation...`);
    for (let chapterNum = 1; chapterNum < BOOK_CHAPTERS.length; chapterNum++) {
      const chapter = BOOK_CHAPTERS[chapterNum];
      const subChunks = CHAPTER_SUBCHUNKS.get(chapterNum) || [];
      
      if (subChunks.length === 0) continue;
      
      // Check if chapter is already consolidated
      const audiobooksDir = getAudiobooksDir();
      const bookDir = path.join(audiobooksDir, bookTitle);
      const chapterPrefix = `${chapterNum.toString().padStart(2, '0')}_`;
      const consolidatedFiles = fs.existsSync(bookDir) 
        ? fs.readdirSync(bookDir).filter(f => f.startsWith(chapterPrefix) && f.endsWith('.wav'))
        : [];
      
      if (consolidatedFiles.length > 0) {
        // Chapter already consolidated
        continue;
      }
      
      // Check if all sub-chunks for this chapter exist
      const generatedCount = countChapterSubChunks(bookTitle, chapterNum);
      const allSubChunksExist = generatedCount === subChunks.length;
      
      if (!allSubChunksExist) {
        console.log(`   Chapter ${chapterNum}: Not ready (${generatedCount}/${subChunks.length} sub-chunks)`);
        continue;
      }
      
      // Consolidate this chapter
      console.log(`📦 Chapter ${chapterNum}/${chapterCount} ready: "${chapter.title}" (${subChunks.length} sub-chunks)`);
      
      try {
        const chapterPath = await consolidateChapterFromSubChunks(bookTitle, chapterNum, chapter.title);
        console.log(`  ✅ Consolidated: ${path.basename(chapterPath)}`);
        
        // NOTE: Sub-chunks are kept for individual chunk playback
        // They can be cleaned up later when user deletes audiobook
        // deleteChapterSubChunks(bookTitle, chapterNum);
        
        // Update metadata for this chapter (use chapterNum-1 for 0-based metadata array)
        const metadata = loadAudiobookMetadata(bookTitle);
        const metadataIndex = chapterNum - 1; // metadata.chapters is 0-based array
        if (metadata && metadata.chapters[metadataIndex]) {
          metadata.chapters[metadataIndex].isGenerated = true;
          metadata.chapters[metadataIndex].tempChunksGenerated = subChunks.length;
          metadata.lastUpdated = new Date().toISOString();
          
          // Check if all chapters are now generated
          const allChaptersGenerated = metadata.chapters.every(c => c.isGenerated);
          if (allChaptersGenerated) {
            metadata.generationStatus = 'completed';
            console.log(`  🎉 All chapters consolidated! Audiobook complete.`);
          }
          
          saveAudiobookMetadata(bookTitle, metadata);
        }
      } catch (error) {
        console.error(`  ❌ Failed to consolidate chapter ${chapterNum}:`, error);
      }
    }
    
    // Create initial metadata if it doesn't exist (for first run)
    const metadata = loadAudiobookMetadata(bookTitle);
    // Use chapterCount already defined above
    if (!metadata && chapterCount > 0 && CHAPTER_SUBCHUNKS.size > 0) {
      console.log(`📝 Creating initial metadata for "${bookTitle}"`);
      
      // Build chapters array from 1-based BOOK_CHAPTERS (skip index 0)
      const chaptersMetadata = [];
      for (let chapterNum = 1; chapterNum < BOOK_CHAPTERS.length; chapterNum++) {
        const chapter = BOOK_CHAPTERS[chapterNum];
        if (!chapter) continue;
        chaptersMetadata.push({
          index: chapterNum - 1, // metadata uses 0-based array
          title: chapter.title,
          filename: `${chapterNum.toString().padStart(2, '0')}_${sanitizeChapterTitle(chapter.title)}.wav`,
          duration: 0,
          isGenerated: false,
          tempChunksCount: CHAPTER_SUBCHUNKS.get(chapterNum)?.length || 0,
          tempChunksGenerated: 0,
        });
      }
      
      const newMetadata: AudiobookMetadata = {
        title: BOOK_METADATA?.title || 'Unknown',
        author: BOOK_METADATA?.author || 'Unknown',
        language: BOOK_METADATA?.language || 'unknown',
        totalChapters: chapterCount,
        chapters: chaptersMetadata,
        generationStatus: 'in-progress',
        lastUpdated: new Date().toISOString(),
        sourceFile: CURRENT_BOOK_FILE,
      };
      saveAudiobookMetadata(bookTitle, newMetadata);
      console.log(`✅ Initial metadata created with ${chapterCount} chapters`);
    }
  } catch (error) {
    console.error(`❌ Error during consolidation check:`, error);
  }
}

// Get list of available books
app.get('/api/books', (req: Request, res: Response) => {
  try {
    console.log(`📂 Reading books from: ${ASSETS_DIR}`);
    const files = fs.readdirSync(ASSETS_DIR);
    console.log(`📂 Found ${files.length} files:`, files);
    
    // Filter supported book formats
    const bookFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.epub', '.txt', '.pdf'].includes(ext);
    });
    
    console.log(`📚 Filtered ${bookFiles.length} book files:`, bookFiles);
    
    // Build book list with metadata
    const books = bookFiles.map(filename => {
      const filePath = path.join(ASSETS_DIR, filename);
      const stats = fs.statSync(filePath);
      const ext = path.extname(filename).toLowerCase();
      
      let format: 'epub' | 'txt' | 'pdf' = 'txt';
      if (ext === '.epub') format = 'epub';
      else if (ext === '.pdf') format = 'pdf';
      
      return {
        filename,
        format,
        size: stats.size,
        sizeFormatted: formatFileSize(stats.size),
        isActive: filename === CURRENT_BOOK_FILE,
      };
    });
    
    res.json({
      books,
      currentBook: CURRENT_BOOK_FILE,
    });
  } catch (error) {
    console.error('✗ Error listing books:', error);
    res.status(500).json({
      error: 'Failed to list books',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Select a different book
app.post('/api/book/select', async (req: Request, res: Response) => {
  try {
    const { filename, narratorVoice } = req.body;
    
    console.log(`📞 /api/book/select called with filename: "${filename}"`);
    console.log(`   Current book: "${CURRENT_BOOK_FILE || 'none'}"`);
    console.log(`   Request from: ${req.headers.origin || 'unknown origin'}`);
    
    // CRITICAL: Update narrator voice BEFORE loadBookFile() runs voice assignment
    if (narratorVoice && typeof narratorVoice === 'string') {
      const oldVoice = NARRATOR_VOICE;
      NARRATOR_VOICE = narratorVoice;
      console.log(`🎙️ Narrator voice set: ${oldVoice} → ${narratorVoice}`);
    }
    
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Filename is required',
      });
    }
    
    // Check if file exists
    const filePath = path.join(ASSETS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'Book not found',
        message: `File not found: ${filename}`,
      });
    }
    
    // Stop any ongoing background generation for previous book
    if (filename !== CURRENT_BOOK_FILE && isGeneratingInBackground) {
      console.log('🛑 Switching books - stopping background generation for previous book');
      stopContinuousGeneration();
      
      // Trigger final consolidation check for previous book
      if (BOOK_METADATA && CHAPTER_SUBCHUNKS.size > 0) {
        const previousBookTitle = sanitizeBookTitle(BOOK_METADATA.title);
        console.log(`🔄 Final consolidation check for "${previousBookTitle}" before switching...`);
        // Run asynchronously, don't block book switching
        setImmediate(() => {
          checkAndConsolidateReadyChapters(previousBookTitle).catch(err => 
            console.error('❌ Consolidation check failed:', err)
          );
        });
      }
      
      // Clean up temp files from previous book (safe now - not in use)
      if (CURRENT_BOOK_FILE && BOOK_METADATA) {
        const previousBookTitle = sanitizeBookTitle(BOOK_METADATA.title);
        const metadata = loadAudiobookMetadata(previousBookTitle);
        
        // Only cleanup temps if consolidated file exists (generation completed)
        if (metadata && metadata.generationStatus === 'completed') {
          console.log(`🗑️ Cleaning up temp files for previous book: "${previousBookTitle}"`);
          const deletedCount = deleteAllTempChunks(previousBookTitle);
          console.log(`   Deleted ${deletedCount} temp chunks (consolidated file exists)`);
        }
      }
    }
    
    // Check if dramatization is requested (from query param or body)
    const enableDramatization = req.query.dramatize === 'true' || req.body.dramatize === true;
    
    // Load the new book (with optional dramatization)
    await loadBookFile(filename, enableDramatization);
    
    console.log(`✓ Switched to book: ${filename}`);
    if (enableDramatization && BOOK_METADATA) {
      console.log(`   🎭 Hybrid dramatization: ${BOOK_METADATA.isDramatized ? 'SUCCESS' : 'FAILED (fallback to single-voice)'}`);
    }
    
    // Return book info (after loadBookFile, these should be populated)
    if (!BOOK_METADATA || !BOOK_INFO) {
      throw new Error('Book metadata not loaded properly');
    }
    
    // PHASE 3: Check if audiobook library exists (but DON'T auto-generate)
    const bookTitle = sanitizeBookTitle(BOOK_METADATA.title);
    const existingMetadata = loadAudiobookMetadata(bookTitle);
    const hasLibraryVersion = existingMetadata && existingMetadata.generationStatus === 'completed';
    
    console.log(`📚 Book selected: "${bookTitle}"`);
    console.log(`   Sanitized title: "${bookTitle}"`);
    console.log(`   Metadata exists: ${existingMetadata ? 'YES' : 'NO'}`);
    if (existingMetadata) {
      console.log(`   Generation status: "${existingMetadata.generationStatus}"`);
      console.log(`   Total chapters: ${existingMetadata.totalChapters}`);
      console.log(`   Chapters generated: ${existingMetadata.chapters.filter(c => c.isGenerated).length}`);
    }
    console.log(`   Library version: ${hasLibraryVersion ? 'YES' : 'NO'}`);
    
    // IMPORTANT: Create metadata immediately if it doesn't exist
    // This enables position save/load to work from the start
    if (!existingMetadata && BOOK_CHAPTERS.length > 0) {
      console.log(`📝 Creating initial metadata for "${bookTitle}" (on book select)`);
      createAudiobookFolder(bookTitle);
      const initialMetadata: AudiobookMetadata = {
        title: BOOK_METADATA.title,
        author: BOOK_METADATA.author,
        language: BOOK_METADATA.language || 'unknown',
        totalChapters: BOOK_CHAPTERS.length,
        chapters: BOOK_CHAPTERS.map((chapter, i) => ({
          index: i,
          title: chapter.title,
          filename: `${(i + 1).toString().padStart(2, '0')}_${sanitizeChapterTitle(chapter.title)}.wav`,
          duration: 0,
          isGenerated: false,
          tempChunksCount: 0,
          tempChunksGenerated: 0,
        })),
        generationStatus: 'in-progress',
        lastUpdated: new Date().toISOString(),
        sourceFile: CURRENT_BOOK_FILE,
      };
      saveAudiobookMetadata(bookTitle, initialMetadata);
      console.log(`✅ Initial metadata created with ${BOOK_CHAPTERS.length} chapters`);
    }
    
    // Calculate effective chunk count (actual or estimated)
    // For background dramatization: use MAX of actual and estimated to ensure reasonable total
    let effectiveTotalChunks = BOOK_INFO.totalChunks; // TOTAL_SUBCHUNKS
    const hasDramatizationPending = (global as any).DRAMATIZATION_ENABLED || isDramatizingInBackground;
    if (hasDramatizationPending && BOOK_CHAPTERS.length > 0) {
      // Estimate: each chapter will have ~10 sub-chunks on average
      const estimatedCount = BOOK_CHAPTERS.length * 10;
      effectiveTotalChunks = Math.max(BOOK_INFO.totalChunks, estimatedCount);
    }
    
    res.json({
      success: true,
      book: {
        filename: CURRENT_BOOK_FILE,
        format: BOOK_FORMAT,
        title: BOOK_METADATA.title,
        author: BOOK_METADATA.author,
        language: BOOK_METADATA.language,
        totalChunks: effectiveTotalChunks,
        actualChunks: BOOK_INFO.totalChunks, // Real count for debugging
        estimatedDuration: formatDuration(BOOK_INFO.estimatedDuration),
        // Dramatization info
        isDramatized: BOOK_METADATA.isDramatized || false,
        dramatizationType: BOOK_METADATA.dramatizationType,
        dramatizationPending: hasDramatizationPending,
        charactersFound: BOOK_METADATA.charactersFound,
        dramatizationCost: BOOK_METADATA.dramatizationCost,
        dramatizationConfidence: BOOK_METADATA.dramatizationConfidence,
        taggingMethodBreakdown: BOOK_METADATA.taggingMethodBreakdown,
      },
      hasLibraryVersion, // Tell frontend if audiobook exists in library
    });
    
  } catch (error) {
    console.error('✗ Error selecting book:', error);
    res.status(500).json({
      error: 'Failed to select book',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// TTS endpoint - read sample text (POC 1.0 - now using first sub-chunk from book)
app.post('/api/tts/read-sample', async (req: Request, res: Response) => {
  try {
    // Use first sub-chunk from first chapter
    const firstChapterSubChunks = CHAPTER_SUBCHUNKS.get(0) || [];
    if (firstChapterSubChunks.length === 0) {
      return res.status(400).json({
        error: 'No content loaded',
        message: 'Please select a book first',
      });
    }
    
    const sampleText = firstChapterSubChunks[0].segments.map(s => s.text).join(' ');
    console.log('🎤 TTS request received (first sub-chunk from book)');
    console.log(`  Synthesizing ${sampleText.length} characters...`);

    // Synthesize text to audio
    const audioBuffer = await synthesizeText(sampleText);

    console.log(`✓ Audio generated: ${audioBuffer.length} bytes`);

    // Set appropriate headers for WAV audio (Vertex AI returns PCM/WAV)
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', audioBuffer.length.toString());
    res.setHeader('Accept-Ranges', 'bytes');

    // Send the audio buffer
    res.send(audioBuffer);
  } catch (error) {
    console.error('✗ TTS Error:', error);
    res.status(500).json({
      error: 'TTS synthesis failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POC 2.0: Get book information
app.get('/api/book/info', (req: Request, res: Response) => {
  try {
    // Check if book is loaded
    if (!BOOK_METADATA || !BOOK_INFO) {
      return res.status(404).json({
        error: 'No book loaded',
        message: 'Please select a book first',
      });
    }

    // Validate metadata completeness
    if (!BOOK_METADATA!.title || !BOOK_METADATA!.author) {
      console.warn('⚠️ Incomplete book metadata detected');
    }

    // For on-demand dramatization: return current sub-chunk count OR estimated count
    // This allows frontend to request chunks as they're generated
    let effectiveTotalChunks = TOTAL_SUBCHUNKS;
    
    // If dramatization is pending, use MAX of actual and estimated counts
    // This ensures frontend always sees a reasonable total even as dramatization progresses
    const hasDramatizationPending = (global as any).DRAMATIZATION_ENABLED || isDramatizingInBackground;
    if (hasDramatizationPending && BOOK_CHAPTERS.length > 0) {
      // Estimate: each chapter will have ~10 sub-chunks on average
      const estimatedCount = BOOK_CHAPTERS.length * 10;
      effectiveTotalChunks = Math.max(TOTAL_SUBCHUNKS, estimatedCount);
    }

    // Build chapter info array with sub-chunk ranges for UI
    const chapterInfo: Array<{
      index: number;
      title: string;
      subChunkStart: number;  // Global sub-chunk index where this chapter starts
      subChunkCount: number;  // Number of sub-chunks in this chapter
    }> = [];
    
    let globalSubChunkIndex = 0;
    // Iterate chapters 1-based (skip index 0)
    for (let chapterNum = 1; chapterNum < BOOK_CHAPTERS.length; chapterNum++) {
      const subChunks = CHAPTER_SUBCHUNKS.get(chapterNum) || [];
      const subChunkCount = subChunks.length > 0 ? subChunks.length : 10; // Estimate 10 for pending
      
      chapterInfo.push({
        index: chapterNum,  // 1-based chapter number
        title: BOOK_CHAPTERS[chapterNum].title,
        subChunkStart: globalSubChunkIndex,
        subChunkCount: subChunkCount,
      });
      
      globalSubChunkIndex += subChunkCount;
    }

    // Include sanitized title for position API calls
    const audiobookTitle = sanitizeBookTitle(BOOK_METADATA!.title);
    const chapterCount = getChapterCount();
    
    res.json({
      title: BOOK_METADATA!.title,
      author: BOOK_METADATA!.author,
      language: BOOK_METADATA!.language,
      estimatedDuration: formatDuration(BOOK_INFO!.estimatedDuration), // "hh:mm" format
      // Chapter info for UI display
      chapters: chapterInfo,
      totalChapters: chapterCount,  // Actual chapter count (not array length)
      // Sanitized title for position API (matches audiobook folder name)
      audiobookTitle: audiobookTitle,
      // Internal data for frontend calculations (not displayed to user)
      _internal: {
        totalChunks: effectiveTotalChunks,
        actualChunks: TOTAL_SUBCHUNKS, // Real count for debugging
        dramatizationPending: hasDramatizationPending,
        durationSeconds: BOOK_INFO!.estimatedDuration,
      }
    });
  } catch (error) {
    console.error('✗ Error fetching book info:', error);
    res.status(500).json({
      error: 'Failed to retrieve book information',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POC 2.0: Get specific chunk audio
// FIXED: Now accepts direct chapterNum+subChunkIndex (no global index conversion needed!)
// chapterNum is 1-based (matches BOOK_CHAPTERS indexing)
// Legacy: Still supports chunkIndex (global) for backward compatibility
app.post('/api/tts/chunk', async (req: Request, res: Response) => {
  try {
    const { 
      chunkIndex,             // Legacy: global index (deprecated, still supported)
      chapterIndex: reqChapterNum,     // NEW: Direct chapter number (1-based)
      subChunkIndex: reqSubChunkIndex, // NEW: Direct sub-chunk index within chapter
      voiceName = 'Algieba', 
      bookFile 
    } = req.body;

    // Update global narrator voice (used for character voice assignment)
    if (voiceName && voiceName !== NARRATOR_VOICE) {
      console.log(`🎙️ Narrator voice updated: ${NARRATOR_VOICE} → ${voiceName}`);
      NARRATOR_VOICE = voiceName;
    }
    
    // CRITICAL: Ensure a book is loaded
    // Note: TOTAL_SUBCHUNKS may be 0 if on-demand dramatization is pending
    // Check if dramatization is in progress (either flag or background process)
    const hasDramatizationPending = (global as any).DRAMATIZATION_ENABLED || isDramatizingInBackground;
    if (!BOOK_METADATA) {
      console.error('❌ No book loaded! BOOK_METADATA:', !!BOOK_METADATA);
      return res.status(400).json({
        error: 'No book loaded',
        message: 'Please select a book first using /api/book/select',
      });
    }

    const bookTitle = sanitizeBookTitle(BOOK_METADATA?.title || bookFile || CURRENT_BOOK_FILE || 'Unknown');
    const requestStartTime = Date.now();

    // ========================================
    // STEP 1: DETERMINE CHAPTER NUMBER AND SUB-CHUNK INDEX
    // ========================================
    
    let chapterNum: number;  // 1-based chapter number
    let localSubChunkIndex: number;
    
    // NEW: Direct chapter:subChunk addressing (preferred, no conversion errors)
    // reqChapterNum is 1-based from frontend
    if (typeof reqChapterNum === 'number' && typeof reqSubChunkIndex === 'number') {
      chapterNum = reqChapterNum;  // Already 1-based
      localSubChunkIndex = reqSubChunkIndex;
      console.log(`📍 Direct addressing: chapter ${chapterNum}:${localSubChunkIndex}`);
    } 
    // LEGACY: Convert global index to chapter:local (kept for backward compatibility)
    else if (typeof chunkIndex === 'number' && chunkIndex >= 0) {
      chapterNum = 1;  // Start from chapter 1
      localSubChunkIndex = chunkIndex;
      
      // Convert global index to chapter:local by iterating through chapters (1-based)
      for (const [chapNum, subChunks] of CHAPTER_SUBCHUNKS.entries()) {
        if (localSubChunkIndex < subChunks.length) {
          chapterNum = chapNum;
          break;
        }
        localSubChunkIndex -= subChunks.length;
      }
      console.log(`🔄 Legacy global index ${chunkIndex} → chapter ${chapterNum}:${localSubChunkIndex}`);
    }
    else {
      return res.status(400).json({
        error: 'Invalid chunk index',
        message: `Must provide either chapterIndex+subChunkIndex or chunkIndex (global)`,
      });
    }
    
    // Calculate global chunk index for backward compatibility with frontend state
    // NOTE: This is only used for logging and legacy compatibility, NOT for file lookups
    let globalChunkIndex = 0;
    for (let chapIdx = 1; chapIdx < chapterNum; chapIdx++) {
      globalChunkIndex += CHAPTER_SUBCHUNKS.get(chapIdx)?.length || 0;
    }
    globalChunkIndex += localSubChunkIndex;
    
    const chapterTitle = BOOK_CHAPTERS[chapterNum]?.title;
    
    // ========================================
    // FILE-FIRST APPROACH: Check disk before any memory state
    // If the file exists, serve it immediately - don't care about TOTAL_SUBCHUNKS
    // ========================================
    
    // PRIORITY 1: Check if chapter is consolidated → extract sub-chunk from chapter file
    if (isChapterConsolidated(bookTitle, chapterNum, chapterTitle)) {
      console.log(`📦 Chapter ${chapterNum} consolidated, extracting sub-chunk ${localSubChunkIndex}...`);
      
      const extractedAudio = extractSubChunkFromChapter(bookTitle, chapterNum, localSubChunkIndex, chapterTitle);
      
      if (extractedAudio) {
        const cacheTime = Date.now() - requestStartTime;
        console.log(`💾 Serving from chapter file: ${chapterNum}:${localSubChunkIndex} (${cacheTime}ms)`);
        
        // Track playback for cleanup (from chapter file = was ready)
        trackSubChunkPlayed(bookTitle, chapterNum, localSubChunkIndex, true);
        
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Length', extractedAudio.length.toString());
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('X-Cache', 'CHAPTER_EXTRACT');
        res.setHeader('X-Chapter-Num', chapterNum.toString());
        res.setHeader('X-SubChunk-Index', localSubChunkIndex.toString());
        
        return res.send(extractedAudio);
      }
    }
    
    // PRIORITY 2: Check for existing sub-chunk file
    if (subChunkExists(bookTitle, chapterNum, localSubChunkIndex)) {
      const cachedAudio = loadSubChunk(bookTitle, chapterNum, localSubChunkIndex);
      
      if (cachedAudio) {
        const cacheTime = Date.now() - requestStartTime;
        console.log(`💾 Serving from sub-chunk file: ${chapterNum}:${localSubChunkIndex} (${cacheTime}ms)`);
        
        // Track playback for cleanup (from sub-chunk file = not ready yet)
        trackSubChunkPlayed(bookTitle, chapterNum, localSubChunkIndex, false);
        
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Length', cachedAudio.length.toString());
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('X-Cache', 'SUBCHUNK_FILE');
        res.setHeader('X-Chapter-Num', chapterNum.toString());
        res.setHeader('X-SubChunk-Index', localSubChunkIndex.toString());
        
        return res.send(cachedAudio);
      }
    }
    
    // PRIORITY 3: Check for old-style temp file (backward compatibility)
    if (typeof chunkIndex === 'number' && tempChunkExists(bookTitle, chunkIndex)) {
      const cachedAudio = loadTempChunk(bookTitle, chunkIndex);
      
      if (cachedAudio) {
        const cacheTime = Date.now() - requestStartTime;
        console.log(`💾 Serving from legacy temp file: chunk ${chunkIndex} (${cacheTime}ms)`);
        
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Length', cachedAudio.length.toString());
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('X-Cache', 'LEGACY_TEMP');
        
        return res.send(cachedAudio);
      }
    }
    
    // PRIORITY 3.5: File-based fallback - scan temp folder for sub-chunk files
    // Only needed for legacy global index requests
    if (typeof chunkIndex === 'number') {
      const chapterCounts = new Map<number, number>();
      for (const [chapNum, subChunks] of CHAPTER_SUBCHUNKS.entries()) {
        chapterCounts.set(chapNum, subChunks.length);
      }
      const foundChunk = findSubChunkByGlobalIndex(bookTitle, chunkIndex, chapterCounts);
      if (foundChunk) {
        const cacheTime = Date.now() - requestStartTime;
        console.log(`💾 Serving from file scan: global ${chunkIndex} → ${foundChunk.chapterIndex}:${foundChunk.subChunkIndex} (${cacheTime}ms)`);
        
        // Update local variables for tracking (foundChunk.chapterIndex is 1-based)
        const foundChapterNum = foundChunk.chapterIndex;
        const foundSubChunkIndex = foundChunk.subChunkIndex;
        
        trackSubChunkPlayed(bookTitle, foundChapterNum, foundSubChunkIndex, false);
        
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Length', foundChunk.audio.length.toString());
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('X-Cache', 'FILE_SCAN');
        res.setHeader('X-Chapter-Num', foundChapterNum.toString());
        res.setHeader('X-SubChunk-Index', foundSubChunkIndex.toString());
        
        return res.send(foundChunk.audio);
      }
    }

    // Create cache key for memory cache
    const cacheKey = `${chapterNum}:${localSubChunkIndex}:${voiceName}`;

    // PRIORITY 4: Check memory cache
    if (audioCache.has(cacheKey)) {
      const cachedAudio = audioCache.get(cacheKey)!;
      const cacheTime = Date.now() - requestStartTime;
      console.log(`✓ Using cached audio for ${chapterNum}:${localSubChunkIndex} (${cacheTime}ms)`);
      
      // Track playback for cleanup (from memory cache = not ready yet)
      trackSubChunkPlayed(bookTitle, chapterNum, localSubChunkIndex, false);
      
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Length', cachedAudio.length.toString());
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('X-Cache', 'MEMORY');
      
      return res.send(cachedAudio);
    }

    // ========================================
    // STEP 2: NO CACHED AUDIO - CHECK IF WE CAN GENERATE
    // ========================================
    
    console.log(`🎤 TTS request: chapter ${chapterNum}:${localSubChunkIndex} (voice: ${voiceName})`);
    
    // Calculate estimated total chunks for validation
    const chapterCount = getChapterCount();
    const estimatedTotalChunks = hasDramatizationPending ? Math.max(TOTAL_SUBCHUNKS, chapterCount * 10) : TOTAL_SUBCHUNKS;
    
    // Determine if this is a direct addressing request (more reliable) or legacy global index
    const isDirectAddressing = typeof reqChapterNum === 'number' && typeof reqSubChunkIndex === 'number';

    // ONLY for LEGACY global index requests: Check if chunk is beyond current count
    // For direct addressing, we trust the frontend and try to generate on-demand
    if (!isDirectAddressing && globalChunkIndex >= TOTAL_SUBCHUNKS && TOTAL_SUBCHUNKS > 0) {
      if (globalChunkIndex >= estimatedTotalChunks && !hasDramatizationPending) {
        // Beyond even estimated range AND no more processing expected - book truly finished
        return res.status(400).json({
          error: 'Book completed',
          message: `Chunk ${globalChunkIndex} is beyond the book (${TOTAL_SUBCHUNKS} total chunks)`,
          totalChunks: TOTAL_SUBCHUNKS,
          dramatizationPending: false,
          isComplete: true,
        });
      }
      
      // Within estimated range or still processing - tell frontend to retry
      if (isDramatizingInBackground || isGeneratingInBackground || hasDramatizationPending) {
        console.log(`⏳ Chunk ${globalChunkIndex} not ready yet (have ${TOTAL_SUBCHUNKS}/${estimatedTotalChunks}), background processing in progress...`);
        return res.status(202).json({
          error: 'Chunk not ready',
          message: `Sub-chunk ${globalChunkIndex} is still being generated. Please retry in a few seconds.`,
          totalChunks: estimatedTotalChunks,
          actualChunks: TOTAL_SUBCHUNKS,
          generatingInBackground: isGeneratingInBackground,
          dramatizingInBackground: isDramatizingInBackground,
          retryAfterMs: 3000,
        });
      }
    }

    // Get sub-chunk data (may be empty if dramatization is pending)
    let subChunks = CHAPTER_SUBCHUNKS.get(chapterNum) || [];
    
    // If sub-chunks empty, chapter needs dramatization
    if (subChunks.length === 0 && (global as any).DRAMATIZATION_ENABLED && BOOK_CHAPTERS[chapterNum]) {
      // For LEGACY requests: If background dramatization is running, return 202 to wait
      // For DIRECT addressing: Always do on-demand dramatization (user explicitly requested this chapter)
      if (!isDirectAddressing && isDramatizingInBackground) {
        console.log(`⏳ Chapter ${chapterNum} not dramatized yet, background dramatization in progress...`);
        return res.status(202).json({
          error: 'Chapter not ready',
          message: `Chapter ${chapterNum} is still being dramatized. Please retry in a few seconds.`,
          totalChunks: TOTAL_SUBCHUNKS,
          dramatizingInBackground: true,
          retryAfterMs: 3000,
        });
      }
      
      // Do on-demand dramatization (direct request or no background process running)
      console.log(`🎭 On-demand dramatization for chapter ${chapterNum}...`);
      
      const chapter = BOOK_CHAPTERS[chapterNum];
      const characters = (global as any).DRAMATIZATION_CHARACTERS || [];
      const geminiConfig = (global as any).DRAMATIZATION_CONFIG;
      const analyzer = (global as any).DRAMATIZATION_ANALYZER;
      
      if (geminiConfig && characters.length > 0 && analyzer) {
        // Dramatize the chapter using tagChapterHybrid
        const result = await tagChapterHybrid(
          chapter.text,
          characters,
          analyzer,
          chapterNum  // chapter number (1-based)
        );
        
        // Update chapter with dramatized text
        BOOK_CHAPTERS[chapterNum] = {
          ...chapter,
          text: result.taggedText
        };
        
        // Now split into sub-chunks
        const newSubChunks = chunkForTwoSpeakers(result.taggedText, undefined, chapterNum);
        CHAPTER_SUBCHUNKS.set(chapterNum, newSubChunks);
        CHAPTER_DRAMATIZED.set(chapterNum, result.taggedText);
        TOTAL_SUBCHUNKS += newSubChunks.length;
        
        console.log(`   ✅ Chapter ${chapterNum}: ${newSubChunks.length} sub-chunks created (${result.method})`);
        
        subChunks = newSubChunks;
      } else {
        // Fallback: wrap in NARRATOR voice
        const narratorText = `[VOICE=NARRATOR]\n${chapter.text}`;
        const newSubChunks = chunkForTwoSpeakers(narratorText, undefined, chapterNum);
        CHAPTER_SUBCHUNKS.set(chapterNum, newSubChunks);
        CHAPTER_DRAMATIZED.set(chapterNum, narratorText);
        TOTAL_SUBCHUNKS += newSubChunks.length;
        
        console.log(`   ⚠️ Chapter ${chapterNum}: ${newSubChunks.length} sub-chunks (narrator fallback)`);
        
        subChunks = newSubChunks;
      }
    }
    
    if (localSubChunkIndex >= subChunks.length) {
      return res.status(400).json({
        error: 'Sub-chunk not found',
        message: `Sub-chunk ${localSubChunkIndex} not found in chapter ${chapterNum} (has ${subChunks.length} sub-chunks)`,
      });
    }
    
    const subChunk = subChunks[localSubChunkIndex];
    
    // Use global VOICE_MAP
    let voiceMap = VOICE_MAP;
    if (Object.keys(voiceMap).length === 0) {
      const voiceMapPath = path.join(ASSETS_DIR, 'dramatized_output', 'voice_map_poc.json');
      if (fs.existsSync(voiceMapPath)) {
        voiceMap = await loadVoiceMap(voiceMapPath);
      }
    }
    
    // Generate sub-chunk audio
    const result = await generateSubChunk(
      bookTitle,
      chapterNum,
      subChunk,
      voiceMap,
      voiceName
    );
    
    const audioBuffer = result.audioBuffer;
    
    // Cache in memory
    const totalTime = Date.now() - requestStartTime;
    audioCache.set(cacheKey, audioBuffer);
    console.log(`✓ Audio generated and cached: ${audioBuffer.length} bytes (TOTAL TIME: ${totalTime}ms = ${(totalTime/1000).toFixed(1)}s)`);

    // Track playback for cleanup (freshly generated = not ready yet)
    trackSubChunkPlayed(bookTitle, chapterNum, localSubChunkIndex, false);

    // Start continuous background generation if not already running
    // This will generate ALL remaining chunks in batches of 3, independently of playback
    if (!isGeneratingInBackground) {
      console.log(`  🔥 Starting continuous background generation for all remaining chunks...`);
      startContinuousGeneration(bookTitle, voiceMap, voiceName)
        .catch(err => console.error('❌ Background generation failed:', err));
    }

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', audioBuffer.length.toString());
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Cache', 'MISS');
    
    res.send(audioBuffer);
  } catch (error) {
    console.error('✗ TTS Chunk Error:', error);
    res.status(500).json({
      error: 'TTS synthesis failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ========================================
// AUDIOBOOK LIBRARY ENDPOINTS (Phase 3)
// ========================================

/**
 * RECOMMENDED ENDPOINTS FOR MOBILE APP SYNC:
 * 
 * User Playback Position:
 * - PUT  /api/audiobooks/:bookTitle/position
 *        Body: { currentChapter: number, currentTime: number }
 *        Updates metadata.playback with current position
 * 
 * - GET  /api/audiobooks/:bookTitle/position
 *        Returns: { currentChapter: number, currentTime: number, lastPlayedAt: string }
 *        Retrieves saved playback position
 * 
 * User Preferences:
 * - PUT  /api/audiobooks/:bookTitle/preferences
 *        Body: { narratorVoice?: string, narratorGender?: string, playbackSpeed?: number }
 *        Updates metadata.userPreferences for this audiobook
 * 
 * - GET  /api/audiobooks/:bookTitle/preferences
 *        Returns: { narratorVoice?: string, narratorGender?: string, playbackSpeed?: number }
 *        Retrieves saved user preferences
 * 
 * Global User Preferences (across all books):
 * - PUT  /api/preferences
 *        Body: { defaultNarratorVoice?: string, defaultPlaybackSpeed?: number }
 *        Store in separate user-preferences.json file
 * 
 * - GET  /api/preferences
 *        Returns global user preferences that apply to all books
 * 
 * Authentication (for future multi-user support):
 *   - Add Bearer token authentication
 *   - Store user-specific metadata in audiobooks/{bookTitle}/users/{userId}/metadata.json
 *   - Or use database for user accounts and link to audiobook metadata
 */

/**
 * List all audiobooks in library
 * 
 * GET /api/audiobooks
 */
app.get('/api/audiobooks', (req: Request, res: Response) => {
  try {
    const audiobooks = listAudiobooks();
    
    // Load metadata for each audiobook
    const audiobookList = audiobooks.map(bookTitle => {
      const metadata = loadAudiobookMetadata(bookTitle);
      const progress = audiobookWorker.getProgress(bookTitle);
      
      return {
        title: bookTitle,
        metadata,
        progress,
        tempChunksCount: countTempChunks(bookTitle),
      };
    });
    
    res.json({
      audiobooks: audiobookList,
      total: audiobooks.length,
    });
  } catch (error) {
    console.error('✗ Error listing audiobooks:', error);
    res.status(500).json({
      error: 'Failed to list audiobooks',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get audiobook metadata and progress
 * 
 * GET /api/audiobooks/:bookTitle
 */
app.get('/api/audiobooks/:bookTitle', (req: Request, res: Response) => {
  try {
    const { bookTitle } = req.params;
    const metadata = loadAudiobookMetadata(bookTitle);
    
    if (!metadata) {
      return res.status(404).json({
        error: 'Audiobook not found',
        message: `No audiobook found with title: ${bookTitle}`,
      });
    }
    
    const progress = audiobookWorker.getProgress(bookTitle);
    const tempChunksCount = countTempChunks(bookTitle);
    
    res.json({
      metadata,
      progress,
      tempChunksCount,
    });
  } catch (error) {
    console.error('✗ Error getting audiobook:', error);
    res.status(500).json({
      error: 'Failed to get audiobook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Start audiobook generation
 * 
 * POST /api/audiobooks/generate
 * Body: { bookFile: string, voiceMap?: object, defaultVoice?: string }
 */
app.post('/api/audiobooks/generate', async (req: Request, res: Response) => {
  try {
    const { bookFile, voiceMap = {}, defaultVoice = 'Algieba' } = req.body;
    
    if (!bookFile) {
      return res.status(400).json({
        error: 'Missing bookFile',
        message: 'bookFile is required',
      });
    }
    
    // Load book file
    const bookPath = path.join(ASSETS_DIR, bookFile);
    if (!fs.existsSync(bookPath)) {
      return res.status(404).json({
        error: 'Book not found',
        message: `File not found: ${bookFile}`,
      });
    }
    
    const ext = path.extname(bookFile).toLowerCase();
    let chapters: Chapter[] = [];
    let bookMetadata;
    let isDramatized = false;
    
    if (ext === '.epub') {
      const epubBuffer = fs.readFileSync(bookPath);
      bookMetadata = parseBookMetadata(epubBuffer, 'epub', bookPath);
      chapters = extractEpubChapters(epubBuffer);
    } else if (ext === '.txt') {
      const bookText = fs.readFileSync(bookPath, 'utf-8');
      bookMetadata = parseBookMetadata(bookText, 'txt');
      
      // Check for voice tags
      isDramatized = /\[VOICE=.*?\]/.test(bookText);
      
      // Detect chapters
      chapters = bookText.includes('Chapter') || bookText.includes('CHAPTER')
        ? detectTextChapters(bookText)
        : createSingleChapter(bookText, bookMetadata.title);
    } else {
      return res.status(400).json({
        error: 'Unsupported format',
        message: 'Only .epub and .txt files are supported',
      });
    }
    
    // Chunk the chapters
    const chunkingResult = chunkBookByChapters(chapters, isDramatized);
    
    // Create audiobook folder and metadata
    const bookTitle = sanitizeBookTitle(bookMetadata.title);
    createAudiobookFolder(bookTitle);
    
    const audiobookMetadata = {
      title: bookMetadata.title,
      author: bookMetadata.author,
      language: bookMetadata.language || 'unknown',
      totalChapters: chapters.length,
      chapters: chapters.map((chapter, i) => ({
        index: i,
        title: chapter.title,
        filename: `Chapter_${i.toString().padStart(2, '0')}.wav`,
        duration: 0,
        isGenerated: false,
        tempChunksCount: chunkingResult.chapterChunkCounts[i],
        tempChunksGenerated: 0,
      })),
      generationStatus: 'in-progress' as const,
      lastUpdated: new Date().toISOString(),
      voiceMap: isDramatized ? voiceMap : undefined,
      sourceFile: bookFile,
    };
    
    saveAudiobookMetadata(bookTitle, audiobookMetadata);
    
    // Add to worker queue
    audiobookWorker.addBook(
      bookTitle,
      chapters,
      chunkingResult.chunks,
      voiceMap,
      defaultVoice,
      isDramatized
    );
    
    console.log(`✓ Started audiobook generation: "${bookTitle}"`);
    
    res.json({
      success: true,
      bookTitle,
      metadata: audiobookMetadata,
      totalChunks: chunkingResult.totalChunks,
      message: 'Audiobook generation started in background',
    });
  } catch (error) {
    console.error('✗ Error starting audiobook generation:', error);
    res.status(500).json({
      error: 'Failed to start generation',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get generation progress
 * 
 * GET /api/audiobooks/:bookTitle/progress
 */
app.get('/api/audiobooks/:bookTitle/progress', (req: Request, res: Response) => {
  try {
    const { bookTitle } = req.params;
    const progress = audiobookWorker.getProgress(bookTitle);
    
    if (!progress) {
      return res.status(404).json({
        error: 'No generation in progress',
        message: `No generation found for: ${bookTitle}`,
      });
    }
    
    res.json(progress);
  } catch (error) {
    console.error('✗ Error getting progress:', error);
    res.status(500).json({
      error: 'Failed to get progress',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get worker status
 * 
 * GET /api/audiobooks/worker/status
 */
app.get('/api/audiobooks/worker/status', (req: Request, res: Response) => {
  try {
    const status = audiobookWorker.getStatus();
    const allProgress = Array.from(audiobookWorker.getAllProgress().values());
    
    res.json({
      ...status,
      jobs: allProgress,
    });
  } catch (error) {
    console.error('✗ Error getting worker status:', error);
    res.status(500).json({
      error: 'Failed to get worker status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Check if book has cached dramatization
 * 
 * GET /api/dramatize/check/:bookFile
 */
app.get('/api/dramatize/check/:bookFile', async (req: Request, res: Response) => {
  try {
    const { bookFile } = req.params;
    const bookPath = path.join(ASSETS_DIR, bookFile);
    
    if (!fs.existsSync(bookPath)) {
      return res.status(404).json({
        error: 'Book not found',
        message: `File not found: ${bookFile}`,
      });
    }
    
    const cacheInfo = await checkCache(bookPath);
    res.json(cacheInfo);
  } catch (error) {
    console.error('✗ Error checking dramatization cache:', error);
    res.status(500).json({
      error: 'Failed to check cache',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Auto-dramatize book with LLM
 * 
 * POST /api/dramatize/auto
 * Body: { bookFile: string, mode?: 'full' | 'fast' }
 */
app.post('/api/dramatize/auto', async (req: Request, res: Response) => {
  try {
    const { bookFile, mode = 'fast' } = req.body;
    
    if (!bookFile) {
      return res.status(400).json({
        error: 'Missing bookFile',
        message: 'bookFile is required',
      });
    }
    
    const bookPath = path.join(ASSETS_DIR, bookFile);
    if (!fs.existsSync(bookPath)) {
      return res.status(404).json({
        error: 'Book not found',
        message: `File not found: ${bookFile}`,
      });
    }
    
    console.log(`🎭 Starting LLM dramatization for: ${bookFile} (mode: ${mode})`);
    
    const result = await dramatizeBook(bookPath, {
      mode,
      onProgress: (progress) => {
        console.log(`  📊 ${progress.phase}: ${progress.message} (${progress.progress}%)`);
      },
    });
    
    res.json({
      success: true,
      message: 'Book dramatized successfully',
      characters: result.characters,
      voiceMap: result.voiceMap,
      stats: {
        charactersFound: result.stats.charactersFound,
        chaptersTagged: result.stats.chaptersTagged,
        totalTime: result.stats.totalTime,
      },
    });
  } catch (error) {
    console.error('✗ Error dramatizing book:', error);
    res.status(500).json({
      error: 'Failed to dramatize book',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Serve chapter audio file
 * 
 * GET /api/audiobooks/:bookTitle/chapters/:chapterIndex
 */
app.get('/api/audiobooks/:bookTitle/chapters/:chapterIndex', (req: Request, res: Response) => {
  try {
    const { bookTitle, chapterIndex } = req.params;
    const chapterPath = getChapterPath(bookTitle, parseInt(chapterIndex));
    
    if (!fs.existsSync(chapterPath)) {
      return res.status(404).json({
        error: 'Chapter not found',
        message: `Chapter ${chapterIndex} not yet generated`,
      });
    }
    
    res.sendFile(path.resolve(chapterPath));
  } catch (error) {
    console.error('✗ Error serving chapter:', error);
    res.status(500).json({
      error: 'Failed to serve chapter',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Update playback position for an audiobook
 * 
 * PUT /api/audiobooks/:bookTitle/position
 * Body: { currentChapter: number, currentTime: number }
 */
app.put('/api/audiobooks/:bookTitle/position', (req: Request, res: Response) => {
  try {
    const { bookTitle } = req.params;
    const { currentChapter, currentTime } = req.body;
    
    if (typeof currentChapter !== 'number' || typeof currentTime !== 'number') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'currentChapter and currentTime must be numbers',
      });
    }
    
    const metadata = loadAudiobookMetadata(bookTitle);
    if (!metadata) {
      return res.status(404).json({
        error: 'Audiobook not found',
        message: `Audiobook "${bookTitle}" does not exist`,
      });
    }
    
    // Update playback position
    metadata.playback = {
      currentChapter,
      currentTime,
      lastPlayedAt: new Date().toISOString(),
    };
    
    saveAudiobookMetadata(bookTitle, metadata);
    
    res.json({
      success: true,
      position: metadata.playback,
    });
  } catch (error) {
    console.error('✗ Error updating position:', error);
    res.status(500).json({
      error: 'Failed to update position',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get playback position for an audiobook
 * 
 * GET /api/audiobooks/:bookTitle/position
 */
app.get('/api/audiobooks/:bookTitle/position', (req: Request, res: Response) => {
  try {
    const { bookTitle } = req.params;
    
    const metadata = loadAudiobookMetadata(bookTitle);
    if (!metadata) {
      return res.status(404).json({
        error: 'Audiobook not found',
        message: `Audiobook "${bookTitle}" does not exist`,
      });
    }
    
    res.json(metadata.playback || {
      currentChapter: 0,
      currentTime: 0,
      lastPlayedAt: null,
    });
  } catch (error) {
    console.error('✗ Error retrieving position:', error);
    res.status(500).json({
      error: 'Failed to retrieve position',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Update user preferences for an audiobook
 * 
 * PUT /api/audiobooks/:bookTitle/preferences
 * Body: { narratorVoice?: string, narratorGender?: string, playbackSpeed?: number }
 */
app.put('/api/audiobooks/:bookTitle/preferences', (req: Request, res: Response) => {
  try {
    const { bookTitle } = req.params;
    const { narratorVoice, narratorGender, playbackSpeed } = req.body;
    
    const metadata = loadAudiobookMetadata(bookTitle);
    if (!metadata) {
      return res.status(404).json({
        error: 'Audiobook not found',
        message: `Audiobook "${bookTitle}" does not exist`,
      });
    }
    
    // Update preferences (merge with existing)
    metadata.userPreferences = {
      ...metadata.userPreferences,
      ...(narratorVoice !== undefined && { narratorVoice }),
      ...(narratorGender !== undefined && { narratorGender }),
      ...(playbackSpeed !== undefined && { playbackSpeed }),
    };
    
    saveAudiobookMetadata(bookTitle, metadata);
    
    res.json({
      success: true,
      preferences: metadata.userPreferences,
    });
  } catch (error) {
    console.error('✗ Error updating preferences:', error);
    res.status(500).json({
      error: 'Failed to update preferences',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get user preferences for an audiobook
 * 
 * GET /api/audiobooks/:bookTitle/preferences
 */
app.get('/api/audiobooks/:bookTitle/preferences', (req: Request, res: Response) => {
  try {
    const { bookTitle } = req.params;
    
    const metadata = loadAudiobookMetadata(bookTitle);
    if (!metadata) {
      return res.status(404).json({
        error: 'Audiobook not found',
        message: `Audiobook "${bookTitle}" does not exist`,
      });
    }
    
    res.json(metadata.userPreferences || {});
  } catch (error) {
    console.error('✗ Error retrieving preferences:', error);
    res.status(500).json({
      error: 'Failed to retrieve preferences',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ========================================
// DRAMATIZED TTS ENDPOINTS (PoC Phase 1)
// ========================================

/**
 * Process dramatized text file
 * 
 * Pipeline:
 * 1. Load tagged text
 * 2. Extract characters
 * 3. Assign voices
 * 4. Save voice map
 * 5. Create chunks
 * 
 * POST /api/dramatize/process
 * Body: { taggedTextPath: string }
 */
app.post('/api/dramatize/process', async (req: Request, res: Response) => {
  try {
    const { taggedTextPath } = req.body;
    
    if (!taggedTextPath) {
      return res.status(400).json({
        error: 'Missing taggedTextPath',
        message: 'taggedTextPath is required'
      });
    }
    
    console.log('[API] Processing dramatized text...');
    console.log(`[API] Input: ${taggedTextPath}`);
    
    // Step 1: Process text and assign voices
    const processorResult = await processDramatizedText(taggedTextPath);
    
    // Step 2: Chunk the tagged text
    const chunkerResult = await processTaggedTextFile(taggedTextPath);
    
    console.log('[API] ✅ Dramatization complete!');
    
    res.json({
      success: true,
      voiceMapPath: processorResult.voiceMapPath,
      characterCount: processorResult.characterCount,
      totalChunks: chunkerResult.totalChunks,
      voiceMap: processorResult.voiceMap
    });
    
  } catch (error) {
    console.error('[API] ❌ Dramatization failed:', error);
    res.status(500).json({
      error: 'Dramatization failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get voice map for dramatized text
 * 
 * GET /api/dramatize/voice-map
 */
app.get('/api/dramatize/voice-map', async (req: Request, res: Response) => {
  try {
    const voiceMapPath = path.join(ASSETS_DIR, 'dramatized_output', 'voice_map_poc.json');
    
    if (!fs.existsSync(voiceMapPath)) {
      return res.status(404).json({
        error: 'Voice map not found',
        message: 'Run /api/dramatize/process first'
      });
    }
    
    const voiceMap = await loadVoiceMap(voiceMapPath);
    
    res.json({
      success: true,
      voiceMap
    });
    
  } catch (error) {
    console.error('[API] Failed to load voice map:', error);
    res.status(500).json({
      error: 'Failed to load voice map',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Ebook Reader Backend POC 2.0        ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('');
  
  if (BOOK_METADATA && BOOK_INFO) {
    console.log('📚 Book Information:');
    console.log(`   Format: ${BOOK_FORMAT.toUpperCase()}`);
    console.log(`   Title: ${BOOK_METADATA.title}`);
    console.log(`   Author: ${BOOK_METADATA.author}`);
    console.log(`   Total chunks: ${BOOK_INFO.totalChunks}`);
    console.log(`   Total words: ${BOOK_INFO.totalWords}`);
    const duration = BOOK_INFO.estimatedDuration || 0;
    console.log(`   Estimated duration: ${Math.floor(duration / 60)}min ${Math.floor(duration % 60)}s`);
    console.log('');
  } else {
    console.log('📚 No book loaded - waiting for selection');
    console.log('');
  }
  
  console.log('Available endpoints:');
  console.log(`  GET  /api/health`);
  console.log(`  GET  /api/books`);
  console.log(`  GET  /api/book/info`);
  console.log(`  POST /api/book/select`);
  console.log(`  POST /api/tts/chunk`);
  console.log(`  POST /api/tts/read-sample (POC 1.0 legacy)`);
  console.log('');
  console.log('Audiobook Library endpoints (Phase 3):');
  console.log(`  GET  /api/audiobooks`);
  console.log(`  GET  /api/audiobooks/:bookTitle`);
  console.log(`  POST /api/audiobooks/generate`);
  console.log(`  GET  /api/audiobooks/:bookTitle/progress`);
  console.log(`  GET  /api/audiobooks/worker/status`);
  console.log(`  GET  /api/audiobooks/:bookTitle/chapters/:chapterIndex`);
  console.log('');
  console.log('LLM Dramatization endpoints:');
  console.log(`  GET  /api/dramatize/check/:bookFile`);
  console.log(`  POST /api/dramatize/auto`);
  console.log('');
  console.log('User State Sync endpoints:');
  console.log(`  PUT  /api/audiobooks/:bookTitle/position`);
  console.log(`  GET  /api/audiobooks/:bookTitle/position`);
  console.log(`  PUT  /api/audiobooks/:bookTitle/preferences`);
  console.log(`  GET  /api/audiobooks/:bookTitle/preferences`);
  console.log('');
  
  // PRODUCTION: Enable background consolidation watcher
  // This runs every 30s to consolidate ready chapters independently
  // Disabled during development to prevent excessive token consumption
  // startConsolidationWatcher();
  console.log('💡 Background consolidation watcher: DISABLED (dev mode)');
  console.log('   To enable for production: uncomment startConsolidationWatcher() in server startup');
  console.log('');
});
