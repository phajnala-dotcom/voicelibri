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
import { loadVoiceMap } from './voiceAssigner.js';
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
  extractChunkFromConsolidated
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
  type AudiobookMetadata
} from './audiobookManager.js';
import { 
  extractEpubChapters, 
  detectTextChapters, 
  createSingleChapter,
  type Chapter 
} from './bookChunker.js';
import { chunkBookByChapters, type ChunkInfo } from './chapterChunker.js';
import { audiobookWorker } from './audiobookWorker.js';

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
let BOOK_CHUNKS: string[] = [];
let BOOK_CHAPTERS: Chapter[] = []; // NEW: Store extracted chapters
let CHUNK_INFOS: ChunkInfo[] = []; // NEW: Store chunk metadata with chapter mapping
let BOOK_METADATA: BookMetadata | null = null;
let BOOK_INFO: ReturnType<typeof getBookInfo> | null = null;
let BOOK_FORMAT: 'txt' | 'epub' | 'pdf' = 'txt';
let CURRENT_BOOK_FILE: string = '';
let ASSETS_DIR: string;

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
function loadBookFile(filename: string): void {
  const bookPath = path.join(ASSETS_DIR, filename);
  
  if (!fs.existsSync(bookPath)) {
    throw new Error(`Book file not found: ${filename}`);
  }
  
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
    
    // Extract chapters from EPUB
    BOOK_CHAPTERS = extractEpubChapters(epubBuffer);
    console.log(`✓ Extracted ${BOOK_CHAPTERS.length} chapters from EPUB`);
    
  } else if (ext === '.txt') {
    BOOK_FORMAT = 'txt';
    console.log(`📄 Loading TXT: ${filename}`);
    
    // Load TXT
    BOOK_TEXT = fs.readFileSync(bookPath, 'utf-8');
    
    // Parse metadata from TXT
    BOOK_METADATA = parseBookMetadata(BOOK_TEXT, 'txt');
    
    // Detect chapters in TXT
    BOOK_CHAPTERS = detectTextChapters(BOOK_TEXT);
    console.log(`✓ Detected ${BOOK_CHAPTERS.length} chapters in TXT`);
    
  } else if (ext === '.pdf') {
    BOOK_FORMAT = 'pdf';
    console.log(`📕 Loading PDF: ${filename}`);
    
    // TODO: Implement PDF loading
    throw new Error('PDF format not yet supported');
    
  } else {
    throw new Error(`Unsupported book format: ${ext}`);
  }
  
  // Chunk the book using chapter-aware chunking
  const hasVoiceTags = /\[VOICE=.*?\]/.test(BOOK_TEXT);
  console.log(hasVoiceTags ? '📢 Detected voice tags - using dramatized chapter chunking' : '📄 Using regular chapter chunking');
  
  const chunkingResult = chunkBookByChapters(BOOK_CHAPTERS, hasVoiceTags);
  CHUNK_INFOS = chunkingResult.chunks;
  BOOK_CHUNKS = chunkingResult.chunks.map(c => c.text);
  
  console.log(`✓ Chapter-aware chunking complete:`);
  console.log(`   ${BOOK_CHAPTERS.length} chapters`);
  console.log(`   ${BOOK_CHUNKS.length} total chunks`);
  console.log(`   Chunks per chapter: ${chunkingResult.chapterChunkCounts.join(', ')}`);
  
  BOOK_INFO = getBookInfo(BOOK_CHUNKS);
  
  // Clear audio cache when switching books
  audioCache.clear();
  
  CURRENT_BOOK_FILE = filename;
  
  console.log('✓ Book loaded and chunked successfully');
  console.log(`  Format: ${BOOK_FORMAT.toUpperCase()}`);
  console.log(`  Title: ${BOOK_METADATA.title}`);
  console.log(`  Author: ${BOOK_METADATA.author}`);
  console.log(`  Language: ${BOOK_METADATA.language || 'auto-detect'}`);
  console.log(`  Total chunks: ${BOOK_INFO.totalChunks}`);
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
 * Continuously generate chunks in background in batches of 3
 * Runs independently of playback to build up buffer
 * @param bookTitle - Sanitized book title
 * @param voiceMap - Character to voice mapping
 * @param defaultVoice - Default voice for narrator
 */
async function startContinuousGeneration(
  bookTitle: string,
  voiceMap: Record<string, string> = {},
  defaultVoice: string = 'Algieba'
): Promise<void> {
  if (isGeneratingInBackground) {
    console.log('🔄 Background generation already running');
    return;
  }

  isGeneratingInBackground = true;
  backgroundGenerationAbort = new AbortController();
  const BATCH_SIZE = 3;
  
  console.log('🚀 Starting continuous background generation...');
  
  try {
    let nextChunkToGenerate = 0;
    
    while (nextChunkToGenerate < BOOK_CHUNKS.length && !backgroundGenerationAbort.signal.aborted) {
      // Find next batch of chunks that need generation
      const batchIndices: number[] = [];
      const batchTexts: string[] = [];
      
      for (let i = 0; i < BATCH_SIZE && nextChunkToGenerate < BOOK_CHUNKS.length; i++) {
        if (!tempChunkExists(bookTitle, nextChunkToGenerate)) {
          batchIndices.push(nextChunkToGenerate);
          batchTexts.push(BOOK_CHUNKS[nextChunkToGenerate]);
        }
        nextChunkToGenerate++;
      }
      
      if (batchIndices.length > 0) {
        console.log(`📦 Background generating batch: ${batchIndices.join(', ')}`);
        await generateMultipleTempChunks(batchIndices, batchTexts, bookTitle, voiceMap, defaultVoice);
        console.log(`✅ Batch complete: ${batchIndices.join(', ')}`);
        
        // Check if any chapters can be consolidated now
        await checkAndConsolidateReadyChapters(bookTitle);
      } else {
        // All chunks in this range already exist, skip ahead
        console.log(`⏭️ Chunks ${nextChunkToGenerate - BATCH_SIZE} to ${nextChunkToGenerate - 1} already cached`);
      }
      
      // Check if aborted between batches
      if (backgroundGenerationAbort.signal.aborted) {
        console.log('🛑 Background generation aborted');
        break;
      }
    }
    
    if (!backgroundGenerationAbort.signal.aborted) {
      console.log('🎉 All chunks generated! Checking for any remaining consolidation...');
      await checkAndConsolidateReadyChapters(bookTitle);
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
 * Check all chapters and consolidate any that have all their chunks ready
 * This allows playback from consolidated files while generation is still ongoing
 * @param bookTitle - Sanitized book title
 */
async function checkAndConsolidateReadyChapters(bookTitle: string): Promise<void> {
  try {
    console.log(`🔍 Consolidation check for "${bookTitle}"...`);
    console.log(`   BOOK_CHAPTERS: ${BOOK_CHAPTERS?.length || 0}`);
    console.log(`   CHUNK_INFOS: ${CHUNK_INFOS?.length || 0}`);
    
    if (!BOOK_CHAPTERS || BOOK_CHAPTERS.length === 0 || CHUNK_INFOS.length === 0) {
      console.log(`   ⚠️ Skipping: No chapter info available`);
      return; // Can't consolidate without chapter info
    }
    
    // Build chapter-to-chunk mapping from CHUNK_INFOS
    const chapterChunkMap = new Map<number, number[]>();
    for (const chunkInfo of CHUNK_INFOS) {
      if (!chapterChunkMap.has(chunkInfo.chapterIndex)) {
        chapterChunkMap.set(chunkInfo.chapterIndex, []);
      }
      chapterChunkMap.get(chunkInfo.chapterIndex)!.push(chunkInfo.globalChunkIndex);
    }
    
    // Check each chapter to see if it's ready for consolidation
    console.log(`   Checking ${BOOK_CHAPTERS.length} chapters for consolidation...`);
    for (let chapterIndex = 0; chapterIndex < BOOK_CHAPTERS.length; chapterIndex++) {
      const chapter = BOOK_CHAPTERS[chapterIndex];
      const chunkIndices = chapterChunkMap.get(chapterIndex) || [];
      
      if (chunkIndices.length === 0) continue;
      
      // Check if chapter is already consolidated
      const audiobooksDir = getAudiobooksDir();
      const bookDir = path.join(audiobooksDir, bookTitle);
      const chapterPrefix = `${(chapterIndex + 1).toString().padStart(2, '0')}_`;
      const consolidatedFiles = fs.existsSync(bookDir) 
        ? fs.readdirSync(bookDir).filter(f => f.startsWith(chapterPrefix) && f.endsWith('.wav'))
        : [];
      
      if (consolidatedFiles.length > 0) {
        // Chapter already consolidated
        continue;
      }
      
      // Check if all chunks for this chapter exist
      let allChapterChunksExist = true;
      for (const chunkIndex of chunkIndices) {
        if (!tempChunkExists(bookTitle, chunkIndex)) {
          allChapterChunksExist = false;
          break;
        }
      }
      
      if (!allChapterChunksExist) {
        console.log(`   Chapter ${chapterIndex + 1}: Not ready (missing chunks)`);
        continue;
      }
      
      if (allChapterChunksExist) {
        // Consolidate this chapter
        console.log(`📦 Chapter ${chapterIndex + 1}/${BOOK_CHAPTERS.length} ready: "${chapter.title}" (${chunkIndices.length} chunks)`);
        
        try {
          const chapterPaths = await consolidateChapterSmart(bookTitle, chapter, chunkIndices);
          console.log(`  ✅ Consolidated: ${chapterPaths.length} file(s) created`);
          
          // Delete temp chunks for this chapter
          deleteChapterTempChunks(bookTitle, chunkIndices);
          
          // Update metadata for this chapter
          const metadata = loadAudiobookMetadata(bookTitle);
          if (metadata && metadata.chapters[chapterIndex]) {
            metadata.chapters[chapterIndex].isGenerated = true;
            metadata.chapters[chapterIndex].tempChunksGenerated = chunkIndices.length;
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
          console.error(`  ❌ Failed to consolidate chapter ${chapterIndex + 1}:`, error);
        }
      }
    }
    
    // Create initial metadata if it doesn't exist (for first run)
    const metadata = loadAudiobookMetadata(bookTitle);
    if (!metadata && BOOK_CHAPTERS.length > 0 && CHUNK_INFOS.length > 0) {
      console.log(`📝 Creating initial metadata for "${bookTitle}"`);
      
      // Count chunks per chapter from CHUNK_INFOS
      const chapterChunkCounts = new Map<number, number>();
      for (const chunkInfo of CHUNK_INFOS) {
        chapterChunkCounts.set(
          chunkInfo.chapterIndex, 
          (chapterChunkCounts.get(chunkInfo.chapterIndex) || 0) + 1
        );
      }
      
      const newMetadata: AudiobookMetadata = {
        title: BOOK_METADATA?.title || 'Unknown',
        author: BOOK_METADATA?.author || 'Unknown',
        language: BOOK_METADATA?.language || 'unknown',
        totalChapters: BOOK_CHAPTERS.length,
        chapters: BOOK_CHAPTERS.map((chapter, i) => ({
          index: i,
          title: chapter.title,
          filename: `Ch${(i + 1).toString().padStart(2, '0')}_${sanitizeChapterTitle(chapter.title)}.wav`,
          duration: 0,
          isGenerated: false,
          tempChunksCount: chapterChunkCounts.get(i) || 0,
          tempChunksGenerated: 0,
        })),
        generationStatus: 'in-progress',
        lastUpdated: new Date().toISOString(),
        sourceFile: CURRENT_BOOK_FILE,
      };
      saveAudiobookMetadata(bookTitle, newMetadata);
      console.log(`✅ Initial metadata created with ${BOOK_CHAPTERS.length} chapters`);
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
    const { filename } = req.body;
    
    console.log(`📞 /api/book/select called with filename: "${filename}"`);
    console.log(`   Current book: "${CURRENT_BOOK_FILE || 'none'}"`);
    console.log(`   Request from: ${req.headers.origin || 'unknown origin'}`);
    
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
      if (BOOK_METADATA && CHUNK_INFOS.length > 0) {
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
    
    // Load the new book
    loadBookFile(filename);
    
    console.log(`✓ Switched to book: ${filename}`);
    
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
    
    res.json({
      success: true,
      book: {
        filename: CURRENT_BOOK_FILE,
        format: BOOK_FORMAT,
        title: BOOK_METADATA.title,
        author: BOOK_METADATA.author,
        language: BOOK_METADATA.language,
        totalChunks: BOOK_INFO.totalChunks,
        estimatedDuration: formatDuration(BOOK_INFO.estimatedDuration),
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

// TTS endpoint - read sample text (POC 1.0 - now using first chunk from book)
app.post('/api/tts/read-sample', async (req: Request, res: Response) => {
  try {
    // Use first chunk from book instead of sample_text.txt
    const sampleText = BOOK_CHUNKS[0];
    console.log('🎤 TTS request received (first chunk from book)');
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

    res.json({
      title: BOOK_METADATA!.title,
      author: BOOK_METADATA!.author,
      language: BOOK_METADATA!.language,
      estimatedDuration: formatDuration(BOOK_INFO!.estimatedDuration), // "hh:mm" format
      // Internal data for frontend calculations (not displayed to user)
      _internal: {
        totalChunks: BOOK_INFO!.totalChunks,
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
app.post('/api/tts/chunk', async (req: Request, res: Response) => {
  try {
    const { chunkIndex, voiceName = 'Algieba', bookFile } = req.body;

    // CRITICAL: Ensure a book is loaded before processing chunks
    if (!BOOK_METADATA || !BOOK_CHUNKS || BOOK_CHUNKS.length === 0) {
      console.error('❌ No book loaded! BOOK_METADATA:', !!BOOK_METADATA, 'BOOK_CHUNKS:', BOOK_CHUNKS?.length || 0);
      return res.status(400).json({
        error: 'No book loaded',
        message: 'Please select a book first using /api/book/select',
      });
    }

    // Validate chunk index
    if (typeof chunkIndex !== 'number' || chunkIndex < 0 || chunkIndex >= BOOK_CHUNKS.length) {
      console.error(`❌ Invalid chunk index ${chunkIndex} (valid range: 0-${BOOK_CHUNKS.length - 1})`);
      console.error(`   Book title: "${BOOK_METADATA?.title}"`);
      console.error(`   Total chunks: ${BOOK_CHUNKS.length}`);
      return res.status(400).json({
        error: 'Invalid chunk index',
        message: `Chunk index ${chunkIndex} is out of range. Valid range: 0-${BOOK_CHUNKS.length - 1}`,
        totalChunks: BOOK_CHUNKS.length,
      });
    }

    console.log(`🎤 TTS chunk request: ${chunkIndex} / ${BOOK_CHUNKS.length - 1} (voice: ${voiceName})`);
    const requestStartTime = Date.now();

    const bookTitle = sanitizeBookTitle(BOOK_METADATA?.title || bookFile || CURRENT_BOOK_FILE || 'Unknown');
    console.log(`  📁 Looking for audio with bookTitle: "${bookTitle}" (from: ${BOOK_METADATA?.title ? 'BOOK_METADATA.title' : bookFile ? 'bookFile param' : CURRENT_BOOK_FILE ? 'CURRENT_BOOK_FILE' : 'fallback'})`);
    
    // PRIORITY 1: Check for consolidated chapter file (PRIMARY playback source)
    const metadata = loadAudiobookMetadata(bookTitle);
    if (metadata && metadata.generationStatus === 'completed') {
      // Find the first consolidated chapter file (glob pattern to catch any naming)
      const bookDir = path.join(getAudiobooksDir(), bookTitle);
      let consolidatedFiles: string[] = [];
      
      if (fs.existsSync(bookDir)) {
        const files = fs.readdirSync(bookDir);
        // Match new format: "01_Title.wav" or "01_Title_Part 01.wav" (no "Ch" prefix)
        consolidatedFiles = files.filter(f => /^\d{2}_.*\.wav$/.test(f));
      }
      
      if (consolidatedFiles.length > 0) {
        const chapterPath = path.join(bookDir, consolidatedFiles[0]);
        console.log(`  📚 Consolidated file exists: ${consolidatedFiles[0]} - extracting chunk ${chunkIndex}`);
        
        // Extract chunk from consolidated file
        const chunkAudio = extractChunkFromConsolidated(bookTitle, 0, chunkIndex);
        
        if (chunkAudio) {
          const cacheTime = Date.now() - requestStartTime;
          console.log(`✅ Serving chunk ${chunkIndex} from consolidated file (${cacheTime}ms)`);
          
          res.setHeader('Content-Type', 'audio/wav');
          res.setHeader('Content-Length', chunkAudio.length.toString());
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('X-Cache', 'CONSOLIDATED');
          
          return res.send(chunkAudio);
        } else {
          console.error(`❌ Failed to extract chunk ${chunkIndex} from consolidated file`);
          // Fall through to temp file or regeneration
        }
      }
    }
    
    // PRIORITY 2: Check for temp file (used during generation, fallback)
    if (tempChunkExists(bookTitle, chunkIndex)) {
      const cacheTime = Date.now() - requestStartTime;
      console.log(`💾 Serving from temp file: chunk ${chunkIndex} (${cacheTime}ms)`);
      const cachedAudio = loadTempChunk(bookTitle, chunkIndex);
      
      if (cachedAudio) {
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Length', cachedAudio.length.toString());
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('X-Cache', 'TEMP_FILE');
        
        return res.send(cachedAudio);
      }
    }

    // Create cache key: "chunkIndex:voiceName" (memory cache for backward compatibility)
    const cacheKey = `${chunkIndex}:${voiceName}`;

    // Check memory cache
    if (audioCache.has(cacheKey)) {
      const cacheTime = Date.now() - requestStartTime;
      console.log(`✓ Using cached audio for chunk ${chunkIndex} with voice ${voiceName} (${cacheTime}ms)`);
      const cachedAudio = audioCache.get(cacheKey)!;
      
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Length', cachedAudio.length.toString());
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('X-Cache', 'MEMORY');
      
      return res.send(cachedAudio);
    }

    // Get chunk text
    const chunkText = BOOK_CHUNKS[chunkIndex];
    
    // PHASE 3: Generate and save to temp file
    const voiceMapPath = path.join(ASSETS_DIR, 'dramatized_output', 'voice_map_poc.json');
    const voiceMap = fs.existsSync(voiceMapPath) 
      ? await loadVoiceMap(voiceMapPath)
      : {};
    
    const tempResult = await generateAndSaveTempChunk(
      chunkIndex,
      chunkText,
      bookTitle,
      voiceMap,
      voiceName
    );
    
    const audioBuffer = tempResult.audioBuffer;
    
    // Cache in memory too (for backward compatibility)
    const totalTime = Date.now() - requestStartTime;
    audioCache.set(cacheKey, audioBuffer);
    console.log(`✓ Audio generated and cached: ${audioBuffer.length} bytes (TOTAL TIME: ${totalTime}ms = ${(totalTime/1000).toFixed(1)}s)`);

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
