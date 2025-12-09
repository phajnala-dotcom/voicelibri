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
let BOOK_METADATA: BookMetadata | null = null;
let BOOK_INFO: ReturnType<typeof getBookInfo> | null = null;
let BOOK_FORMAT: 'txt' | 'epub' | 'pdf' = 'txt';
let CURRENT_BOOK_FILE: string = '';
let ASSETS_DIR: string;

// Audio cache for generated chunks - key format: "chunkIndex:voiceName"
const audioCache = new Map<string, Buffer>();

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
    
  } else if (ext === '.txt') {
    BOOK_FORMAT = 'txt';
    console.log(`📄 Loading TXT: ${filename}`);
    
    // Load TXT
    BOOK_TEXT = fs.readFileSync(bookPath, 'utf-8');
    
    // Parse metadata from TXT
    BOOK_METADATA = parseBookMetadata(BOOK_TEXT, 'txt');
    
  } else if (ext === '.pdf') {
    BOOK_FORMAT = 'pdf';
    console.log(`📕 Loading PDF: ${filename}`);
    
    // TODO: Implement PDF loading
    throw new Error('PDF format not yet supported');
    
  } else {
    throw new Error(`Unsupported book format: ${ext}`);
  }
  
  // Chunk the book (check for voice tags first)
  const hasVoiceTags = /\[VOICE=.*?\]/.test(BOOK_TEXT);
  
  if (hasVoiceTags) {
    console.log('📢 Detected voice tags - using dramatized chunking');
    // Use voice-aware chunking that preserves tags
    const segments = extractVoiceSegments(BOOK_TEXT);
    console.log(`   Found ${segments.length} voice segments`);
    
    if (segments.length > 0) {
      // For dramatized text: Each segment becomes one chunk
      // This ensures voice tags are never split and chunks align with speaker changes
      BOOK_CHUNKS = segments.map((segment, index) => {
        const chunkText = `[VOICE=${segment.speaker}]\n${segment.text}\n[/VOICE]`;
        console.log(`   Chunk ${index}: ${segment.speaker} (${segment.text.length} chars)`);
        return chunkText;
      });
    } else {
      // Fallback to regular chunking
      console.log('   No segments found, using regular chunking');
      BOOK_CHUNKS = chunkBookText(BOOK_TEXT);
    }
  } else {
    // Regular chunking for non-dramatized text
    console.log('📄 No voice tags detected - using regular chunking');
    BOOK_CHUNKS = chunkBookText(BOOK_TEXT);
  }
  
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

// Get list of available books
app.get('/api/books', (req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(ASSETS_DIR);
    
    // Filter supported book formats
    const bookFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.epub', '.txt', '.pdf'].includes(ext);
    });
    
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
    
    // Load the new book
    loadBookFile(filename);
    
    console.log(`✓ Switched to book: ${filename}`);
    
    // Return book info (after loadBookFile, these should be populated)
    if (!BOOK_METADATA || !BOOK_INFO) {
      throw new Error('Book metadata not loaded properly');
    }
    
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
    const { chunkIndex, voiceName = 'Algieba' } = req.body;

    // Validate chunk index
    if (typeof chunkIndex !== 'number' || chunkIndex < 0 || chunkIndex >= BOOK_CHUNKS.length) {
      return res.status(400).json({
        error: 'Invalid chunk index',
        message: `Chunk index must be between 0 and ${BOOK_CHUNKS.length - 1}`,
      });
    }

    console.log(`🎤 TTS chunk request: ${chunkIndex} / ${BOOK_CHUNKS.length - 1} (voice: ${voiceName})`);

    // Create cache key: "chunkIndex:voiceName"
    const cacheKey = `${chunkIndex}:${voiceName}`;

    // Check cache first
    if (audioCache.has(cacheKey)) {
      console.log(`✓ Using cached audio for chunk ${chunkIndex} with voice ${voiceName}`);
      const cachedAudio = audioCache.get(cacheKey)!;
      
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Length', cachedAudio.length.toString());
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('X-Cache', 'HIT');
      
      return res.send(cachedAudio);
    }

    // Get chunk text
    const chunkText = BOOK_CHUNKS[chunkIndex];
    
    // Check if chunk contains voice tags (dramatized mode)
    const voiceSegments = extractVoiceSegments(chunkText);
    
    let audioBuffer: Buffer;
    
    if (voiceSegments.length > 0) {
      // MULTI-VOICE MODE: Chunk has voice tags
      console.log(`  Multi-voice chunk detected (${voiceSegments.length} segments)`);
      
      // Load voice map
      const voiceMapPath = path.join(ASSETS_DIR, 'dramatized_output', 'voice_map_poc.json');
      const voiceMap = fs.existsSync(voiceMapPath) 
        ? await loadVoiceMap(voiceMapPath)
        : {};
      
      // Synthesize each segment with its assigned voice
      const audioBuffers: Buffer[] = [];
      for (const segment of voiceSegments) {
        // Get voice for this speaker (fallback to narrator voice if not found)
        const speakerVoice = voiceMap[segment.speaker] === 'USER_SELECTED'
          ? voiceName // Use UI-selected voice for narrator
          : voiceMap[segment.speaker] || voiceName;
        
        console.log(`    ${segment.speaker} -> ${speakerVoice} (${segment.text.length} chars)`);
        
        // Synthesize this segment
        const segmentAudio = await synthesizeText(segment.text, speakerVoice);
        
        // Add 1 second pause after each segment (except the last one)
        const audioWithPause = addSilence(segmentAudio, 1000, 'end');
        audioBuffers.push(audioWithPause);
      }
      
      // Concatenate all audio segments
      audioBuffer = concatenateWavBuffers(audioBuffers);
      console.log(`  ✓ Concatenated ${audioBuffers.length} segments with pauses -> ${audioBuffer.length} bytes`);
      
    } else {
      // SINGLE-VOICE MODE: No voice tags (fallback)
      console.log(`  Single-voice mode (${chunkText.length} characters)`);
      
      // Remove any stray voice tags (safety)
      const cleanText = removeVoiceTags(chunkText);
      audioBuffer = await synthesizeText(cleanText, voiceName);
    }
    
    // Cache the audio
    audioCache.set(cacheKey, audioBuffer);
    console.log(`✓ Audio generated and cached: ${audioBuffer.length} bytes`);

    // Preload next chunk in background (don't await)
    const nextCacheKey = `${chunkIndex + 1}:${voiceName}`;
    if (chunkIndex + 1 < BOOK_CHUNKS.length && !audioCache.has(nextCacheKey)) {
      console.log(`  Preloading chunk ${chunkIndex + 1}...`);
      const nextChunkText = BOOK_CHUNKS[chunkIndex + 1];
      
      // Check if next chunk is multi-voice
      const nextSegments = extractVoiceSegments(nextChunkText);
      if (nextSegments.length > 0) {
        // Skip preload for multi-voice chunks (too complex for background)
        console.log(`  Skipping preload (multi-voice chunk)`);
      } else {
        synthesizeText(nextChunkText, voiceName)
          .then(nextAudio => {
            audioCache.set(nextCacheKey, nextAudio);
            console.log(`✓ Chunk ${chunkIndex + 1} preloaded`);
          })
          .catch(err => {
            console.error(`✗ Failed to preload chunk ${chunkIndex + 1}:`, err);
          });
      }
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
});
