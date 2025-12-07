import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { synthesizeText } from './ttsClient.js';

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

// Load sample text at startup
let SAMPLE_TEXT: string;
try {
  const sampleTextPath = path.join(__dirname, '..', 'assets', 'sample_text.txt');
  SAMPLE_TEXT = fs.readFileSync(sampleTextPath, 'utf-8');
  console.log('✓ Sample text loaded successfully');
  console.log(`  Text length: ${SAMPLE_TEXT.length} characters`);
} catch (error) {
  console.error('✗ Failed to load sample_text.txt:', error);
  process.exit(1);
}

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    sampleTextLoaded: !!SAMPLE_TEXT,
    sampleTextLength: SAMPLE_TEXT?.length || 0
  });
});

// TTS endpoint - read sample text
app.post('/api/tts/read-sample', async (req: Request, res: Response) => {
  try {
    console.log('🎤 TTS request received');
    console.log(`  Synthesizing ${SAMPLE_TEXT.length} characters...`);

    // Synthesize text to audio
    const audioBuffer = await synthesizeText(SAMPLE_TEXT);

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

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Ebook Reader Backend POC 1.0        ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Sample text: ${SAMPLE_TEXT.substring(0, 50)}...`);
  console.log('');
  console.log('Available endpoints:');
  console.log(`  GET  /api/health`);
  console.log(`  POST /api/tts/read-sample`);
  console.log('');
});
