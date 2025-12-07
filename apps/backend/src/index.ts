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
  type BookMetadata 
} from './bookChunker.js';

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

// Load book and create chunks at startup (POC 2.0)
let BOOK_TEXT: string;
let BOOK_CHUNKS: string[];
let BOOK_METADATA: BookMetadata;
let BOOK_INFO: ReturnType<typeof getBookInfo>;

try {
  const bookPath = path.join(__dirname, '..', 'assets', 'sample_ebook.txt');
  BOOK_TEXT = fs.readFileSync(bookPath, 'utf-8');
  
  // Parse metadata
  BOOK_METADATA = parseBookMetadata(BOOK_TEXT, 'txt');
  
  // Chunk the book
  BOOK_CHUNKS = chunkBookText(BOOK_TEXT); // Use default 200 bytes
  BOOK_INFO = getBookInfo(BOOK_CHUNKS);
  
  console.log('✓ Book loaded and chunked successfully');
  console.log(`  Title: ${BOOK_METADATA.title}`);
  console.log(`  Author: ${BOOK_METADATA.author}`);
  console.log(`  Language: ${BOOK_METADATA.language || 'auto-detect'}`);
  console.log(`  Total chunks: ${BOOK_INFO.totalChunks}`);
  console.log(`  Total words: ${BOOK_INFO.totalWords}`);
  console.log(`  Estimated duration: ${formatDuration(BOOK_INFO.estimatedDuration)}`);
} catch (error) {
  console.error('✗ Failed to load book:', error);
  process.exit(1);
}

// Audio cache for generated chunks
const audioCache = new Map<number, Buffer>();

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    bookLoaded: !!BOOK_TEXT,
    totalChunks: BOOK_INFO.totalChunks
  });
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
    // Validate metadata completeness
    if (!BOOK_METADATA.title || !BOOK_METADATA.author) {
      console.warn('⚠️ Incomplete book metadata detected');
    }

    res.json({
      title: BOOK_METADATA.title,
      author: BOOK_METADATA.author,
      language: BOOK_METADATA.language,
      estimatedDuration: formatDuration(BOOK_INFO.estimatedDuration), // "hh:mm" format
      // Internal data for frontend calculations (not displayed to user)
      _internal: {
        totalChunks: BOOK_INFO.totalChunks,
        durationSeconds: BOOK_INFO.estimatedDuration,
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
    const { chunkIndex } = req.body;

    // Validate chunk index
    if (typeof chunkIndex !== 'number' || chunkIndex < 0 || chunkIndex >= BOOK_CHUNKS.length) {
      return res.status(400).json({
        error: 'Invalid chunk index',
        message: `Chunk index must be between 0 and ${BOOK_CHUNKS.length - 1}`,
      });
    }

    console.log(`🎤 TTS chunk request: ${chunkIndex} / ${BOOK_CHUNKS.length - 1}`);

    // Check cache first
    if (audioCache.has(chunkIndex)) {
      console.log(`✓ Using cached audio for chunk ${chunkIndex}`);
      const cachedAudio = audioCache.get(chunkIndex)!;
      
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Length', cachedAudio.length.toString());
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('X-Cache', 'HIT');
      
      return res.send(cachedAudio);
    }

    // Synthesize chunk
    const chunkText = BOOK_CHUNKS[chunkIndex];
    console.log(`  Synthesizing chunk ${chunkIndex} (${chunkText.length} characters)...`);
    
    const audioBuffer = await synthesizeText(chunkText);
    
    // Cache the audio
    audioCache.set(chunkIndex, audioBuffer);
    console.log(`✓ Audio generated and cached: ${audioBuffer.length} bytes`);

    // Preload next chunk in background (don't await)
    if (chunkIndex + 1 < BOOK_CHUNKS.length && !audioCache.has(chunkIndex + 1)) {
      console.log(`  Preloading chunk ${chunkIndex + 1}...`);
      const nextChunkText = BOOK_CHUNKS[chunkIndex + 1];
      synthesizeText(nextChunkText)
        .then(nextAudio => {
          audioCache.set(chunkIndex + 1, nextAudio);
          console.log(`✓ Chunk ${chunkIndex + 1} preloaded`);
        })
        .catch(err => {
          console.error(`✗ Failed to preload chunk ${chunkIndex + 1}:`, err);
        });
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

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Ebook Reader Backend POC 2.0        ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('');
  console.log('📚 Book Information:');
  console.log(`   Total chunks: ${BOOK_INFO.totalChunks}`);
  console.log(`   Total words: ${BOOK_INFO.totalWords}`);
  const duration = BOOK_INFO.estimatedDuration || 0;
  console.log(`   Estimated duration: ${Math.floor(duration / 60)}min ${Math.floor(duration % 60)}s`);
  console.log('');
  console.log('Available endpoints:');
  console.log(`  GET  /api/health`);
  console.log(`  GET  /api/book/info`);
  console.log(`  POST /api/tts/chunk`);
  console.log(`  POST /api/tts/read-sample (POC 1.0 legacy)`);
  console.log('');
});
