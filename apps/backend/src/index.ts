import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { synthesizeText } from './ttsClient.js';
import {
  SUPPORTED_EXTENSIONS,
  detectFormat,
  extractTextFromHtml,
  extractTextFromMobi,
  extractTextFromDocx,
  extractTextFromOdt,
  extractTextFromRtf,
  extractTextFromMarkdown,
  extractTextFromPages,
  extractTextFromWps,
  extractTextFromPdf,
} from './formatExtractors.js';
import { 
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
  tempChunkExists, 
  loadTempChunk,
  consolidateChapterSmart,
  consolidateChapterFromSubChunks,
  deleteAllTempChunks,
  stopPreDramatization,
  generateSubChunksParallel,
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
  loadChapterFile,
  deleteAudiobook,
  type AudiobookMetadata,
} from './audiobookManager.js';
import { 
  extractEpubChapters, 
  detectTextChapters, 
  createSingleChapter,
  type Chapter 
} from './bookChunker.js';
import { type ChunkInfo } from './chapterChunker.js';
import { chunkForTwoSpeakers, type TwoSpeakerChunk } from './twoSpeakerChunker.js';
import { tagChapterHybrid } from './hybridDramatizer.js';
import { GeminiConfig, CharacterProfile } from './llmCharacterAnalyzer.js';
import { audiobookWorker } from './audiobookWorker.js';
import { checkCache } from './geminiDramatizer.js';
// Chapter translation support
import { 
  ChapterTranslator, 
  needsTranslation,
  getLanguageDisplayName,
  normalizeQuotesForDramatization
} from './chapterTranslator.js';
// Per-chapter character extraction with alias support
import { CharacterRegistry } from './characterRegistry.js';
// Parallel pipeline manager - only resetPipeline() is used for book switching
import { resetPipeline } from './parallelPipelineManager.js';
// Cost tracking for audiobook generation
import { CostTracker, estimateTokens } from './costTracker.js';

// ES modules dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
// Increase body size limit for large EPUB/ebook uploads (default is 100kb)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Book state variables (initialized empty, loaded on demand)
let BOOK_TEXT: string = '';
// REMOVED: BOOK_CHUNKS - chunk layer eliminated, now using sub-chunks directly
// REMOVED: CHUNK_INFOS - chunk layer eliminated
// BOOK_CHAPTERS uses 1-based indexing: BOOK_CHAPTERS[1] = first chapter, BOOK_CHAPTERS[0] = undefined
let BOOK_CHAPTERS: Chapter[] = []; // Store extracted chapters (1-based: index 0 unused)
let BOOK_METADATA: BookMetadata | null = null;
let BOOK_INFO: ReturnType<typeof getBookInfo> | null = null;
let BOOK_FORMAT: 'txt' | 'epub' | 'pdf' | 'html' | 'mobi' | 'docx' | 'odt' | 'rtf' | 'md' | 'pages' | 'wps' = 'txt';
let CURRENT_BOOK_FILE: string = '';
let ASSETS_DIR: string;
let VOICE_MAP: Record<string, string> = {}; // Global voice map for dramatized books
let NARRATOR_VOICE: string = 'Achird'; // Global narrator voice selection (default: Achird)
let TARGET_LANGUAGE: string | null = null; // Target language for translation (null = no translation)
let COST_TRACKER: CostTracker | null = null; // Cost tracking for current audiobook generation

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

// LOCK: Chapter dramatization - prevents duplicate dramatization calls
// Map: chapterNum (1-based) -> Promise that resolves when dramatization completes
const CHAPTER_DRAMATIZATION_LOCK: Map<number, Promise<TwoSpeakerChunk[]>> = new Map();

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

  
  // Stop any ongoing background dramatization (includes TTS generation)
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
    (global as any).BOOK_METADATA = BOOK_METADATA; // Expose for TTS single-word language override
    
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
    
    // Parse metadata from TXT (pass filePath for better title extraction)
    BOOK_METADATA = parseBookMetadata(BOOK_TEXT, 'txt', bookPath);
    (global as any).BOOK_METADATA = BOOK_METADATA; // Expose for TTS single-word language override
    
    // Detect chapters in TXT (returns 0-indexed array)
    const chaptersArray = detectTextChapters(BOOK_TEXT);
    
    // Store chapters at 1-based array positions
    BOOK_CHAPTERS = [];
    for (let i = 0; i < chaptersArray.length; i++) {
      const chapterNum = i + 1;
      BOOK_CHAPTERS[chapterNum] = { ...chaptersArray[i], index: chapterNum };
    }
    console.log(`✓ Detected ${chaptersArray.length} chapters in TXT (1-based indexing)`);
    
  } else if (ext === '.html' || ext === '.htm') {
    BOOK_FORMAT = 'html';
    console.log(`🌐 Loading HTML: ${filename}`);
    
    // Load and extract text from HTML
    const htmlContent = fs.readFileSync(bookPath, 'utf-8');
    BOOK_TEXT = extractTextFromHtml(htmlContent);
    
    // Parse metadata (use cleaned text)
    BOOK_METADATA = parseBookMetadata(BOOK_TEXT, 'txt', bookPath);
    (global as any).BOOK_METADATA = BOOK_METADATA;
    
    // Detect chapters in extracted text
    const chaptersArray = detectTextChapters(BOOK_TEXT);
    BOOK_CHAPTERS = [];
    for (let i = 0; i < chaptersArray.length; i++) {
      const chapterNum = i + 1;
      BOOK_CHAPTERS[chapterNum] = { ...chaptersArray[i], index: chapterNum };
    }
    console.log(`✓ Extracted text from HTML, detected ${chaptersArray.length} chapters`);
    
  } else if (ext === '.mobi' || ext === '.azw' || ext === '.azw3' || ext === '.kf8') {
    BOOK_FORMAT = 'mobi';
    console.log(`📱 Loading MOBI/KF8: ${filename}`);
    
    // Load and extract text from MOBI
    const mobiBuffer = fs.readFileSync(bookPath);
    BOOK_TEXT = await extractTextFromMobi(mobiBuffer);
    
    // Parse metadata (use cleaned text)
    BOOK_METADATA = parseBookMetadata(BOOK_TEXT, 'txt', bookPath);
    (global as any).BOOK_METADATA = BOOK_METADATA;
    
    // Detect chapters in extracted text
    const chaptersArray = detectTextChapters(BOOK_TEXT);
    BOOK_CHAPTERS = [];
    for (let i = 0; i < chaptersArray.length; i++) {
      const chapterNum = i + 1;
      BOOK_CHAPTERS[chapterNum] = { ...chaptersArray[i], index: chapterNum };
    }
    console.log(`✓ Extracted text from MOBI, detected ${chaptersArray.length} chapters`);
    
  } else if (ext === '.docx' || ext === '.doc') {
    BOOK_FORMAT = 'docx';
    console.log(`📝 Loading Word Document: ${filename}`);
    
    // Load and extract text from DOCX/DOC
    const docBuffer = fs.readFileSync(bookPath);
    BOOK_TEXT = await extractTextFromDocx(docBuffer);
    
    // Parse metadata
    BOOK_METADATA = parseBookMetadata(BOOK_TEXT, 'txt', bookPath);
    (global as any).BOOK_METADATA = BOOK_METADATA;
    
    // Detect chapters
    const chaptersArray = detectTextChapters(BOOK_TEXT);
    BOOK_CHAPTERS = [];
    for (let i = 0; i < chaptersArray.length; i++) {
      const chapterNum = i + 1;
      BOOK_CHAPTERS[chapterNum] = { ...chaptersArray[i], index: chapterNum };
    }
    console.log(`✓ Extracted text from Word, detected ${chaptersArray.length} chapters`);
    
  } else if (ext === '.odt') {
    BOOK_FORMAT = 'odt';
    console.log(`📄 Loading OpenDocument: ${filename}`);
    
    // Load and extract text from ODT
    const odtBuffer = fs.readFileSync(bookPath);
    BOOK_TEXT = await extractTextFromOdt(odtBuffer);
    
    // Parse metadata
    BOOK_METADATA = parseBookMetadata(BOOK_TEXT, 'txt', bookPath);
    (global as any).BOOK_METADATA = BOOK_METADATA;
    
    // Detect chapters
    const chaptersArray = detectTextChapters(BOOK_TEXT);
    BOOK_CHAPTERS = [];
    for (let i = 0; i < chaptersArray.length; i++) {
      const chapterNum = i + 1;
      BOOK_CHAPTERS[chapterNum] = { ...chaptersArray[i], index: chapterNum };
    }
    console.log(`✓ Extracted text from ODT, detected ${chaptersArray.length} chapters`);
    
  } else if (ext === '.rtf') {
    BOOK_FORMAT = 'rtf';
    console.log(`📃 Loading RTF: ${filename}`);
    
    // Load and extract text from RTF
    const rtfBuffer = fs.readFileSync(bookPath);
    BOOK_TEXT = await extractTextFromRtf(rtfBuffer);
    
    // Parse metadata
    BOOK_METADATA = parseBookMetadata(BOOK_TEXT, 'txt', bookPath);
    (global as any).BOOK_METADATA = BOOK_METADATA;
    
    // Detect chapters
    const chaptersArray = detectTextChapters(BOOK_TEXT);
    BOOK_CHAPTERS = [];
    for (let i = 0; i < chaptersArray.length; i++) {
      const chapterNum = i + 1;
      BOOK_CHAPTERS[chapterNum] = { ...chaptersArray[i], index: chapterNum };
    }
    console.log(`✓ Extracted text from RTF, detected ${chaptersArray.length} chapters`);
    
  } else if (ext === '.md' || ext === '.markdown') {
    BOOK_FORMAT = 'md';
    console.log(`📑 Loading Markdown: ${filename}`);
    
    // Load and extract text from Markdown
    const mdContent = fs.readFileSync(bookPath, 'utf-8');
    BOOK_TEXT = await extractTextFromMarkdown(mdContent);
    
    // Parse metadata
    BOOK_METADATA = parseBookMetadata(BOOK_TEXT, 'txt', bookPath);
    (global as any).BOOK_METADATA = BOOK_METADATA;
    
    // Detect chapters
    const chaptersArray = detectTextChapters(BOOK_TEXT);
    BOOK_CHAPTERS = [];
    for (let i = 0; i < chaptersArray.length; i++) {
      const chapterNum = i + 1;
      BOOK_CHAPTERS[chapterNum] = { ...chaptersArray[i], index: chapterNum };
    }
    console.log(`✓ Extracted text from Markdown, detected ${chaptersArray.length} chapters`);
    
  } else if (ext === '.pages') {
    BOOK_FORMAT = 'pages';
    console.log(`🍎 Loading Apple Pages: ${filename}`);
    
    // Load and extract text from Pages
    const pagesBuffer = fs.readFileSync(bookPath);
    BOOK_TEXT = await extractTextFromPages(pagesBuffer);
    
    // Parse metadata
    BOOK_METADATA = parseBookMetadata(BOOK_TEXT, 'txt', bookPath);
    (global as any).BOOK_METADATA = BOOK_METADATA;
    
    // Detect chapters
    const chaptersArray = detectTextChapters(BOOK_TEXT);
    BOOK_CHAPTERS = [];
    for (let i = 0; i < chaptersArray.length; i++) {
      const chapterNum = i + 1;
      BOOK_CHAPTERS[chapterNum] = { ...chaptersArray[i], index: chapterNum };
    }
    console.log(`✓ Extracted text from Pages, detected ${chaptersArray.length} chapters`);
    
  } else if (ext === '.wps') {
    BOOK_FORMAT = 'wps';
    console.log(`📋 Loading WPS Writer: ${filename}`);
    
    // Load and extract text from WPS
    const wpsBuffer = fs.readFileSync(bookPath);
    BOOK_TEXT = await extractTextFromWps(wpsBuffer);
    
    // Parse metadata
    BOOK_METADATA = parseBookMetadata(BOOK_TEXT, 'txt', bookPath);
    (global as any).BOOK_METADATA = BOOK_METADATA;
    
    // Detect chapters
    const chaptersArray = detectTextChapters(BOOK_TEXT);
    BOOK_CHAPTERS = [];
    for (let i = 0; i < chaptersArray.length; i++) {
      const chapterNum = i + 1;
      BOOK_CHAPTERS[chapterNum] = { ...chaptersArray[i], index: chapterNum };
    }
    console.log(`✓ Extracted text from WPS, detected ${chaptersArray.length} chapters`);
    
  } else if (ext === '.pdf') {
    BOOK_FORMAT = 'pdf';
    console.log(`📕 Loading PDF: ${filename}`);
    
    // Load and extract text from PDF with quality check
    // Only clean digital PDFs are accepted (not scanned/OCR)
    const pdfBuffer = fs.readFileSync(bookPath);
    BOOK_TEXT = await extractTextFromPdf(pdfBuffer);
    
    // Parse metadata
    BOOK_METADATA = parseBookMetadata(BOOK_TEXT, 'txt', bookPath);
    (global as any).BOOK_METADATA = BOOK_METADATA;
    
    // Detect chapters
    const chaptersArray = detectTextChapters(BOOK_TEXT);
    BOOK_CHAPTERS = [];
    for (let i = 0; i < chaptersArray.length; i++) {
      const chapterNum = i + 1;
      BOOK_CHAPTERS[chapterNum] = { ...chaptersArray[i], index: chapterNum };
    }
    console.log(`✓ Extracted text from PDF, detected ${chaptersArray.length} chapters`);
    
  } else {
    throw new Error(`Unsupported book format: ${ext}. Supported formats: EPUB, TXT, HTML, MOBI, DOCX, DOC, ODT, RTF, MD, Pages, WPS, PDF.`);
  }
  
  // Check for voice tags (existing or from dramatization) - new format: SPEAKER: text
  let hasVoiceTags = /^[A-Z][A-Z0-9]*:\s/m.test(BOOK_TEXT);
  
  // HYBRID DRAMATIZATION: Auto-tag dialogue with LLM
  // All books use the same background dramatization process
  if (enableDramatization && !hasVoiceTags) {
    console.log(`\n🎭 BACKGROUND DRAMATIZATION`);
    console.log('==========================================');
    
    try {
      const geminiConfig: GeminiConfig = {
        projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      };
      
      if (!geminiConfig.projectId) {
        throw new Error('GOOGLE_CLOUD_PROJECT environment variable not set');
      }
      
      console.log('⚡ Per-chapter character extraction (universal approach)...');
      console.log(`   Book: ${BOOK_TEXT.length} chars, ${getChapterCount()} chapters`);
      
      // Import analyzer for hybrid tagging
      const { GeminiCharacterAnalyzer } = await import('./llmCharacterAnalyzer.js');
      const analyzer = new GeminiCharacterAnalyzer(geminiConfig);
      
      // Initialize CharacterRegistry for per-chapter extraction
      // Characters will be extracted from each chapter (after translation if needed)
      // This approach handles aliases naturally and works for all scenarios
      const characterRegistry = new CharacterRegistry(geminiConfig);
      characterRegistry.setNarratorVoice(NARRATOR_VOICE);
      
      console.log('📋 Character registry initialized (per-chapter extraction enabled)');
      console.log(`   Narrator voice: ${NARRATOR_VOICE}`);
      console.log('');
      
      // Store registry and analyzer for background dramatization
      (global as any).CHARACTER_REGISTRY = characterRegistry;
      (global as any).DRAMATIZATION_CONFIG = geminiConfig;
      (global as any).DRAMATIZATION_ANALYZER = analyzer;
      
      // ALL BOOKS: Background parallel dramatization (non-blocking)
      // Same process regardless of book length for consistency
      (global as any).DRAMATIZATION_ENABLED = true;
      
      // Update metadata
      BOOK_METADATA.isDramatized = false; // Will be true after chunks are dramatized
      BOOK_METADATA.dramatizationType = 'parallel-background';
      BOOK_METADATA.charactersFound = 0; // Will be updated per-chapter
      
      console.log('✅ Ready for background dramatization\n');
      console.log('🚀 Starting PARALLEL BACKGROUND DRAMATIZATION...');
      console.log('   Per-chapter: translate → extract characters → dramatize\n');
      
      // Start background dramatization (non-blocking)
      // Each chapter: translate (if needed) → extract characters → dramatize
      startBackgroundDramatization(characterRegistry, analyzer).catch(err => 
        console.error('❌ Background dramatization failed:', err)
      );
      
    } catch (error) {
      console.error('\n❌ INITIALIZATION FAILED');
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
      
      // Extract all unique character names from voice tags (SPEAKER: format) in the book text
      const voiceTagRegex = /^([A-Z][A-Z0-9]*):\s/gm;
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
  CHAPTER_DRAMATIZATION_LOCK.clear();  // Clear dramatization locks from previous book
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
    
    // Check if chapter has voice tags (either pre-tagged or needs dramatization) - SPEAKER: format
    const chapterHasVoiceTags = /^[A-Z][A-Z0-9]*:\s/m.test(chapterText);
    
    if (chapterHasVoiceTags) {
      // Pre-tagged: split directly to sub-chunks
      const subChunks = chunkForTwoSpeakers(chapterText, undefined, chapterNum);
      CHAPTER_SUBCHUNKS.set(chapterNum, subChunks);
      CHAPTER_DRAMATIZED.set(chapterNum, chapterText);
      TOTAL_SUBCHUNKS += subChunks.length;
      
      console.log(`   Chapter ${chapterNum}: ${subChunks.length} sub-chunks (pre-tagged)`);
    } else if ((global as any).DRAMATIZATION_ENABLED) {
      // Will be dramatized by background process - create placeholder
      // Sub-chunks will be generated when chapter is dramatized in background
      CHAPTER_SUBCHUNKS.set(chapterNum, []);
      // Note: Verbose 'pending dramatization' log removed for cleaner output
    } else {
      // No voice tags, no dramatization - treat as single NARRATOR voice
      const narratorText = `NARRATOR: ${chapterText}`;
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
  // Filter out null (index 0 placeholder for 1-based indexing)
  const allChapterText = BOOK_CHAPTERS.filter(ch => ch !== null).map(ch => ch.text).join('\n\n');
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

// Dramatization status endpoint
app.get('/api/dramatization/status', (req: Request, res: Response) => {
  // Check for timeout
  const now = Date.now();
  const isTimedOut = dramatizationStatus.lastActivityAt && 
    (now - dramatizationStatus.lastActivityAt) > DRAMATIZATION_TIMEOUT_MS;
  
  const status = {
    ...dramatizationStatus,
    isActive: isDramatizingInBackground,
    isTimedOut,
    completedChapters: CHAPTER_SUBCHUNKS.size,
    totalSubChunks: TOTAL_SUBCHUNKS,
  };
  
  res.json(status);
});

// Background dramatization state (includes TTS generation)
let isDramatizingInBackground = false;
let backgroundDramatizationAbort: AbortController | null = null;

// Dramatization progress tracking
interface DramatizationStatus {
  phase: 'idle' | 'translating' | 'dramatizing' | 'generating_audio' | 'complete' | 'failed';
  currentChapter: number;
  totalChapters: number;
  currentOperation: string;
  startedAt: number | null;
  lastActivityAt: number | null;
  error: string | null;
}

let dramatizationStatus: DramatizationStatus = {
  phase: 'idle',
  currentChapter: 0,
  totalChapters: 0,
  currentOperation: '',
  startedAt: null,
  lastActivityAt: null,
  error: null,
};

const DRAMATIZATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per chapter

/**
 * Stop background dramatization (and TTS generation)
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
  characterRegistry: CharacterRegistry,
  analyzer: any
): Promise<void> {
  if (isDramatizingInBackground) {
    console.log('🔄 Background dramatization already running');
    return;
  }
  
  isDramatizingInBackground = true;
  backgroundDramatizationAbort = new AbortController();
  
  // Sequential chapter processing (1) ensures chapters complete in order
  // TTS parallelism (2) within each chapter keeps generation fast
  const parallelism = 1;
  const chapterCount = getChapterCount();
  
  // Initialize status tracking
  const now = Date.now();
  dramatizationStatus = {
    phase: 'dramatizing',
    currentChapter: 0,
    totalChapters: chapterCount - 1, // -1 because we skip chapter 0
    currentOperation: 'Starting background dramatization',
    startedAt: now,
    lastActivityAt: now,
    error: null,
  };
  
  // Initialize translator if translation is needed
  let translator: ChapterTranslator | null = null;
  const translationRequired = needsTranslation(TARGET_LANGUAGE);
  
  if (translationRequired) {
    const geminiConfig: GeminiConfig = {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    };
    translator = new ChapterTranslator(geminiConfig);
  }
  
  console.log(`\n🎭 BACKGROUND DRAMATIZATION STARTED (per-chapter extraction)`);
  console.log(`   Chapters: ${chapterCount}`);
  console.log(`   Chapter parallelism: ${parallelism} (sequential)`);
  console.log(`   Mode: Per-chapter character extraction with alias detection`);
  if (translationRequired) {
    console.log(`   🌍 Translation: → ${getLanguageDisplayName(TARGET_LANGUAGE!)} (LLM auto-detects source)`);
  } else {
    console.log(`   🌍 Translation: not required (using original language)`);
  }
  console.log('');
  
  // Create audiobook folder BEFORE any file operations
  const bookTitle = sanitizeBookTitle(BOOK_METADATA?.title || CURRENT_BOOK_FILE || 'Unknown');
  createAudiobookFolder(bookTitle);
  console.log(`   📁 Audiobook folder: ${bookTitle}`);
  
  // Initialize cost tracker for this audiobook
  COST_TRACKER = new CostTracker(bookTitle);
  console.log(`   💰 Cost tracking enabled`);
  
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
      
      console.log(`📝 Processing chapters ${pendingChapterNums.join(', ')}...`);
      
      // Dramatize chapters in parallel - store promises in lock map for TTS to await
      await Promise.all(pendingChapterNums.map(async (chapterNum) => {
        if (backgroundDramatizationAbort?.signal.aborted) return;
        
        // Create and store the dramatization promise BEFORE starting
        // This allows continuous generation to await it
        let resolvePromise: () => void;
        const dramatizationPromise = new Promise<TwoSpeakerChunk[]>((resolve) => {
          resolvePromise = () => resolve(CHAPTER_SUBCHUNKS.get(chapterNum) || []);
        });
        CHAPTER_DRAMATIZATION_LOCK.set(chapterNum, dramatizationPromise);
        
        try {
          const chapter = BOOK_CHAPTERS[chapterNum];
          let textToDramatize = chapter.text;
          
          // ★ STEP 0: TRANSLATE chapter (if needed) ★
          if (translationRequired && translator) {
            console.log(`   🌍 Translating chapter ${chapterNum}...`);
            
            // Update status
            dramatizationStatus.phase = 'translating';
            dramatizationStatus.currentChapter = chapterNum;
            dramatizationStatus.currentOperation = `Translating chapter ${chapterNum}`;
            dramatizationStatus.lastActivityAt = Date.now();
            
            try {
              // Check for timeout
              const elapsed = Date.now() - (dramatizationStatus.lastActivityAt || 0);
              if (elapsed > DRAMATIZATION_TIMEOUT_MS) {
                throw new Error(`Translation timeout after ${Math.round(elapsed / 1000)}s`);
              }
              
              const translationResult = await translator.translateChapter(
                chapter.text,
                TARGET_LANGUAGE!
              );
              textToDramatize = translationResult.translatedText;
              
              // Track translation cost
              if (COST_TRACKER) {
                const inputTokens = estimateTokens(chapter.text, TARGET_LANGUAGE || 'slavic');
                const outputTokens = estimateTokens(textToDramatize, TARGET_LANGUAGE || 'slavic');
                COST_TRACKER.addTranslation(inputTokens, outputTokens);
              }
              
              // Normalize quotes: curly single quotes → straight apostrophes
              // This prevents contractions (can't, won't) from being treated as dialogue
              textToDramatize = normalizeQuotesForDramatization(textToDramatize);
              
              console.log(`   ✅ Chapter ${chapterNum} translated (${chapter.text.length} → ${textToDramatize.length} chars)`);
              
              // Update activity timestamp
              dramatizationStatus.lastActivityAt = Date.now();
              
            } catch (transErr) {
              console.error(`   ⚠️ Chapter ${chapterNum} translation failed, using original:`, transErr);
              dramatizationStatus.error = `Translation failed: ${transErr}`;
              // Continue with original text on translation failure
            }
          }
          
          // ★ STEP 1: EXTRACT CHARACTERS from this chapter (after translation) ★
          // Only extract from content chapters, skip front matter sections
          // This is the key change: per-chapter extraction with alias detection
          const chapterTextForExtraction = textToDramatize;
          await characterRegistry.extractFromChapter(textToDramatize, chapterNum, chapter.isFrontMatter);
          
          // Track character extraction cost (input = chapter text, output = ~500 tokens for JSON response)
          if (COST_TRACKER && !chapter.isFrontMatter) {
            const inputTokens = estimateTokens(chapterTextForExtraction, TARGET_LANGUAGE || 'slavic');
            const outputTokens = 500; // Approximate JSON response size
            COST_TRACKER.addCharacterExtraction(inputTokens, outputTokens);
          }
          
          // Update global VOICE_MAP with current registry state
          VOICE_MAP = characterRegistry.getVoiceMap();
          
          // Save character registry JSON for review (after each chapter)
          try {
            const registryFolder = path.join(getAudiobooksDir(), bookTitle);
            await characterRegistry.saveToFile(registryFolder);
          } catch (saveErr) {
            console.error(`   ⚠️ Failed to save character registry:`, saveErr);
          }
          
          // Convert registry characters to CharacterProfile[] for hybrid tagger
          const registeredChars = characterRegistry.getAllCharacters();
          const characters: CharacterProfile[] = registeredChars.map(rc => ({
            name: rc.primaryName,
            gender: rc.gender,
            traits: [rc.speechStyle], // Use speechStyle as single trait for compatibility
            role: 'unknown' as const,
            aliases: rc.aliases.filter(a => a !== rc.primaryName), // Exclude primary name from aliases
          }));
          
          // STEP 2: Dramatize the chapter (with translated text if applicable)
          dramatizationStatus.phase = 'dramatizing';
          dramatizationStatus.currentOperation = `Dramatizing chapter ${chapterNum}`;
          dramatizationStatus.lastActivityAt = Date.now();
          
          const result = await tagChapterHybrid(
            textToDramatize,
            characters,
            analyzer,
            chapterNum  // chapter number (1-based)
          );
          
          // Track dramatization cost (only for LLM-based methods)
          if (COST_TRACKER && result.method === 'llm-fallback') {
            const inputTokens = estimateTokens(textToDramatize, TARGET_LANGUAGE || 'slavic');
            const outputTokens = estimateTokens(result.taggedText, TARGET_LANGUAGE || 'slavic');
            COST_TRACKER.addDramatization(inputTokens, outputTokens);
          }
          
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
          
          // DEBUG: Save EXACT text as it will be sent to TTS (with speech style instructions)
          // Format per official Gemini TTS multi-speaker docs:
          // https://ai.google.dev/gemini-api/docs/speech-generation#multi-speaker
          const bookFolder = path.join(getAudiobooksDir(), bookTitle);
          await fs.promises.mkdir(bookFolder, { recursive: true });
          const debugPath = path.join(bookFolder, `chapter_${chapterNum}_dramatized.txt`);
          try {
            // Build EXACT TTS input per Gemini multi-speaker format
            const { extractVoiceSegments } = await import('./dramatizedChunkerSimple.js');
            const segments = extractVoiceSegments(result.taggedText);
            
            // Get CharacterRegistry for speech styles
            const registry = (global as any).CHARACTER_REGISTRY;
            
            // Helper: get speech style for a speaker
            const getSpeechStyle = (speaker: string): string | undefined => {
              if (!registry) return undefined;
              if (speaker === 'NARRATOR') {
                return registry.getNarratorInstruction?.();
              }
              // Try exact match
              let style = registry.getSpeechStyleForName?.(speaker);
              if (style) return style;
              // Try normalized name
              const normalized = speaker.replace(/_/g, ' ').split(' ')
                .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
              style = registry.getSpeechStyleForName?.(normalized);
              if (style) return style;
              // Try surname
              const lastName = normalized.split(' ').pop();
              if (lastName && lastName.length >= 3) {
                return registry.getSpeechStyleForName?.(lastName);
              }
              return undefined;
            };
            
            // Helper: count words (excluding punctuation)
            const countWords = (text: string): number => {
              const clean = text.replace(/["„"'«»‹›,\.!?;:—–-]/g, '').trim();
              return clean.split(/\s+/).filter(w => w.length > 0).length;
            };
            
            // Format EXACTLY as TTS will receive it per Gemini multi-speaker docs:
            // [Optional speech directive without period, with colon]
            // SPEAKER: Text to speak
            const ttsLines: string[] = [];
            for (const seg of segments) {
              const speechStyle = getSpeechStyle(seg.speaker);
              const wordCount = countWords(seg.text);
              
              // Build the EXACT text TTS will receive
              if (speechStyle && wordCount > 3) {
                // Speech style directive (remove trailing period)
                const directive = speechStyle.replace(/\.$/, '').trim();
                ttsLines.push(`${directive}:`);
              }
              // SPEAKER: text format (Gemini multi-speaker format)
              ttsLines.push(`${seg.speaker}: ${seg.text}`);
              ttsLines.push(''); // blank line separator
            }
            
            await fs.promises.writeFile(debugPath, ttsLines.join('\n'), 'utf8');
            console.log(`   📝 Debug: Saved EXACT TTS input to ${debugPath}`);
          } catch (e) {
            console.error(`   ⚠️ Failed to save dramatized text:`, e);
          }
          
          // Signal that dramatization is complete
          resolvePromise!();
          
          // IMMEDIATELY generate TTS for this chapter (producer responsibility)
          console.log(`   🎤 Generating TTS for chapter ${chapterNum}...`);
          dramatizationStatus.phase = 'generating_audio';
          dramatizationStatus.currentOperation = `Generating audio for chapter ${chapterNum}`;
          dramatizationStatus.lastActivityAt = Date.now();
          
          await generateSubChunksParallel(
            bookTitle,
            chapterNum,
            newSubChunks,
            VOICE_MAP,
            NARRATOR_VOICE,
            3 // TTS parallelism within chapter
          );
          
          // Track audio generation cost (TTS: input = text, output = ~10x for audio tokens)
          if (COST_TRACKER) {
            // Sum up all sub-chunk text for this chapter
            const totalTextForTTS = newSubChunks.reduce((sum, sc) => 
              sum + sc.segments.reduce((s, seg) => s + seg.text.length, 0), 0);
            const inputTokens = estimateTokens(result.taggedText, TARGET_LANGUAGE || 'slavic');
            // Audio output tokens are roughly 10x the input for Gemini TTS
            const outputTokens = inputTokens * 10;
            COST_TRACKER.addAudioGeneration(inputTokens, outputTokens);
          }
          
          // Update activity after generation
          dramatizationStatus.lastActivityAt = Date.now();
          
          // AUTO-CONSOLIDATE immediately after all sub-chunks generated
          try {
            const chapterTitle = BOOK_CHAPTERS[chapterNum]?.title;
            const bookTitle = sanitizeBookTitle(BOOK_METADATA?.title || CURRENT_BOOK_FILE || 'Unknown');
            await consolidateChapterFromSubChunks(bookTitle, chapterNum, chapterTitle);
            console.log(`   📦 Chapter ${chapterNum} consolidated successfully`);
            // NOTE: Sub-chunks are NOT deleted here - they are kept for playback
            // Cleanup happens via trackSubChunkPlayed() after chapter is fully played
          } catch (consErr) {
            console.error(`   ⚠️ Chapter ${chapterNum} consolidation failed:`, consErr);
          }
          
        } catch (error) {
          console.error(`   ❌ Chapter ${chapterNum} dramatization failed:`, error);
          
          // Fallback: wrap in NARRATOR voice (still try translation if needed)
          const chapter = BOOK_CHAPTERS[chapterNum];
          let fallbackText = chapter.text;
          
          // Try translation even for fallback (TTS might not support source language)
          if (translationRequired && translator) {
            try {
              console.log(`   🌍 Translating chapter ${chapterNum} for fallback...`);
              const translationResult = await translator.translateChapter(
                chapter.text,
                TARGET_LANGUAGE!
              );
              fallbackText = translationResult.translatedText;
            } catch (transErr) {
              console.error(`   ⚠️ Fallback translation also failed:`, transErr);
            }
          }
          
          const narratorText = `NARRATOR: ${fallbackText}`;
          const newSubChunks = chunkForTwoSpeakers(narratorText, undefined, chapterNum);
          CHAPTER_SUBCHUNKS.set(chapterNum, newSubChunks);
          CHAPTER_DRAMATIZED.set(chapterNum, narratorText);
          TOTAL_SUBCHUNKS += newSubChunks.length;
          
          console.log(`   ⚠️ Chapter ${chapterNum}: ${newSubChunks.length} sub-chunks (narrator fallback)`);
          
          // Signal that dramatization is complete
          resolvePromise!();
          
          // Generate TTS even for fallback
          const bookTitle = sanitizeBookTitle(BOOK_METADATA?.title || CURRENT_BOOK_FILE || 'Unknown');
          console.log(`   🎤 Generating TTS for chapter ${chapterNum} (fallback)...`);
          await generateSubChunksParallel(
            bookTitle,
            chapterNum,
            newSubChunks,
            VOICE_MAP,
            NARRATOR_VOICE,
            3 // TTS parallelism within chapter
          );
          
          // Track audio generation cost for fallback path
          if (COST_TRACKER) {
            const inputTokens = estimateTokens(narratorText, TARGET_LANGUAGE || 'slavic');
            const outputTokens = inputTokens * 10;
            COST_TRACKER.addAudioGeneration(inputTokens, outputTokens);
          }
          
          // AUTO-CONSOLIDATE immediately after all sub-chunks generated
          try {
            const chapterTitle = BOOK_CHAPTERS[chapterNum]?.title;
            const bookTitle = sanitizeBookTitle(BOOK_METADATA?.title || CURRENT_BOOK_FILE || 'Unknown');
            await consolidateChapterFromSubChunks(bookTitle, chapterNum, chapterTitle);
            console.log(`   📦 Chapter ${chapterNum} consolidated (fallback) successfully`);
            // NOTE: Sub-chunks are NOT deleted here - they are kept for playback
            // Cleanup happens via trackSubChunkPlayed() after chapter is fully played
          } catch (consErr) {
            console.error(`   ⚠️ Chapter ${chapterNum} consolidation failed:`, consErr);
          }
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
      
      // Save cost summary to audiobook folder
      if (COST_TRACKER) {
        try {
          await COST_TRACKER.saveToFile();
          console.log(`   💰 Cost summary saved`);
          console.log(COST_TRACKER.getTextReport());
        } catch (costErr) {
          console.error(`   ⚠️ Failed to save cost summary:`, costErr);
        }
      }
    }
  } catch (error) {
    console.error('❌ Background dramatization error:', error);
    dramatizationStatus.phase = 'failed';
    dramatizationStatus.error = String(error);
    dramatizationStatus.lastActivityAt = Date.now();
  } finally {
    if (dramatizationStatus.phase !== 'failed') {
      dramatizationStatus.phase = 'complete';
      dramatizationStatus.currentOperation = 'Dramatization finished';
    }
    isDramatizingInBackground = false;
    backgroundDramatizationAbort = null;
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
        await consolidateChapterFromSubChunks(bookTitle, chapterNum, chapter.title);
        console.log(`  ✅ Consolidated successfully`);
        
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
    const { filename, narratorVoice, targetLanguage } = req.body;
    
    console.log(`📞 /api/book/select called with filename: "${filename}"`);
    console.log(`   Current book: "${CURRENT_BOOK_FILE || 'none'}"`);
    console.log(`   Request from: ${req.headers.origin || 'unknown origin'}`);
    
    // CRITICAL: Update narrator voice BEFORE loadBookFile() runs voice assignment
    if (narratorVoice && typeof narratorVoice === 'string') {
      const oldVoice = NARRATOR_VOICE;
      NARRATOR_VOICE = narratorVoice;
      console.log(`🎙️ Narrator voice set: ${oldVoice} → ${narratorVoice}`);
    }
    
    // Update target language for translation
    // Note: undefined/'original' = no translation, anything else = translate to that language
    if (targetLanguage && typeof targetLanguage === 'string' && targetLanguage !== 'original') {
      TARGET_LANGUAGE = targetLanguage;
      (global as any).TARGET_LANGUAGE = targetLanguage; // Expose for TTS single-word language override
      console.log(`🌍 Target language set: ${getLanguageDisplayName(targetLanguage)}`);
    } else {
      TARGET_LANGUAGE = null;
      (global as any).TARGET_LANGUAGE = null;
      console.log(`🌍 No translation (using original language) - received: "${targetLanguage}"`);
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
    
    // Trigger final consolidation check for previous book when switching
    if (filename !== CURRENT_BOOK_FILE && isDramatizingInBackground) {
      console.log('🛑 Switching books - will stop background dramatization');
      
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
    let existingMetadata = loadAudiobookMetadata(bookTitle);
    const hasLibraryVersion = existingMetadata && existingMetadata.generationStatus === 'completed';
    
    console.log(`📚 Book selected: "${bookTitle}"`);
    console.log(`   Sanitized title: "${bookTitle}"`);
    console.log(`   Metadata exists: ${existingMetadata ? 'YES' : 'NO'}`);
    if (existingMetadata) {
      console.log(`   Generation status: "${existingMetadata.generationStatus}"`);
      console.log(`   Total chapters: ${existingMetadata.totalChapters}`);
      console.log(`   Chapters generated: ${existingMetadata.chapters.filter(c => c && c.isGenerated).length}`);
    }
    console.log(`   Library version: ${hasLibraryVersion ? 'YES' : 'NO'}`);
    
    // IMPORTANT: Create metadata immediately if it doesn't exist
    // This enables position save/load to work from the start
    if (!existingMetadata && BOOK_CHAPTERS.length > 0) {
      console.log(`📝 Creating initial metadata for "${bookTitle}" (on book select)`);
      createAudiobookFolder(bookTitle);
      // Skip index 0 (null placeholder for 1-based indexing)
      const validChapters = BOOK_CHAPTERS.filter((ch, i) => i > 0 && ch !== null);
      const initialMetadata: AudiobookMetadata = {
        title: BOOK_METADATA.title,
        author: BOOK_METADATA.author,
        language: BOOK_METADATA.language || 'unknown',
        totalChapters: validChapters.length,
        chapters: validChapters.map((chapter, i) => ({
          index: i + 1, // 1-based chapter index
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
      console.log(`✅ Initial metadata created with ${validChapters.length} chapters`);
    }
    
    // Calculate effective chunk count (actual or estimated)
    // For background dramatization: use MAX of actual and estimated to ensure reasonable total
    let effectiveTotalChunks = BOOK_INFO.totalChunks; // TOTAL_SUBCHUNKS
    const hasDramatizationPending = (global as any).DRAMATIZATION_ENABLED || isDramatizingInBackground;
    if (hasDramatizationPending && getChapterCount() > 0) {
      // Estimate: each chapter will have ~10 sub-chunks on average
      const estimatedCount = getChapterCount() * 10;
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

// ============================================
// TEXT PASTE TO AUDIOBOOK
// ============================================
/**
 * Create audiobook from pasted text content
 * Supports two modes:
 * - Single chapter: treats entire text as one chapter
 * - Chapter detection: automatically detects chapter markers in text
 * - Base64 EPUB: decodes and processes EPUB file from mobile device
 */
app.post('/api/book/from-text', async (req: Request, res: Response) => {
  try {
    const { text, title, detectChapters, narratorVoice, targetLanguage, isBase64Epub, isBase64File, fileExtension } = req.body;
    
    console.log(`📝 /api/book/from-text called`);
    console.log(`   Title: "${title || 'Untitled'}"`);
    console.log(`   Text length: ${text?.length || 0} chars`);
    console.log(`   Detect chapters: ${detectChapters}`);
    console.log(`   Is Base64 EPUB: ${isBase64Epub || false}`);
    console.log(`   Is Base64 File: ${isBase64File || false}`);
    console.log(`   File Extension: ${fileExtension || 'none'}`);
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Text content is required',
      });
    }
    
    // Handle base64 binary files from mobile device (EPUB, DOCX, PDF, ODT, RTF, etc.)
    let filename: string;
    let filePath: string;
    const safeTitle = title?.replace(/[^a-zA-Z0-9\s]/g, '').trim() || `mobile_file_${Date.now()}`;
    const baseFilename = safeTitle.substring(0, 50).replace(/\s+/g, '_');
    
    // Determine file extension for binary formats
    const ext = fileExtension?.toLowerCase() || 'txt';
    const BINARY_EXTENSIONS = ['epub', 'docx', 'doc', 'odt', 'rtf', 'pdf', 'mobi', 'azw', 'azw3', 'kf8', 'pages', 'wps'];
    const isBinaryFormat = isBase64Epub || isBase64File || BINARY_EXTENSIONS.includes(ext);
    
    if (isBinaryFormat) {
      // Decode base64 and save as binary file with correct extension
      const actualExt = isBase64Epub ? 'epub' : ext;
      filename = `${baseFilename}.${actualExt}`;
      filePath = path.join(ASSETS_DIR, filename);
      
      // Decode base64 to binary buffer
      const binaryBuffer = Buffer.from(text, 'base64');
      fs.writeFileSync(filePath, binaryBuffer);
      console.log(`   Decoded ${actualExt.toUpperCase()} (${binaryBuffer.length} bytes) saved as: ${filename}`);
    } else {
      // Regular text content (TXT, MD, HTML) or text with extension hint
      const textExt = ['txt', 'md', 'markdown', 'html', 'htm'].includes(ext) ? ext : 'txt';
      filename = `${baseFilename}.${textExt}`;
      filePath = path.join(ASSETS_DIR, filename);
      
      // Write text to temp file in assets folder
      fs.writeFileSync(filePath, text.trim(), 'utf8');
      console.log(`   Saved as: ${filename}`);
    }
    
    // Update narrator voice if provided
    if (narratorVoice && typeof narratorVoice === 'string') {
      NARRATOR_VOICE = narratorVoice;
      console.log(`🎙️ Narrator voice set: ${narratorVoice}`);
    }
    
    // Update target language
    if (targetLanguage && typeof targetLanguage === 'string' && targetLanguage !== 'original') {
      TARGET_LANGUAGE = targetLanguage;
      (global as any).TARGET_LANGUAGE = targetLanguage;
      console.log(`🌍 Target language set: ${getLanguageDisplayName(targetLanguage)}`);
    } else {
      TARGET_LANGUAGE = null;
      (global as any).TARGET_LANGUAGE = null;
    }
    
    // Load the book file (with dramatization enabled)
    await loadBookFile(filename, true);
    
    // Return success with book info
    if (!BOOK_METADATA || !BOOK_INFO) {
      throw new Error('Book metadata not loaded properly');
    }
    
    const bookTitle = sanitizeBookTitle(BOOK_METADATA.title);
    console.log(`✅ Text pasted and loaded as: ${bookTitle}`);
    
    res.json({
      success: true,
      filename,
      title: BOOK_METADATA.title,
      author: BOOK_METADATA.author,
      audiobookTitle: bookTitle,
      chapters: BOOK_CHAPTERS.filter((ch, i) => i > 0 && ch !== null).map((ch, i) => ({
        index: i + 1,
        title: ch.title,
        subChunkStart: 0,
        subChunkCount: 10, // Estimated
      })),
      _internal: {
        totalChunks: BOOK_INFO.totalChunks,
        durationSeconds: BOOK_INFO.estimatedDuration,
      },
    });
    
  } catch (error) {
    console.error('✗ Error creating book from text:', error);
    res.status(500).json({
      error: 'Failed to create book from text',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// URL EBOOK DOWNLOAD
// ============================================
/**
 * Download ebook from URL and create audiobook
 * Supports direct links to: .txt, .epub files
 * Does NOT support multi-document pages or HTML pages
 */
app.post('/api/book/from-url', async (req: Request, res: Response) => {
  try {
    const { url, narratorVoice, targetLanguage } = req.body;
    
    console.log(`🌐 /api/book/from-url called`);
    console.log(`   URL: "${url}"`);
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'URL is required',
      });
    }
    
    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({
        error: 'Invalid URL',
        message: 'Please provide a valid URL',
      });
    }
    
    // Only allow http/https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        error: 'Invalid protocol',
        message: 'Only HTTP and HTTPS URLs are supported',
      });
    }
    
    // Get filename from URL path or use timestamp
    const urlPath = parsedUrl.pathname;
    const urlFilename = path.basename(urlPath) || `download_${Date.now()}`;
    const ext = path.extname(urlFilename).toLowerCase();
    
    // Check for supported formats using centralized config
    // Supports: EPUB, TXT, HTML, MOBI/KF8
    const supportedFormats = [...SUPPORTED_EXTENSIONS, '.zip']; // .zip often contains EPUB
    if (ext && !supportedFormats.includes(ext)) {
      return res.status(400).json({
        error: 'Unsupported format',
        message: `Format '${ext}' is not supported. Supported formats: EPUB, TXT, HTML, MOBI.`,
      });
    }
    
    // Download file
    console.log(`   Downloading...`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'VoiceLibri/1.0 (Audiobook Generator)',
        'Accept': 'text/plain, application/epub+zip, */*',
      },
    });
    
    if (!response.ok) {
      console.error(`   Download failed: ${response.status} ${response.statusText}`);
      return res.status(400).json({
        error: 'Download failed',
        message: `Failed to download file: ${response.status} ${response.statusText}`,
      });
    }
    
    // Determine format from content-type header
    const contentType = response.headers.get('content-type') || '';
    const detectedFormat = detectFormat(contentType, urlFilename);
    
    // Determine actual extension - HTML is now supported!
    let actualExt = ext;
    if (!ext || ext === '' || ext === '.zip') {
      if (contentType.includes('epub') || contentType.includes('application/zip') || ext === '.zip') {
        actualExt = '.epub';
      } else if (contentType.includes('text/plain')) {
        actualExt = '.txt';
      } else if (contentType.includes('text/html')) {
        // HTML is supported! Gutenberg provides HTML versions of books
        actualExt = '.html';
      } else if (contentType.includes('mobipocket') || contentType.includes('x-mobi')) {
        actualExt = '.mobi';
      } else if (!ext) {
        return res.status(400).json({
          error: 'Unknown format',
          message: 'Could not determine file format. Supported formats: EPUB, TXT, HTML, MOBI.',
        });
      }
    }
    
    // Generate safe filename
    const safeBasename = urlFilename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 50);
    const finalFilename = actualExt ? 
      (safeBasename.endsWith(actualExt) ? safeBasename : `${safeBasename}${actualExt}`) : 
      safeBasename;
    const filePath = path.join(ASSETS_DIR, finalFilename);
    
    // Save file
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);
    console.log(`   Saved as: ${finalFilename} (${buffer.length} bytes)`);
    
    // Update narrator voice if provided
    if (narratorVoice && typeof narratorVoice === 'string') {
      NARRATOR_VOICE = narratorVoice;
      console.log(`🎙️ Narrator voice set: ${narratorVoice}`);
    }
    
    // Update target language
    if (targetLanguage && typeof targetLanguage === 'string' && targetLanguage !== 'original') {
      TARGET_LANGUAGE = targetLanguage;
      (global as any).TARGET_LANGUAGE = targetLanguage;
      console.log(`🌍 Target language set: ${getLanguageDisplayName(targetLanguage)}`);
    } else {
      TARGET_LANGUAGE = null;
      (global as any).TARGET_LANGUAGE = null;
    }
    
    // Load the book file (with dramatization enabled)
    await loadBookFile(finalFilename, true);
    
    // Return success with book info
    if (!BOOK_METADATA || !BOOK_INFO) {
      throw new Error('Book metadata not loaded properly');
    }
    
    const bookTitle = sanitizeBookTitle(BOOK_METADATA.title);
    console.log(`✅ URL downloaded and loaded as: ${bookTitle}`);
    
    res.json({
      success: true,
      filename: finalFilename,
      title: BOOK_METADATA.title,
      author: BOOK_METADATA.author,
      audiobookTitle: bookTitle,
      chapters: BOOK_CHAPTERS.filter((ch, i) => i > 0 && ch !== null).map((ch, i) => ({
        index: i + 1,
        title: ch.title,
        subChunkStart: 0,
        subChunkCount: 10, // Estimated
      })),
      _internal: {
        totalChunks: BOOK_INFO.totalChunks,
        durationSeconds: BOOK_INFO.estimatedDuration,
      },
    });
    
  } catch (error) {
    console.error('✗ Error creating book from URL:', error);
    res.status(500).json({
      error: 'Failed to download and process ebook',
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
    if (hasDramatizationPending && getChapterCount() > 0) {
      // Estimate: each chapter will have ~10 sub-chunks on average
      const estimatedCount = getChapterCount() * 10;
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

// Get consolidated chapters status - which chapters are ready for navigation
// Used by frontend to implement consolidated-only skip behavior
app.get('/api/book/consolidated', (req: Request, res: Response) => {
  try {
    if (!BOOK_METADATA) {
      return res.status(404).json({
        error: 'No book loaded',
        message: 'Please select a book first',
      });
    }

    const bookTitle = sanitizeBookTitle(BOOK_METADATA.title);
    const chapterCount = getChapterCount();
    
    // Build array of consolidated status for each chapter
    const consolidatedStatus: Array<{
      chapterNum: number;
      title: string;
      isConsolidated: boolean;
      hasSubChunks: boolean;  // Has at least some sub-chunks in temp
    }> = [];
    
    for (let chapterNum = 1; chapterNum <= chapterCount; chapterNum++) {
      const chapterTitle = BOOK_CHAPTERS[chapterNum]?.title;
      const isConsolidated = isChapterConsolidated(bookTitle, chapterNum, chapterTitle);
      const subChunkCount = countChapterSubChunks(bookTitle, chapterNum);
      
      consolidatedStatus.push({
        chapterNum,
        title: chapterTitle || `Chapter ${chapterNum}`,
        isConsolidated,
        hasSubChunks: subChunkCount > 0,
      });
    }
    
    // Find highest consolidated chapter (for skip forward limit)
    const highestConsolidated = consolidatedStatus
      .filter(c => c.isConsolidated)
      .map(c => c.chapterNum)
      .reduce((max, n) => Math.max(max, n), 0);
    
    res.json({
      bookTitle,
      totalChapters: chapterCount,
      consolidatedChapters: consolidatedStatus.filter(c => c.isConsolidated).length,
      highestConsolidated,
      chapters: consolidatedStatus,
      generatingInBackground: isDramatizingInBackground, // TTS now runs inside dramatization
      dramatizingInBackground: isDramatizingInBackground,
    });
  } catch (error) {
    console.error('✗ Error fetching consolidated status:', error);
    res.status(500).json({
      error: 'Failed to retrieve consolidated status',
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
      bookFile,
      targetLanguage          // Target language for translation
    } = req.body;

    // CRITICAL: Check if target language has EXPLICITLY changed → trigger re-dramatization
    // FIX Issue 3: Only change language if explicitly provided (not undefined)
    // When frontend doesn't send targetLanguage, preserve the current setting
    const previousTargetLang = TARGET_LANGUAGE;
    
    // Only compute newTargetLang if targetLanguage was explicitly provided
    // undefined = not provided = keep previous value
    // 'original' = explicitly requested original = set to null
    // other value = explicitly requested language = set to that value
    let newTargetLang: string | null;
    if (targetLanguage === undefined) {
      // Not provided - preserve current setting
      newTargetLang = previousTargetLang;
      console.log(`🔍 Language check: not provided, keeping previous="${previousTargetLang}"`);
    } else if (targetLanguage === 'original' || targetLanguage === null) {
      // Explicitly requested original language
      newTargetLang = null;
      console.log(`🔍 Language check: explicitly set to original`);
    } else {
      // Explicitly requested a specific language
      newTargetLang = targetLanguage;
      console.log(`🔍 Language check: explicitly set to "${targetLanguage}"`);
    }
    
    if (newTargetLang !== previousTargetLang) {
      console.log(`\n🔄 TARGET LANGUAGE CHANGED: ${previousTargetLang || 'original'} → ${newTargetLang || 'original'}`);
      
      // Update target language
      TARGET_LANGUAGE = newTargetLang;
      (global as any).TARGET_LANGUAGE = newTargetLang; // Expose for TTS single-word language override
      
      if (newTargetLang) {
        console.log(`🌍 Target language updated: ${getLanguageDisplayName(newTargetLang)}`);
      } else {
        console.log(`🌍 Target language cleared (using original)`);
      }
      
      // Clear existing dramatization and trigger re-processing
      console.log('🔄 Clearing cached dramatization...');
      CHAPTER_DRAMATIZED.clear();
      CHAPTER_SUBCHUNKS.clear();
      TOTAL_SUBCHUNKS = 0;
      
      // Delete existing audiobook folder to force regeneration
      if (BOOK_METADATA) {
        const bookTitle = sanitizeBookTitle(BOOK_METADATA.title || CURRENT_BOOK_FILE || 'Unknown');
        const audiobookPath = path.join(getAudiobooksDir(), bookTitle);
        try {
          await fs.promises.rm(audiobookPath, { recursive: true, force: true });
          console.log(`🗑️ Deleted existing audiobook: ${bookTitle}`);
        } catch (e) {
          console.warn('⚠️ Failed to delete audiobook folder:', e);
        }
      }
      
      // Trigger re-dramatization
      if ((global as any).DRAMATIZATION_ENABLED && BOOK_METADATA) {
        console.log('🚀 Starting re-dramatization with new language...');
        isDramatizingInBackground = true;
        
        // Import necessary modules
        const { CharacterRegistry } = await import('./characterRegistry.js');
        const { GeminiCharacterAnalyzer } = await import('./llmCharacterAnalyzer.js');
        
        // Create GeminiConfig from environment
        const geminiConfig: GeminiConfig = {
          projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
          location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
        };
        
        const characterRegistry = new CharacterRegistry(geminiConfig);
        characterRegistry.setNarratorVoice(NARRATOR_VOICE);
        const analyzer = new GeminiCharacterAnalyzer(geminiConfig);
        
        startBackgroundDramatization(characterRegistry, analyzer).catch(err => 
          console.error('❌ Re-dramatization failed:', err)
        );
      }
    }

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
    
    // PRIORITY 1: Check for existing sub-chunk file (during generation)
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
        res.setHeader('X-Total-Chunks', TOTAL_SUBCHUNKS.toString());
        res.setHeader('X-Dramatization-Pending', isDramatizingInBackground.toString());
        
        return res.send(cachedAudio);
      }
    }
    
    // PRIORITY 2: Check if chapter is consolidated → serve whole chapter file
    // Sub-chunks are deleted after consolidation, so serve the chapter for seeking
    if (isChapterConsolidated(bookTitle, chapterNum, chapterTitle)) {
      const chapterAudio = loadChapterFile(bookTitle, chapterNum, chapterTitle);
      
      if (chapterAudio) {
        const cacheTime = Date.now() - requestStartTime;
        console.log(`📦 Serving whole chapter file: ${chapterNum} (${cacheTime}ms) - sub-chunks were cleaned up`);
        
        // Calculate seek offset in seconds based on requested sub-chunk index
        // Total chapter duration from audio buffer (24kHz, mono, 16-bit = 48000 bytes/sec)
        const chapterDurationSec = (chapterAudio.length - 44) / 48000; // minus WAV header
        const chapterSubChunks = CHAPTER_SUBCHUNKS.get(chapterNum);
        const totalSubChunks = chapterSubChunks?.length || 1;
        
        // Approximate seek position: (subChunkIndex / totalSubChunks) * totalDuration
        // This assumes roughly equal sub-chunk durations
        const seekOffsetSec = (localSubChunkIndex / totalSubChunks) * chapterDurationSec;
        
        console.log(`   Seek offset: ${seekOffsetSec.toFixed(2)}s (subChunk ${localSubChunkIndex}/${totalSubChunks}, chapter ${chapterDurationSec.toFixed(1)}s)`);
        
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Length', chapterAudio.length.toString());
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('X-Cache', 'CHAPTER_FILE');
        res.setHeader('X-Chapter-Num', chapterNum.toString());
        res.setHeader('X-Is-Whole-Chapter', 'true');
        res.setHeader('X-Seek-Offset-Sec', seekOffsetSec.toFixed(3));
        res.setHeader('X-Total-SubChunks', totalSubChunks.toString());
        res.setHeader('X-Requested-SubChunk', localSubChunkIndex.toString());
        res.setHeader('X-Total-Chunks', TOTAL_SUBCHUNKS.toString());
        res.setHeader('X-Dramatization-Pending', isDramatizingInBackground.toString());
        
        return res.send(chapterAudio);
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
    
    // CRITICAL: Block if requested chapter hasn't been dramatized yet
    // This prevents frontend from polling for audio before it's ready
    if (isDramatizingInBackground) {
      const chapterDramatized = CHAPTER_SUBCHUNKS.has(chapterNum);
      
      if (!chapterDramatized) {
        // Check for timeout
        const now = Date.now();
        const isTimedOut = dramatizationStatus.lastActivityAt && 
          (now - dramatizationStatus.lastActivityAt) > DRAMATIZATION_TIMEOUT_MS;
        
        if (isTimedOut) {
          console.error(`⏱️ TIMEOUT: No activity for ${Math.round((now - dramatizationStatus.lastActivityAt!) / 1000)}s`);
          dramatizationStatus.phase = 'failed';
          dramatizationStatus.error = 'Dramatization timeout - no progress detected';
          isDramatizingInBackground = false;
          
          return res.status(500).json({
            error: 'Dramatization timeout',
            message: `Chapter ${chapterNum} dramatization timed out. Current phase: ${dramatizationStatus.currentOperation}`,
            status: dramatizationStatus,
          });
        }
        
        console.log(`⏳ Chapter ${chapterNum} not dramatized yet (currently on chapter ${dramatizationStatus.currentChapter})`);
        return res.status(202).json({
          error: 'Chapter not ready',
          message: `Chapter ${chapterNum} is still being processed. Current: ${dramatizationStatus.currentOperation}`,
          chapterNum,
          status: dramatizationStatus,
          retryAfterMs: 3000,
        });
      }
    }
    
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
      if (isDramatizingInBackground || hasDramatizationPending) {
        console.log(`⏳ Chunk ${globalChunkIndex} not ready yet (have ${TOTAL_SUBCHUNKS}/${estimatedTotalChunks}), background processing in progress...`);
        return res.status(202).json({
          error: 'Chunk not ready',
          message: `Sub-chunk ${globalChunkIndex} is still being generated. Please retry in a few seconds.`,
          totalChunks: estimatedTotalChunks,
          actualChunks: TOTAL_SUBCHUNKS,
          generatingInBackground: isDramatizingInBackground,
          dramatizingInBackground: isDramatizingInBackground,
          retryAfterMs: 3000,
        });
      }
    }

    // ========================================
    // READ-ONLY MODE: No on-demand generation!
    // Player can ONLY serve existing files from disk/cache.
    // Background process is the ONLY producer of audio.
    // ========================================
    
    // If we reach here, audio doesn't exist anywhere - return 202
    // The background generation will eventually create it
    console.log(`⏳ Audio not ready: chapter ${chapterNum}:${localSubChunkIndex}`);
    
    return res.status(202).json({
      error: 'Audio not ready',
      message: `Audio for chapter ${chapterNum}, sub-chunk ${localSubChunkIndex} is still being generated. Please retry.`,
      chapterNum,
      subChunkIndex: localSubChunkIndex,
      totalChunks: TOTAL_SUBCHUNKS,
      generatingInBackground: isDramatizingInBackground,
      dramatizingInBackground: isDramatizingInBackground,
      retryAfterMs: 2000,
    });
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
 * Delete an audiobook from library
 * 
 * DELETE /api/audiobooks/:bookTitle
 */
app.delete('/api/audiobooks/:bookTitle', (req: Request, res: Response) => {
  try {
    const { bookTitle } = req.params;
    
    if (!bookTitle) {
      return res.status(400).json({
        error: 'Missing bookTitle',
        message: 'bookTitle is required',
      });
    }
    
    const success = deleteAudiobook(bookTitle);
    
    if (!success) {
      return res.status(404).json({
        error: 'Audiobook not found',
        message: `No audiobook found with title: ${bookTitle}`,
      });
    }
    
    console.log(`✓ Deleted audiobook: ${bookTitle}`);
    res.json({
      success: true,
      message: `Audiobook "${bookTitle}" deleted successfully`,
    });
  } catch (error) {
    console.error('✗ Error deleting audiobook:', error);
    res.status(500).json({
      error: 'Failed to delete audiobook',
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
      
      // Check for voice tags (SPEAKER: format)
      isDramatized = /^[A-Z][A-Z0-9]*:\s/m.test(bookText);
      
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
        tempChunksCount: 0,
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
      [],
      voiceMap,
      defaultVoice,
      isDramatized
    );
    
    console.log(`✓ Started audiobook generation: "${bookTitle}"`);
    
    res.json({
      success: true,
      bookTitle,
      metadata: audiobookMetadata,
      totalChunks: 0,
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
    // PHASE 2 cleanup: dramatizeBook and onProgress removed. Implement new dramatization logic here if needed.
    res.json({
      success: false,
      message: 'Dramatization endpoint under refactor. Please use hybrid dramatization.',
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
 * Stream subchunk audio in real-time during generation
 * 
 * GET /api/audiobooks/:bookTitle/subchunks/:chapterIndex/:subChunkIndex
 * Returns audio for specific subchunk, waiting if necessary during generation
 */
app.get('/api/audiobooks/:bookTitle/subchunks/:chapterIndex/:subChunkIndex', async (req: Request, res: Response) => {
  try {
    const { bookTitle, chapterIndex, subChunkIndex } = req.params;
    const chapterNum = parseInt(chapterIndex);
    const subChunkNum = parseInt(subChunkIndex);
    
    if (isNaN(chapterNum) || isNaN(subChunkNum)) {
      return res.status(400).json({
        error: 'Invalid parameters',
        message: 'chapterIndex and subChunkIndex must be numbers',
      });
    }
    
    console.log(`🎧 Streaming subchunk: ${bookTitle} chapter ${chapterNum}, subchunk ${subChunkNum}`);
    
    // Check if subchunk exists
    if (subChunkExists(bookTitle, chapterNum, subChunkNum)) {
      const audio = loadSubChunk(bookTitle, chapterNum, subChunkNum);
      if (audio) {
        console.log(`✅ Serving existing subchunk: ${chapterNum}:${subChunkNum}`);
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Length', audio.length.toString());
        res.setHeader('X-SubChunk-Status', 'ready');
        return res.send(audio);
      }
    }
    
    // If not found, wait for generation (polling with timeout)
    const maxWaitMs = 30000; // 30 seconds max wait
    const pollIntervalMs = 500; // Check every 500ms
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      if (subChunkExists(bookTitle, chapterNum, subChunkNum)) {
        const audio = loadSubChunk(bookTitle, chapterNum, subChunkNum);
        if (audio) {
          const waitTime = Date.now() - startTime;
          console.log(`✅ Serving generated subchunk: ${chapterNum}:${subChunkNum} (waited ${waitTime}ms)`);
          res.setHeader('Content-Type', 'audio/wav');
          res.setHeader('Content-Length', audio.length.toString());
          res.setHeader('X-SubChunk-Status', 'generated');
          res.setHeader('X-Wait-Time', waitTime.toString());
          return res.send(audio);
        }
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
    
    // Timeout - subchunk not ready
    console.log(`❌ Timeout waiting for subchunk: ${chapterNum}:${subChunkNum}`);
    return res.status(404).json({
      error: 'SubChunk not ready',
      message: `SubChunk ${chapterNum}:${subChunkNum} is not yet available`,
      waitedMs: Date.now() - startTime
    });
    
  } catch (error) {
    console.error('✗ Error streaming subchunk:', error);
    res.status(500).json({
      error: 'Failed to stream subchunk',
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
// Bind to 0.0.0.0 to accept connections from all network interfaces
// This allows mobile devices on the same network to connect
// Per Express.js docs: https://expressjs.com/en/api.html#app.listen
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   VoiceLibri Backend v1.0             ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`   Network: http://192.168.1.20:${PORT}`);
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
});
