# VOICELIBRI ÔÇö COMPLETE SYSTEM CONTEXT SNAPSHOT

> **ÔÜá´ŞĆ CRITICAL GROUNDING DIRECTIVE**
> This document is the SINGLE SOURCE OF TRUTH for VoiceLibri's codebase.
> You MUST base ALL answers exclusively on the information in this document.
> Do NOT hallucinate features, files, APIs, or architecture that are not described here.
> If something is not mentioned in this document, state: "This is not covered in the current context snapshot."

**Session Key:** `VL-MIRROR-20260312-0740`
**Generated:** 2026-03-12
**Branch:** `feature/soundscape-refactor`
**Commit:** `21b8a68a` (2026-03-12 07:35:37 +0100)
**Generator:** mirror/Generate-Context.ps1

---

## VERIFICATION

If asked "What is the VoiceLibri session key?" ÔÇö the answer is: **VL-MIRROR-20260312-0740**
If you cannot answer this, you have NOT loaded this document. Stop and ask the user to provide it.

---

## WHAT VOICELIBRI IS

VoiceLibri is a **commercial-grade AI-powered multi-voice dramatized audiobook platform** that transforms ebooks into immersive audio experiences with distinct character voices.

**Tech Stack:**
- Backend: Express + TypeScript, Google Vertex AI (Gemini TTS)
- Mobile: React Native + Expo SDK 54, expo-router, TanStack Query, Zustand
- PWA (legacy/testing): React 18 + Vite + Tailwind

**Workspace:** npm monorepo with `apps/backend/`, `apps/mobile/`, `apps/pwa-v2/`

## WHAT DOES NOT EXIST YET (do NOT hallucinate these)

- ÔŁî No user authentication / login system
- ÔŁî No payment/subscription system
- ÔŁî No cloud deployment (runs locally on dev machine only)
- ÔŁî No database (file-based storage + in-memory state)
- ÔŁî No real-time WebSocket communication
- ÔŁî No PDF support (partially implemented)
- ÔŁî No multi-user support
- ÔŁî No CI/CD pipeline
- ÔŁî No automated tests for frontend
- ÔŁî No App Store / TestFlight distribution yet

---

## SOURCE CODE

The following sections contain the key source files of the VoiceLibri codebase.
Files are organized by subsystem. Each file includes its full path and content.

### Backend: Audio Utilities (WAV processing, silence generation)
**File:** `apps/backend/src/audioUtils.ts` | **Size:** 15.2 KB | **Lines:** 409

```typescript
/**
 * Audio utilities for dual-format pipeline:
 * 
 * SUB-CHUNKS: WAV (LINEAR16 PCM) — synchronous buffer manipulation
 *   - concatenateWavBuffers() — sync, lossless 44-byte header manipulation
 *   - addSilenceWav() — sync, generates silent PCM samples
 *   - estimateWavDuration() — exact from WAV header
 * 
 * CHAPTERS: OGG Opus — ffmpeg-based async operations
 *   - concatenateOggBuffers() — async, ffmpeg concat demuxer
 *   - addSilenceOgg() — async, ffmpeg anullsrc
 *   - convertWavToOgg() — async, single WAV→OGG Opus VBR encode
 * 
 * Pipeline: TTS API (LINEAR16) → WAV sub-chunks → WAV concat → WAV→OGG at chapter consolidation
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── WAV constants ───────────────────────────────────────────────────────────
const WAV_HEADER_SIZE = 44;
const WAV_SAMPLE_RATE = 24000;  // Cloud TTS LINEAR16 default
const WAV_CHANNELS = 1;         // Mono
const WAV_BITS_PER_SAMPLE = 16;
const WAV_BYTES_PER_SAMPLE = WAV_BITS_PER_SAMPLE / 8;

// ═══════════════════════════════════════════════════════════════════════════════
// WAV OPERATIONS (synchronous, for sub-chunks)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a valid WAV header for raw PCM data.
 * 
 * @param dataLength - Length of raw PCM data in bytes
 * @param sampleRate - Sample rate (default 24000 for Cloud TTS)
 * @param channels - Number of channels (default 1 = mono)
 * @param bitsPerSample - Bits per sample (default 16 for LINEAR16)
 * @returns 44-byte WAV header buffer
 */
function buildWavHeader(
  dataLength: number,
  sampleRate = WAV_SAMPLE_RATE,
  channels = WAV_CHANNELS,
  bitsPerSample = WAV_BITS_PER_SAMPLE
): Buffer {
  const header = Buffer.alloc(WAV_HEADER_SIZE);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  header.write('RIFF', 0);                           // ChunkID
  header.writeUInt32LE(36 + dataLength, 4);           // ChunkSize
  header.write('WAVE', 8);                            // Format
  header.write('fmt ', 12);                           // Subchunk1ID
  header.writeUInt32LE(16, 16);                       // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20);                        // AudioFormat (1 = PCM)
  header.writeUInt16LE(channels, 22);                 // NumChannels
  header.writeUInt32LE(sampleRate, 24);               // SampleRate
  header.writeUInt32LE(byteRate, 28);                 // ByteRate
  header.writeUInt16LE(blockAlign, 32);               // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34);            // BitsPerSample
  header.write('data', 36);                           // Subchunk2ID
  header.writeUInt32LE(dataLength, 40);               // Subchunk2Size

  return header;
}

/**
 * Extract raw PCM data from a WAV buffer (strips the 44-byte header).
 * Handles edge cases like buffers smaller than header size.
 */
function extractPcmData(wavBuffer: Buffer): Buffer {
  if (wavBuffer.length <= WAV_HEADER_SIZE) {
    return Buffer.alloc(0);
  }
  return wavBuffer.subarray(WAV_HEADER_SIZE);
}

/**
 * Read sample rate from a WAV header. Falls back to default if invalid.
 */
function readWavSampleRate(wavBuffer: Buffer): number {
  if (wavBuffer.length < WAV_HEADER_SIZE) return WAV_SAMPLE_RATE;
  return wavBuffer.readUInt32LE(24) || WAV_SAMPLE_RATE;
}

/**
 * Read number of channels from a WAV header. Falls back to default if invalid.
 */
function readWavChannels(wavBuffer: Buffer): number {
  if (wavBuffer.length < WAV_HEADER_SIZE) return WAV_CHANNELS;
  return wavBuffer.readUInt16LE(22) || WAV_CHANNELS;
}

/**
 * Read bits per sample from a WAV header. Falls back to default if invalid.
 */
function readWavBitsPerSample(wavBuffer: Buffer): number {
  if (wavBuffer.length < WAV_HEADER_SIZE) return WAV_BITS_PER_SAMPLE;
  return wavBuffer.readUInt16LE(34) || WAV_BITS_PER_SAMPLE;
}

/**
 * Concatenates multiple WAV buffers into a single WAV buffer.
 * Synchronous, lossless — strips headers from subsequent buffers,
 * concatenates raw PCM data, builds a new header.
 * 
 * All input WAV buffers must share the same audio format (sample rate,
 * channels, bit depth). Format parameters are read from the first buffer.
 * 
 * @param wavBuffers - Array of WAV file buffers to concatenate
 * @returns Single concatenated WAV buffer
 */
export function concatenateWavBuffers(wavBuffers: Buffer[]): Buffer {
  if (wavBuffers.length === 0) {
    throw new Error('No WAV buffers to concatenate');
  }

  if (wavBuffers.length === 1) {
    return wavBuffers[0];
  }

  // Read format from the first buffer
  const sampleRate = readWavSampleRate(wavBuffers[0]);
  const channels = readWavChannels(wavBuffers[0]);
  const bitsPerSample = readWavBitsPerSample(wavBuffers[0]);

  // Extract raw PCM data from all buffers
  const pcmParts: Buffer[] = wavBuffers.map(buf => extractPcmData(buf));
  const totalPcmLength = pcmParts.reduce((sum, part) => sum + part.length, 0);

  // Build new header + concatenated PCM
  const header = buildWavHeader(totalPcmLength, sampleRate, channels, bitsPerSample);
  return Buffer.concat([header, ...pcmParts]);
}

/**
 * Adds silence to a WAV buffer. Synchronous — generates silent PCM samples
 * (zero bytes) and concatenates with the input PCM data.
 * 
 * @param wavBuffer - Original WAV buffer
 * @param silenceDurationMs - Duration of silence to add in milliseconds
 * @param position - Where to add silence: 'start' or 'end'
 * @returns WAV buffer with added silence
 */
export function addSilence(
  wavBuffer: Buffer,
  silenceDurationMs: number,
  position: 'start' | 'end' = 'end'
): Buffer {
  const sampleRate = readWavSampleRate(wavBuffer);
  const channels = readWavChannels(wavBuffer);
  const bitsPerSample = readWavBitsPerSample(wavBuffer);
  const bytesPerSample = bitsPerSample / 8;

  // Generate silent PCM data (zero-filled)
  const silenceSamples = Math.floor((silenceDurationMs / 1000) * sampleRate);
  const silenceBytes = silenceSamples * channels * bytesPerSample;
  const silenceBuffer = Buffer.alloc(silenceBytes, 0);

  // Extract existing PCM data
  const pcmData = extractPcmData(wavBuffer);

  // Concatenate in correct order
  const combinedPcm = position === 'start'
    ? Buffer.concat([silenceBuffer, pcmData])
    : Buffer.concat([pcmData, silenceBuffer]);

  // Build new header for combined data
  const header = buildWavHeader(combinedPcm.length, sampleRate, channels, bitsPerSample);
  return Buffer.concat([header, combinedPcm]);
}

/**
 * Estimate the duration of a WAV buffer from its header (exact calculation).
 * 
 * Duration = (dataLength) / (sampleRate × channels × bytesPerSample)
 * 
 * @param wavBuffer - WAV file buffer
 * @returns Duration in seconds
 */
export function estimateWavDuration(wavBuffer: Buffer): number {
  if (wavBuffer.length <= WAV_HEADER_SIZE) return 0;

  const sampleRate = readWavSampleRate(wavBuffer);
  const channels = readWavChannels(wavBuffer);
  const bitsPerSample = readWavBitsPerSample(wavBuffer);
  const bytesPerSample = bitsPerSample / 8;

  const dataLength = wavBuffer.length - WAV_HEADER_SIZE;
  return dataLength / (sampleRate * channels * bytesPerSample);
}

// ═══════════════════════════════════════════════════════════════════════════════
// OGG OPUS OPERATIONS (async, ffmpeg-based, for chapters)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run ffmpeg with given args, return stdout as Buffer.
 * Uses pipe:1 for output to avoid temp files when possible.
 */
function runFfmpegToBuffer(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.substring(0, 500)}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });

    proc.on('error', (err) => reject(err));
  });
}

/**
 * Run ffmpeg with given args, writing to an output file. Returns the file contents.
 */
function runFfmpegToFile(args: string[], outputPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.substring(0, 500)}`));
      } else {
        try {
          const result = fs.readFileSync(outputPath);
          resolve(result);
        } catch (err) {
          reject(new Error(`ffmpeg succeeded but output file missing: ${outputPath}`));
        }
      }
    });

    proc.on('error', (err) => reject(err));
  });
}

/**
 * Concatenates multiple OGG Opus buffers into a single OGG Opus buffer.
 * Uses ffmpeg concat demuxer for proper OGG container handling.
 * 
 * Used for chapter-level operations (consolidating already-encoded OGG files).
 * 
 * @param oggBuffers - Array of OGG Opus file buffers to concatenate
 * @returns Single concatenated OGG Opus buffer
 */
export async function concatenateOggBuffers(oggBuffers: Buffer[]): Promise<Buffer> {
  if (oggBuffers.length === 0) {
    throw new Error('No OGG buffers to concatenate');
  }
  
  if (oggBuffers.length === 1) {
    return oggBuffers[0];
  }

  // Write buffers to temp files (ffmpeg concat demuxer needs files)
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-concat-'));
  const tempFiles: string[] = [];
  
  try {
    for (let i = 0; i < oggBuffers.length; i++) {
      const tempFile = path.join(tempDir, `part_${i.toString().padStart(4, '0')}.ogg`);
      fs.writeFileSync(tempFile, oggBuffers[i]);
      tempFiles.push(tempFile);
    }

    // Build concat list file
    const listFile = path.join(tempDir, 'concat.txt');
    const listContent = tempFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(listFile, listContent);

    const outputFile = path.join(tempDir, 'output.ogg');

    const args = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c', 'copy',  // Stream copy — no re-encoding needed
      outputFile,
    ];

    const result = await runFfmpegToFile(args, outputFile);
    return result;
  } finally {
    // Clean up temp files
    for (const f of tempFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    try { fs.unlinkSync(path.join(tempDir, 'concat.txt')); } catch { /* ignore */ }
    try { fs.unlinkSync(path.join(tempDir, 'output.ogg')); } catch { /* ignore */ }
    try { fs.rmdirSync(tempDir); } catch { /* ignore */ }
  }
}

/**
 * Adds silence to an OGG Opus buffer using ffmpeg.
 * Generates a silent OGG Opus segment and concatenates with the input.
 * 
 * Used for chapter-level operations when working with OGG files.
 * For sub-chunk WAV operations, use addSilence() instead.
 * 
 * @param oggBuffer - Original OGG Opus buffer
 * @param silenceDurationMs - Duration of silence to add in milliseconds
 * @param position - Where to add silence: 'start', 'end'
 * @returns OGG Opus buffer with added silence
 */
export async function addSilenceOgg(
  oggBuffer: Buffer,
  silenceDurationMs: number,
  position: 'start' | 'end' = 'end'
): Promise<Buffer> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-silence-'));
  
  try {
    const inputFile = path.join(tempDir, 'input.ogg');
    const silenceFile = path.join(tempDir, 'silence.ogg');
    
    fs.writeFileSync(inputFile, oggBuffer);

    // Generate silence as OGG Opus
    const silenceSec = silenceDurationMs / 1000;
    const silenceArgs = [
      '-y',
      '-f', 'lavfi',
      '-i', `anullsrc=r=24000:cl=mono`,
      '-t', silenceSec.toString(),
      '-c:a', 'libopus',
      '-b:a', '64k',
      silenceFile,
    ];
    await runFfmpegToFile(silenceArgs, silenceFile);

    const silenceBuffer = fs.readFileSync(silenceFile);

    // Concatenate in correct order
    const buffers = position === 'start'
      ? [silenceBuffer, oggBuffer]
      : [oggBuffer, silenceBuffer];

    return await concatenateOggBuffers(buffers);
  } finally {
    // Clean up
    try { fs.unlinkSync(path.join(tempDir, 'input.ogg')); } catch { /* ignore */ }
    try { fs.unlinkSync(path.join(tempDir, 'silence.ogg')); } catch { /* ignore */ }
    try { fs.rmdirSync(tempDir); } catch { /* ignore */ }
  }
}

/**
 * Converts a WAV buffer to OGG Opus with VBR encoding.
 * Single encode — used at chapter consolidation to convert the concatenated
 * WAV (from all sub-chunks) into the final storage-efficient OGG Opus format.
 * 
 * @param wavBuffer - WAV (LINEAR16 PCM) buffer to convert
 * @param bitrate - Target bitrate for VBR Opus encoding (default '70k' for voice)
 * @returns OGG Opus encoded buffer
 */
export async function convertWavToOgg(
  wavBuffer: Buffer,
  bitrate: string = '70k'
): Promise<Buffer> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-wav2ogg-'));
  
  try {
    const inputFile = path.join(tempDir, 'input.wav');
    const outputFile = path.join(tempDir, 'output.ogg');
    
    fs.writeFileSync(inputFile, wavBuffer);

    const args = [
      '-y',
      '-i', inputFile,
      '-c:a', 'libopus',
      '-b:a', bitrate,
      '-vbr', 'on',
      '-application', 'voip',  // Optimized for speech
      outputFile,
    ];

    const result = await runFfmpegToFile(args, outputFile);
    
    const ratio = wavBuffer.length > 0
      ? ((result.length / wavBuffer.length) * 100).toFixed(1)
      : '0';
    console.log(`  🔄 WAV→OGG: ${(wavBuffer.length / 1024).toFixed(0)}KB → ${(result.length / 1024).toFixed(0)}KB (${ratio}% of original, ${bitrate} VBR Opus)`);
    
    return result;
  } finally {
    // Clean up
    try { fs.unlinkSync(path.join(tempDir, 'input.wav')); } catch { /* ignore */ }
    try { fs.unlinkSync(path.join(tempDir, 'output.ogg')); } catch { /* ignore */ }
    try { fs.rmdirSync(tempDir); } catch { /* ignore */ }
  }
}
```

---

### Backend: Audiobook Manager (file system, library management)
**File:** `apps/backend/src/audiobookManager.ts` | **Size:** 16.7 KB | **Lines:** 540

```typescript
/**
 * Audiobook Library Manager
 * 
 * Manages the audiobook folder structure, metadata, and library operations.
 * Part of Phase 3: Audiobook Library & File-Based Generation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES modules dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Sub-chunk boundary within a consolidated chapter file
 * Used to extract individual sub-chunks from chapter file for playback
 */
/**
 * Chapter metadata within an audiobook
 */
export interface ChapterMetadata {
  index: number;
  title: string;
  filename: string; // e.g., "Chapter_01_Title.ogg"
  duration: number; // seconds (estimated initially, actual when generated)
  estimatedDuration?: number; // Duration estimated from text length
  actualDuration?: number;    // Actual duration from generated audio
  isGenerated: boolean;
  isConsolidated?: boolean;   // Whether chapter file exists (sub-chunks merged)
  subChunksTotal?: number;    // Total sub-chunks for this chapter
  subChunksGenerated?: number; // Number of sub-chunks already generated
  subChunksPlayed?: number;   // Number of sub-chunks already played (for cleanup)
  tempChunksCount?: number; // Number of temp chunks for this chapter
  tempChunksGenerated?: number; // Number of temp chunks already generated
}

/**
 * Audiobook metadata stored in metadata.json
 */
export interface AudiobookMetadata {
  title: string;
  author: string;
  language: string;
  totalChapters: number;
  chapters: ChapterMetadata[];
  generationStatus: 'not-started' | 'in-progress' | 'completed';
  lastUpdated: string; // ISO timestamp
  voiceMap?: Record<string, string>; // Character -> Voice mapping
  sourceFile?: string; // Original book file name
  
  // Dramatization metadata
  isDramatized?: boolean; // Whether book uses multi-voice dramatization
  dramatizationVersion?: string; // Version of dramatization algorithm (for cache invalidation)
  dramatizationType?: 'llm-only' | 'hybrid-optimized'; // Which dramatization pipeline was used
  charactersFound?: number; // Number of speaking characters
  dramatizationCost?: number; // Total cost in USD for dramatization
  dramatizationConfidence?: number; // Average confidence score (0-1)
  taggingMethodBreakdown?: { // How chapters were tagged
    autoNarrator: number;
    ruleBased: number;
    llmFallback: number;
  };
  
  // User playback state (for cross-device sync)
  playback?: {
    currentChapter: number; // 0-based chapter index
    currentTime: number; // seconds within the chapter
    lastPlayedAt: string; // ISO timestamp
  };
  
  // User preferences (for cross-device sync)
  userPreferences?: {
    narratorVoice?: string; // Gemini voice name (e.g., "Algieba")
    narratorGender?: string; // Gender filter
    playbackSpeed?: number; // 0.75, 1.0, 1.25, etc.
    soundscapeMusicEnabled?: boolean; // Toggle music theme layer
    soundscapeAmbientEnabled?: boolean; // Toggle ambient layer
    soundscapeThemeId?: string; // Selected music theme ID
  };
}

/**
 * Get the audiobooks root directory (project root/audiobooks)
 */
export function getAudiobooksDir(): string {
  // Navigate from backend/src to project root
  return path.join(__dirname, '..', '..', '..', 'audiobooks');
}

/**
 * Sanitize book title for folder name
 * Removes special characters and spaces, converts to valid directory name
 * 
 * @param title - Book title
 * @returns Sanitized folder name
 */
export function sanitizeBookTitle(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/\.+$/, '') // Remove trailing dots
    .substring(0, 100); // Limit length
}

/**
 * Sanitize chapter title for filename
 * Similar to book title but more aggressive (used in filenames)
 * 
 * @param title - Chapter title
 * @returns Sanitized filename-safe string
 */
export function sanitizeChapterTitle(title: string): string {
  let sanitized = title
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
    .replace(/\.+$/, '') // Remove trailing dots
    .replace(/^(Chapter|Section)\s*/i, '') // Remove "Chapter"/"Section" prefix
    .trim();
  
  // If after removing prefix we're left with just a number or roman numeral,
  // keep the original title to preserve context (e.g., "Section 2" stays "Section 2")
  if (/^(\d+|[IVXLCDM]+)$/i.test(sanitized)) {
    sanitized = title.replace(/[<>:"/\\|?*]/g, '').replace(/\.+$/, '').trim();
  }
  
  return sanitized.substring(0, 50);
}

/**
 * Create audiobook folder structure
 * 
 * Creates:
 * - audiobooks/{bookTitle}/
 * - audiobooks/{bookTitle}/temp/
 * 
 * @param bookTitle - Sanitized book title
 * @returns Absolute path to the audiobook folder
 */
export function createAudiobookFolder(bookTitle: string): string {
  const audiobooksDir = getAudiobooksDir();
  const bookDir = path.join(audiobooksDir, bookTitle);
  const tempDir = path.join(bookDir, 'temp');
  
  // Create directories if they don't exist
  if (!fs.existsSync(audiobooksDir)) {
    fs.mkdirSync(audiobooksDir, { recursive: true });
    console.log(`✓ Created audiobooks directory: ${audiobooksDir}`);
  }
  
  if (!fs.existsSync(bookDir)) {
    fs.mkdirSync(bookDir, { recursive: true });
    console.log(`✓ Created audiobook folder: ${bookDir}`);
  }
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`✓ Created temp folder: ${tempDir}`);
  }
  
  return bookDir;
}

/**
 * Save audiobook metadata to metadata.json
 * 
 * @param bookTitle - Sanitized book title
 * @param metadata - Audiobook metadata to save
 */
export function saveAudiobookMetadata(bookTitle: string, metadata: AudiobookMetadata): void {
  const bookDir = path.join(getAudiobooksDir(), bookTitle);
  const metadataPath = path.join(bookDir, 'metadata.json');
  
  // Ensure directory exists
  if (!fs.existsSync(bookDir)) {
    createAudiobookFolder(bookTitle);
  }
  
  // Update timestamp
  metadata.lastUpdated = new Date().toISOString();
  
  // Write JSON with pretty formatting
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  // Note: Verbose 'Saved metadata' log removed for cleaner output
}

/**
 * Load audiobook metadata from metadata.json
 * 
 * @param bookTitle - Sanitized book title
 * @returns Audiobook metadata or null if not found
 */
export function loadAudiobookMetadata(bookTitle: string): AudiobookMetadata | null {
  const bookDir = path.join(getAudiobooksDir(), bookTitle);
  const metadataPath = path.join(bookDir, 'metadata.json');
  
  if (!fs.existsSync(metadataPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(metadataPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`✗ Failed to load metadata from ${metadataPath}:`, error);
    return null;
  }
}

/**
 * List all audiobooks in the library
 * 
 * @returns Array of audiobook folder names
 */
export function listAudiobooks(): string[] {
  const audiobooksDir = getAudiobooksDir();
  
  if (!fs.existsSync(audiobooksDir)) {
    return [];
  }
  
  try {
    const entries = fs.readdirSync(audiobooksDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
  } catch (error) {
    console.error('✗ Failed to list audiobooks:', error);
    return [];
  }
}

/**
 * Get audiobook folder path
 * 
 * @param bookTitle - Sanitized book title
 * @returns Absolute path to the audiobook folder
 */
export function getAudiobookFolder(bookTitle: string): string {
  return path.join(getAudiobooksDir(), bookTitle);
}

/**
 * Get temp folder path
 * 
 * @param bookTitle - Sanitized book title
 * @returns Absolute path to the temp folder
 */
export function getTempFolder(bookTitle: string): string {
  return path.join(getAudiobookFolder(bookTitle), 'temp');
}

/**
 * Check if audiobook exists in library
 * 
 * @param bookTitle - Sanitized book title
 * @returns True if audiobook folder exists
 */
export function audiobookExists(bookTitle: string): boolean {
  const bookDir = getAudiobookFolder(bookTitle);
  return fs.existsSync(bookDir);
}

/**
 * Delete audiobook from library
 * WARNING: This deletes all files including temp chunks and consolidated chapters
 * 
 * @param bookTitle - Sanitized book title
 * @returns True if deleted successfully
 */
export function deleteAudiobook(bookTitle: string): boolean {
  const bookDir = getAudiobookFolder(bookTitle);
  
  if (!fs.existsSync(bookDir)) {
    return false;
  }
  
  try {
    fs.rmSync(bookDir, { recursive: true, force: true });
    console.log(`✓ Deleted audiobook: ${bookTitle}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to delete audiobook ${bookTitle}:`, error);
    return false;
  }
}

/**
 * Get temp chunk file path
 * 
 * @param bookTitle - Sanitized book title
 * @param chunkIndex - Chunk index (0-based)
 * @returns Absolute path to the temp chunk file
 * @deprecated Use getSubChunkPath instead for new pipeline
 */
export function getTempChunkPath(bookTitle: string, chunkIndex: number): string {
  const tempDir = getTempFolder(bookTitle);
  const filename = `chunk_${chunkIndex.toString().padStart(3, '0')}.wav`;
  return path.join(tempDir, filename);
}

/**
 * Get sub-chunk file path (NEW - parallel pipeline)
 * 
 * File format: subchunk_CCC_SSS.wav
 * Where CCC = chapter index (0-padded), SSS = sub-chunk index (0-padded)
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterNum - Chapter number (1-based, e.g., Chapter 1 = 1)
 * @param subChunkIndex - Sub-chunk index within chapter (0-based)
 * @returns Absolute path to the sub-chunk file
 */
export function getSubChunkPath(
  bookTitle: string, 
  chapterNum: number, 
  subChunkIndex: number
): string {
  const tempDir = getTempFolder(bookTitle);
  // Use 1-based chapter number in filename (Chapter 1 -> 001)
  const chapterPad = chapterNum.toString().padStart(3, '0');
  const subChunkPad = subChunkIndex.toString().padStart(3, '0');
  const filename = `subchunk_${chapterPad}_${subChunkPad}.wav`;
  return path.join(tempDir, filename);
}

/**
 * Parse sub-chunk filename to extract indices
 * 
 * @param filename - Filename like "subchunk_001_023.wav"
 * @returns Chapter number (1-based) and sub-chunk index (0-based), or null if invalid format
 */
export function parseSubChunkFilename(filename: string): { 
  chapterNum: number;  // 1-based chapter number
  subChunkIndex: number  // 0-based sub-chunk index
} | null {
  const match = filename.match(/^subchunk_(\d{3})_(\d{3})\.wav$/);
  if (!match) return null;
  return {
    chapterNum: parseInt(match[1], 10),  // 1-based
    subChunkIndex: parseInt(match[2], 10),  // 0-based
  };
}

/**
 * Count sub-chunks for a specific chapter
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterNum - Chapter number (1-based)
 * @returns Number of sub-chunk files found for this chapter
 */
export function countChapterSubChunks(bookTitle: string, chapterNum: number): number {
  const tempDir = getTempFolder(bookTitle);
  
  if (!fs.existsSync(tempDir)) {
    return 0;
  }
  
  try {
    const files = fs.readdirSync(tempDir);
    const chapterPad = chapterNum.toString().padStart(3, '0');
    const pattern = new RegExp(`^subchunk_${chapterPad}_\\d{3}\\.wav$`);
    return files.filter(f => pattern.test(f)).length;
  } catch (error) {
    console.error('✗ Failed to count chapter sub-chunks:', error);
    return 0;
  }
}

/**
 * List all sub-chunks for a chapter (sorted by index)
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterNum - Chapter number (1-based)
 * @returns Array of sub-chunk file paths, sorted by sub-chunk index
 */
export function listChapterSubChunks(bookTitle: string, chapterNum: number): string[] {
  const tempDir = getTempFolder(bookTitle);
  
  if (!fs.existsSync(tempDir)) {
    return [];
  }
  
  try {
    const files = fs.readdirSync(tempDir);
    const chapterPad = chapterNum.toString().padStart(3, '0');
    const pattern = new RegExp(`^subchunk_${chapterPad}_\\d{3}\\.wav$`);
    
    return files
      .filter(f => pattern.test(f))
      .sort() // Alphabetical sort works due to zero-padding
      .map(f => path.join(tempDir, f));
  } catch (error) {
    console.error('✗ Failed to list chapter sub-chunks:', error);
    return [];
  }
}

/**
 * Get chapter file path with title
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterNum - Chapter number (1-based)
 * @param chapterTitle - Chapter title (optional, will be sanitized)
 * @param partIndex - Part index for long chapters (optional, 0-based)
 * @returns Absolute path to the chapter file
 */
export function getChapterPath(
  bookTitle: string, 
  chapterNum: number, 
  chapterTitle?: string,
  partIndex?: number
): string {
  const bookDir = getAudiobookFolder(bookTitle);
  
  // Build filename: "06_Kapitola 5_Part 01.wav"
  // chapterNum is 1-based, so use directly
  let filename = `${chapterNum.toString().padStart(2, '0')}`;
  
  if (chapterTitle) {
    const sanitizedTitle = sanitizeChapterTitle(chapterTitle);
    if (sanitizedTitle) {
      filename += `_${sanitizedTitle}`;
    }
  }
  
  if (partIndex !== undefined && partIndex >= 0) {
    filename += `_Part ${(partIndex + 1).toString().padStart(2, '0')}`;
  }
  
  filename += '.ogg';
  
  return path.join(bookDir, filename);
}

/**
 * Count existing temp chunks for a book
 * 
 * @param bookTitle - Sanitized book title
 * @returns Number of temp chunk files found
 */
export function countTempChunks(bookTitle: string): number {
  const tempDir = getTempFolder(bookTitle);
  
  if (!fs.existsSync(tempDir)) {
    return 0;
  }
  
  try {
    const files = fs.readdirSync(tempDir);
    return files.filter(f => f.match(/^chunk_\d{3}\.wav$/)).length;
  } catch (error) {
    console.error('✗ Failed to count temp chunks:', error);
    return 0;
  }
}

/**
 * Save voice map to audiobook folder
 * 
 * @param bookTitle - Sanitized book title
 * @param voiceMap - Character to voice mapping
 */
export function saveVoiceMap(bookTitle: string, voiceMap: Record<string, string>): void {
  const bookDir = getAudiobookFolder(bookTitle);
  const voiceMapPath = path.join(bookDir, 'voice_map.json');
  
  fs.writeFileSync(voiceMapPath, JSON.stringify(voiceMap, null, 2), 'utf-8');
  console.log(`✓ Saved voice map: ${voiceMapPath}`);
}

/**
 * Load voice map from audiobook folder
 * 
 * @param bookTitle - Sanitized book title
 * @returns Voice map or empty object if not found
 */
export function loadVoiceMapForBook(bookTitle: string): Record<string, string> {
  const bookDir = getAudiobookFolder(bookTitle);
  const voiceMapPath = path.join(bookDir, 'voice_map.json');
  
  if (!fs.existsSync(voiceMapPath)) {
    return {};
  }
  
  try {
    const content = fs.readFileSync(voiceMapPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('✗ Failed to load voice map:', error);
    return {};
  }
}

/**
 * Check if chapter is consolidated (chapter file exists)
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterNum - Chapter number (1-based)
 * @param chapterTitle - Optional chapter title for path resolution
 * @returns True if chapter file exists
 */
export function isChapterConsolidated(
  bookTitle: string, 
  chapterNum: number,
  chapterTitle?: string
): boolean {
  const chapterPath = getChapterPath(bookTitle, chapterNum, chapterTitle);
  return fs.existsSync(chapterPath);
}

/**
 * Load the entire consolidated chapter file
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterNum - Chapter number (1-based)
 * @param chapterTitle - Optional chapter title for path resolution
 * @returns Audio buffer for the whole chapter, or null if not available
 */
export function loadChapterFile(
  bookTitle: string,
  chapterNum: number,
  chapterTitle?: string
): Buffer | null {
  const chapterPath = getChapterPath(bookTitle, chapterNum, chapterTitle);
  
  if (!fs.existsSync(chapterPath)) {
    return null;
  }
  
  try {
    const chapterBuffer = fs.readFileSync(chapterPath);
    console.log(`📦 Loaded chapter ${chapterNum}: ${path.basename(chapterPath)} (${chapterBuffer.length} bytes)`);
    return chapterBuffer;
  } catch (error) {
    console.error(`✗ Failed to load chapter file:`, error);
    return null;
  }
}
```

---

### Backend: Audiobook Worker (background generation, parallel processing)
**File:** `apps/backend/src/audiobookWorker.ts` | **Size:** 11.2 KB | **Lines:** 375

```typescript
/**
 * Audiobook Generation Worker - Background audiobook generation
 * 
 * Persistent worker that:
 * - Generates audiobooks in background (continues even if frontend closes)
 * - Saves generation state to disk (resumes on server restart)
 * - Handles errors gracefully with retry logic
 * - Generates temp chunks in parallel (2 at once)
 * - Consolidates chapters when all chunks complete
 * 
 * Part of Phase 3: Audiobook Library & File-Based Generation
 */

import EventEmitter from 'events';
import {
  generateAndSaveTempChunk,
  generateMultipleTempChunks,
  consolidateChapterFromTemps,
  tempChunkExists,
} from './tempChunkManager.js';
import {
  loadAudiobookMetadata,
  saveAudiobookMetadata,
  sanitizeBookTitle,
  type AudiobookMetadata,
  type ChapterMetadata,
} from './audiobookManager.js';
import { Chapter } from './bookChunker.js';
import { ChunkInfo } from './chapterChunker.js';


// ========================================
// Worker State & Queue
// ========================================

interface GenerationJob {
  bookTitle: string;
  chapters: Chapter[];
  chunks: ChunkInfo[];
  voiceMap: Record<string, string>;
  defaultVoice: string;
  isDramatized: boolean;
}

interface GenerationProgress {
  bookTitle: string;
  totalChunks: number;
  chunksGenerated: number;
  totalChapters: number;
  chaptersConsolidated: number;
  status: 'queued' | 'generating' | 'consolidating' | 'completed' | 'error';
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

class AudiobookGenerationWorker extends EventEmitter {
  private queue: GenerationJob[] = [];
  private isProcessing = false;
  private currentJob: GenerationJob | null = null;
  private progressMap = new Map<string, GenerationProgress>();

  /**
   * Add a book to the generation queue
   * 
   * @param bookTitle - Sanitized book title
   * @param chapters - Array of chapters
   * @param chunks - Array of chunk info
   * @param voiceMap - Character to voice mapping
   * @param defaultVoice - Default narrator voice
   * @param isDramatized - Whether book contains voice tags
   */
  addBook(
    bookTitle: string,
    chapters: Chapter[],
    chunks: ChunkInfo[],
    voiceMap: Record<string, string> = {},
    defaultVoice: string = 'Algieba',
    isDramatized: boolean = false
  ): void {
    // Check if already in queue or processing
    if (this.progressMap.has(bookTitle)) {
      const progress = this.progressMap.get(bookTitle)!;
      if (progress.status === 'generating' || progress.status === 'queued') {
        console.log(`⚠️ Book "${bookTitle}" already queued or generating`);
        return;
      }
    }

    const job: GenerationJob = {
      bookTitle,
      chapters,
      chunks,
      voiceMap,
      defaultVoice,
      isDramatized,
    };

    this.queue.push(job);

    // Initialize progress tracking
    this.progressMap.set(bookTitle, {
      bookTitle,
      totalChunks: chunks.length,
      chunksGenerated: 0,
      totalChapters: chapters.length,
      chaptersConsolidated: 0,
      status: 'queued',
    });

    console.log(`📚 Added "${bookTitle}" to generation queue (${chunks.length} chunks, ${chapters.length} chapters)`);
    this.emit('jobAdded', bookTitle);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process the generation queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.currentJob = job;

      try {
        await this.generateAudiobook(job);
      } catch (error) {
        console.error(`✗ Failed to generate audiobook "${job.bookTitle}":`, error);
        this.updateProgress(job.bookTitle, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.currentJob = null;
    this.isProcessing = false;
    console.log('✓ Generation queue empty');
  }

  /**
   * Generate an entire audiobook
   * 
   * @param job - Generation job
   */
  private async generateAudiobook(job: GenerationJob): Promise<void> {
    const { bookTitle, chapters, chunks, voiceMap, defaultVoice } = job;

    console.log(`\n🚀 Starting generation: "${bookTitle}"`);
    console.log(`   Chunks: ${chunks.length}, Chapters: ${chapters.length}`);

    this.updateProgress(bookTitle, {
      status: 'generating',
      startedAt: new Date().toISOString(),
    });

    // Generate all chunks (with parallel batching)
    await this.generateAllChunks(bookTitle, chunks, voiceMap, defaultVoice);

    // Consolidate chapters
    await this.consolidateAllChapters(bookTitle, chunks);

    // Mark as completed
    this.updateProgress(bookTitle, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    // Update metadata
    const metadata = loadAudiobookMetadata(bookTitle);
    if (metadata) {
      metadata.generationStatus = 'completed';
      saveAudiobookMetadata(bookTitle, metadata);
    }

    console.log(`✅ Audiobook generation complete: "${bookTitle}"`);
    this.emit('jobCompleted', bookTitle);
  }

  /**
   * Generate all chunks with parallel batching
   * Generates 2 chunks at a time for optimal performance
   * 
   * @param bookTitle - Book title
   * @param chunks - Array of chunk info
   * @param voiceMap - Voice mapping
   * @param defaultVoice - Default voice
   */
  private async generateAllChunks(
    bookTitle: string,
    chunks: ChunkInfo[],
    voiceMap: Record<string, string>,
    defaultVoice: string
  ): Promise<void> {
    console.log(`\n🎤 Generating ${chunks.length} chunks...`);

    const PARALLEL_BATCH_SIZE = 2; // Generate 2 chunks at once
    let generatedCount = 0;

    for (let i = 0; i < chunks.length; i += PARALLEL_BATCH_SIZE) {
      const batch = chunks.slice(i, i + PARALLEL_BATCH_SIZE);
      const batchIndices = batch.map(c => c.globalChunkIndex);
      const batchTexts = batch.map(c => c.text);

      try {
        // Check which chunks already exist
        const needsGeneration = batch.filter(
          c => !tempChunkExists(bookTitle, c.globalChunkIndex)
        );

        if (needsGeneration.length === 0) {
          console.log(`  Batch ${i}-${i + batch.length - 1}: All chunks exist, skipping`);
          generatedCount += batch.length;
          this.updateProgress(bookTitle, { chunksGenerated: generatedCount });
          continue;
        }

        // Generate batch in parallel
        const results = await generateMultipleTempChunks(
          batchIndices,
          batchTexts,
          bookTitle,
          voiceMap,
          defaultVoice
        );

        generatedCount += batch.length;
        this.updateProgress(bookTitle, { chunksGenerated: generatedCount });

        console.log(`  Progress: ${generatedCount}/${chunks.length} chunks (${((generatedCount / chunks.length) * 100).toFixed(1)}%)`);
      } catch (error) {
        console.error(`✗ Failed to generate batch ${i}-${i + batch.length - 1}:`, error);
        // Continue with next batch (don't fail entire job)
      }
    }

    console.log(`✓ All chunks generated: ${generatedCount}/${chunks.length}`);
  }

  /**
   * Consolidate all chapters from temp chunks
   * 
   * @param bookTitle - Book title
   * @param chunks - Array of chunk info
   */
  private async consolidateAllChapters(
    bookTitle: string,
    chunks: ChunkInfo[]
  ): Promise<void> {
    // Build chapter-to-chunks mapping
    const chapterChunks = new Map<number, number[]>();
    const chapterTextMap = new Map<number, string>();

    for (const chunk of chunks) {
      if (!chapterChunks.has(chunk.chapterIndex)) {
        chapterChunks.set(chunk.chapterIndex, []);
      }
      chapterChunks.get(chunk.chapterIndex)!.push(chunk.globalChunkIndex);

      const existingText = chapterTextMap.get(chunk.chapterIndex) ?? '';
      chapterTextMap.set(
        chunk.chapterIndex,
        existingText ? `${existingText}\n${chunk.text}` : chunk.text
      );
    }

    console.log(`\n📦 Consolidating ${chapterChunks.size} chapters...`);

    this.updateProgress(bookTitle, { status: 'consolidating' });

    let consolidatedCount = 0;

    for (const [chapterIndex, chunkIndices] of chapterChunks.entries()) {
      try {
        console.log(`  Consolidating chapter ${chapterIndex}: ${chunkIndices.length} chunks (${chunkIndices.join(', ')})`);
        const chapterPath = await consolidateChapterFromTemps(bookTitle, chapterIndex, chunkIndices);
        consolidatedCount++;
        this.updateProgress(bookTitle, { chaptersConsolidated: consolidatedCount });
        console.log(`  ✓ Chapter ${chapterIndex} consolidated (${consolidatedCount}/${chapterChunks.size})`);
      } catch (error) {
        console.error(`✗ Failed to consolidate chapter ${chapterIndex}:`, error);
        // Log error but continue with other chapters
        if (error instanceof Error) {
          console.error(`  Error details: ${error.message}`);
        }
      }
    }

    console.log(`✓ Consolidation complete: ${consolidatedCount}/${chapterChunks.size} chapters`);
  }

  /**
   * Update progress for a book
   * 
   * @param bookTitle - Book title
   * @param updates - Partial progress updates
   */
  private updateProgress(bookTitle: string, updates: Partial<GenerationProgress>): void {
    const current = this.progressMap.get(bookTitle);
    if (current) {
      Object.assign(current, updates);
      this.emit('progressUpdate', bookTitle, current);
    }
  }

  /**
   * Get progress for a specific book
   * 
   * @param bookTitle - Book title
   * @returns Progress or null if not found
   */
  getProgress(bookTitle: string): GenerationProgress | null {
    return this.progressMap.get(bookTitle) || null;
  }

  /**
   * Get all progress (for all books)
   * 
   * @returns Map of bookTitle -> progress
   */
  getAllProgress(): Map<string, GenerationProgress> {
    return new Map(this.progressMap);
  }

  /**
   * Cancel generation for a book (if queued)
   * Cannot cancel currently processing job
   * 
   * @param bookTitle - Book title
   * @returns True if cancelled, false if not found or already processing
   */
  cancelJob(bookTitle: string): boolean {
    const index = this.queue.findIndex(job => job.bookTitle === bookTitle);

    if (index !== -1) {
      this.queue.splice(index, 1);
      this.progressMap.delete(bookTitle);
      console.log(`🚫 Cancelled job: "${bookTitle}"`);
      this.emit('jobCancelled', bookTitle);
      return true;
    }

    return false;
  }

  /**
   * Get current processing status
   * 
   * @returns Worker status
   */
  getStatus(): {
    isProcessing: boolean;
    currentJob: string | null;
    queueLength: number;
  } {
    return {
      isProcessing: this.isProcessing,
      currentJob: this.currentJob?.bookTitle || null,
      queueLength: this.queue.length,
    };
  }
}

// Export singleton instance
export const audiobookWorker = new AudiobookGenerationWorker();
```

---

### Backend: Book Chunker (text splitting, byte-limit compliance)
**File:** `apps/backend/src/bookChunker.ts` | **Size:** 37.6 KB | **Lines:** 1165

```typescript
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import path from 'path';

/**
 * Check if a title is meaningful (not just a number, not too short, has semantic content)
 * @param title - The title to validate
 * @returns true if the title is meaningful and should be used, false if fallback needed
 */
function isMeaningfulTitle(title: string | undefined): boolean {
  if (!title) return false;
  const trimmed = title.trim();
  // Too short (less than 3 chars)
  if (trimmed.length < 3) return false;
  // Just a number
  if (/^\d+$/.test(trimmed)) return false;
  // Just roman numerals
  if (/^[IVXLCDM]+$/i.test(trimmed)) return false;
  return true;
}

/**
 * Chunks book text into smaller pieces for TTS processing
 * Breaks at sentence endings AFTER reaching minimum chunk size
 * @param fullText - The complete book text
 * @param minBytesPerChunk - Minimum bytes before looking for sentence end (default 200)
 * @returns Array of text chunks ending at sentence boundaries
 */
export function chunkBookText(
  fullText: string,
  minBytesPerChunk: number = 200
): string[] {
  const chunks: string[] = [];
  
  // Split by whitespace to get words
  const words = fullText.split(/\s+/).filter(word => word.length > 0);
  
  // Sentence-ending punctuation (period, exclamation, question mark, ellipsis)
  const isSentenceEnding = (word: string): boolean => {
    return /[.!?…]$/.test(word.trim());
  };
  
  let currentChunk = '';
  let i = 0;
  
  while (i < words.length) {
    const word = words[i];
    const testChunk = currentChunk ? `${currentChunk} ${word}` : word;
    currentChunk = testChunk;
    
    const byteLength = Buffer.byteLength(currentChunk, 'utf8');
    
    // Once we've reached minimum size, look for sentence ending
    if (byteLength >= minBytesPerChunk) {
      if (isSentenceEnding(word)) {
        // Perfect! End chunk at sentence boundary
        chunks.push(currentChunk);
        currentChunk = '';
        i++;
        continue;
      }
      
      // Continue adding words until we find sentence ending
      // (with safety limit to prevent extremely long chunks)
      if (byteLength >= 500) {
        // Safety: chunk is too long, break anyway
        chunks.push(currentChunk);
        currentChunk = '';
      }
    }
    
    i++;
  }
  
  // Add the last chunk if not empty
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Book metadata interface - extensible for future formats (EPUB, PDF, MOBI, etc.)
 */
export interface BookMetadata {
  title: string;           // Book title only (no author duplication)
  author: string;          // Primary author
  language?: string;       // Language code (cs, sk, en, etc.)
  publisher?: string;      // Publisher name
  year?: number;          // Publication year
  isbn?: string;          // ISBN if available
  
  // Hybrid dramatization metadata
  isDramatized?: boolean;
  dramatizationType?: 'llm-only' | 'hybrid-optimized' | 'hybrid-streaming' | 'on-demand' | 'parallel-background';
  charactersFound?: number;
  dramatizationCost?: number;
  dramatizationConfidence?: number;
  taggingMethodBreakdown?: {
    autoNarrator: number;
    ruleBased: number;
    llmFallback: number;
  };
}

/**
 * Parses book metadata from text file or EPUB buffer
 * Supports simple .txt format with metadata in first lines
 * Extensible for future formats (EPUB, PDF) through strategy pattern
 * 
 * @param contentOrBuffer - Complete book text (for txt) or Buffer (for epub/pdf)
 * @param format - Book format ('txt', 'epub', 'pdf', etc.)
 * @param filePath - Optional file path for EPUB/PDF parsing
 * @returns Parsed metadata or defaults
 */
export function parseBookMetadata(
  contentOrBuffer: string | Buffer,
  format: 'txt' | 'epub' | 'pdf' = 'txt',
  filePath?: string
): BookMetadata {
  // Strategy pattern - easy to extend for other formats
  switch (format) {
    case 'txt':
      if (typeof contentOrBuffer !== 'string') {
        throw new Error('TXT format requires string content');
      }
      return parseTxtMetadata(contentOrBuffer, filePath);
    case 'epub':
      if (typeof contentOrBuffer === 'string') {
        throw new Error('EPUB format requires Buffer');
      }
      return parseEpubMetadata(contentOrBuffer, filePath);
    case 'pdf':
      // TODO: Implement PDF metadata parsing
      return { title: 'Unknown', author: 'Unknown' };
    default:
      return { title: 'Unknown', author: 'Unknown' };
  }
}

/**
 * Parses metadata from simple .txt format
 * 
 * Priority for title:
 * 1. Filename (without extension) - most reliable for ebook files
 * 2. First meaningful line (fallback)
 * 
 * Expects format for author detection:
 * Line 1-5: Look for ALL CAPS author name
 * 
 * @param fullText - Complete text file content
 * @param filePath - Optional file path for better title extraction
 * @returns Extracted metadata
 */
function parseTxtMetadata(fullText: string, filePath?: string): BookMetadata {
  const lines = fullText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Extract title from filename (most reliable for ebook files)
  let title = 'Unknown Title';
  if (filePath) {
    const basename = filePath.replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '');
    if (basename && basename.length > 2) {
      title = basename;
    }
  }
  
  let author = 'Unknown Author';
  let language: string | undefined;
  
  // Search for author in first lines (look for ALL CAPS names)
  if (lines.length > 0) {
    // Skip common headers like "e Knizky.sk", "PDFknihy.sk"
    // ALSO skip voice tags like "NARRATOR: text" or "CHARACTER: text" (Gemini TTS format)
    const skipPatterns = [
      /^e\s+knizky/i, 
      /^pdf/i, 
      /^www\./i, 
      /^http/i, 
      /©/, 
      /obsah/i,
      /^[A-Z][A-Z0-9]*: /,  // Skip "SPEAKER: " lines (Gemini TTS format)
    ];
    
    let titleFromText = '';
    const authorLines: string[] = [];
    let foundAuthor = false;
    
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      const line = lines[i];
      
      // Skip metadata/publisher lines
      if (skipPatterns.some(pattern => pattern.test(line))) continue;
      
      // Skip very short lines (likely headers)
      if (line.length < 2) continue;
      
      // First valid line = potential title (only use if no filename)
      if (!titleFromText) {
        titleFromText = line;
        continue;
      }
      
      // Collect author lines (typically 1-3 consecutive uppercase lines after title)
      const isUppercase = line === line.toUpperCase();
      
      if (isUppercase && !foundAuthor) {
        // Author name (must be all uppercase)
        // Stop at first uppercase line that looks like author
        authorLines.push(line);
        foundAuthor = true;
        break;
      }
      
      // If we've skipped several lines after title and found no uppercase author,
      // stop looking (probably narrative text)
      if (!foundAuthor && i > 5) {
        break;
      }
    }
    
    // Only use title from text if we didn't get one from filename
    if (title === 'Unknown Title' && titleFromText) {
      title = titleFromText.trim();
      if (title === title.toUpperCase() && title.length < 50) {
        // Convert "POVÍDKY" to "Povídky"
        title = title.charAt(0) + title.slice(1).toLowerCase();
      }
    }
    
    if (authorLines.length > 0) {
      // Combine author lines (e.g., "ÉMILE" + "ZOLA" = "ÉMILE ZOLA")
      const combinedAuthor = authorLines.join(' ').trim();
      author = combinedAuthor;
      
      // Convert "ÉMILE ZOLA" to "Émile Zola"
      if (author === author.toUpperCase()) {
        author = author.split(' ').map(word => 
          word.charAt(0) + word.slice(1).toLowerCase()
        ).join(' ');
      }
    }
  }
  
  // Detect language from content (simple heuristic)
  const czechSlovakMarkers = ['ě', 'ř', 'ů', 'ľ', 'ĺ', 'ŕ'];
  const hasSpecialChars = czechSlovakMarkers.some(char => fullText.includes(char));
  
  if (hasSpecialChars) {
    // Distinguish Czech vs Slovak
    if (fullText.includes('ě') || fullText.includes('ř')) {
      language = 'cs'; // Czech
    } else if (fullText.includes('ľ') || fullText.includes('ĺ')) {
      language = 'sk'; // Slovak
    } else {
      language = 'cs'; // Default to Czech if unsure
    }
  }
  
  return {
    title,
    author,
    language,
  };
}

/**
 * Helper function to strip HTML tags from text
 * @param html - HTML content
 * @returns Plain text without HTML tags
 */
function stripHtml(html: string): string {
  // Remove script and style tags with their content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&apos;/g, "'");
  
  // Decode numeric HTML entities (&#160; &#8211; etc.)
  text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)));
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ');
  text = text.trim();
  
  return text;
}

/**
 * Parses EPUB file and extracts metadata
 * EPUB is a ZIP archive containing XML files (OPF metadata) and HTML/XHTML content
 * 
 * @param epubBuffer - EPUB file as Buffer
 * @param filePath - Optional file path for error messages
 * @returns Extracted metadata
 */
function parseEpubMetadata(epubBuffer: Buffer, filePath?: string): BookMetadata {
  try {
    const zip = new AdmZip(epubBuffer);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    
    // Find container.xml to locate OPF file
    const containerEntry = zip.getEntry('META-INF/container.xml');
    if (!containerEntry) {
      console.warn('⚠️ EPUB: container.xml not found');
      return { title: 'Unknown EPUB', author: 'Unknown' };
    }
    
    const containerXml = containerEntry.getData().toString('utf8');
    const containerData = parser.parse(containerXml);
    
    // Get OPF file path from container
    const rootfile = containerData?.container?.rootfiles?.rootfile;
    const opfPath = rootfile?.['@_full-path'];
    
    if (!opfPath) {
      console.warn('⚠️ EPUB: OPF path not found in container.xml');
      return { title: 'Unknown EPUB', author: 'Unknown' };
    }
    
    // Read OPF file
    const opfEntry = zip.getEntry(opfPath);
    if (!opfEntry) {
      console.warn(`⚠️ EPUB: OPF file not found at ${opfPath}`);
      return { title: 'Unknown EPUB', author: 'Unknown' };
    }
    
    const opfXml = opfEntry.getData().toString('utf8');
    const opfData = parser.parse(opfXml);
    
    // Extract metadata from OPF
    const metadata = opfData?.package?.metadata;
    
    let title = 'Unknown EPUB';
    let author = 'Unknown';
    let language: string | undefined;
    
    // Parse title (can be string or object with #text)
    if (metadata?.['dc:title']) {
      const titleData = metadata['dc:title'];
      title = typeof titleData === 'string' ? titleData : titleData['#text'] || title;
    }
    
    // Parse author/creator (can be string, object, or array)
    if (metadata?.['dc:creator']) {
      const creatorData = metadata['dc:creator'];
      
      if (Array.isArray(creatorData)) {
        // Multiple authors - take first
        const firstAuthor = creatorData[0];
        author = typeof firstAuthor === 'string' ? firstAuthor : firstAuthor['#text'] || author;
      } else if (typeof creatorData === 'string') {
        author = creatorData;
      } else if (creatorData['#text']) {
        author = creatorData['#text'];
      }
    }
    
    // Parse language (can be string or object)
    if (metadata?.['dc:language']) {
      const langData = metadata['dc:language'];
      const langCode = typeof langData === 'string' ? langData : langData['#text'];
      
      if (langCode) {
        // Normalize language code (e.g., 'en-US' -> 'en', 'cs-CZ' -> 'cs')
        language = langCode.split('-')[0].toLowerCase();
      }
    }
    
    console.log(`✓ EPUB metadata extracted: "${title}" by ${author} [${language || 'unknown'}]`);
    
    return {
      title,
      author,
      language,
    };
    
  } catch (error) {
    console.error('✗ Failed to parse EPUB metadata:', error);
    const fileName = filePath ? path.basename(filePath) : 'Unknown';
    return {
      title: fileName,
      author: 'Unknown',
    };
  }
}

/**
 * Extracts plain text content from EPUB file
 * Reads HTML/XHTML files in spine order and strips HTML tags
 * 
 * @param epubBuffer - EPUB file as Buffer
 * @returns Plain text content ready for TTS
 */
export function extractTextFromEpub(epubBuffer: Buffer): string {
  try {
    const zip = new AdmZip(epubBuffer);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    
    // Find container.xml to locate OPF file
    const containerEntry = zip.getEntry('META-INF/container.xml');
    if (!containerEntry) {
      throw new Error('container.xml not found in EPUB');
    }
    
    const containerXml = containerEntry.getData().toString('utf8');
    const containerData = parser.parse(containerXml);
    
    // Get OPF file path
    const rootfile = containerData?.container?.rootfiles?.rootfile;
    const opfPath = rootfile?.['@_full-path'];
    
    if (!opfPath) {
      throw new Error('OPF path not found in container.xml');
    }
    
    // Read OPF file
    const opfEntry = zip.getEntry(opfPath);
    if (!opfEntry) {
      throw new Error(`OPF file not found at ${opfPath}`);
    }
    
    const opfXml = opfEntry.getData().toString('utf8');
    const opfData = parser.parse(opfXml);
    
    // Get base directory of OPF file (for resolving relative paths)
    const opfDir = path.dirname(opfPath);
    
    // Get manifest (maps IDs to file paths)
    const manifest = opfData?.package?.manifest?.item;
    const manifestMap = new Map<string, string>();
    
    if (Array.isArray(manifest)) {
      manifest.forEach((item: any) => {
        const id = item['@_id'];
        const href = item['@_href'];
        if (id && href) {
          manifestMap.set(id, href);
        }
      });
    } else if (manifest) {
      const id = manifest['@_id'];
      const href = manifest['@_href'];
      if (id && href) {
        manifestMap.set(id, href);
      }
    }
    
    // Get spine (reading order)
    const spine = opfData?.package?.spine?.itemref;
    const spineItems: string[] = [];
    
    if (Array.isArray(spine)) {
      spine.forEach((item: any) => {
        const idref = item['@_idref'];
        if (idref) {
          spineItems.push(idref);
        }
      });
    } else if (spine) {
      const idref = spine['@_idref'];
      if (idref) {
        spineItems.push(idref);
      }
    }
    
    // Extract text from each spine item in order
    const textParts: string[] = [];
    
    for (const itemId of spineItems) {
      const href = manifestMap.get(itemId);
      if (!href) {
        console.warn(`⚠️ EPUB: Item ${itemId} not found in manifest`);
        continue;
      }
      
      // Resolve path relative to OPF directory
      const fullPath = path.posix.join(opfDir, href);
      const contentEntry = zip.getEntry(fullPath);
      
      if (!contentEntry) {
        console.warn(`⚠️ EPUB: Content file not found: ${fullPath}`);
        continue;
      }
      
      const htmlContent = contentEntry.getData().toString('utf8');
      const plainText = stripHtml(htmlContent);
      
      if (plainText.trim().length > 0) {
        textParts.push(plainText);
      }
    }
    
    const fullText = textParts.join('\n\n');
    console.log(`✓ EPUB text extracted: ${fullText.length} characters from ${spineItems.length} chapters`);
    
    return fullText;
    
  } catch (error) {
    console.error('✗ Failed to extract text from EPUB:', error);
    throw error;
  }
}

/**
 * Gets information about a chunked book
 * @param chunks - Array of text chunks
 * @returns Book metadata
 */
export function getBookInfo(chunks: string[]) {
  const totalWords = chunks.reduce((sum, chunk) => {
    return sum + chunk.split(/\s+/).length;
  }, 0);
  
  // Estimate reading time (average speaking rate: 150 words/minute)
  const estimatedSeconds = Math.ceil((totalWords / 150) * 60);
  
  return {
    totalChunks: chunks.length,
    totalWords,
    estimatedDuration: estimatedSeconds, // in seconds
  };
}

/**
 * Formats duration in seconds to "hh:mm" format
 * @param seconds - Duration in seconds
 * @returns Formatted string "hh:mm"
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// ========================================
// CHAPTER DETECTION (Phase 3)
// ========================================

/**
 * Chapter information
 */
export interface Chapter {
  index: number;           // Internal array position (1-based)
  displayNumber: number | null; // User-facing chapter number (null = front matter)
  isFrontMatter: boolean;  // true for TOC, dedication, copyright, etc.
  title: string;
  startOffset: number;     // Character position in full text
  endOffset: number;
  text: string;
}

/**
 * Language-agnostic chapter number extraction from title
 * Focuses on NUMBERS (universal) rather than words like "Chapter/Kapitola"
 * 
 * @param title - Chapter title
 * @returns Extracted number or null
 */
export function extractChapterNumber(title: string): number | null {
  const trimmed = title.trim();
  
  // Pattern 1: Arabic numerals at START of title
  // Matches: "1.", "1 -", "1:", "1 Chapter", "12. Kapitola", etc.
  const startNumberMatch = trimmed.match(/^(\d+)[\s.\-:]/);
  if (startNumberMatch) {
    return parseInt(startNumberMatch[1], 10);
  }
  
  // Pattern 2: Arabic numerals at END of title (common in many languages)
  // Matches: "Chapter 1", "Kapitola 12", "Глава 3", "第 1 章" approximation
  const endNumberMatch = trimmed.match(/\s(\d+)$/);
  if (endNumberMatch) {
    return parseInt(endNumberMatch[1], 10);
  }
  
  // Pattern 3: Roman numerals at START (I, II, III, IV, V, VI, VII, VIII, IX, X, etc.)
  const romanMatch = trimmed.match(/^(M{0,3})(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})(?:[\s.\-:]|$)/i);
  if (romanMatch) {
    const roman = romanMatch[0].replace(/[\s.\-:]$/, '').toUpperCase();
    const romanValue = romanToArabic(roman);
    if (romanValue > 0) {
      return romanValue;
    }
  }
  
  // Pattern 4: Standalone number (entire title is just a number)
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  
  // Pattern 5: Number somewhere in short title (< 30 chars)
  // Matches: "Part 1", "Část první", etc.
  if (trimmed.length < 30) {
    const anyNumberMatch = trimmed.match(/(\d+)/);
    if (anyNumberMatch) {
      return parseInt(anyNumberMatch[1], 10);
    }
  }
  
  return null;
}

/**
 * Convert Roman numeral string to Arabic number
 */
function romanToArabic(roman: string): number {
  const romanValues: { [key: string]: number } = {
    'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000
  };
  
  let result = 0;
  let prev = 0;
  
  for (let i = roman.length - 1; i >= 0; i--) {
    const curr = romanValues[roman[i].toUpperCase()];
    if (!curr) return 0; // Invalid character
    
    if (curr < prev) {
      result -= curr;
    } else {
      result += curr;
    }
    prev = curr;
  }
  
  return result;
}

// ========================================
// SHARED HEURISTICS FOR CHAPTER CLASSIFICATION
// Works for EPUB, TXT, and future formats
// ========================================

/**
 * Front matter title keywords (language-agnostic where possible)
 * These indicate non-chapter content that shouldn't be numbered
 */
const FRONT_MATTER_KEYWORDS = [
  // English
  'contents', 'table of contents', 'copyright', 'dedication', 'foreword',
  'preface', 'introduction', 'acknowledgement', 'acknowledgment', 'about',
  'author', 'note', 'notes', 'prologue', 'epilogue',
  // Czech/Slovak
  'obsah', 'věnování', 'předmluva', 'úvod', 'poděkování', 'poznámka', 'autor',
  // German
  'inhalt', 'inhaltsverzeichnis', 'widmung', 'vorwort', 'einleitung',
  // French
  'sommaire', 'dédicace', 'avant-propos', 'préface',
  // Spanish
  'índice', 'dedicatoria', 'prólogo', 'prefacio',
  // Common patterns
  'title page', 'cover', 'colophon',
];

/**
 * Check if title indicates front matter based on keywords
 */
export function isFrontMatterTitle(title: string): boolean {
  const normalized = title.toLowerCase().trim();
  return FRONT_MATTER_KEYWORDS.some(keyword => normalized.includes(keyword));
}

/**
 * Raw section data before classification
 */
interface RawSection {
  title: string;
  text: string;
  originalIndex: number; // Position in source (spine index for EPUB, line index for TXT)
}

/**
 * Classify sections into front matter vs real chapters using heuristics
 * 
 * Algorithm:
 * 1. Parse explicit chapter numbers from titles (multi-tier regex)
 * 2. Detect front matter by:
 *    - Title keywords (Contents, Dedication, etc.)
 *    - Short text (< 500 chars) at beginning before first numbered/long chapter
 * 3. Assign sequential numbers to real chapters without explicit numbers
 * 
 * @param sections - Raw sections from EPUB spine or TXT detection
 * @returns Classified chapters with displayNumber and isFrontMatter
 */
export function classifySections(sections: RawSection[]): Chapter[] {
  if (sections.length === 0) return [];
  
  // Step 1: Parse chapter numbers and detect keyword-based front matter
  const analysis = sections.map((section, idx) => ({
    ...section,
    parsedNumber: extractChapterNumber(section.title),
    isKeywordFrontMatter: isFrontMatterTitle(section.title),
    textLength: section.text.length,
  }));
  
  // Step 2: Find first section with a chapter number (real content marker)
  const firstNumberedIndex = analysis.findIndex(s => s.parsedNumber !== null);
  
  // Step 3: Classify front matter vs real chapters
  // Front matter = keyword match OR (no chapter number AND short AND before first numbered chapter)
  const classifiedSections = analysis.map((section, i) => {
    // If it has a chapter number, it's a real chapter (not front matter)
    if (section.parsedNumber !== null) {
      return { ...section, isFrontMatter: false };
    }
    // Keyword-based front matter detection
    if (section.isKeywordFrontMatter) {
      return { ...section, isFrontMatter: true };
    }
    // Short section before first numbered chapter = front matter
    const isFrontMatter = section.textLength < 700 && 
      (firstNumberedIndex === -1 || i < firstNumberedIndex);
    return { ...section, isFrontMatter };
  });
  
  // Step 4: Build chapters with proper titles
  // - index: sequential 1-based position (for file naming, array access)
  // - displayNumber: parsed from title (for UI) or sequential fallback
  // - title: extracted from HTML or fallback "Section N" / "Chapter N"
  const chapters: Chapter[] = [];
  let chapterNumber = 1;  // Counter for real chapters (starting from 1)
  let sectionNumber = 1;  // Counter for front matter sections (starting from 1)
  let currentOffset = 0;
  
  for (let i = 0; i < classifiedSections.length; i++) {
    const section = classifiedSections[i];
    
    // Determine displayNumber and generate title if needed
    let displayNumber: number | null;
    let finalTitle: string;
    
    if (section.isFrontMatter) {
      displayNumber = null;
      // For front matter: use extracted title only if meaningful, else "Section N"
      finalTitle = isMeaningfulTitle(section.title) ? section.title! : `Section ${sectionNumber}`;
      sectionNumber++;
    } else {
      // For real chapters: use parsed number or sequential
      if (section.parsedNumber !== null) {
        displayNumber = section.parsedNumber;
        // Update chapter counter to stay ahead of parsed numbers
        if (section.parsedNumber >= chapterNumber) {
          chapterNumber = section.parsedNumber + 1;
        }
      } else {
        displayNumber = chapterNumber++;
      }
      // For chapters: use extracted title only if meaningful, else "Chapter N"
      finalTitle = isMeaningfulTitle(section.title) ? section.title! : `Chapter ${displayNumber}`;
    }
    
    const chapterIndex = chapters.length + 1; // 1-based internal index
    const startOffset = currentOffset;
    const endOffset = currentOffset + section.text.length;
    
    chapters.push({
      index: chapterIndex,
      displayNumber,
      isFrontMatter: section.isFrontMatter,
      title: finalTitle,
      startOffset,
      endOffset,
      text: section.text,
    });
    
    currentOffset = endOffset + 2; // +2 for "\n\n" separator
    
    // Log classification
    if (section.isFrontMatter) {
      console.log(`📄 Section ${chapterIndex} (front matter): "${finalTitle}" (${section.textLength} chars)`);
    } else {
      console.log(`📖 Section ${chapterIndex} (Chapter ${displayNumber}): "${finalTitle}" (${section.textLength} chars)`);
    }
  }
  
  return chapters;
}

/**
 * Extract chapters from EPUB file using spine structure
 * Each spine item (typically an XHTML file) represents one chapter
 * 
 * @param epubBuffer - EPUB file as Buffer
 * @returns Array of chapters
 */
export function extractEpubChapters(epubBuffer: Buffer): Chapter[] {
  try {
    const zip = new AdmZip(epubBuffer);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    
    // Find container.xml to locate OPF file
    const containerEntry = zip.getEntry('META-INF/container.xml');
    if (!containerEntry) {
      throw new Error('container.xml not found in EPUB');
    }
    
    const containerXml = containerEntry.getData().toString('utf8');
    const containerData = parser.parse(containerXml);
    
    // Get OPF file path
    const rootfile = containerData?.container?.rootfiles?.rootfile;
    const opfPath = rootfile?.['@_full-path'];
    
    if (!opfPath) {
      throw new Error('OPF path not found in container.xml');
    }
    
    // Read OPF file
    const opfEntry = zip.getEntry(opfPath);
    if (!opfEntry) {
      throw new Error(`OPF file not found at ${opfPath}`);
    }
    
    const opfXml = opfEntry.getData().toString('utf8');
    const opfData = parser.parse(opfXml);
    
    // Get base directory of OPF file
    const opfDir = path.dirname(opfPath);
    
    // Get manifest (maps IDs to file paths)
    const manifest = opfData?.package?.manifest?.item;
    const manifestMap = new Map<string, string>();
    
    if (Array.isArray(manifest)) {
      manifest.forEach((item: any) => {
        const id = item['@_id'];
        const href = item['@_href'];
        if (id && href) {
          manifestMap.set(id, href);
        }
      });
    } else if (manifest) {
      const id = manifest['@_id'];
      const href = manifest['@_href'];
      if (id && href) {
        manifestMap.set(id, href);
      }
    }
    
    // Get spine (reading order)
    const spine = opfData?.package?.spine?.itemref;
    const spineItems: string[] = [];
    
    if (Array.isArray(spine)) {
      spine.forEach((item: any) => {
        const idref = item['@_idref'];
        if (idref) {
          spineItems.push(idref);
        }
      });
    } else if (spine) {
      const idref = spine['@_idref'];
      if (idref) {
        spineItems.push(idref);
      }
    }
    
    // Try to get chapter titles from TOC (toc.ncx or nav.xhtml)
    const chapterTitles = extractEpubTocTitles(zip, opfPath, opfData);
    
    // Collect all sections from spine
    const rawSections: RawSection[] = [];
    
    for (let i = 0; i < spineItems.length; i++) {
      const itemId = spineItems[i];
      const href = manifestMap.get(itemId);
      
      if (!href) {
        console.warn(`⚠️ EPUB: Item ${itemId} not found in manifest`);
        continue;
      }
      
      // Resolve path relative to OPF directory
      const fullPath = path.posix.join(opfDir, href);
      const contentEntry = zip.getEntry(fullPath);
      
      if (!contentEntry) {
        console.warn(`⚠️ EPUB: Content file not found: ${fullPath}`);
        continue;
      }
      
      const htmlContent = contentEntry.getData().toString('utf8');
      const plainText = stripHtml(htmlContent);
      
      // Skip empty or very short sections (< 50 chars - likely just empty wrapper)
      if (plainText.trim().length < 50) {
        if (plainText.trim().length > 0) {
          console.log(`⏭️ EPUB: Skipping empty section (${plainText.trim().length} chars): "${plainText.trim().substring(0, 50)}..."`);
        }
        continue;
      }
      
      // Extract title from HTML content (h1, h2, title tag) - most reliable source
      // Fallback will be computed in classifySections based on section type (Section N vs Chapter N)
      const extractedTitle = extractTitleFromHtml(htmlContent);
      // Use extracted title or placeholder that will be replaced in classifySections
      const title = extractedTitle || '';
      
      console.log(`📖 EPUB section ${rawSections.length + 1}: "${title || '(no title)'}" (from: ${extractedTitle ? 'HTML' : 'pending'}) (${plainText.trim().length} chars)`);
      rawSections.push({ title, text: plainText, originalIndex: i });
    }
    
    // Use shared classification logic
    const chapters = classifySections(rawSections);
    
    console.log(`✓ Extracted ${chapters.length} chapters from EPUB`);
    return chapters;
    
  } catch (error) {
    console.error('✗ Failed to extract EPUB chapters:', error);
    throw error;
  }
}

/**
 * Extract title from HTML content by looking at h1, h2, or title tags
 * 
 * @param html - HTML content
 * @returns Extracted title or null
 */
function extractTitleFromHtml(html: string): string | null {
  // Simple extraction - just get text from heading tags
  // Validation (meaningful title check) happens in classifySections
  
  // Try h1 tag first (most common for chapter titles)
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const title = stripHtml(h1Match[1]).trim();
    if (title.length > 0 && title.length < 200) return title;
  }
  
  // Try h2 tag
  const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (h2Match) {
    const title = stripHtml(h2Match[1]).trim();
    if (title.length > 0 && title.length < 200) return title;
  }
  
  // Try h3 tag
  const h3Match = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
  if (h3Match) {
    const title = stripHtml(h3Match[1]).trim();
    if (title.length > 0 && title.length < 200) return title;
  }
  
  // Skip <title> tag - it often contains filename/metadata, not chapter title
  // If no heading found, return null and let fallback handle it
  
  return null;
}

/**
 * Extract chapter titles from EPUB TOC (toc.ncx or nav.xhtml)
 * NOTE: This is now a fallback - we prefer extracting from HTML content
 * 
 * @param zip - EPUB zip archive
 * @param opfPath - Path to OPF file
 * @param opfData - Parsed OPF data
 * @returns Array of chapter titles (may be incomplete)
 */
function extractEpubTocTitles(zip: AdmZip, opfPath: string, opfData: any): string[] {
  const titles: string[] = [];
  
  try {
    // Try to find TOC reference in OPF
    const manifest = opfData?.package?.manifest?.item;
    let tocPath: string | null = null;
    
    if (Array.isArray(manifest)) {
      const tocItem = manifest.find((item: any) => 
        item['@_id'] === 'ncx' || 
        item['@_media-type'] === 'application/x-dtbncx+xml' ||
        item['@_properties']?.includes('nav')
      );
      if (tocItem) {
        tocPath = tocItem['@_href'];
      }
    }
    
    if (!tocPath) {
      return titles; // No TOC found
    }
    
    const opfDir = path.dirname(opfPath);
    const fullTocPath = path.posix.join(opfDir, tocPath);
    const tocEntry = zip.getEntry(fullTocPath);
    
    if (!tocEntry) {
      return titles;
    }
    
    const tocXml = tocEntry.getData().toString('utf8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    const tocData = parser.parse(tocXml);
    
    // Parse NCX format (older EPUB2)
    if (tocData.ncx) {
      const navPoints = tocData.ncx.navMap?.navPoint;
      if (Array.isArray(navPoints)) {
        navPoints.forEach((np: any) => {
          const label = np.navLabel?.text;
          if (label) {
            titles.push(typeof label === 'string' ? label : label['#text'] || 'Untitled');
          }
        });
      }
    }
    
    // Parse XHTML nav format (EPUB3)
    if (tocData.html || tocData.xhtml) {
      // Simple extraction - just get text from nav ol li elements
      // This is a basic implementation and may need refinement
      const htmlContent = tocXml;
      const navMatch = htmlContent.match(/<nav[^>]*epub:type="toc"[^>]*>([\s\S]*?)<\/nav>/i);
      if (navMatch) {
        const navContent = navMatch[1];
        const titleMatches = navContent.matchAll(/<a[^>]*>(.*?)<\/a>/gi);
        for (const match of titleMatches) {
          const title = stripHtml(match[1]).trim();
          if (title) {
            titles.push(title);
          }
        }
      }
    }
    
  } catch (error) {
    console.warn('⚠️ Failed to extract TOC titles:', error);
  }
  
  return titles;
}

/**
 * Detect chapters in plain text using common chapter markers
 * 
 * Patterns detected:
 * - "Chapter 1", "Chapter I", "Chapter One"
 * - "1.", "I.", "Part 1"
 * - "===" or "---" separators
 * 
 * @param text - Full book text
 * @returns Array of chapters (or single chapter if none detected)
 */
export function detectTextChapters(text: string): Chapter[] {
  // Chapter detection patterns (case-insensitive)
  const patterns = [
    /^Chapter\s+(\d+|[IVXLCDM]+|\w+)/mi,     // "Chapter 1", "Chapter I", "Chapter One"
    /^(\d+|[IVXLCDM]+)\.\s+[A-Z]/mi,         // "1. Title", "I. Title"
    /^={3,}$/mi,                               // "===" separator
    /^-{3,}$/mi,                               // "---" separator
    /^PART\s+(\d+|[IVXLCDM]+)/mi,            // "PART 1", "PART I"
    /^BOOK\s+(\d+|[IVXLCDM]+)/mi,            // "BOOK 1", "BOOK I"
  ];
  
  const lines = text.split('\n');
  const chapterStarts: Array<{ lineIndex: number; title: string; charOffset: number }> = [];
  
  let charOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if this line matches any chapter pattern
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        // Extract title (use next non-empty line if current line is just a marker)
        let title = line;
        if (line.match(/^={3,}$/) || line.match(/^-{3,}$/)) {
          // Separator found - title might be above or below
          if (i > 0 && lines[i - 1].trim().length > 0) {
            title = lines[i - 1].trim();
          } else if (i < lines.length - 1 && lines[i + 1].trim().length > 0) {
            title = lines[i + 1].trim();
          }
        }
        
        chapterStarts.push({
          lineIndex: i,
          title: title.substring(0, 100), // Limit title length
          charOffset,
        });
        break; // Don't check other patterns for this line
      }
    }
    
    charOffset += lines[i].length + 1; // +1 for newline
  }
  
  // If no chapters detected, treat entire text as single chapter
  if (chapterStarts.length === 0) {
    return createSingleChapter(text, 'Full Text');
  }
  
  // Build raw sections from detected starts
  const rawSections: RawSection[] = [];
  for (let i = 0; i < chapterStarts.length; i++) {
    const start = chapterStarts[i];
    const nextStart = chapterStarts[i + 1];
    
    const startOffset = start.charOffset;
    const endOffset = nextStart ? nextStart.charOffset : text.length;
    const chapterText = text.substring(startOffset, endOffset).trim();
    
    rawSections.push({
      title: start.title,
      text: chapterText,
      originalIndex: i,
    });
  }
  
  // Use shared classification logic
  const chapters = classifySections(rawSections);
  
  console.log(`✓ Detected ${chapters.length} chapters in plain text`);
  return chapters;
}

/**
 * Create a single chapter from entire text (fallback when no chapters detected)
 * 
 * @param text - Full book text
 * @param title - Chapter title
 * @returns Array with single chapter
 */
export function createSingleChapter(text: string, title: string): Chapter[] {
  console.log('✓ No chapters detected - treating as single chapter');
  return [
    {
      index: 0,
      displayNumber: 1,
      isFrontMatter: false,
      title,
      startOffset: 0,
      endOffset: text.length,
      text: text.trim(),
    },
  ];
}
```

---

### Backend: Cost Tracker (API usage monitoring)
**File:** `apps/backend/src/costTracker.ts` | **Size:** 12.3 KB | **Lines:** 326

```typescript
/**
 * VoiceLibri - Cost Tracking Module
 * 
 * Tracks LLM/TTS token usage and calculates costs per audiobook.
 * Saves cost summary as JSON to audiobook folder.
 * 
 * Pricing (as of 2025):
 * - gemini-2.5-flash (character extraction): $0.30/M input, $2.50/M output
 * - gemini-2.5-flash (dramatization): $0.50/M input, $2.50/M output  
 * - gemini-2.5-flash-tts (audio): $0.50/M input, $10.00/M output
 */

import fs from 'fs';
import path from 'path';
import { getAudiobooksDir } from './audiobookManager.js';

/**
 * Token estimation coefficients (validated with Google Vertex AI CountTokens API)
 * 
 * These values were measured using real text samples with the official Gemini tokenizer:
 * - Slovak sample: 2.203 tokens/word
 * - Czech sample: 2.092 tokens/word
 * - English sample: 1.379 tokens/word
 */
export const TOKEN_COEFFICIENTS = {
  // Slavic languages (validated average of Czech + Slovak)
  SLAVIC_TOKENS_PER_WORD: 2.15,
  
  // English
  ENGLISH_TOKENS_PER_WORD: 1.38,
  
  // Fallback for unknown languages (conservative middle ground)
  DEFAULT_TOKENS_PER_WORD: 1.76,
};

/**
 * Count words in text (excluding punctuation)
 */
export function countWords(text: string): number {
  const cleaned = text.replace(/[„""\'''«»‹›,\.!?;:—–\-\(\)\[\]]/g, ' ');
  return cleaned.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Estimate tokens from text based on language
 * 
 * @param text - The text to estimate tokens for
 * @param language - Language code (e.g., 'cs', 'sk', 'en') or 'slavic', 'english'
 * @returns Estimated token count
 */
export function estimateTokens(text: string, language?: string): number {
  const words = countWords(text);
  
  // Determine coefficient based on language
  let coefficient = TOKEN_COEFFICIENTS.DEFAULT_TOKENS_PER_WORD;
  
  if (language) {
    const lang = language.toLowerCase();
    if (['cs', 'sk', 'pl', 'uk', 'ru', 'hr', 'sr', 'bg', 'sl', 'slavic', 'czech', 'slovak'].includes(lang)) {
      coefficient = TOKEN_COEFFICIENTS.SLAVIC_TOKENS_PER_WORD;
    } else if (['en', 'english'].includes(lang)) {
      coefficient = TOKEN_COEFFICIENTS.ENGLISH_TOKENS_PER_WORD;
    }
  }
  
  return Math.ceil(words * coefficient);
}

/**
 * Pricing rates per million tokens (USD)
 */
export const PRICING = {
  CHARACTER_EXTRACTION: {
    model: 'gemini-2.5-flash',
    inputPerMillion: 0.30,
    outputPerMillion: 2.50,
  },
  DRAMATIZATION: {
    model: 'gemini-2.5-flash',
    inputPerMillion: 0.50,
    outputPerMillion: 2.50,
  },
  AUDIO_GENERATION: {
    model: 'gemini-2.5-flash-tts',
    inputPerMillion: 0.50,
    outputPerMillion: 10.00,
  },
  TRANSLATION: {
    model: 'gemini-2.5-flash',
    inputPerMillion: 0.30,
    outputPerMillion: 2.50,
  },
};

/**
 * Token usage for a single process
 */
export interface ProcessUsage {
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  subtotal: number;  // inputCost + outputCost
}

/**
 * Complete cost summary for an audiobook
 */
export interface CostSummary {
  title: string;
  generatedAt: string;
  
  // Token usage by process
  characterExtraction: ProcessUsage;
  translation: ProcessUsage;
  dramatization: ProcessUsage;
  audioGeneration: ProcessUsage;
  
  // Totals
  totalInputTokens: number;
  totalOutputTokens: number;
  totalInputCost: number;
  totalOutputCost: number;
  grandTotal: number;
  
  // Duration and unit price
  totalDurationHours: number;
  costPerHour: number;
}

/**
 * Cost Tracker - accumulates usage during audiobook generation
 */
export class CostTracker {
  private title: string;
  private characterExtraction: ProcessUsage = { inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, subtotal: 0 };
  private translation: ProcessUsage = { inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, subtotal: 0 };
  private dramatization: ProcessUsage = { inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, subtotal: 0 };
  private audioGeneration: ProcessUsage = { inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, subtotal: 0 };
  private totalDurationSeconds: number = 0;
  
  constructor(title: string) {
    this.title = title;
  }
  
  /**
   * Add character extraction usage
   */
  addCharacterExtraction(inputTokens: number, outputTokens: number): void {
    const pricing = PRICING.CHARACTER_EXTRACTION;
    this.characterExtraction.inputTokens += inputTokens;
    this.characterExtraction.outputTokens += outputTokens;
    this.characterExtraction.inputCost = (this.characterExtraction.inputTokens / 1_000_000) * pricing.inputPerMillion;
    this.characterExtraction.outputCost = (this.characterExtraction.outputTokens / 1_000_000) * pricing.outputPerMillion;
    this.characterExtraction.subtotal = this.characterExtraction.inputCost + this.characterExtraction.outputCost;
  }
  
  /**
   * Add translation usage
   */
  addTranslation(inputTokens: number, outputTokens: number): void {
    const pricing = PRICING.TRANSLATION;
    this.translation.inputTokens += inputTokens;
    this.translation.outputTokens += outputTokens;
    this.translation.inputCost = (this.translation.inputTokens / 1_000_000) * pricing.inputPerMillion;
    this.translation.outputCost = (this.translation.outputTokens / 1_000_000) * pricing.outputPerMillion;
    this.translation.subtotal = this.translation.inputCost + this.translation.outputCost;
  }
  
  /**
   * Add dramatization usage
   */
  addDramatization(inputTokens: number, outputTokens: number): void {
    const pricing = PRICING.DRAMATIZATION;
    this.dramatization.inputTokens += inputTokens;
    this.dramatization.outputTokens += outputTokens;
    this.dramatization.inputCost = (this.dramatization.inputTokens / 1_000_000) * pricing.inputPerMillion;
    this.dramatization.outputCost = (this.dramatization.outputTokens / 1_000_000) * pricing.outputPerMillion;
    this.dramatization.subtotal = this.dramatization.inputCost + this.dramatization.outputCost;
  }
  
  /**
   * Add audio generation usage
   */
  addAudioGeneration(inputTokens: number, outputTokens: number): void {
    const pricing = PRICING.AUDIO_GENERATION;
    this.audioGeneration.inputTokens += inputTokens;
    this.audioGeneration.outputTokens += outputTokens;
    this.audioGeneration.inputCost = (this.audioGeneration.inputTokens / 1_000_000) * pricing.inputPerMillion;
    this.audioGeneration.outputCost = (this.audioGeneration.outputTokens / 1_000_000) * pricing.outputPerMillion;
    this.audioGeneration.subtotal = this.audioGeneration.inputCost + this.audioGeneration.outputCost;
  }
  
  /**
   * Set total audio duration
   */
  setDuration(seconds: number): void {
    this.totalDurationSeconds = seconds;
  }
  
  /**
   * Get current cost summary
   */
  getSummary(): CostSummary {
    const totalInputTokens = 
      this.characterExtraction.inputTokens +
      this.translation.inputTokens +
      this.dramatization.inputTokens +
      this.audioGeneration.inputTokens;
      
    const totalOutputTokens =
      this.characterExtraction.outputTokens +
      this.translation.outputTokens +
      this.dramatization.outputTokens +
      this.audioGeneration.outputTokens;
      
    const totalInputCost =
      this.characterExtraction.inputCost +
      this.translation.inputCost +
      this.dramatization.inputCost +
      this.audioGeneration.inputCost;
      
    const totalOutputCost =
      this.characterExtraction.outputCost +
      this.translation.outputCost +
      this.dramatization.outputCost +
      this.audioGeneration.outputCost;
      
    const grandTotal = totalInputCost + totalOutputCost;
    const totalDurationHours = this.totalDurationSeconds / 3600;
    const costPerHour = totalDurationHours > 0 ? grandTotal / totalDurationHours : 0;
    
    return {
      title: this.title,
      generatedAt: new Date().toISOString(),
      characterExtraction: { ...this.characterExtraction },
      translation: { ...this.translation },
      dramatization: { ...this.dramatization },
      audioGeneration: { ...this.audioGeneration },
      totalInputTokens,
      totalOutputTokens,
      totalInputCost,
      totalOutputCost,
      grandTotal,
      totalDurationHours,
      costPerHour,
    };
  }
  
  /**
   * Save cost summary to audiobook folder as JSON
   */
  async saveToFile(): Promise<string> {
    const summary = this.getSummary();
    const bookFolder = path.join(getAudiobooksDir(), this.title);
    
    // Ensure folder exists
    await fs.promises.mkdir(bookFolder, { recursive: true });
    
    const jsonPath = path.join(bookFolder, 'cost_summary.json');
    const jsonContent = JSON.stringify(summary, null, 2);
    
    await fs.promises.writeFile(jsonPath, jsonContent, 'utf8');
    console.log(`   💰 Cost summary saved: ${jsonPath}`);
    
    return jsonPath;
  }
  
  /**
   * Generate formatted text report
   */
  getTextReport(): string {
    const s = this.getSummary();
    
    const lines = [
      `═══════════════════════════════════════════════════════════════════════`,
      `                    VOICELIBRI COST SUMMARY`,
      `═══════════════════════════════════════════════════════════════════════`,
      `Title: ${s.title}`,
      `Generated: ${s.generatedAt}`,
      ``,
      `───────────────────────────────────────────────────────────────────────`,
      `Process                  Input Tokens   Output Tokens   Subtotal`,
      `───────────────────────────────────────────────────────────────────────`,
      `Character Extraction     ${s.characterExtraction.inputTokens.toLocaleString().padStart(12)}   ${s.characterExtraction.outputTokens.toLocaleString().padStart(13)}   $${s.characterExtraction.subtotal.toFixed(4)}`,
      `Translation              ${s.translation.inputTokens.toLocaleString().padStart(12)}   ${s.translation.outputTokens.toLocaleString().padStart(13)}   $${s.translation.subtotal.toFixed(4)}`,
      `Dramatization            ${s.dramatization.inputTokens.toLocaleString().padStart(12)}   ${s.dramatization.outputTokens.toLocaleString().padStart(13)}   $${s.dramatization.subtotal.toFixed(4)}`,
      `Audio Generation         ${s.audioGeneration.inputTokens.toLocaleString().padStart(12)}   ${s.audioGeneration.outputTokens.toLocaleString().padStart(13)}   $${s.audioGeneration.subtotal.toFixed(4)}`,
      `───────────────────────────────────────────────────────────────────────`,
      `TOTAL                    ${s.totalInputTokens.toLocaleString().padStart(12)}   ${s.totalOutputTokens.toLocaleString().padStart(13)}   $${s.grandTotal.toFixed(4)}`,
      ``,
      `Duration: ${s.totalDurationHours.toFixed(2)} hours`,
      `Cost per hour: $${s.costPerHour.toFixed(4)}`,
      `═══════════════════════════════════════════════════════════════════════`,
    ];
    
    return lines.join('\n');
  }
}

// Global cost tracker instance (per audiobook generation)
let currentTracker: CostTracker | null = null;

/**
 * Start tracking costs for a new audiobook
 */
export function startCostTracking(title: string): CostTracker {
  currentTracker = new CostTracker(title);
  console.log(`   💰 Cost tracking started for: ${title}`);
  return currentTracker;
}

/**
 * Get current cost tracker
 */
export function getCostTracker(): CostTracker | null {
  return currentTracker;
}

/**
 * Clear cost tracker
 */
export function clearCostTracker(): void {
  currentTracker = null;
}
```

---

### Backend: Dialogue Parser Simple (dialogue extraction from text)
**File:** `apps/backend/src/dialogueParserSimple.ts` | **Size:** 8.3 KB | **Lines:** 282

```typescript
/**
 * SIMPLIFIED Dialogue Parser for Phase 1 PoC
 * 
 * Focuses on core functionality:
 * - Extract ALL quoted text (Czech quotes „...")
 * - Identify speakers from attribution (Lili poznamenala, Ragowski zvolal)
 * - Split text into narrator/dialogue segments
 */

import { toTTSSpeakerAlias } from './llmCharacterAnalyzer.js';

export interface DialogueSegment {
  type: 'narrator' | 'dialogue';
  speaker: string;
  text: string;
  startIndex: number;
  endIndex: number;
}

export interface CharacterInfo {
  name: string;
  gender: 'male' | 'female' | 'neutral';
  appearanceCount: number;
}

export interface VoiceProfile {
  gender: 'male' | 'female' | 'neutral';
}

/**
 * Detects ALL dialogues in text using simple regex
 */
export function detectDialogues(text: string): DialogueSegment[] {
  const segments: DialogueSegment[] = [];
  
  // Strategy: Find speaker names in text BEFORE quotes, then extract quotes
  
  // First pass: Find all quotes
  const quoteRegex = /[\u201E\u201C„"]([^\u201E\u201C""]+)[\u201E\u201C""]/g;
  const quotes: Array<{
    text: string;
    index: number;
    length: number;
  }> = [];
  
  let match;
  while ((match = quoteRegex.exec(text)) !== null) {
    quotes.push({
      text: match[1].trim(),
      index: match.index,
      length: match[0].length,
    });
  }
  
  // Second pass: For each quote, look backwards for speaker attribution
  const dialogues: Array<{
    text: string;
    speaker: string;
    index: number;
    length: number;
  }> = [];
  
  let lastKnownSpeaker = 'NARRATOR';
  
  for (const quote of quotes) {
    let speaker = lastKnownSpeaker;
    
    // Look at text BEFORE the quote (up to 100 chars back)
    const startSearch = Math.max(0, quote.index - 100);
    const beforeText = text.substring(startSearch, quote.index);
    
    // Pattern 1: verb + Name immediately before quote
    // Example: "poznamenala Lili Saffro. „..."
    const verbNamePattern = /(zvolal|zvolala|poznamenal|poznamenala|řekl|řekla|odpověděl|odpověděla|prohlásil|prohlásila|dodal|dodala|podotkl|podotkla)\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+(\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)*)[,.]?\s*$/;
    const verbNameMatch = beforeText.match(verbNamePattern);
    
    if (verbNameMatch) {
      speaker = toTTSSpeakerAlias(verbNameMatch[2]);
      lastKnownSpeaker = speaker;
    } else {
      // Pattern 2: Name + action verb (not dialogue verb) before quote
      // Example: "Ragowski zavrčel... „..."
      const nameActionPattern = /([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)\s+([a-záčďéěíňóřšťúůýž]+)[^.!?]*[,.]?\s*$/;
      const nameActionMatch = beforeText.match(nameActionPattern);
      
      if (nameActionMatch) {
        speaker = toTTSSpeakerAlias(nameActionMatch[1]);
        lastKnownSpeaker = speaker;
      }
    }
    
    dialogues.push({
      text: quote.text,
      speaker: speaker,
      index: quote.index,
      length: quote.length,
    });
  }
  
  // Third pass: Split text into narrator + dialogue segments
  let lastIndex = 0;
  
  for (const dialogue of dialogues) {
    // Add narrator part BEFORE this dialogue
    if (dialogue.index > lastIndex) {
      const narratorText = text.substring(lastIndex, dialogue.index).trim();
      if (narratorText.length > 0) {
        // Clean up narrator text - remove attribution at the end
        const cleanedNarrator = narratorText
          .replace(/\s+(zvolal|zvolala|poznamenal|poznamenala|řekl|řekla|odpověděl|odpověděla|prohlásil|prohlásila|dodal|dodala|podotkl|podotkla)(\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+(\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)*)?[,.]?\s*$/i, '')
          .trim();
        
        if (cleanedNarrator.length > 0 && cleanedNarrator !== '.') {
          segments.push({
            type: 'narrator',
            speaker: 'NARRATOR',
            text: cleanedNarrator,
            startIndex: lastIndex,
            endIndex: dialogue.index,
          });
        }
      }
    }
    
    // Add dialogue
    segments.push({
      type: 'dialogue',
      speaker: dialogue.speaker,
      text: dialogue.text,
      startIndex: dialogue.index,
      endIndex: dialogue.index + dialogue.length,
    });
    
    lastIndex = dialogue.index + dialogue.length;
  }
  
  // Add remaining narrator text
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex).trim();
    if (remainingText.length > 0) {
      segments.push({
        type: 'narrator',
        speaker: 'NARRATOR',
        text: remainingText,
        startIndex: lastIndex,
        endIndex: text.length,
      });
    }
  }
  
  return segments;
}

/**
 * Identifies characters from segments
 */
export function identifyCharacters(segments: DialogueSegment[]): Map<string, CharacterInfo> {
  const characters = new Map<string, CharacterInfo>();
  
  for (const segment of segments) {
    const speaker = segment.speaker;
    
    if (!characters.has(speaker)) {
      let gender: 'male' | 'female' | 'neutral' = 'neutral';
      
      if (speaker === 'NARRATOR') {
        gender = 'neutral';
      } else {
        // Czech name gender heuristics
        const lowerName = speaker.toLowerCase();
        
        // Female indicators: ends with -a, -e, -ie, -í
        // Common female names: Anna, Marie, Lucie, Jana, Lili, etc.
        if (lowerName.endsWith('a') || lowerName.endsWith('e') || 
            lowerName.endsWith('ie') || lowerName.endsWith('í') ||
            lowerName.includes('lili') || lowerName.includes('marie')) {
          gender = 'female';
        } else {
          gender = 'male';
        }
      }
      
      characters.set(speaker, {
        name: speaker,
        gender: gender,
        appearanceCount: 1,
      });
    } else {
      const char = characters.get(speaker)!;
      char.appearanceCount++;
    }
  }
  
  return characters;
}

/**
 * Inserts voice tags using Gemini TTS format: SPEAKER: text
 */
export function insertVoiceTags(segments: DialogueSegment[]): string {
  const lines: string[] = [];
  
  for (const segment of segments) {
    // Each segment is one line: SPEAKER: text
    lines.push(`${segment.speaker}: ${segment.text}`);
  }
  
  return lines.join('\n');
}

/**
 * Removes speaker prefixes for TTS (SPEAKER: pattern)
 */
export function removeVoiceTags(taggedText: string): string {
  return taggedText
    .replace(/^[A-Z][A-Z0-9]*:\s*/gm, '')  // Remove SPEAKER: prefix from start of lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts voice segments from Gemini TTS format (SPEAKER: text)
 */
export function extractVoiceSegments(taggedText: string): Array<{ voice: string; text: string }> {
  const segments: Array<{ voice: string; text: string }> = [];
  const lines = taggedText.split('\n');
  const voicePattern = /^([A-Z][A-Z0-9]*):\s*(.+)$/;
  
  for (const line of lines) {
    const match = line.match(voicePattern);
    if (match) {
      segments.push({
        voice: match[1],
        text: match[2].trim(),
      });
    }
  }
  
  return segments;
}

/**
 * Generates voice map
 */
export function generatePoCVoiceMap(characters: Map<string, CharacterInfo>): Record<string, VoiceProfile> {
  const voiceMap: Record<string, VoiceProfile> = {};
  
  for (const [name, info] of characters.entries()) {
    voiceMap[name] = {
      gender: info.gender,
    };
  }
  
  return voiceMap;
}

/**
 * Full processing pipeline
 */
export function processDramatizedText(inputText: string) {
  console.log('🎭 Starting dramatized text processing (SIMPLE mode)...');
  
  const segments = detectDialogues(inputText);
  console.log(`✓ Detected ${segments.length} segments`);
  
  const characters = identifyCharacters(segments);
  console.log(`✓ Identified ${characters.size} unique characters`);
  
  const taggedText = insertVoiceTags(segments);
  console.log(`✓ Inserted voice tags`);
  
  const voiceMap = generatePoCVoiceMap(characters);
  console.log(`✓ Generated voice map`);
  
  return {
    taggedText,
    segments,
    characters,
    voiceMap,
  };
}
```

---

### Backend: Dramatized Chunker Simple (dramatization-aware text splitting)
**File:** `apps/backend/src/dramatizedChunkerSimple.ts` | **Size:** 13.6 KB | **Lines:** 426

```typescript
/**
 * Dramatized Chunker Simple - Chunking with Voice Tags (PoC)
 * 
 * Simple chunking approach for PoC that:
 * 1. Preserves voice segments within chunks
 * 2. Ensures chunks don't split in the middle of a voice segment
 * 3. Maintains voice tag structure
 * 4. Generates metadata with speaker information
 * 
 * Part of Dramatized TTS implementation (PoC Phase)
 * 
 * FORMAT: Uses official Gemini TTS multi-speaker format:
 *   SPEAKER: text content on same line
 * 
 * Character alias rules (per Gemini TTS docs):
 * - Only alphanumeric characters (A-Z, a-z, 0-9)
 * - ALL CAPS for speaker names
 * - No spaces, underscores, hyphens, dots, emojis or diacritics
 * - Multi-word names are CONCATENATED (e.g., JOSEPHRAGOWSKI)
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Voice segment within text
 */
export interface VoiceSegment {
  speaker: string;
  text: string;
  startIndex: number;
  endIndex: number;
  speechStyle?: string;
}

/**
 * Chunk metadata
 */
export interface ChunkMetadata {
  id: string;
  characterCount: number;
  voiceSegments: number;
  estimatedDuration: number; // seconds (rough estimate: 150 words/min)
  speakers: string[];
}

/**
 * Chunking result
 */
export interface ChunkingResult {
  chunks: string[];
  metadata: ChunkMetadata[];
  totalChunks: number;
}

/**
 * Extract voice segments from tagged text
 * 
 * Parses the official Gemini TTS multi-speaker format:
 *   SPEAKER: text content
 * 
 * Each line starting with "SPEAKER: " is a new voice segment.
 * Speaker names are ALL CAPS alphanumeric only.
 * 
 * @param text - Tagged text with "SPEAKER: text" format
 * @returns Array of voice segments
 */
export function extractVoiceSegments(text: string): VoiceSegment[] {
  const segments: VoiceSegment[] = [];
  
  // Pattern: Line starts with ALLCAPS speaker name followed by colon and space
  // Speaker names: only A-Z and 0-9, no spaces/underscores/diacritics
  const speakerLinePattern = /^([A-Z][A-Z0-9]*): (.+)$/;
  
  const lines = text.split('\n');
  let currentSpeaker: string | null = null;
  let currentText: string[] = [];
  let startIndex = 0;
  let currentLineStart = 0;
  let pendingSpeechStyle: string | undefined;
  let currentSpeechStyle: string | undefined;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const speakerMatch = line.match(speakerLinePattern);
    const trimmedLine = line.trim();
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    const nextIsSpeaker = speakerLinePattern.test(nextLine);
    const isDirectiveLine = !speakerMatch && trimmedLine.length > 0 && trimmedLine !== 'NARRATOR:' && nextIsSpeaker;
    
    if (speakerMatch) {
      // Save previous segment if exists
      if (currentSpeaker && currentText.length > 0) {
        const segmentText = currentText.join(' ').trim();
        if (segmentText) {
          segments.push({
            speaker: currentSpeaker,
            text: segmentText,
            startIndex,
            endIndex: currentLineStart,
            speechStyle: currentSpeechStyle
          });
        }
      }

      // Start new segment with speaker from this line
      currentSpeaker = speakerMatch[1];
      let speakerText = speakerMatch[2];

      // If a directive is appended to the end of the speaker line and the next line
      // starts with a SPEAKER tag, extract it and apply to the next segment.
      if (nextIsSpeaker) {
        const appendedDirectiveMatch = speakerText.match(/^(.*?)(\s+[A-Z][a-z]+\s+as\s+[^\n]+)$/);
        if (appendedDirectiveMatch) {
          speakerText = appendedDirectiveMatch[1].trim();
          pendingSpeechStyle = appendedDirectiveMatch[2].trim();
        }
      }

      currentText = [speakerText]; // Text after "SPEAKER: " (without appended directive)
      startIndex = currentLineStart;
      currentSpeechStyle = pendingSpeechStyle;
      pendingSpeechStyle = undefined;
    } else if (isDirectiveLine) {
      // Directive line before a speaker line
      pendingSpeechStyle = trimmedLine.replace(/:\s*$/, '').trim();
      currentLineStart += line.length + 1;
      continue;
    } else if (currentSpeaker && line.trim()) {
      // Continuation line - append to current segment
      currentText.push(line.trim());
    }
    
    currentLineStart += line.length + 1; // +1 for newline
  }
  
  // Save final segment
  if (currentSpeaker && currentText.length > 0) {
    const segmentText = currentText.join(' ').trim();
    if (segmentText) {
      segments.push({
        speaker: currentSpeaker,
        text: segmentText,
        startIndex,
        endIndex: currentLineStart,
        speechStyle: currentSpeechStyle
      });
    }
  }

  return mergeInterruptedDialogueFragments(segments);
}

const ATTRIBUTION_VERBS = new Set([
  'said', 'asked', 'replied', 'answered', 'whispered', 'muttered', 'exclaimed', 'thought', 'wondered',
  'remarked', 'commented', 'added', 'continued', 'began', 'started', 'finished', 'declared', 'stated',
  'mentioned', 'noted', 'observed', 'insisted', 'urged', 'warned', 'promised', 'admitted', 'denied',
  'řekl', 'řekla', 'zvolal', 'zvolala', 'poznamenal', 'poznamenala', 'odpověděl', 'odpověděla',
  'prohlásil', 'prohlásila', 'dodal', 'dodala', 'podotkl', 'podotkla', 'zeptal', 'zeptala',
  'pomyslel', 'pomyslela', 'uvažoval', 'uvažovala', 'přemýšlel', 'přemýšlela', 'zavolal', 'zavolala',
  'křikl', 'křikla', 'zašeptal', 'zašeptala', 'zabručel', 'zabručela'
]);

function isAttributionWordOnly(text: string): boolean {
  const cleaned = text.replace(/[.,!?"“”„'’\-–—]+/g, ' ').trim().toLowerCase();
  if (!cleaned) return false;
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  return tokens.length === 1 && ATTRIBUTION_VERBS.has(tokens[0]);
}

function mergeInterruptedDialogueFragments(segments: VoiceSegment[]): VoiceSegment[] {
  const merged: VoiceSegment[] = [];
  let i = 0;

  while (i < segments.length) {
    const current = segments[i];
    const next = segments[i + 1];
    const nextNext = segments[i + 2];

    if (current && next && nextNext && next.speaker === 'NARRATOR') {
      const fragment = next.text.trim();
      const hasSentenceEnd = /[.!?]/.test(fragment);
      if (!hasSentenceEnd || isAttributionWordOnly(fragment)) {
        if (current.speaker === nextNext.speaker) {
          const combinedText = mergeSpeakerQuotes(current.text, nextNext.text);
          merged.push({
            speaker: current.speaker,
            text: combinedText,
            startIndex: current.startIndex,
            endIndex: nextNext.endIndex,
            speechStyle: current.speechStyle ?? nextNext.speechStyle
          });
        } else {
          merged.push(current, nextNext);
        }
        i += 3;
        continue;
      }
    }

    merged.push(current);
    i += 1;
  }

  return merged;
}

function mergeSpeakerQuotes(left: string, right: string): string {
  const combined = `${left} ${right}`.replace(/["“”„]/g, ' ');
  return combined.replace(/\s+/g, ' ').trim();
}

/**
 * Estimate audio duration from text
 * 
 * Rough estimate: 150 words per minute (average reading speed)
 * 
 * @param text - Plain text (without tags)
 * @returns Estimated duration in seconds
 */
function estimateDuration(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  const wordsPerMinute = 150;
  return (words / wordsPerMinute) * 60;
}

/**
 * Remove speaker labels from text to get plain content
 * 
 * @param text - Text with "SPEAKER: text" format
 * @returns Plain text without speaker labels
 */
export function removeVoiceTags(text: string): string {
  // Remove "SPEAKER: " prefix from each line (ALLCAPS followed by colon+space)
  return text
    .split('\n')
    .map(line => {
      const speakerMatch = line.match(/^[A-Z][A-Z0-9]*: (.+)$/);
      if (speakerMatch) return speakerMatch[1];
      if (/^.+:\s*$/.test(line.trim())) return '';
      return line;
    })
    .filter(line => line.trim().length > 0)
    .join('\n')
    .trim();
}

/**
 * Chunk tagged text while preserving voice segments
 * 
 * Algorithm:
 * 1. Extract all voice segments
 * 2. Group segments into chunks (target ~200 bytes plain text per chunk)
 * 3. Keep voice segments intact (don't split)
 * 4. Generate metadata for each chunk
 * 
 * @param taggedText - Text with voice tags
 * @param targetBytesPerChunk - Target size in bytes (default 200)
 * @returns Chunking result with chunks and metadata
 */
export function chunkTaggedText(
  taggedText: string,
  targetBytesPerChunk: number = 3500
): ChunkingResult {
  const segments = extractVoiceSegments(taggedText);
  
  if (segments.length === 0) {
    throw new Error('No voice segments found in tagged text');
  }
  
  const chunks: string[] = [];
  const metadata: ChunkMetadata[] = [];
  
  let currentChunkSegments: VoiceSegment[] = [];
  let currentByteCount = 0;
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const segmentBytes = Buffer.byteLength(segment.text, 'utf-8');
    
    // Check if adding this segment would exceed target
    if (currentByteCount > 0 && currentByteCount + segmentBytes > targetBytesPerChunk) {
      // Finalize current chunk
      const chunkText = buildChunkFromSegments(currentChunkSegments);
      const chunkMeta = buildChunkMetadata(chunks.length + 1, currentChunkSegments);
      
      chunks.push(chunkText);
      metadata.push(chunkMeta);
      
      // Start new chunk with current segment
      currentChunkSegments = [segment];
      currentByteCount = segmentBytes;
    } else {
      // Add segment to current chunk
      currentChunkSegments.push(segment);
      currentByteCount += segmentBytes;
    }
  }
  
  // Add final chunk
  if (currentChunkSegments.length > 0) {
    const chunkText = buildChunkFromSegments(currentChunkSegments);
    const chunkMeta = buildChunkMetadata(chunks.length + 1, currentChunkSegments);
    
    chunks.push(chunkText);
    metadata.push(chunkMeta);
  }
  
  console.log(`[DramatizedChunkerSimple] Created ${chunks.length} chunks from ${segments.length} voice segments`);
  
  return {
    chunks,
    metadata,
    totalChunks: chunks.length
  };
}

/**
 * Build chunk text from voice segments
 * 
 * Reconstructs text in official Gemini TTS format: "SPEAKER: text"
 * 
 * @param segments - Voice segments to include
 * @returns Formatted chunk text for TTS API
 */
function buildChunkFromSegments(segments: VoiceSegment[]): string {
  return segments
    .map(seg => `${seg.speaker}: ${seg.text}`)
    .join('\n');
}

/**
 * Build chunk metadata
 * 
 * @param chunkIndex - 1-based chunk index
 * @param segments - Voice segments in chunk
 * @returns Chunk metadata
 */
function buildChunkMetadata(chunkIndex: number, segments: VoiceSegment[]): ChunkMetadata {
  const plainText = segments.map(s => s.text).join(' ');
  const speakers = Array.from(new Set(segments.map(s => s.speaker)));
  
  return {
    id: String(chunkIndex).padStart(3, '0'),
    characterCount: plainText.length,
    voiceSegments: segments.length,
    estimatedDuration: Number(estimateDuration(plainText).toFixed(2)),
    speakers
  };
}

/**
 * Save chunks to files
 * 
 * Creates:
 * - chunks/chunk_001.txt, chunk_002.txt, ...
 * - chunks_metadata.json
 * 
 * @param chunks - Array of chunk texts
 * @param metadata - Array of chunk metadata
 * @param outputDir - Directory for output files
 */
export async function saveChunks(
  chunks: string[],
  metadata: ChunkMetadata[],
  outputDir: string
): Promise<void> {
  // Create chunks directory
  const chunksDir = path.join(outputDir, 'chunks');
  await fs.mkdir(chunksDir, { recursive: true });
  
  // Save individual chunk files
  for (let i = 0; i < chunks.length; i++) {
    const chunkPath = path.join(chunksDir, `chunk_${metadata[i].id}.txt`);
    await fs.writeFile(chunkPath, chunks[i], 'utf-8');
  }
  
  // Save metadata
  const metadataPath = path.join(outputDir, 'chunks_metadata.json');
  const metadataObj = {
    chunks: metadata,
    totalChunks: chunks.length,
    totalDuration: metadata.reduce((sum, m) => sum + m.estimatedDuration, 0)
  };
  
  await fs.writeFile(
    metadataPath,
    JSON.stringify(metadataObj, null, 2),
    'utf-8'
  );
  
  console.log(`[DramatizedChunkerSimple] Saved ${chunks.length} chunks to: ${chunksDir}`);
  console.log(`[DramatizedChunkerSimple] Metadata saved to: ${metadataPath}`);
}

/**
 * Process tagged text file into chunks
 * 
 * End-to-end chunking:
 * 1. Load tagged text
 * 2. Chunk with voice preservation
 * 3. Save chunks and metadata
 * 
 * @param taggedTextPath - Path to tagged text file
 * @param outputDir - Directory for output (defaults to same as input)
 * @param targetBytesPerChunk - Target chunk size (default 200)
 * @returns Chunking result
 */
export async function processTaggedTextFile(
  taggedTextPath: string,
  outputDir?: string,
  targetBytesPerChunk: number = 3500
): Promise<ChunkingResult> {
  console.log('[DramatizedChunkerSimple] Loading tagged text...');
  const taggedText = await fs.readFile(taggedTextPath, 'utf-8');
  
  console.log('[DramatizedChunkerSimple] Chunking text...');
  const result = chunkTaggedText(taggedText, targetBytesPerChunk);
  
  const outDir = outputDir || path.dirname(taggedTextPath);
  await saveChunks(result.chunks, result.metadata, outDir);
  
  console.log('[DramatizedChunkerSimple] ✅ Chunking complete!');
  return result;
}
```

---

### Backend: Dramatized Processor (dramatization pipeline orchestration)
**File:** `apps/backend/src/dramatizedProcessor.ts` | **Size:** 6 KB | **Lines:** 191

```typescript
/**
 * Dramatized Processor - Main Orchestrator
 * 
 * Coordinates the entire dramatization pipeline:
 * 1. Load tagged text
 * 2. Extract character list
 * 3. Assign voices to characters
 * 4. Save voice map
 * 
 * Part of Dramatized TTS implementation (PoC Phase)
 */

import fs from 'fs/promises';
import path from 'path';
import { assignVoices, saveVoiceMap, Character, VoiceMap } from './voiceAssigner.js';

/**
 * Process result containing all output paths
 */
export interface ProcessResult {
  voiceMapPath: string;
  voiceMap: VoiceMap;
  characterCount: number;
  success: boolean;
}

/**
 * Extract character names from tagged text
 * 
 * Scans for SPEAKER: format lines and collects unique speaker names
 * Excludes NARRATOR from character list
 * 
 * @param taggedText - Text with SPEAKER: format tags
 * @returns Set of unique character names (UPPERCASE)
 */
function extractCharacterNames(taggedText: string): Set<string> {
  const voiceTagRegex = /^([A-Z][A-Z0-9]*):\s/gm;
  const characters = new Set<string>();
  
  let match;
  while ((match = voiceTagRegex.exec(taggedText)) !== null) {
    const speaker = match[1].trim();
    if (speaker !== 'NARRATOR') {
      characters.add(speaker);
    }
  }
  
  return characters;
}

/**
 * Infer character gender from dialogue content
 * 
 * Simple heuristics:
 * - Male pronouns (he, him, his) -> male
 * - Female pronouns (she, her) -> female
 * - Default -> neutral
 * 
 * @param dialogue - Character's dialogue text
 * @returns Inferred gender
 */
function inferGender(dialogue: string): 'male' | 'female' | 'neutral' {
  const lower = dialogue.toLowerCase();
  
  const malePronouns = ['he ', 'him ', 'his '];
  const femalePronouns = ['she ', 'her '];
  
  const maleCount = malePronouns.reduce((sum, p) => sum + (lower.match(new RegExp(p, 'g'))?.length || 0), 0);
  const femaleCount = femalePronouns.reduce((sum, p) => sum + (lower.match(new RegExp(p, 'g'))?.length || 0), 0);
  
  if (maleCount > femaleCount) return 'male';
  if (femaleCount > maleCount) return 'female';
  return 'neutral';
}

/**
 * Build character profiles from character analysis JSON
 * 
 * If character_analysis.json exists, use it.
 * Otherwise, infer from tagged text (fallback).
 * 
 * @param characterAnalysisPath - Path to character_analysis.json
 * @param taggedText - Tagged text (for fallback)
 * @param characterNames - Set of character names from tags
 * @returns Array of character profiles
 */
async function buildCharacterProfiles(
  characterAnalysisPath: string,
  taggedText: string,
  characterNames: Set<string>
): Promise<Character[]> {
  try {
    // Try loading character analysis JSON
    const analysisContent = await fs.readFile(characterAnalysisPath, 'utf-8');
    const analysis = JSON.parse(analysisContent);
    
    console.log('[DramatizedProcessor] Loaded character analysis from JSON');
    return analysis.characters;
    
  } catch (error) {
    // Fallback: Infer from tagged text
    console.log('[DramatizedProcessor] character_analysis.json not found, inferring from tagged text');
    
    const characters: Character[] = [];
    for (const name of characterNames) {
      // Extract character's dialogue (new SPEAKER: format)
      const dialogueRegex = new RegExp(`^${name}:\\s*(.+)$`, 'gm');
      const dialogues: string[] = [];
      let match;
      while ((match = dialogueRegex.exec(taggedText)) !== null) {
        dialogues.push(match[1].trim());
      }
      
      const allDialogue = dialogues.join(' ');
      const gender = inferGender(allDialogue);
      
      characters.push({
        name,
        gender,
        traits: ['neutral'], // No traits available without LLM analysis
        dialogueExamples: dialogues.slice(0, 2)
      });
    }
    
    return characters;
  }
}

/**
 * Process dramatized text - Main orchestrator
 * 
 * Pipeline:
 * 1. Load tagged text from file
 * 2. Extract character names from voice tags
 * 3. Load/infer character profiles
 * 4. Assign voices to characters
 * 5. Save voice map to JSON
 * 
 * @param taggedTextPath - Path to tagged text file
 * @param characterAnalysisPath - Path to character_analysis.json (optional)
 * @param outputDir - Directory for output files
 * @returns ProcessResult with paths and metadata
 */
export async function processDramatizedText(
  taggedTextPath: string,
  characterAnalysisPath?: string,
  outputDir?: string
): Promise<ProcessResult> {
  console.log('[DramatizedProcessor] Starting dramatization pipeline...');
  console.log(`[DramatizedProcessor] Input: ${taggedTextPath}`);
  
  try {
    // 1. Load tagged text
    const taggedText = await fs.readFile(taggedTextPath, 'utf-8');
    console.log(`[DramatizedProcessor] Loaded tagged text (${taggedText.length} chars)`);
    
    // 2. Extract character names
    const characterNames = extractCharacterNames(taggedText);
    console.log(`[DramatizedProcessor] Found ${characterNames.size} characters: ${Array.from(characterNames).join(', ')}`);
    
    // 3. Build character profiles
    const defaultAnalysisPath = characterAnalysisPath || path.join(
      path.dirname(taggedTextPath),
      'character_analysis.json'
    );
    const characters = await buildCharacterProfiles(defaultAnalysisPath, taggedText, characterNames);
    
    // 4. Assign voices
    console.log('[DramatizedProcessor] Assigning voices...');
    const voiceMap = assignVoices(characters);
    
    // 5. Save voice map
    const defaultOutputDir = outputDir || path.dirname(taggedTextPath);
    const voiceMapPath = path.join(defaultOutputDir, 'voice_map_poc.json');
    await saveVoiceMap(voiceMap, voiceMapPath);
    
    console.log('[DramatizedProcessor] ✅ Dramatization pipeline complete!');
    
    return {
      voiceMapPath,
      voiceMap,
      characterCount: characters.length,
      success: true
    };
    
  } catch (error) {
    console.error('[DramatizedProcessor] ❌ Pipeline failed:', error);
    throw error;
  }
}
```

---

### Backend: Format Extractors (EPUB, TXT, PDF, DOCX parsing)
**File:** `apps/backend/src/formatExtractors.ts` | **Size:** 24.6 KB | **Lines:** 744

```typescript
/**
 * VoiceLibri - Multi-Format Text Extraction
 * Supports: TXT, EPUB, HTML, MOBI/KF8, DOCX, DOC, ODT, RTF, MD, Pages, WPS, PDF (clean)
 * 
 * SUPPORTED FORMATS (good for audiobooks):
 * - EPUB: Best quality, chapters preserved
 * - TXT: Clean text, easy to process
 * - HTML: Stripped tags, usable text
 * - MOBI/KF8: Kindle format, convertible
 * - DOCX: Microsoft Word (via mammoth - official API: {buffer})
 * - DOC: Legacy Word (via mammoth - official API: {buffer})
 * - ODT: OpenDocument Text (ZIP with content.xml)
 * - RTF: Rich Text Format (via rtf-parser)
 * - MD: Markdown (via marked.parse() - official API)
 * - Pages: Apple Pages (ZIP with content)
 * - WPS: WPS Writer (similar to DOC)
 * - PDF: Clean digital PDFs only (via pdf-parse - official PDFParse class)
 * 
 * PDF QUALITY DETECTION:
 * - Checks if PDF is digitally created (clean text) vs scanned (OCR/image-based)
 * - Only clean digital PDFs are accepted for audiobook generation
 * - Scanned PDFs are rejected with user-friendly message
 */

import * as cheerio from 'cheerio';

// Supported MIME types for audiobook generation
export const SUPPORTED_MIME_TYPES = [
  'application/epub+zip',                           // EPUB
  'text/plain',                                     // TXT (with various charset suffixes)
  'text/plain; charset=utf-8',
  'text/plain; charset=us-ascii',
  'text/html',                                      // HTML
  'text/html; charset=utf-8',
  'text/html; charset=us-ascii',
  'application/x-mobipocket-ebook',                 // MOBI/KF8
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/msword',                             // DOC
  'application/vnd.oasis.opendocument.text',        // ODT
  'application/rtf',                                // RTF
  'text/rtf',
  'text/markdown',                                  // Markdown
  'text/x-markdown',
  'application/vnd.apple.pages',                    // Apple Pages
  'application/wps-office.wps',                     // WPS Writer
  'application/pdf',                                // PDF (clean digital only)
];

// Supported file extensions - ALL text-based document formats
export const SUPPORTED_EXTENSIONS = [
  // Ebook formats
  '.epub', '.mobi', '.azw', '.azw3', '.kf8',
  // Plain text
  '.txt',
  // Web formats
  '.html', '.htm',
  // Microsoft Office
  '.docx', '.doc',
  // OpenDocument
  '.odt',
  // Rich Text
  '.rtf',
  // Markdown
  '.md', '.markdown',
  // Apple
  '.pages',
  // WPS Office
  '.wps',
  // PDF (clean digital only)
  '.pdf',
];

// Excluded MIME types (explicitly not supported)
export const EXCLUDED_MIME_TYPES = [
  'application/rdf+xml',            // Metadata only
  'application/octet-stream',       // Binary/unknown
  'image/jpeg',                     // Cover images
  'image/png',
  'image/gif',
  'audio/',                         // Audio files
  'video/',                         // Video files
];

/**
 * Check if a MIME type is supported for audiobook generation
 */
export function isSupportedMimeType(mimeType: string): boolean {
  const normalizedMime = mimeType.toLowerCase().split(';')[0].trim();
  
  // Check exclusions first
  for (const excluded of EXCLUDED_MIME_TYPES) {
    if (normalizedMime.startsWith(excluded)) {
      return false;
    }
  }
  
  // Check supported types
  return SUPPORTED_MIME_TYPES.some(supported => 
    normalizedMime.startsWith(supported.split(';')[0])
  );
}

/**
 * Check if a file extension is supported
 */
export function isSupportedExtension(ext: string): boolean {
  const normalizedExt = ext.toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(normalizedExt);
}

/**
 * Detect format from content-type header or file extension
 */
export function detectFormat(contentType?: string, filename?: string): 'epub' | 'txt' | 'html' | 'mobi' | 'unknown' {
  // Try content-type first
  if (contentType) {
    const mime = contentType.toLowerCase();
    if (mime.includes('epub')) return 'epub';
    if (mime.includes('text/plain')) return 'txt';
    if (mime.includes('text/html')) return 'html';
    if (mime.includes('mobipocket') || mime.includes('x-mobi')) return 'mobi';
  }
  
  // Fall back to extension
  if (filename) {
    const ext = filename.toLowerCase();
    if (ext.endsWith('.epub')) return 'epub';
    if (ext.endsWith('.txt')) return 'txt';
    if (ext.endsWith('.html') || ext.endsWith('.htm')) return 'html';
    if (ext.endsWith('.mobi') || ext.endsWith('.azw') || ext.endsWith('.azw3') || ext.endsWith('.kf8')) return 'mobi';
  }
  
  return 'unknown';
}

/**
 * Extract clean text from HTML content
 * Removes scripts, styles, and extracts readable text
 */
export function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html);
  
  // Remove non-content elements
  $('script, style, noscript, iframe, object, embed, svg, canvas').remove();
  $('head, header, footer, nav, aside, form, button, input, select, textarea').remove();
  $('[hidden], [aria-hidden="true"]').remove();
  
  // Try to find main content areas
  const mainContent = $('main, article, .content, .main, #content, #main, .chapter, .text, .body').first();
  
  let text: string;
  if (mainContent.length > 0) {
    text = mainContent.text();
  } else {
    // Fall back to body
    text = $('body').text() || $('html').text() || '';
  }
  
  // Clean up whitespace
  text = text
    .replace(/\s+/g, ' ')           // Multiple spaces to single
    .replace(/\n\s*\n/g, '\n\n')    // Multiple newlines to double
    .replace(/^\s+|\s+$/gm, '')     // Trim lines
    .trim();
  
  return text;
}

/**
 * Extract text from MOBI/KF8 format
 * MOBI files contain HTML internally, so we extract and clean it
 * 
 * Uses @lingo-reader/mobi-parser for proper MOBI/KF8 parsing
 */
export async function extractTextFromMobi(buffer: Buffer): Promise<string> {
  try {
    // Import the mobi-parser library
    const { initMobiFile, initKf8File } = await import('@lingo-reader/mobi-parser');
    
    // Create a Uint8Array from buffer (the library expects Uint8Array/InputFile)
    const uint8Array = new Uint8Array(buffer);
    
    // Try MOBI format first, then KF8
    let parser: Awaited<ReturnType<typeof initMobiFile>> | Awaited<ReturnType<typeof initKf8File>>;
    try {
      parser = await initMobiFile(uint8Array);
    } catch {
      // Try KF8 format
      parser = await initKf8File(uint8Array);
    }
    
    // Get the spine (list of chapters)
    const spine = parser.getSpine();
    const textParts: string[] = [];
    
    // Extract text from each chapter
    for (const chapter of spine) {
      const processed = parser.loadChapter(chapter.id);
      if (processed?.html) {
        const chapterText = extractTextFromHtml(processed.html);
        if (chapterText.trim()) {
          textParts.push(chapterText);
        }
      }
    }
    
    // Clean up
    parser.destroy();
    
    if (textParts.length === 0) {
      throw new Error('No text content extracted from MOBI');
    }
    
    return textParts.join('\n\n');
  } catch (error) {
    console.error('MOBI parsing error:', error);
    
    // Fallback: Try to find HTML content in the buffer
    // MOBI files often have readable HTML sections
    const bufferStr = buffer.toString('utf-8', 0, Math.min(buffer.length, 1024 * 1024));
    
    // Look for HTML markers
    const htmlStart = bufferStr.indexOf('<html');
    const bodyStart = bufferStr.indexOf('<body');
    
    if (htmlStart !== -1 || bodyStart !== -1) {
      // Extract what looks like HTML content
      const startIndex = htmlStart !== -1 ? htmlStart : bodyStart;
      const htmlContent = bufferStr.substring(startIndex);
      return extractTextFromHtml(htmlContent);
    }
    
    throw new Error('Failed to extract text from MOBI file: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Extract text from a file based on its format
 */
export async function extractText(
  buffer: Buffer, 
  format: 'epub' | 'txt' | 'html' | 'mobi' | 'docx' | 'doc' | 'odt' | 'rtf' | 'md' | 'pages' | 'wps' | 'pdf'
): Promise<string> {
  switch (format) {
    case 'txt':
      return buffer.toString('utf-8').trim();
      
    case 'html':
      return extractTextFromHtml(buffer.toString('utf-8'));
      
    case 'mobi':
      return extractTextFromMobi(buffer);
      
    case 'md':
      return extractTextFromMarkdown(buffer.toString('utf-8'));
      
    case 'docx':
    case 'doc':
      return extractTextFromDocx(buffer);
      
    case 'odt':
      return extractTextFromOdt(buffer);
      
    case 'rtf':
      return extractTextFromRtf(buffer);
      
    case 'pages':
      return extractTextFromPages(buffer);
      
    case 'wps':
      return extractTextFromWps(buffer);
      
    case 'pdf':
      return extractTextFromPdf(buffer);
      
    case 'epub':
      // EPUB uses existing extractTextFromEpub function in bookChunker.ts
      throw new Error('Use extractTextFromEpub for EPUB files');
      
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

// ============================================================================
// NEW FORMAT EXTRACTORS
// ============================================================================

/**
 * Extract text from DOCX/DOC (Microsoft Word) using mammoth
 */
export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    
    if (!result.value || result.value.trim().length === 0) {
      throw new Error('No text content extracted from Word document');
    }
    
    return result.value.trim();
  } catch (error) {
    console.error('DOCX extraction error:', error);
    throw new Error('Failed to extract text from Word document: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Extract text from Markdown using marked
 */
export async function extractTextFromMarkdown(markdown: string): Promise<string> {
  try {
    const { marked } = await import('marked');
    
    // Convert markdown to HTML, then extract text
    const html = await marked.parse(markdown);
    return extractTextFromHtml(html);
  } catch (error) {
    console.error('Markdown extraction error:', error);
    // Fallback: return raw markdown with basic cleanup
    return markdown
      .replace(/^#+\s+/gm, '')      // Remove heading markers
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove bold
      .replace(/\*([^*]+)\*/g, '$1')      // Remove italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Convert links to text
      .replace(/`([^`]+)`/g, '$1')  // Remove code markers
      .trim();
  }
}

/**
 * Extract text from RTF using rtf-parser
 */
export async function extractTextFromRtf(buffer: Buffer): Promise<string> {
  try {
    const rtfParser = await import('rtf-parser');
    
    return new Promise((resolve, reject) => {
      const rtfContent = buffer.toString('utf-8');
      
      rtfParser.string(rtfContent, (err: Error | null, doc: any) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Extract text from RTF document structure
        const textParts: string[] = [];
        
        function extractFromNode(node: any) {
          if (typeof node === 'string') {
            textParts.push(node);
          } else if (node && node.content) {
            for (const child of node.content) {
              extractFromNode(child);
            }
          } else if (node && node.value) {
            textParts.push(node.value);
          }
        }
        
        if (doc && doc.content) {
          for (const item of doc.content) {
            extractFromNode(item);
          }
        }
        
        const text = textParts.join(' ').replace(/\s+/g, ' ').trim();
        if (!text) {
          reject(new Error('No text content extracted from RTF'));
          return;
        }
        
        resolve(text);
      });
    });
  } catch (error) {
    console.error('RTF extraction error:', error);
    
    // Fallback: Try basic regex extraction
    const rtfContent = buffer.toString('utf-8');
    const textMatch = rtfContent.match(/\\[a-z]+\s*([^\\{}]+)/g);
    if (textMatch) {
      const text = textMatch
        .map(m => m.replace(/^\\[a-z]+\s*/, ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) return text;
    }
    
    throw new Error('Failed to extract text from RTF: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Extract text from ODT (OpenDocument Text)
 * ODT is a ZIP archive containing XML content
 */
export async function extractTextFromOdt(buffer: Buffer): Promise<string> {
  try {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(buffer);
    
    // ODT content is in content.xml
    const contentEntry = zip.getEntry('content.xml');
    if (!contentEntry) {
      throw new Error('ODT file does not contain content.xml');
    }
    
    const contentXml = contentEntry.getData().toString('utf-8');
    
    // Parse XML and extract text from <text:p> elements
    const $ = cheerio.load(contentXml, { xmlMode: true });
    const textParts: string[] = [];
    
    // Extract all text content from text:p, text:h, and text:span elements
    $('*').each((_, elem) => {
      const tagName = (elem as any).tagName || '';
      if (tagName.startsWith('text:p') || tagName.startsWith('text:h') || tagName.startsWith('text:span')) {
        const text = $(elem).text();
        if (text.trim()) {
          textParts.push(text.trim());
        }
      }
    });
    
    // If no text found with namespace, try without
    if (textParts.length === 0) {
      $('p, h1, h2, h3, h4, h5, h6, span').each((_, elem) => {
        const text = $(elem).text();
        if (text.trim()) {
          textParts.push(text.trim());
        }
      });
    }
    
    const text = textParts.join('\n\n');
    if (!text) {
      throw new Error('No text content found in ODT');
    }
    
    return text;
  } catch (error) {
    console.error('ODT extraction error:', error);
    throw new Error('Failed to extract text from ODT: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Extract text from Apple Pages
 * Pages is a ZIP archive containing IWA (protobuf) or XML content
 */
export async function extractTextFromPages(buffer: Buffer): Promise<string> {
  try {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(buffer);
    
    // Try to find text content in various locations
    const possiblePaths = [
      'Index/Document.iwa',  // Modern Pages format (protobuf)
      'index.xml',           // Older Pages format
      'Contents/Document.xml',
    ];
    
    for (const path of possiblePaths) {
      const entry = zip.getEntry(path);
      if (entry) {
        const content = entry.getData().toString('utf-8');
        
        // For XML content
        if (path.endsWith('.xml')) {
          const $ = cheerio.load(content, { xmlMode: true });
          const text = $('*').text();
          if (text.trim()) {
            return text.replace(/\s+/g, ' ').trim();
          }
        }
      }
    }
    
    // Fallback: Extract all text from all entries
    const textParts: string[] = [];
    zip.getEntries().forEach(entry => {
      if (!entry.isDirectory && entry.entryName.endsWith('.xml')) {
        try {
          const content = entry.getData().toString('utf-8');
          const $ = cheerio.load(content, { xmlMode: true });
          const text = $('*').text().trim();
          if (text) {
            textParts.push(text);
          }
        } catch {
          // Skip entries that can't be parsed
        }
      }
    });
    
    if (textParts.length === 0) {
      throw new Error('No text content found in Pages document. Note: Modern .pages files use a proprietary format that may not be fully extractable.');
    }
    
    return textParts.join('\n\n');
  } catch (error) {
    console.error('Pages extraction error:', error);
    throw new Error('Failed to extract text from Pages: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Extract text from WPS Writer (.wps)
 * WPS is similar to DOC format, try mammoth first
 */
export async function extractTextFromWps(buffer: Buffer): Promise<string> {
  try {
    // Try mammoth first (WPS often compatible with DOC)
    return await extractTextFromDocx(buffer);
  } catch {
    // Fallback: Try to find text patterns in binary
    const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 1024 * 1024));
    
    // Look for readable text sections
    const textMatches = content.match(/[\x20-\x7E]{20,}/g);
    if (textMatches && textMatches.length > 0) {
      const text = textMatches.join(' ').trim();
      if (text.length > 100) {
        return text;
      }
    }
    
    throw new Error('Failed to extract text from WPS file. Consider converting to DOCX or TXT.');
  }
}

// ============================================================================
// PDF EXTRACTION WITH QUALITY DETECTION
// ============================================================================

/**
 * Result of PDF quality analysis
 */
export interface PDFQualityResult {
  isClean: boolean;           // true if PDF is suitable for audiobook
  text: string;               // extracted text (if clean)
  pageCount: number;          // number of pages
  textDensity: number;        // characters per page (higher = better)
  wordCount: number;          // total word count
  reason?: string;            // reason if not clean
}

/**
 * Analyze PDF quality to determine if suitable for audiobook generation
 * 
 * QUALITY CRITERIA (based on empirical analysis):
 * - Text density: Clean PDFs typically have >500 chars/page average
 * - Word distribution: Real text has consistent word patterns
 * - Character patterns: OCR artifacts create unusual character sequences
 * - Readability: Clean text should have proper sentences
 */
function analyzePdfQuality(text: string, pageCount: number): PDFQualityResult {
  // Basic text stats
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;
  const charCount = cleanText.length;
  const textDensity = pageCount > 0 ? charCount / pageCount : 0;
  
  // Quality checks
  const issues: string[] = [];
  
  // 1. Minimum content check - at least 100 words
  if (wordCount < 100) {
    issues.push('Too little text extracted (less than 100 words)');
  }
  
  // 2. Text density check - clean PDFs have substantial text per page
  // Scanned/OCR PDFs often have very low or very high density (garbage chars)
  if (textDensity < 200 && pageCount > 1) {
    issues.push('Very low text density - may be scanned or image-based PDF');
  }
  
  // 3. Check for OCR artifacts - unusual character sequences
  const ocrArtifacts = (cleanText.match(/[^\w\s.,!?;:'"()-]{3,}/g) || []).length;
  const artifactRatio = ocrArtifacts / Math.max(1, wordCount);
  if (artifactRatio > 0.05) {
    issues.push('High occurrence of unusual characters - likely OCR artifacts');
  }
  
  // 4. Check for word validity - most words should be in typical length range
  const words = cleanText.split(/\s+/);
  const validWordCount = words.filter(w => w.length >= 2 && w.length <= 25).length;
  const validRatio = validWordCount / Math.max(1, words.length);
  if (validRatio < 0.7) {
    issues.push('Many words have unusual lengths - may indicate OCR errors');
  }
  
  // 5. Check for sentence structure - clean text has proper punctuation
  const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length < 5 && charCount > 1000) {
    issues.push('Text lacks proper sentence structure');
  }
  
  // 6. Check for repeated garbage patterns (common in scanned PDFs)
  const repeatedPattern = /(.{5,})\1{3,}/g;
  if (repeatedPattern.test(cleanText)) {
    issues.push('Detected repeated character patterns - possible scan artifact');
  }
  
  const isClean = issues.length === 0;
  
  return {
    isClean,
    text: isClean ? cleanText : '',
    pageCount,
    textDensity: Math.round(textDensity),
    wordCount,
    reason: issues.length > 0 ? issues.join('; ') : undefined,
  };
}

/**
 * Extract text from PDF using pdf-parse library (v2 API per official docs)
 * Only accepts clean digital PDFs, rejects scanned/OCR PDFs
 * 
 * @throws Error with user-friendly message if PDF is not suitable
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // Import pdf-parse using official v2 API
    const { PDFParse } = await import('pdf-parse');
    
    // Create parser from buffer per official docs
    const parser = new PDFParse({ data: buffer });
    
    // Get text content
    const textResult = await parser.getText();
    
    // Get page info for quality analysis
    const info = await parser.getInfo({ parsePageInfo: true });
    
    // Clean up parser
    await parser.destroy();
    
    const pageCount = info.total || 1;
    const rawText = textResult.text || '';
    
    // Analyze quality
    const quality = analyzePdfQuality(rawText, pageCount);
    
    if (!quality.isClean) {
      throw new Error(
        `This PDF cannot be used for audiobook generation. ${quality.reason}. ` +
        `The PDF appears to be scanned or contains images rather than clean digital text. ` +
        `Please use a digitally created PDF (e.g., exported from Word, Google Docs, or similar) ` +
        `or convert your document to EPUB, DOCX, or TXT format for better results.`
      );
    }
    
    console.log(`✓ PDF quality check passed: ${quality.wordCount} words, ${quality.textDensity} chars/page avg`);
    return quality.text;
    
  } catch (error) {
    // Re-throw our quality errors as-is
    if (error instanceof Error && error.message.includes('cannot be used for audiobook')) {
      throw error;
    }
    
    // Handle pdf-parse specific errors
    console.error('PDF extraction error:', error);
    
    // Check for password protected PDFs
    if (error instanceof Error && error.message.toLowerCase().includes('password')) {
      throw new Error(
        'This PDF is password protected. Please remove the password protection and try again, ' +
        'or convert to a different format (EPUB, DOCX, TXT).'
      );
    }
    
    // Check for corrupted PDFs
    if (error instanceof Error && (
      error.message.toLowerCase().includes('invalid') ||
      error.message.toLowerCase().includes('corrupt')
    )) {
      throw new Error(
        'This PDF file appears to be corrupted or invalid. ' +
        'Please try re-downloading the file or converting to a different format.'
      );
    }
    
    throw new Error(
      'Failed to extract text from PDF. ' +
      'The file may be damaged, encrypted, or contain only images. ' +
      'Please try EPUB, DOCX, or TXT format instead.'
    );
  }
}

/**
 * Get the best download URL from Gutenberg formats
 * Priority: EPUB > TXT > HTML > MOBI
 */
export function getBestDownloadUrl(formats: Record<string, string>): { url: string; format: string } | null {
  // Priority order for audiobook generation
  const priorities = [
    { key: 'application/epub+zip', format: 'epub' },
    { key: 'text/plain; charset=utf-8', format: 'txt' },
    { key: 'text/plain; charset=us-ascii', format: 'txt' },
    { key: 'text/plain', format: 'txt' },
    { key: 'text/html', format: 'html' },
    { key: 'application/x-mobipocket-ebook', format: 'mobi' },
  ];
  
  for (const { key, format } of priorities) {
    // Check for exact match or partial match
    const matchingKey = Object.keys(formats).find(k => k.startsWith(key));
    if (matchingKey && formats[matchingKey]) {
      return { url: formats[matchingKey], format };
    }
  }
  
  return null;
}

/**
 * Check if a Gutenberg book has downloadable text content
 */
export function hasDownloadableText(formats: Record<string, string>): boolean {
  return getBestDownloadUrl(formats) !== null;
}

export default {
  SUPPORTED_MIME_TYPES,
  SUPPORTED_EXTENSIONS,
  EXCLUDED_MIME_TYPES,
  isSupportedMimeType,
  isSupportedExtension,
  detectFormat,
  extractTextFromHtml,
  extractTextFromMobi,
  extractTextFromPdf,
  extractText,
  getBestDownloadUrl,
  hasDownloadableText,
};
```

---

### Backend: Gemini Dramatizer (Gemini-based dramatization engine)
**File:** `apps/backend/src/geminiDramatizer.ts` | **Size:** 13.8 KB | **Lines:** 461

```typescript
/**
 * Gemini Dramatizer - Main Orchestration Module
 * 
 * Implements Option C → D Strategy:
 * - Phase 1: Quick character scan (15-20s)
 * - Phase 2: Progressive chapter tagging (stay ahead of playback)
 * - Phase 3: Caching for instant replay
 * 
 * Coordinates:
 * - Text cleaning
 * - LLM character extraction
 * - LLM chapter tagging
 * - Voice assignment
 * - Caching/storage
 */

import { GeminiCharacterAnalyzer, CharacterProfile, GeminiConfig } from './llmCharacterAnalyzer.js';
import { assignVoices, VoiceMap } from './voiceAssigner.js';
import { cleanEpubText, cleanPlainText } from './textCleaner.js';
import { Chapter } from './bookChunker.js';
import fs from 'fs/promises';
import path from 'path';
import { getAudiobooksDir, sanitizeBookTitle } from './audiobookManager.js';

/**
 * Dramatization configuration
 */
export interface DramatizationConfig {
  /** Gemini API configuration */
  gemini: GeminiConfig;
  
  /** Minimum dialogue lines for character inclusion */
  minDialogueLines?: number;
  
  /** Maximum characters to voice */
  maxCharacters?: number;
  
  /** Enable caching */
  enableCaching?: boolean;
  
  /** Text cleaning aggressiveness */
  aggressive?: boolean;
}

/**
 * Dramatization result
 */
export interface DramatizationResult {
  characters: CharacterProfile[];
  voiceMap: VoiceMap;
  taggedChapters: string[];
  cacheLocation?: string;
  stats: {
    charactersFound: number;
    chaptersTagged: number;
    totalTime: number; // milliseconds
    characterScanTime: number;
    taggingTime: number;
  };
}

/**
 * Progress callback for user feedback
 */
export type ProgressCallback = (progress: {
  phase: 'cleaning' | 'scanning' | 'tagging' | 'caching';
  progress: number; // 0-100
  message: string;
}) => void;

/**
 * Cache metadata
 */
interface CacheMetadata {
  version: string; // '1.0'
  timestamp: string;
  bookTitle: string;
  charactersFound: number;
  chaptersTagged: number;
}

/**
 * Main Dramatizer class
 */
export class GeminiDramatizer {
  private analyzer: GeminiCharacterAnalyzer;
  private config: DramatizationConfig;
  
  constructor(config: DramatizationConfig) {
    this.config = {
      minDialogueLines: 3,
      maxCharacters: 10,
      enableCaching: true,
      aggressive: false,
      ...config,
    };
    
    this.analyzer = new GeminiCharacterAnalyzer(config.gemini);
  }
  
  /**
   * Check if dramatization is cached
   * 
   * @param bookTitle - Sanitized book title
   * @returns Cache metadata if exists, null otherwise
   */
  async checkCache(bookTitle: string): Promise<CacheMetadata | null> {
    if (!this.config.enableCaching) {
      return null;
    }
    
    try {
      const cacheDir = this.getCacheDir(bookTitle);
      const metadataPath = path.join(cacheDir, 'dramatization.json');
      
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata: CacheMetadata = JSON.parse(metadataContent);
      
      console.log(`📦 Found cached dramatization: ${metadata.charactersFound} characters, ${metadata.chaptersTagged} chapters`);
      return metadata;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Load cached dramatization
   * 
   * @param bookTitle - Sanitized book title
   * @returns Cached characters and tagged chapters
   */
  async loadCache(bookTitle: string): Promise<{
    characters: CharacterProfile[];
    voiceMap: VoiceMap;
    taggedChapters: string[];
  } | null> {
    try {
      const cacheDir = this.getCacheDir(bookTitle);
      
      // Load characters
      const charactersPath = path.join(cacheDir, 'characters.json');
      const charactersContent = await fs.readFile(charactersPath, 'utf-8');
      const characters: CharacterProfile[] = JSON.parse(charactersContent);
      
      // Load voice map
      const voiceMapPath = path.join(cacheDir, 'voice_map.json');
      const voiceMapContent = await fs.readFile(voiceMapPath, 'utf-8');
      const voiceMap: VoiceMap = JSON.parse(voiceMapContent);
      
      // Load tagged chapters
      const taggedChapters: string[] = [];
      const chaptersDir = path.join(cacheDir, 'chapters');
      const chapterFiles = await fs.readdir(chaptersDir);
      
      for (const file of chapterFiles.sort()) {
        if (file.endsWith('.txt')) {
          const chapterPath = path.join(chaptersDir, file);
          const chapterContent = await fs.readFile(chapterPath, 'utf-8');
          taggedChapters.push(chapterContent);
        }
      }
      
      console.log(`✅ Loaded cached dramatization: ${characters.length} characters, ${taggedChapters.length} chapters`);
      return { characters, voiceMap, taggedChapters };
    } catch (error) {
      console.error('❌ Failed to load cache:', error);
      return null;
    }
  }
  
  /**
   * Save dramatization to cache
   */
  private async saveCache(
    bookTitle: string,
    characters: CharacterProfile[],
    voiceMap: VoiceMap,
    taggedChapters: string[]
  ): Promise<void> {
    if (!this.config.enableCaching) {
      return;
    }
    
    try {
      const cacheDir = this.getCacheDir(bookTitle);
      await fs.mkdir(cacheDir, { recursive: true });
      
      // Save metadata
      const metadata: CacheMetadata = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        bookTitle,
        charactersFound: characters.length,
        chaptersTagged: taggedChapters.length,
      };
      await fs.writeFile(
        path.join(cacheDir, 'dramatization.json'),
        JSON.stringify(metadata, null, 2)
      );
      
      // Save characters
      await fs.writeFile(
        path.join(cacheDir, 'characters.json'),
        JSON.stringify(characters, null, 2)
      );
      
      // Save voice map
      await fs.writeFile(
        path.join(cacheDir, 'voice_map.json'),
        JSON.stringify(voiceMap, null, 2)
      );
      
      // Save tagged chapters
      const chaptersDir = path.join(cacheDir, 'chapters');
      await fs.mkdir(chaptersDir, { recursive: true });
      
      for (let i = 0; i < taggedChapters.length; i++) {
        const filename = `chapter_${(i + 1).toString().padStart(3, '0')}.txt`;
        await fs.writeFile(
          path.join(chaptersDir, filename),
          taggedChapters[i]
        );
      }
      
      console.log(`💾 Saved dramatization cache: ${cacheDir}`);
    } catch (error) {
      console.error('❌ Failed to save cache:', error);
    }
  }
  
  /**
   * Get cache directory path
   */
  private getCacheDir(bookTitle: string): string {
    const sanitized = sanitizeBookTitle(bookTitle);
    return path.join(getAudiobooksDir(), sanitized, 'dramatization_cache');
  }
  
  /**
   * Dramatize a book (full process)
   * 
   * @param bookText - Full book text
   * @param chapters - Array of chapter objects
   * @param bookTitle - Book title for caching
   * @param format - 'epub' or 'txt'
   * @param onProgress - Progress callback
   * @returns Dramatization result
   */
  async dramatizeBook(
    bookText: string,
    chapters: Chapter[],
    bookTitle: string,
    format: 'epub' | 'txt' = 'txt',
    onProgress?: ProgressCallback
  ): Promise<DramatizationResult> {
    const startTime = Date.now();
    
    console.log(`\n🎭 Starting dramatization: "${bookTitle}" (${chapters.length} chapters)`);
    
    // Check cache first
    const cached = await this.loadCache(bookTitle);
    if (cached) {
      onProgress?.({ phase: 'caching', progress: 100, message: 'Loaded from cache' });
      return {
        characters: cached.characters,
        voiceMap: cached.voiceMap,
        taggedChapters: cached.taggedChapters,
        cacheLocation: this.getCacheDir(bookTitle),
        stats: {
          charactersFound: cached.characters.length,
          chaptersTagged: cached.taggedChapters.length,
          totalTime: Date.now() - startTime,
          characterScanTime: 0,
          taggingTime: 0,
        },
      };
    }
    
    // Phase 1: Character Scan (15-20s)
    onProgress?.({ phase: 'scanning', progress: 10, message: 'Analyzing characters...' });
    
    const scanStart = Date.now();
    const characters = await this.analyzer.analyzeFullBook(bookText);
    const scanTime = Date.now() - scanStart;
    
    console.log(`✅ Character scan complete (${(scanTime / 1000).toFixed(1)}s): ${characters.length} characters`);
    onProgress?.({ phase: 'scanning', progress: 40, message: `Found ${characters.length} characters` });
    
    // Assign voices
    const voiceMap = assignVoices(
      characters.map(c => ({
        name: c.name,
        gender: c.gender === 'unknown' ? 'neutral' : c.gender,
        traits: c.traits,
      }))
    );
    
    console.log(`🎤 Voice assignments:`, voiceMap);
    onProgress?.({ phase: 'scanning', progress: 50, message: 'Voices assigned' });
    
    // Phase 2: Progressive Chapter Tagging
    onProgress?.({ phase: 'tagging', progress: 50, message: 'Tagging chapters...' });
    
    const taggingStart = Date.now();
    const taggedChapters: string[] = [];
    
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const progress = 50 + Math.floor((i / chapters.length) * 45);
      
      onProgress?.({
        phase: 'tagging',
        progress,
        message: `Tagging chapter ${i + 1}/${chapters.length}: "${chapter.title}"`
      });
      
      console.log(`\n📝 Tagging chapter ${i + 1}/${chapters.length}: "${chapter.title}"`);
      
      const taggedChapter = await this.analyzer.tagChapterWithVoices(chapter.text, characters);
      taggedChapters.push(taggedChapter);
    }
    
    const taggingTime = Date.now() - taggingStart;
    console.log(`✅ Chapter tagging complete (${(taggingTime / 1000).toFixed(1)}s)`);
    
    // Phase 3: Save cache
    onProgress?.({ phase: 'caching', progress: 95, message: 'Saving cache...' });
    await this.saveCache(bookTitle, characters, voiceMap, taggedChapters);
    
    const totalTime = Date.now() - startTime;
    
    onProgress?.({ phase: 'caching', progress: 100, message: 'Complete!' });
    
    console.log(`\n🎉 Dramatization complete!`);
    console.log(`   Total time: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`   Character scan: ${(scanTime / 1000).toFixed(1)}s`);
    console.log(`   Chapter tagging: ${(taggingTime / 1000).toFixed(1)}s`);
    
    return {
      characters,
      voiceMap,
      taggedChapters,
      cacheLocation: this.getCacheDir(bookTitle),
      stats: {
        charactersFound: characters.length,
        chaptersTagged: taggedChapters.length,
        totalTime,
        characterScanTime: scanTime,
        taggingTime,
      },
    };
  }
  
  /**
   * Dramatize just first chapter (for fast start)
   * 
   * @param bookText - Full book text (for character scan)
   * @param firstChapter - First chapter only
   * @param bookTitle - Book title
   * @returns Characters, voice map, and tagged first chapter
   */
  async dramatizeFirstChapter(
    bookText: string,
    firstChapter: Chapter,
    bookTitle: string
  ): Promise<{
    characters: CharacterProfile[];
    voiceMap: VoiceMap;
    taggedChapter: string;
  }> {
    console.log(`\n⚡ Fast start: Dramatizing first chapter only`);
    
    // Character scan
    const characters = await this.analyzer.analyzeFullBook(bookText);
    const voiceMap = assignVoices(
      characters.map(c => ({
        name: c.name,
        gender: c.gender === 'unknown' ? 'neutral' : c.gender,
        traits: c.traits,
      }))
    );
    
    // Tag first chapter
    const taggedChapter = await this.analyzer.tagChapterWithVoices(firstChapter.text, characters);
    
    console.log(`✅ First chapter ready (~30s)`);
    
    return { characters, voiceMap, taggedChapter };
  }
}

/**
 * Convenience function: Dramatize a book
 * Creates a default dramatizer instance and processes the book
 */
export async function dramatizeBook(
  bookPath: string,
  options?: {
    mode?: 'fast' | 'full';
    onProgress?: ProgressCallback;
  }
): Promise<DramatizationResult> {
  const config: DramatizationConfig = {
    gemini: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    },
  };
  
  const dramatizer = new GeminiDramatizer(config);
  
  // Extract book title from path
  const bookTitle = path.basename(bookPath, path.extname(bookPath));
  
  // Load book content
  const fs = await import('fs');
  const bookText = fs.readFileSync(bookPath, 'utf-8');
  const format = bookPath.endsWith('.epub') ? 'epub' : 'txt';
  
  // For now, create single chapter (TODO: proper chapter detection)
  const chapters: Chapter[] = [{
    index: 0,
    displayNumber: 1,
    isFrontMatter: false,
    title: 'Chapter 1',
    text: bookText,
    startOffset: 0,
    endOffset: bookText.length,
  }];
  
  return await dramatizer.dramatizeBook(bookText, chapters, bookTitle, format, options?.onProgress);
}

/**
 * Convenience function: Check if book has cached dramatization
 */
export async function checkCache(bookPath: string): Promise<{
  hasCached: boolean;
  metadata?: any;
}> {
  const config: DramatizationConfig = {
    gemini: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    },
  };
  
  const dramatizer = new GeminiDramatizer(config);
  const bookTitle = path.basename(bookPath, path.extname(bookPath));
  const cache = await dramatizer.checkCache(bookTitle);
  
  if (cache === null) {
    return { hasCached: false };
  }
  
  return {
    hasCached: true,
    metadata: cache,
  };
}
```

---

### Backend: Gemini Voices (voice catalog, gender/style metadata)
**File:** `apps/backend/src/geminiVoices.ts` | **Size:** 13.6 KB | **Lines:** 281

```typescript
/**
 * Gemini TTS Voice Database
 * 
 * Complete list of 30 prebuilt Gemini voices with characteristics
 * Based on Gemini TTS documentation and empirical testing
 */

export interface GeminiVoice {
  name: string;              // Original Gemini TTS name (star name)
  alias: string;             // VoiceLibri frontend-friendly alias
  gender: 'male' | 'female';
  pitch: 'low' | 'medium' | 'high';
  characteristic: string;    // One-word description
}

/**
 * All 30 Gemini prebuilt voices with VoiceLibri frontend aliases
 * 
 * Source: Google Gemini TTS Documentation
 * https://cloud.google.com/text-to-speech/docs/gemini-tts
 */
export const GEMINI_VOICES: GeminiVoice[] = [
  // MALE VOICES (16 total)
  { name: 'Achird', alias: 'Arthur', gender: 'male', pitch: 'medium', characteristic: 'neutral' },
  { name: 'Algenib', alias: 'Alex', gender: 'male', pitch: 'medium', characteristic: 'clear' },
  { name: 'Algieba', alias: 'Albert', gender: 'male', pitch: 'low', characteristic: 'deep' },
  { name: 'Alnilam', alias: 'Milan', gender: 'male', pitch: 'low', characteristic: 'authoritative' },
  { name: 'Charon', alias: 'Charles', gender: 'male', pitch: 'medium', characteristic: 'friendly' },
  { name: 'Enceladus', alias: 'Eric', gender: 'male', pitch: 'medium', characteristic: 'energetic' },
  { name: 'Fenrir', alias: 'Fero', gender: 'male', pitch: 'medium', characteristic: 'dynamic' },
  { name: 'Iapetus', alias: 'Ian', gender: 'male', pitch: 'low', characteristic: 'calm' },
  { name: 'Orus', alias: 'Oliver', gender: 'male', pitch: 'medium', characteristic: 'smooth' },
  { name: 'Puck', alias: 'Peter', gender: 'male', pitch: 'high', characteristic: 'youthful' },
  { name: 'Rasalgethi', alias: 'Ross', gender: 'male', pitch: 'low', characteristic: 'mature' },
  { name: 'Sadachbia', alias: 'Stan', gender: 'male', pitch: 'medium', characteristic: 'steady' },
  { name: 'Sadaltager', alias: 'Simon', gender: 'male', pitch: 'medium', characteristic: 'warm' },
  { name: 'Schedar', alias: 'Scott', gender: 'male', pitch: 'low', characteristic: 'serious' },
  { name: 'Umbriel', alias: 'Umberto', gender: 'male', pitch: 'medium', characteristic: 'gentle' },
  { name: 'Zubenelgenubi', alias: 'Zachary', gender: 'male', pitch: 'medium', characteristic: 'balanced' },
  
  // FEMALE VOICES (14 total)
  { name: 'Achernar', alias: 'Ash', gender: 'female', pitch: 'low', characteristic: 'professional' },
  { name: 'Aoede', alias: 'Ada', gender: 'female', pitch: 'high', characteristic: 'bright' },
  { name: 'Autonoe', alias: 'Toni', gender: 'female', pitch: 'medium', characteristic: 'elegant' },
  { name: 'Callirrhoe', alias: 'Callie', gender: 'female', pitch: 'medium', characteristic: 'refined' },
  { name: 'Despina', alias: 'Desi', gender: 'female', pitch: 'medium', characteristic: 'soft' },
  { name: 'Erinome', alias: 'Erin', gender: 'female', pitch: 'medium', characteristic: 'melodic' },
  { name: 'Gacrux', alias: 'Grace', gender: 'female', pitch: 'low', characteristic: 'strong' },
  { name: 'Kore', alias: 'Cora', gender: 'female', pitch: 'medium', characteristic: 'pleasant' },
  { name: 'Laomedeia', alias: 'Laura', gender: 'female', pitch: 'medium', characteristic: 'smooth' },
  { name: 'Leda', alias: 'Lea', gender: 'female', pitch: 'high', characteristic: 'playful' },
  { name: 'Pulcherrima', alias: 'Paula', gender: 'female', pitch: 'high', characteristic: 'cheerful' },
  { name: 'Sulafat', alias: 'Sue', gender: 'female', pitch: 'low', characteristic: 'confident' },
  { name: 'Vindemiatrix', alias: 'Vinnie', gender: 'female', pitch: 'medium', characteristic: 'crisp' },
  { name: 'Zephyr', alias: 'Zara', gender: 'female', pitch: 'high', characteristic: 'light' },
];

/**
 * Get voice by Gemini TTS name (star name)
 */
export function getVoiceByName(name: string): GeminiVoice | undefined {
  return GEMINI_VOICES.find(v => v.name.toLowerCase() === name.toLowerCase());
}

/**
 * Get voice by frontend alias
 */
export function getVoiceByAlias(alias: string): GeminiVoice | undefined {
  return GEMINI_VOICES.find(v => v.alias.toLowerCase() === alias.toLowerCase());
}

/**
 * Convert frontend alias to Gemini TTS name
 * @param alias - Frontend alias (e.g., 'Arthur', 'Ash')
 * @returns Gemini TTS name (e.g., 'Achird', 'Achernar') or undefined if not found
 */
export function aliasToGeminiName(alias: string): string | undefined {
  const voice = getVoiceByAlias(alias);
  return voice?.name;
}

/**
 * Convert Gemini TTS name to frontend alias
 * @param geminiName - Gemini TTS name (e.g., 'Achird', 'Achernar')
 * @returns Frontend alias (e.g., 'Arthur', 'Ash') or undefined if not found
 */
export function geminiNameToAlias(geminiName: string): string | undefined {
  const voice = getVoiceByName(geminiName);
  return voice?.alias;
}

/**
 * Get all voices by gender
 */
export function getVoicesByGender(gender: 'male' | 'female'): GeminiVoice[] {
  return GEMINI_VOICES.filter(v => v.gender === gender);
}

/**
 * Get all voices by pitch
 */
export function getVoicesByPitch(pitch: 'low' | 'medium' | 'high'): GeminiVoice[] {
  return GEMINI_VOICES.filter(v => v.pitch === pitch);
}

/**
 * Semantic trait clusters - maps related concepts to voice characteristics
 * Uses semantic similarity rather than exact matching
 */
const TRAIT_SEMANTIC_CLUSTERS: Record<string, string[]> = {
  // Voice characteristic -> semantically related traits
  'deep': ['deep', 'bass', 'resonant', 'booming', 'rich', 'low voice', 'hluboký'],
  'authoritative': ['authoritative', 'commanding', 'leader', 'powerful', 'dominant', 'boss', 'master', 'lord', 'king', 'emperor', 'general', 'captain', 'chief', 'director', 'vůdce', 'pán'],
  'mature': ['mature', 'elderly', 'old', 'aged', 'wise', 'experienced', 'senior', 'veteran', 'ancient', 'stará', 'starý', 'babička', 'dědeček', 'grandmother', 'grandfather'],
  'calm': ['calm', 'peaceful', 'serene', 'tranquil', 'composed', 'relaxed', 'zen', 'meditative', 'klidný', 'klidná'],
  'gentle': ['gentle', 'soft', 'tender', 'kind', 'caring', 'nurturing', 'sweet', 'mild', 'jemný', 'laskavý'],
  'serious': ['serious', 'stern', 'grave', 'solemn', 'stoic', 'formal', 'strict', 'vážný', 'přísný'],
  'warm': ['warm', 'friendly', 'welcoming', 'affectionate', 'loving', 'cordial', 'hospitable', 'vřelý', 'přátelský'],
  'youthful': ['youthful', 'young', 'child', 'kid', 'teen', 'teenager', 'boy', 'girl', 'juvenile', 'dítě', 'mladý', 'mladá', 'chlapec', 'dívka'],
  'energetic': ['energetic', 'lively', 'dynamic', 'vibrant', 'spirited', 'enthusiastic', 'animated', 'excited', 'energický'],
  'playful': ['playful', 'mischievous', 'fun', 'humorous', 'witty', 'prankster', 'joker', 'hravý', 'vtipný'],
  'bright': ['bright', 'cheerful', 'happy', 'optimistic', 'sunny', 'radiant', 'joyful', 'veselý', 'radostný'],
  'elegant': ['elegant', 'refined', 'sophisticated', 'graceful', 'noble', 'aristocratic', 'lady', 'gentleman', 'elegantní', 'vznešený', 'paní', 'dáma'],
  'professional': ['professional', 'businesslike', 'competent', 'efficient', 'skilled', 'expert', 'profesionální'],
  'confident': ['confident', 'bold', 'assertive', 'self-assured', 'fearless', 'brave', 'courageous', 'sebevědomý', 'odvážný'],
  'strong': ['strong', 'powerful', 'mighty', 'robust', 'tough', 'hardy', 'silný', 'mocný'],
  'smooth': ['smooth', 'silky', 'flowing', 'fluid', 'sleek', 'polished', 'hladký'],
  'crisp': ['crisp', 'clear', 'precise', 'sharp', 'articulate', 'distinct', 'jasný', 'zřetelný'],
  'melodic': ['melodic', 'musical', 'lyrical', 'harmonious', 'singing', 'melodický', 'zpěvný'],
  'soft': ['soft', 'quiet', 'hushed', 'whispered', 'delicate', 'faint', 'tichý', 'jemný'],
  'neutral': ['neutral', 'balanced', 'even', 'moderate', 'impartial', 'neutrální', 'vyvážený'],
  'clear': ['clear', 'lucid', 'transparent', 'intelligible', 'understandable', 'srozumitelný'],
  'friendly': ['friendly', 'amiable', 'approachable', 'likable', 'pleasant', 'nice', 'milý', 'sympatický'],
  'dynamic': ['dynamic', 'active', 'vigorous', 'forceful', 'powerful', 'intense', 'dynamický'],
  'steady': ['steady', 'stable', 'consistent', 'reliable', 'dependable', 'trustworthy', 'spolehlivý'],
  'pleasant': ['pleasant', 'agreeable', 'enjoyable', 'likeable', 'charming', 'appealing', 'příjemný'],
  'refined': ['refined', 'cultured', 'polished', 'cultivated', 'tasteful', 'rafinovaný'],
  'light': ['light', 'airy', 'ethereal', 'delicate', 'feathery', 'lehký', 'vzdušný'],
  'cheerful': ['cheerful', 'happy', 'jolly', 'merry', 'bubbly', 'upbeat', 'veselý'],
};

/**
 * Age range to preferred pitch mapping
 * NOTE: Pitch values are RELATIVE within gender (low female ≠ low male)
 * - Female "low" voices: Achernar, Gacrux, Sulafat (mature/professional)
 * - Male "low" voices: Algieba, Alnilam, Iapetus, Rasalgethi, Schedar (deep/authoritative)
 * This works correctly because we filter by gender first, then apply pitch preference
 */
const AGE_TO_PITCH: Record<string, 'low' | 'medium' | 'high'> = {
  'child': 'high',
  'young adult': 'medium',
  'adult': 'medium',
  'elderly': 'low',
};

/**
 * Calculate semantic similarity score between trait and voice characteristic
 * Returns 0-1 score based on semantic cluster matching
 */
function calculateTraitScore(trait: string, voiceCharacteristic: string): number {
  const traitLower = trait.toLowerCase();
  const charLower = voiceCharacteristic.toLowerCase();
  
  // Exact match = perfect score
  if (traitLower === charLower) return 1.0;
  
  // Check if trait is in the semantic cluster for this characteristic
  const cluster = TRAIT_SEMANTIC_CLUSTERS[charLower];
  if (cluster) {
    // Check for substring matches in cluster
    for (const synonym of cluster) {
      if (traitLower.includes(synonym) || synonym.includes(traitLower)) {
        return 0.8; // Strong semantic match
      }
    }
  }
  
  // Check reverse - if characteristic is in trait's cluster
  for (const [characteristic, synonyms] of Object.entries(TRAIT_SEMANTIC_CLUSTERS)) {
    if (synonyms.some(s => traitLower.includes(s) || s.includes(traitLower))) {
      if (characteristic === charLower) {
        return 0.8;
      }
    }
  }
  
  // Partial string match
  if (traitLower.includes(charLower) || charLower.includes(traitLower)) {
    return 0.5;
  }
  
  return 0;
}

/**
 * Smart voice selection for character based on profile
 * Uses intelligent semantic matching with traits, age, and scoring
 * 
 * @param characterName - Character name (used for name-based hints like "stará paní")
 * @param gender - Character gender
 * @param traits - Character traits (e.g., ['calm', 'mature', 'authoritative'])
 * @param excludeVoices - Voices to exclude (e.g., narrator voice, already used voices)
 * @param ageRange - Optional age range for pitch selection
 * @returns Best matching voice
 */
export function selectVoiceForCharacter(
  characterName: string,
  gender: 'male' | 'female' | 'neutral',
  traits: string[] = [],
  excludeVoices: string[] = [],
  ageRange?: string
): GeminiVoice {
  // Filter by gender
  let candidates = gender === 'neutral' 
    ? GEMINI_VOICES 
    : GEMINI_VOICES.filter(v => v.gender === gender);
  
  // Exclude already used voices
  let availableCandidates = candidates.filter(v => !excludeVoices.includes(v.name));
  
  // If all voices of this gender are used, allow reuse (for books with many characters)
  if (availableCandidates.length === 0) {
    console.log(`[VoiceSelect] All ${gender} voices used, allowing reuse for ${characterName}`);
    availableCandidates = candidates;
  }
  
  if (availableCandidates.length === 0) {
    // Fallback to any voice if no gender match
    availableCandidates = GEMINI_VOICES.filter(v => !excludeVoices.includes(v.name));
    if (availableCandidates.length === 0) {
      availableCandidates = GEMINI_VOICES; // Last resort: reuse any voice
    }
  }
  
  // Combine character name with traits for matching
  // This allows "Stará paní" in name to influence voice selection
  const allTraits = [...traits, ...characterName.split(/\s+/)];
  
  // Score each candidate voice
  const scoredCandidates = availableCandidates.map(voice => {
    let score = 0;
    
    // 1. Trait matching (semantic)
    for (const trait of allTraits) {
      const traitScore = calculateTraitScore(trait, voice.characteristic);
      score += traitScore * 2; // Weight trait matches highly
    }
    
    // 2. Age/pitch matching
    if (ageRange) {
      const preferredPitch = AGE_TO_PITCH[ageRange.toLowerCase()];
      if (preferredPitch && voice.pitch === preferredPitch) {
        score += 1.5; // Bonus for age-appropriate pitch
      }
    }
    
    // 3. Infer age from traits/name
    const allTraitsLower = allTraits.map(t => t.toLowerCase()).join(' ');
    if (/stará|starý|elderly|old|aged|babička|dědeček|grandmother|grandfather/.test(allTraitsLower)) {
      if (voice.pitch === 'low') score += 1.5;
    } else if (/mladý|mladá|young|child|kid|boy|girl|dítě|teen/.test(allTraitsLower)) {
      if (voice.pitch === 'high') score += 1.5;
    }
    
    // 4. Small random factor to add variety when scores are equal
    score += Math.random() * 0.1;
    
    return { voice, score };
  });
  
  // Sort by score (highest first)
  scoredCandidates.sort((a, b) => b.score - a.score);
  
  const selected = scoredCandidates[0].voice;
  const topScore = scoredCandidates[0].score;
  
  console.log(`[VoiceSelect] ${characterName}: score=${topScore.toFixed(2)} -> ${selected.name} (${selected.characteristic}, ${selected.pitch})`);
  
  return selected;
}
```

---

### Backend: Hybrid Dramatizer (LLM-powered character analysis orchestration)
**File:** `apps/backend/src/hybridDramatizer.ts` | **Size:** 8.8 KB | **Lines:** 265

```typescript
/**
 * Hybrid Dramatization Pipeline
 * 
 * Cost-optimized workflow:
 * 1. Full-book character scan (LLM) - $0.04
 * 2. Chapter analysis:
 *    - No dialogue → Auto-tag NARRATOR ($0)
 *    - Simple dialogue → Rule-based ($0)
 *    - Complex dialogue → LLM on dialogue only ($0.01-0.02)
 * 
 * Expected: 60-80% cost reduction, 97-99% accuracy
 */

import { GeminiCharacterAnalyzer, CharacterProfile, GeminiConfig } from './llmCharacterAnalyzer.js';
import { 
  hasDialogue, 
  countDialogues, 
  applyRuleBasedTagging, 
  calculateConfidence,
  extractDialogueParagraphs,
  mergeWithNarration,
  TaggingResult 
} from './hybridTagger.js';
import { estimateTokens, TOKEN_COEFFICIENTS } from './costTracker.js';

export interface HybridDramatizationResult {
  taggedChapters: Array<{
    chapterNumber: number;
    taggedText: string;
    method: 'auto-narrator' | 'rule-based' | 'llm-fallback';
    confidence: number;
    cost: number;
  }>;
  characters: CharacterProfile[];
  totalCost: number;
  costBreakdown: {
    characterScan: number;
    autoNarrator: number;
    ruleBased: number;
    llmFallback: number;
  };
}

/**
 * Smart chapter tagging with hybrid approach
 * 
 * Decision tree:
 * - No dialogue → Auto-tag NARRATOR (100% confidence, $0)
 * - Has dialogue → Try rule-based
 *   - High confidence (≥0.85) → Use rule-based ($0)
 *   - Low confidence (<0.85) → LLM fallback on dialogue paragraphs only (~$0.01-0.02)
 */
export async function tagChapterHybrid(
  chapterText: string,
  characters: CharacterProfile[],
  analyzer: GeminiCharacterAnalyzer,
  chapterNumber: number,
  confidenceThreshold: number = 0.85
): Promise<TaggingResult> {
  
  // Strategy 1: No dialogue → Auto-tag as NARRATOR
  if (!hasDialogue(chapterText)) {
    console.log(`📖 Chapter ${chapterNumber}: No dialogue detected → Auto-tag NARRATOR`);
    // Use Gemini TTS format: "SPEAKER: text"
    const taggedText = `NARRATOR: ${chapterText}`;
    
    return {
      taggedText,
      method: 'auto-narrator',
      confidence: 1.0,
      dialogueCount: 0,
      cost: 0,
    };
  }
  
  const dialogueCount = countDialogues(chapterText);
  console.log(`💬 Chapter ${chapterNumber}: ${dialogueCount} dialogue(s) detected`);
  
  // Strategy 2: Try rule-based tagging
  console.log(`🔍 Chapter ${chapterNumber}: Attempting rule-based tagging...`);
  const { taggedText: ruleBasedTagged, confidence: ruleConfidence } = applyRuleBasedTagging(
    chapterText,
    characters
  );
  
  const finalConfidence = calculateConfidence(ruleBasedTagged, characters);
  console.log(`📊 Rule-based confidence: ${(finalConfidence * 100).toFixed(1)}%`);
  
  // High confidence → Use rule-based only if speechStyle directives are not required
  if (finalConfidence >= confidenceThreshold) {
    console.log(`✅ Chapter ${chapterNumber}: Rule-based tagging successful (confidence ${(finalConfidence * 100).toFixed(1)}%)`);
    console.log(`🔁 Chapter ${chapterNumber}: Forcing LLM tagging to generate speechStyle directives`);
  } else {
    console.log(`🤖 Chapter ${chapterNumber}: Low confidence → LLM fallback on dialogue paragraphs`);
  }
  
  // Strategy 3: LLM fallback (dialogue paragraphs only)
  
  // Extract only paragraphs with dialogue
  const dialogueParagraphs = extractDialogueParagraphs(chapterText);
  const dialogueText = dialogueParagraphs.join('\n\n');
  
  console.log(`📝 Sending ${dialogueParagraphs.length} dialogue paragraphs to LLM (${dialogueText.length} chars vs ${chapterText.length} full chapter)`);
  
  // Call LLM on dialogue-only text
  const llmTagged = await analyzer.tagChapterWithVoices(
    dialogueText,
    characters
  );
  
  // Merge LLM-tagged dialogues back with narration
  const mergedText = mergeWithNarration(chapterText, llmTagged, characters);
  
  // Text is already in Gemini TTS format "SPEAKER: text"
  const finalText = mergedText;
  
  // Estimate cost using validated token coefficients (words × 2.15 for Slavic)
  // Note: Assuming Slavic language - adjust if language detection is available
  const inputTokens = estimateTokens(dialogueText, 'slavic');
  const outputTokens = estimateTokens(llmTagged, 'slavic');
  const cost = (inputTokens * 0.30 / 1_000_000) + (outputTokens * 2.50 / 1_000_000);
  
  console.log(`💰 LLM fallback cost: $${cost.toFixed(4)} (${inputTokens} in + ${outputTokens} out tokens)`);
  
  return {
    taggedText: finalText,
    method: 'llm-fallback',
    confidence: 0.98, // LLM is highly accurate
    dialogueCount,
    cost,
  };
}

/**
 * Dramatize full book with hybrid approach
 */


/**
 * Streaming Dramatization Result for individual chapters
 */
export interface StreamingChapterResult {
  chapterNumber: number;
  taggedText: string;
  method: 'auto-narrator' | 'rule-based' | 'llm-fallback';
  confidence: number;
  cost: number;
}

/**
 * Streaming Dramatization Pipeline
 * 
 * Yields chapters one-by-one as they're dramatized, enabling:
 * 1. Dramatize chapter 1 → yield → generate audio → start playback
 * 2. Meanwhile continue dramatizing chapter 2, 3, etc.
 * 
 * @param bookText - Full book text for character analysis
 * @param chapters - Array of chapter texts
 * @param geminiConfig - Gemini API config
 * @param onCharactersFound - Callback when character analysis completes
 * @param confidenceThreshold - Minimum confidence for rule-based (default 0.85)
 */
export async function* dramatizeBookStreaming(
  bookText: string,
  chapters: string[],
  geminiConfig: GeminiConfig,
  onCharactersFound?: (characters: CharacterProfile[]) => void,
  confidenceThreshold: number = 0.85
): AsyncGenerator<StreamingChapterResult, { characters: CharacterProfile[]; totalCost: number }, undefined> {
  
  console.log('🎭 Starting STREAMING hybrid dramatization pipeline...');
  console.log(`📚 Book: ${bookText.length} chars, ${chapters.length} chapters`);
  
  // Initialize Gemini analyzer
  const analyzer = new GeminiCharacterAnalyzer(geminiConfig);
  
  // Step 1: Character scan (blocking - needed for all chapters)
  console.log('🔍 Step 1: Analyzing full book for characters (LLM)...');
  const characters = await analyzer.analyzeFullBook(bookText);
  const characterScanCost = 0.04;
  
  console.log(`✅ Found ${characters.length} characters: ${characters.map((c: CharacterProfile) => c.name).join(', ')}`);
  console.log(`💰 Character scan cost: $${characterScanCost.toFixed(4)}`);
  
  // Notify caller of characters (for voice assignment)
  if (onCharactersFound) {
    onCharactersFound(characters);
  }
  
  // Step 2: Stream chapters one at a time
  console.log('🏷️ Step 2: Streaming chapter dramatization...');
  let totalCost = characterScanCost;
  
  for (let i = 0; i < chapters.length; i++) {
    const chapterNum = i + 1;
    console.log(`\n📖 Streaming Chapter ${chapterNum}/${chapters.length}...`);
    
    const result = await tagChapterHybrid(
      chapters[i],
      characters,
      analyzer,
      chapterNum,
      confidenceThreshold
    );
    
    totalCost += result.cost;
    
    // Yield this chapter immediately for audio generation
    yield {
      chapterNumber: chapterNum,
      taggedText: result.taggedText,
      method: result.method,
      confidence: result.confidence,
      cost: result.cost,
    };
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 STREAMING DRAMATIZATION COMPLETE');
  console.log(`💰 Total cost: $${totalCost.toFixed(4)}`);
  console.log('='.repeat(60) + '\n');
  
  return { characters, totalCost };
}

/**
 * Fast-start: Dramatize first chapter only for immediate playback
 */
export async function dramatizeFirstChapterHybrid(
  bookText: string,
  firstChapter: string,
  geminiConfig: GeminiConfig,
  confidenceThreshold: number = 0.85
): Promise<{
  taggedText: string;
  characters: CharacterProfile[];
  method: 'auto-narrator' | 'rule-based' | 'llm-fallback';
  confidence: number;
  cost: number;
}> {
  
  console.log('⚡ Fast-start: First chapter hybrid dramatization...');
  
  // Initialize analyzer
  const analyzer = new GeminiCharacterAnalyzer(geminiConfig);
  
  // Step 1: Character scan
  const characters = await analyzer.analyzeFullBook(bookText);
  const characterScanCost = 0.04;
  
  // Step 2: Tag first chapter with hybrid approach
  const result = await tagChapterHybrid(firstChapter, characters, analyzer, 1, confidenceThreshold);
  
  console.log(`⚡ Fast-start complete: ${result.method} (confidence ${(result.confidence * 100).toFixed(1)}%)`);
  console.log(`💰 Total cost: $${(characterScanCost + result.cost).toFixed(4)}`);
  
  return {
    taggedText: result.taggedText,
    characters,
    method: result.method,
    confidence: result.confidence,
    cost: characterScanCost + result.cost,
  };
}
```

---

### Backend: Hybrid Tagger (dialogue tagging with [VOICE=X] markers)
**File:** `apps/backend/src/hybridTagger.ts` | **Size:** 25 KB | **Lines:** 628

```typescript
/**
 * Hybrid Dialogue Tagger
 * 
 * Cost-optimized tagging strategy:
 * 1. No dialogue → Auto-tag as NARRATOR ($0)
 * 2. Simple dialogue → Rule-based tagging ($0)
 * 3. Complex dialogue → LLM fallback (minimal cost)
 * 
 * Expected cost reduction: 60-80% vs pure LLM
 * Expected accuracy: 97-99%
 * 
 * OUTPUT FORMAT: Official Gemini TTS multi-speaker format
 * - Each line: "SPEAKER: text"
 * - Speaker aliases: ALL CAPS, alphanumeric only, no spaces/diacritics
 * - Example: "NARRATOR: He walked in.\nJOHN: Hello there!"
 * 
 * INNER VOICE / THOUGHTS:
 * - WITH quotes: "Did he lie?" she thought → Rule-based can detect
 * - WITHOUT quotes: She wondered if he lied → LLM required (narrator paraphrase vs actual thought)
 * 
 * Limitation: Unquoted internal thoughts are very hard for rule-based detection.
 * These cases will trigger LLM fallback for proper attribution and style tagging.
 */

import { CharacterProfile, toTTSSpeakerAlias } from './llmCharacterAnalyzer.js';

export interface TaggingResult {
  taggedText: string;
  method: 'auto-narrator' | 'rule-based' | 'llm-fallback';
  confidence: number;
  dialogueCount: number;
  cost: number; // Estimated cost in USD
}

export interface VoiceStyle {
  character: string;
  style: 'normal' | 'whisper' | 'thought' | 'letter';
}

/**
 * Infer gender from character name and context
 * 
 * Methods:
 * 1. Character name patterns (Marie, John, etc.)
 * 2. Pronoun usage in surrounding text (he/she, his/her)
 * 3. Gendered verb forms (Czech: řekl/řekla, pomyslel/pomyslela)
 * 4. Gendered adjectives (Czech: byl/byla, měl/měla)
 * 
 * @param characterName - Character name to analyze
 * @param contextText - Surrounding text for context analysis
 * @returns 'male', 'female', or 'neutral'
 */
export function inferGender(characterName: string, contextText: string = ''): 'male' | 'female' | 'neutral' {
  const name = characterName.toLowerCase();
  const context = contextText.toLowerCase();
  
  // Method 1: Czech name endings (very reliable)
  // Czech female names typically end in -a, -e
  // Czech male names typically end in consonants or -o
  const czechFemaleEndings = /a$|e$/i;
  const czechMaleEndings = /[bcčdďfghjklmnňpqrřsštťvwxzž]$/i;
  
  // Check if it's a Czech-looking name (contains Czech characters or is capitalized properly)
  const isCzechName = /[áčďéěíňóřšťúůýž]/i.test(name) || /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+$/.test(characterName);
  
  if (isCzechName) {
    if (czechFemaleEndings.test(name) && !name.match(/ska$/)) {
      // Most Czech female names end in -a or -e (but not surnames ending in -ska which can be ambiguous)
      return 'female';
    }
    if (czechMaleEndings.test(name)) {
      return 'male';
    }
  }
  
  // Method 2: Common international name patterns
  const femaleNames = /^(marie|maria|mary|lili|lily|sarah|anna|eve|elizabeth|kate|susan|jane|lisa|linda|barbara|margaret|dorothy|helen|nancy|karen|betty|sandra|ashley|kimberly|donna|emily|michelle|carol|amanda|melissa|saffro)/i;
  const maleNames = /^(joseph|ragowski|joe|john|james|robert|michael|william|david|richard|charles|thomas|christopher|daniel|paul|mark|donald|george|kenneth|steven|edward|brian|ronald|anthony|kevin|jason|matthew|gary|timothy)/i;
  
  if (femaleNames.test(name)) return 'female';
  if (maleNames.test(name)) return 'male';
  
  // Method 3: Pronoun analysis in context
  const malePronouns = (context.match(/\b(he|him|his|jeho|mu|jej)\b/gi) || []).length;
  const femalePronouns = (context.match(/\b(she|her|hers|její|jí)\b/gi) || []).length;
  
  if (femalePronouns > malePronouns * 1.5) return 'female';
  if (malePronouns > femalePronouns * 1.5) return 'male';
  
  // Method 4: Czech gendered verb forms (past tense) - MOST RELIABLE
  // Male: řekl, zvolal, poznamenal, odpověděl, prohlásil, dodal, podotkl, zeptal, pomyslel, uvažoval, zavrčel
  // Female: řekla, zvolala, poznamenala, odpověděla, prohlásila, dodala, podotkla, zeptala, pomyslela, uvažovala
  const czechMaleVerbs = (context.match(/\b(řekl|zvolal|poznamenal|odpověděl|prohlásil|dodal|podotkl|zeptal|pomyslel|uvažoval|přemýšlel|zavrčel|vzal|byl|měl|viděl|šel|přišel|začal|skončil)\b/gi) || []).length;
  const czechFemaleVerbs = (context.match(/\b(řekla|zvolala|poznamenala|odpověděla|prohlásila|dodala|podotkla|zeptala|pomyslela|uvažovala|přemýšlela|vzala|byla|měla|viděla|šla|přišla|začala|skončila)\b/gi) || []).length;
  
  if (czechFemaleVerbs > czechMaleVerbs) return 'female';
  if (czechMaleVerbs > czechFemaleVerbs) return 'male';
  
  // Method 5: Czech gendered adjectives (l-participle)
  // Male: byl, měl, viděl, šel
  // Female: byla, měla, viděla, šla
  const czechMaleAdjectives = (context.match(/\b(mladý|starý|velký|malý|dobrý|zlý|krásný|ošklivý)\b/gi) || []).length;
  const czechFemaleAdjectives = (context.match(/\b(mladá|stará|velká|malá|dobrá|zlá|krásná|ošklivá)\b/gi) || []).length;
  
  if (czechFemaleAdjectives > czechMaleAdjectives) return 'female';
  if (czechMaleAdjectives > czechFemaleAdjectives) return 'male';
  
  // Default: neutral if no clear pattern
  return 'neutral';
}

/**
 * Detect if chapter has any dialogue
 * Checks for common quote marks (English, Czech, German)
 */
export function hasDialogue(text: string): boolean {
  // Check for various quote marks
  const quotePatterns = [
    /["']([^"']+)["']/,        // English straight: "text" or 'text'
    /[\u201C\u201D]([^\u201C\u201D]+)[\u201C\u201D]/,  // English curly: "text" (U+201C/U+201D)
    /\u201E([^\u201E\u201C]+)\u201C/,  // Czech/German: „text" (U+201E opening, U+201C closing)
    /[»«]([^»«]+)[»«]/,         // French/German guillemets
  ];
  
  return quotePatterns.some(pattern => pattern.test(text));
}

/**
 * Count dialogue instances in text
 */
export function countDialogues(text: string): number {
  const patterns = [
    /["']([^"']+)["']/g,                    // English straight: "text" or 'text'
    /[\u201C\u201D]([^\u201C\u201D]+)[\u201C\u201D]/g,  // English curly: "text" (U+201C/U+201D)
    /\u201E([^\u201E\u201C]+)\u201C/g,      // Czech/German: „text" (U+201E opening, U+201C closing)
    /[»«]([^»«]+)[»«]/g,                     // French/German guillemets
  ];
  
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  
  return count;
}

/**
 * Extract dialogue paragraphs (paragraphs containing quotes)
 */
export function extractDialogueParagraphs(text: string): string[] {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.filter(p => hasDialogue(p));
}

/**
 * Split text content into dialogue (quoted) and narration (unquoted) segments
 * 
 * This is the CORE function that ensures narration is always separated from dialogue.
 * Used by both rule-based tagging and LLM output processing.
 * 
 * @param content - Text that may contain mixed dialogue and narration
 * @returns Array of segments with type (dialogue/narration) and text
 */
function splitIntoDialogueNarration(content: string): Array<{ type: 'dialogue' | 'narration'; text: string }> {
  const segments: Array<{ type: 'dialogue' | 'narration'; text: string }> = [];
  
  // Pattern matches various quote styles BUT NOT ASCII apostrophe (') which is used in contractions
  // Includes: „ (Czech), " (ASCII), "" (curly double), '' (curly single U+2018/U+2019), «» (guillemets)
  const quotePattern = /([„"\u201C\u201D\u2018\u2019«»])([^„"\u201C\u201D\u2018\u2019«»]*?)([„"\u201C\u201D\u2018\u2019«»])/g;
  const hasPhoneticContent = (text: string): boolean => /[\p{L}\p{N}]/u.test(text);
  
  let lastIndex = 0;
  let match;
  
  while ((match = quotePattern.exec(content)) !== null) {
    // Text before this quote is narration
    const beforeQuote = content.substring(lastIndex, match.index).trim();
    if (beforeQuote) {
      segments.push({ type: 'narration', text: beforeQuote });
    }
    
    // The quote itself is dialogue (discard if it has no phonetic content)
    const quotedInner = match[2] || '';
    if (hasPhoneticContent(quotedInner)) {
      segments.push({ type: 'dialogue', text: match[0] });
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Text after last quote is narration
  const afterQuotes = content.substring(lastIndex).trim();
  if (afterQuotes) {
    segments.push({ type: 'narration', text: afterQuotes });
  }
  
  // If no quotes found at all, entire content is narration
  if (segments.length === 0 && content.trim()) {
    segments.push({ type: 'narration', text: content.trim() });
  }
  
  return segments;
}

/**
 * Remove quoted spans that contain no phonetic content.
 */
function stripNonPhoneticQuotedText(text: string): string {
  const quotePattern = /([„"\u201C\u201D\u2018\u2019«»])([^„"\u201C\u201D\u2018\u2019«»]*?)([„"\u201C\u201D\u2018\u2019«»])/g;
  const hasPhoneticContent = (value: string): boolean => /[\p{L}\p{N}]/u.test(value);
  return text.replace(quotePattern, (full, _open, inner, _close) => {
    return hasPhoneticContent(inner) ? full : '';
  });
}

/**
 * Remove speaker lines that only contain non-phonetic quoted text.
 */
function removeNonPhoneticQuotedSpeakerLines(taggedDialogues: string): string {
  const speakerLinePattern = /^([A-Z][A-Z0-9]*):\s*(.*)$/;
  const hasPhoneticContent = (value: string): boolean => /[\p{L}\p{N}]/u.test(value);
  const lines = taggedDialogues.split('\n');
  const cleaned: string[] = [];

  for (const line of lines) {
    const match = line.match(speakerLinePattern);
    if (!match) {
      cleaned.push(line);
      continue;
    }

    const speaker = match[1];
    const rawText = match[2] || '';
    const strippedText = stripNonPhoneticQuotedText(rawText).trim();

    if (!hasPhoneticContent(strippedText)) {
      // Drop any preceding directive line for this speaker
      const prev = cleaned[cleaned.length - 1];
      if (prev && !speakerLinePattern.test(prev.trim()) && prev.trim().length > 0) {
        cleaned.pop();
      }
      continue;
    }

    cleaned.push(`${speaker}: ${strippedText}`);
  }

  return cleaned.join('\n');
}

/**
 * Enhanced rule-based dialogue detection and tagging
 * 
 * Improvements over basic approach:
 * 1. Multi-line attribution: Looks at next/previous lines for attribution
 * 2. Post-quote attribution: "Quote" CHARACTER smiled/said
 * 3. Pronoun resolution: "he said" → most recently mentioned character
 * 4. Paragraph context: Groups quotes within same paragraph
 * 5. No incorrect carry-over: Resets speaker when there's narration gap
 * 
 * CRITICAL: Lines with mixed dialogue/narration are split into segments.
 * Narration (unquoted text) ALWAYS gets NARRATOR tag.
 */
export function applyRuleBasedTagging(
  text: string,
  characters: CharacterProfile[]
): { taggedText: string; confidence: number } {
  // Create character name lookup (case-insensitive)
  const characterNames = new Set<string>();
  const aliasToMainName = new Map<string, string>();
  const mainNameToTTSAlias = new Map<string, string>(); // Map main name to TTS alias
  
  for (const char of characters) {
    const mainName = char.name.toUpperCase();
    const ttsAlias = toTTSSpeakerAlias(char.name); // Convert to TTS alias (concatenated, no diacritics)
    
    characterNames.add(mainName);
    aliasToMainName.set(mainName, mainName);
    mainNameToTTSAlias.set(mainName, ttsAlias);
    
    if (char.aliases) {
      for (const alias of char.aliases) {
        const upperAlias = alias.toUpperCase();
        characterNames.add(upperAlias);
        aliasToMainName.set(upperAlias, mainName);
      }
    }
  }
  
  // Helper to convert character name to TTS alias
  const toSpeakerAlias = (name: string): string => {
    const mainName = aliasToMainName.get(name.toUpperCase()) || name.toUpperCase();
    return mainNameToTTSAlias.get(mainName) || toTTSSpeakerAlias(name);
  };

  
  // Speech verbs (English + Czech)
  const speechVerbs = 'said|asked|replied|answered|shouted|whispered|muttered|exclaimed|thought|wondered|pondered|mused|realized|called|cried|yelled|screamed|murmured|demanded|inquired|responded|suggested|added|continued|began|started|finished|concluded|agreed|disagreed|argued|explained|announced|declared|stated|mentioned|noted|observed|remarked|commented|repeated|echoed|insisted|urged|warned|promised|admitted|confessed|denied|lied|joked|laughed|sighed|groaned|moaned|gasped|breathed|hissed|growled|snarled|snapped|barked|roared|bellowed|boomed|thundered|smiled|grinned|frowned|nodded|shrugged|cleared|řekl|řekla|zvolal|zvolala|poznamenal|poznamenala|odpověděl|odpověděla|prohlásil|prohlásila|dodal|dodala|podotkl|podotkla|zeptal|zeptala|pomyslel|pomyslela|uvažoval|uvažovala|přemýšlel|přemýšlela|zavolal|zavolala|křikl|křikla|zašeptal|zašeptala|zabručel|zabručela|zasmál|zasmála|povzdechl|povzdechla|zasténal|zasténala|zaúpěl|zaúpěla';
  const speechVerbPattern = new RegExp(`\\b(${speechVerbs})\\b`, 'i');
  
  // Pronoun patterns for he/she attribution
  const pronounPattern = /\b(he|she|they)\s+(said|asked|replied|exclaimed|whispered|muttered|shouted|thought|wondered|began|continued|added|remarked|observed|noted|commented)\b/i;
  
  // Sort character names by length (longest first)
  const sortedNames = Array.from(characterNames).sort((a, b) => b.length - a.length);
  
  // Helper: Find character name in text
  const findCharacterInText = (searchText: string): string | null => {
    for (const charName of sortedNames) {
      const escapedName = charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const namePattern = new RegExp(`\\b${escapedName}\\b`, 'i');
      if (namePattern.test(searchText)) {
        return aliasToMainName.get(charName) || charName;
      }
    }
    return null;
  };
  
  const lines = text.split('\n');
  const taggedLines: string[] = [];
  let lastMentionedCharacter: string | null = null; // Track last mentioned character for pronoun resolution
  let lastDialogueSpeaker: string | null = null; // Track speaker of last dialogue line
  let linesSinceLastDialogue = 0; // Count narration lines between dialogues
  let successfulAttributions = 0;
  let totalDialogues = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
    const prevLine = i > 0 ? lines[i - 1].trim() : '';
    
    // Track any character mentioned in narration (for pronoun resolution)
    if (!hasDialogue(line)) {
      const mentionedChar = findCharacterInText(line);
      if (mentionedChar) {
        lastMentionedCharacter = mentionedChar;
      }
      
      // Narration line - output in Gemini TTS format
      taggedLines.push(`NARRATOR: ${line}`);
      linesSinceLastDialogue++;
      continue;
    }
    
    totalDialogues++;
    let speaker: string | null = null;
    let foundAttribution = false;
    
    // === PATTERN 1: Direct attribution on same line ===
    // "Quote" said CHARACTER or CHARACTER said "Quote"
    if (speechVerbPattern.test(line)) {
      const charInLine = findCharacterInText(line);
      if (charInLine) {
        speaker = charInLine;
        foundAttribution = true;
        console.log(`  [Tagger] Direct attribution: "${charInLine}" in line`);
      }
    }
    
    // === PATTERN 2: Pronoun attribution on same line ===
    // "Quote" he said → resolve "he" to lastMentionedCharacter
    if (!foundAttribution && pronounPattern.test(line) && lastMentionedCharacter) {
      speaker = lastMentionedCharacter;
      foundAttribution = true;
      console.log(`  [Tagger] Pronoun resolved to: "${lastMentionedCharacter}"`);
    }
    
    // === PATTERN 3: Post-quote attribution (same line) ===
    // "Quote" The newscaster smiled. → CHARACTER + action verb (even without speech verb)
    if (!foundAttribution) {
      // Look for character name AFTER a quote on the same line
      const postQuoteMatch = line.match(/[""\u201D][,.]?\s*(.+)$/);
      if (postQuoteMatch) {
        const afterQuote = postQuoteMatch[1];
        const charInAfter = findCharacterInText(afterQuote);
        if (charInAfter) {
          speaker = charInAfter;
          foundAttribution = true;
          console.log(`  [Tagger] Post-quote attribution: "${charInAfter}"`);
        }
      }
    }
    
    // === PATTERN 4: Multi-line attribution (look at NEXT line) ===
    // "Quote"
    // he exclaimed, looking around...
    if (!foundAttribution && nextLine) {
      // Check if next line has attribution
      if (speechVerbPattern.test(nextLine)) {
        const charInNext = findCharacterInText(nextLine);
        if (charInNext) {
          speaker = charInNext;
          foundAttribution = true;
          console.log(`  [Tagger] Next-line attribution: "${charInNext}"`);
        } else if (pronounPattern.test(nextLine) && lastMentionedCharacter) {
          // "Quote"
          // he said
          speaker = lastMentionedCharacter;
          foundAttribution = true;
          console.log(`  [Tagger] Next-line pronoun resolved to: "${lastMentionedCharacter}"`);
        }
      }
    }
    
    // === PATTERN 5: Pre-quote attribution (look at PREVIOUS line) ===
    // Mr. Dursley cleared his throat nervously.
    // "Er – Petunia..."
    if (!foundAttribution && prevLine && !hasDialogue(prevLine)) {
      const charInPrev = findCharacterInText(prevLine);
      if (charInPrev) {
        speaker = charInPrev;
        foundAttribution = true;
        console.log(`  [Tagger] Previous-line attribution: "${charInPrev}"`);
      } else if (lastMentionedCharacter) {
        // ENHANCEMENT: If previous line has action (verb) but no explicit name,
        // use last mentioned character (for pronoun-like attribution)
        // e.g., "He cleared his throat nervously." → He = last mentioned character
        const hasActionVerb = /\b(cleared|raised|lifted|turned|looked|smiled|frowned|nodded|shook|sighed|groaned|stood|sat|walked|moved|stepped|reached|grabbed|took|put|placed|opened|closed)\b/i.test(prevLine);
        if (hasActionVerb) {
          speaker = lastMentionedCharacter;
          foundAttribution = true;
          console.log(`  [Tagger] Previous-line action → inferred character: "${lastMentionedCharacter}"`);
        }
      }
    }
    
    // === PATTERN 6: Continuation - same speaker for adjacent quotes ===
    // Only if no significant narration gap (≤1 line)
    if (!foundAttribution && lastDialogueSpeaker && linesSinceLastDialogue <= 1) {
      speaker = lastDialogueSpeaker;
      console.log(`  [Tagger] Continuation from previous dialogue: "${lastDialogueSpeaker}"`);
      // Note: Don't mark as foundAttribution since it's just continuation
    }
    
    // === FALLBACK: NARRATOR if nothing found ===
    if (!speaker) {
      speaker = 'NARRATOR';
      console.log(`  [Tagger] No attribution found, using NARRATOR. Line: "${line.substring(0, 60)}..."`);
    }
    
    if (foundAttribution) {
      successfulAttributions++;
      lastMentionedCharacter = speaker; // Update for pronoun resolution
    }
    
    // Update tracking
    lastDialogueSpeaker = speaker !== 'NARRATOR' ? speaker : lastDialogueSpeaker;
    linesSinceLastDialogue = 0;
    
    // Split line into dialogue/narration segments
    const segments = splitIntoDialogueNarration(line);
    
    // Detect if this is a thought
    const isThought = /\b(thought|wondered|pondered|mused|realized|pomyslel|pomyslela|uvažoval|uvažovala|přemýšlel|přemýšlela)\b/i.test(line);
    
    // Tag each segment - output in Gemini TTS format "SPEAKER: text"
    for (const segment of segments) {
      if (segment.type === 'narration') {
        // NARRATOR segment
        taggedLines.push(`NARRATOR: ${segment.text}`);
        
        // Track character mentioned in narration part
        const mentionedInNarration = findCharacterInText(segment.text);
        if (mentionedInNarration) {
          lastMentionedCharacter = mentionedInNarration;
        }
      } else {
        // Dialogue segment - convert speaker to TTS alias (concatenated, no diacritics)
        const speakerAlias = toSpeakerAlias(speaker);
        taggedLines.push(`${speakerAlias}: ${segment.text}`);
      }
    }
  }
  
  // Calculate confidence
  const attributionRate = totalDialogues > 0 ? successfulAttributions / totalDialogues : 1.0;
  const confidence = attributionRate * 0.9 + 0.05;
  
  // POST-PROCESSING: Merge consecutive same-speaker lines
  const finalLines = mergeConsecutiveSpeakerLines(taggedLines);
  
  return {
    taggedText: finalLines.join('\n'),
    confidence: Math.min(confidence, 0.95),
  };
}

/**
 * Merge consecutive lines from the same speaker
 * 
 * Optimizes output by combining consecutive "SPEAKER: text" lines
 * into a single line when the speaker is the same.
 * 
 * @param lines - Array of lines in "SPEAKER: text" format
 * @returns Merged lines with no consecutive duplicates
 */
export function mergeConsecutiveSpeakerLines(lines: string[]): string[] {
  if (lines.length === 0) return [];
  
  const result: string[] = [];
  const speakerPattern = /^([A-Z][A-Z0-9]*): (.+)$/;
  
  let currentSpeaker: string | null = null;
  let currentTexts: string[] = [];
  
  for (const line of lines) {
    const match = line.match(speakerPattern);
    
    if (match) {
      const [, speaker, text] = match;
      
      if (speaker === currentSpeaker) {
        // Same speaker - accumulate text
        currentTexts.push(text);
      } else {
        // Different speaker - flush previous and start new
        if (currentSpeaker && currentTexts.length > 0) {
          result.push(`${currentSpeaker}: ${currentTexts.join(' ')}`);
        }
        currentSpeaker = speaker;
        currentTexts = [text];
      }
    } else {
      // Line doesn't match pattern - flush and add as-is
      if (currentSpeaker && currentTexts.length > 0) {
        result.push(`${currentSpeaker}: ${currentTexts.join(' ')}`);
        currentSpeaker = null;
        currentTexts = [];
      }
      if (line.trim()) {
        result.push(line);
      }
    }
  }
  
  // Flush final segment
  if (currentSpeaker && currentTexts.length > 0) {
    result.push(`${currentSpeaker}: ${currentTexts.join(' ')}`);
  }
  
  return result;
}

/**
 * Calculate confidence score for tagged text
 * 
 * Now works with SPEAKER: format (Gemini TTS official format)
 * 
 * Checks:
 * - All dialogues have speaker tags
 * - Speakers match known characters
 * - Quote marks are properly paired
 */
export function calculateConfidence(
  taggedText: string,
  characters: CharacterProfile[]
): number {
  const characterNames = new Set(
    characters.map(c => c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase())
  );
  characterNames.add('NARRATOR');
  
  let score = 1.0;
  
  // Extract speakers from SPEAKER: format
  const speakerMatches = taggedText.match(/^([A-Z][A-Z0-9]*):/gm) || [];
  
  if (speakerMatches.length === 0) {
    return 0.0; // No tags found
  }
  
  // Check 1: All speakers are known characters
  let unknownSpeakers = 0;
  for (const match of speakerMatches) {
    const speaker = match.replace(':', '');
    if (!characterNames.has(speaker)) {
      unknownSpeakers++;
    }
  }
  if (unknownSpeakers > 0) {
    score *= Math.max(0.5, 1 - unknownSpeakers / speakerMatches.length);
  }
  
  // Check 2: Quote marks are paired
  const openQuotes = (taggedText.match(/[""„'«]/g) || []).length;
  const closeQuotes = (taggedText.match(/[""'»]/g) || []).length;
  const quotePairing = Math.abs(openQuotes - closeQuotes);
  if (quotePairing > 0) {
    score *= Math.max(0.7, 1 - quotePairing / Math.max(openQuotes, 1));
  }
  
  // Check 3: Reasonable tag density
  const lines = taggedText.split('\n').length;
  const tagDensity = speakerMatches.length / lines;
  if (tagDensity < 0.01 || tagDensity > 0.5) {
    score *= 0.8; // Suspicious density
  }
  
  return Math.max(0.0, Math.min(1.0, score));
}

/**
 * Merge LLM-tagged dialogues back into full chapter with narration
 * 
 * Uses SPEAKER: format (Gemini TTS official format)
 */
export function mergeWithNarration(
  originalText: string,
  taggedDialogues: string,
  characters: CharacterProfile[]
): string {
  // Check if output is in SPEAKER: format
  const speakerLineCount = (taggedDialogues.match(/^[A-Z][A-Z0-9]*:\s/gm) || []).length;
  
  if (speakerLineCount > 1) {
    // Properly tagged with multiple speakers
    console.log(`  [mergeWithNarration] LLM returned ${speakerLineCount} SPEAKER: lines - returning as-is`);
    return removeNonPhoneticQuotedSpeakerLines(taggedDialogues.trim());
  }
  
  // Fallback: wrap everything in NARRATOR
  console.log(`  [mergeWithNarration] Only ${speakerLineCount} tag(s) - wrapping as NARRATOR`);
  return `NARRATOR: ${originalText}`;
}
```

---

### Backend: Chapter Chunker (chapter-level splitting)
**File:** `apps/backend/src/chapterChunker.ts` | **Size:** 16.1 KB | **Lines:** 481

```typescript
/**
 * Chapter Chunker - Chapter-aware chunking with Gemini TTS limits
 * 
 * Implements chunking that:
 * 1. Respects chapter boundaries (chunks never span chapters)
 * 2. Enforces Gemini TTS 4000-byte hard limit per voice segment
 * 3. Targets 2500 bytes per chunk (max 3500 bytes for safety margin)
 * 4. Breaks at sentence boundaries
 * 5. Validates voice segments individually for dramatized text
 * 
 * Part of Phase 3: Audiobook Library & File-Based Generation
 */

import { Chapter } from './bookChunker.js';
import { extractVoiceSegments, VoiceSegment } from './dramatizedChunkerSimple.js';
import { chunkForTwoSpeakers, TwoSpeakerChunk } from './twoSpeakerChunker.js';

// ========================================
// Gemini TTS Limits (CRITICAL)
// ========================================

/**
 * Gemini TTS hard limit - absolute maximum bytes per API request
 * Source: https://ai.google.dev/gemini-api/docs/text-to-speech
 */
export const GEMINI_TTS_HARD_LIMIT = 4000;

/**
 * Target bytes per chunk (for optimal generation time vs buffer)
 * ~2500 bytes = ~60s generation time, ~3-4 min audio
 */
export const SAFE_CHUNK_TARGET = 3500;

/**
 * Maximum bytes per chunk (safety margin below hard limit)
 * Accounts for:
 * - Multiple voice segments within one chunk
 * - UTF-8 encoding differences
 * - Edge cases in segment boundaries
 */
export const SAFE_CHUNK_MAX = 3500; // (unchanged, but now matches target)

// ========================================
// Ramp-Up Chunking Strategy
// ========================================

/**
 * Ramp-up chunk sizes for faster time-to-first-audio
 * 
 * Strategy: Start with tiny chunks that generate quickly,
 * then gradually increase to max size as buffer builds.
 * 
 * Math:
 * - 300 bytes ≈ 50 words ≈ 20s audio ≈ 3-5s TTS generation
 * - While user listens to 20s, next (larger) chunk generates
 * - Buffer grows continuously, preventing interruptions
 */
export const RAMP_UP_SIZES = [
  300,   // Chunk 0: ~20s audio, ~3s TTS → User hears audio at t=3s!
  500,   // Chunk 1: ~35s audio, ~4s TTS → Ready before chunk 0 finishes
  800,   // Chunk 2: ~55s audio, ~6s TTS → Buffer growing
  1200,  // Chunk 3: ~80s audio, ~8s TTS
  1800,  // Chunk 4: ~120s audio, ~12s TTS
  2500,  // Chunk 5: ~170s audio, ~15s TTS
  3500,  // Chunk 6+: Max size, steady state
];

/**
 * Get the target chunk size for a given chunk index (ramp-up strategy)
 * 
 * @param chunkIndex - Global chunk index (0 = first chunk of book)
 * @param useRampUp - Whether to use ramp-up strategy (default: true)
 * @returns Target bytes for this chunk
 */
export function getRampUpChunkSize(chunkIndex: number, useRampUp: boolean = true): number {
  if (!useRampUp) {
    return SAFE_CHUNK_TARGET;
  }
  
  if (chunkIndex < RAMP_UP_SIZES.length) {
    return RAMP_UP_SIZES[chunkIndex];
  }
  
  return SAFE_CHUNK_TARGET; // Max size after ramp-up
}

// ========================================
// Chunk Metadata
// ========================================

export interface ChunkInfo {
  chapterIndex: number;
  chunkIndexInChapter: number;
  globalChunkIndex: number;
  text: string;
  byteLength: number;
  isMultiVoice: boolean;
  voiceSegmentCount?: number;
}

export interface ChunkingResult {
  chunks: ChunkInfo[];
  totalChunks: number;
  chapterChunkCounts: number[]; // Number of chunks per chapter
}

// ========================================
// Helper Functions
// ========================================

/**
 * Check if a word ends with sentence-ending punctuation
 * 
 * @param word - Word to check
 * @returns True if word ends a sentence
 */
function isSentenceEnding(word: string): boolean {
  return /[.!?…]$/.test(word.trim());
}

/**
 * Validate that a voice segment doesn't exceed Gemini TTS hard limit
 * If it does, split it into smaller segments
 * 
 * @param segment - Voice segment to validate
 * @returns Array of valid segments (may be split if too large)
 */
export function validateAndSplitVoiceSegment(segment: VoiceSegment): VoiceSegment[] {
  const bytes = Buffer.byteLength(segment.text, 'utf8');
  
  if (bytes <= GEMINI_TTS_HARD_LIMIT) {
    return [segment]; // Segment is valid, return as-is
  }
  
  console.log(`  ⚠️ Splitting large ${segment.speaker} segment: ${bytes} bytes → multiple chunks`);
  
  // Split large segment into smaller ones at sentence boundaries
  const splitSegments: VoiceSegment[] = [];
  const sentences = segment.text.split(/(?<=[.!?…])\s+/);
  
  let currentText = '';
  let currentBytes = 0;
  
  for (const sentence of sentences) {
    const sentenceBytes = Buffer.byteLength(sentence, 'utf8');
    
    // If single sentence exceeds limit, split by words
    if (sentenceBytes > SAFE_CHUNK_TARGET && currentText === '') {
      const words = sentence.split(/\s+/);
      let wordChunk = '';
      
      for (const word of words) {
        const testChunk = wordChunk ? `${wordChunk} ${word}` : word;
        const testBytes = Buffer.byteLength(testChunk, 'utf8');
        
        if (testBytes >= SAFE_CHUNK_TARGET && wordChunk) {
          splitSegments.push({
            speaker: segment.speaker,
            text: wordChunk.trim(),
            startIndex: segment.startIndex,
            endIndex: segment.endIndex,
          });
          wordChunk = word;
        } else {
          wordChunk = testChunk;
        }
      }
      
      if (wordChunk) {
        currentText = wordChunk;
        currentBytes = Buffer.byteLength(wordChunk, 'utf8');
      }
      continue;
    }
    
    // Normal case: accumulate sentences
    const testText = currentText ? `${currentText} ${sentence}` : sentence;
    const testBytes = Buffer.byteLength(testText, 'utf8');
    
    if (testBytes >= SAFE_CHUNK_TARGET && currentText) {
      // Save current chunk and start new one
      splitSegments.push({
        speaker: segment.speaker,
        text: currentText.trim(),
        startIndex: segment.startIndex,
        endIndex: segment.endIndex,
      });
      currentText = sentence;
      currentBytes = sentenceBytes;
    } else {
      currentText = testText;
      currentBytes = testBytes;
    }
  }
  
  // Add remaining text
  if (currentText.trim()) {
    splitSegments.push({
      speaker: segment.speaker,
      text: currentText.trim(),
      startIndex: segment.startIndex,
      endIndex: segment.endIndex,
    });
  }
  
  console.log(`    → Split into ${splitSegments.length} segments`);
  return splitSegments;
}

/**
 * Legacy validation function - throws error for oversized segments
 * @deprecated Use validateAndSplitVoiceSegment instead for automatic splitting
 * 
 * @param segment - Voice segment to validate
 * @throws Error if segment exceeds 4000 bytes
 */
export function validateVoiceSegment(segment: VoiceSegment): void {
  const bytes = Buffer.byteLength(segment.text, 'utf8');
  if (bytes > GEMINI_TTS_HARD_LIMIT) {
    throw new Error(
      `Voice segment for ${segment.speaker} exceeds ${GEMINI_TTS_HARD_LIMIT}-byte Gemini TTS limit: ${bytes} bytes. ` +
      `This will cause TTS API failure. Split the text into smaller chunks.`
    );
  }
}

/**
 * Build chunk text from voice segments in Gemini TTS format
 * 
 * @param segments - Array of voice segments
 * @returns Chunk text in "SPEAKER: text" format
 */
function buildChunkFromSegments(segments: VoiceSegment[]): string {
  return segments.map(seg => `${seg.speaker}: ${seg.text}`).join('\n');
}

// ========================================
// Main Chunking Functions
// ========================================

/**
 * Chunk a single chapter (plain text, no voice tags)
 * 
 * Algorithm:
 * 1. Split chapter into words
 * 2. Accumulate words until reaching target size
 * 3. Look for sentence ending
 * 4. Break at sentence boundary (or max size if no sentence found)
 * 
 * @param chapter - Chapter to chunk
 * @param targetBytes - Target chunk size in bytes (default: 2500)
 * @param maxBytes - Maximum chunk size in bytes (default: 3500)
 * @param globalChunkOffset - Starting global chunk index for ramp-up calculation
 * @param useRampUp - Whether to use ramp-up chunk sizing (default: true for chapter 0)
 * @returns Array of chunk texts
 */
export function chunkChapter(
  chapter: Chapter,
  targetBytes: number = SAFE_CHUNK_TARGET,
  maxBytes: number = SAFE_CHUNK_MAX,
  globalChunkOffset: number = 0,
  useRampUp: boolean = false
): string[] {
  const chunks: string[] = [];
  const words = chapter.text.split(/\s+/).filter(w => w.length > 0);
  
  let currentChunk = '';
  let currentChunkIndex = 0;
  
  for (const word of words) {
    const testChunk = currentChunk ? `${currentChunk} ${word}` : word;
    const byteLength = Buffer.byteLength(testChunk, 'utf8');
    
    // Use ramp-up size for early chunks, or fixed target for later chunks
    const globalIndex = globalChunkOffset + currentChunkIndex;
    const effectiveTarget = useRampUp 
      ? getRampUpChunkSize(globalIndex, true)
      : targetBytes;
    const effectiveMax = Math.min(effectiveTarget + 500, maxBytes); // Small buffer above target
    
    // Once we reach target size, look for sentence ending
    if (byteLength >= effectiveTarget) {
      if (isSentenceEnding(word)) {
        // End chunk at sentence boundary
        chunks.push(testChunk);
        currentChunk = '';
        currentChunkIndex++;
        continue;
      }
      
      // Safety: if we exceed max size, break anyway (even mid-sentence)
      if (byteLength >= effectiveMax) {
        chunks.push(currentChunk);
        currentChunk = word; // Start new chunk with current word
        currentChunkIndex++;
        continue;
      }
    }
    
    currentChunk = testChunk;
  }
  
  // Add remaining text as final chunk
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  // Log ramp-up info for first chapter
  if (useRampUp && globalChunkOffset === 0) {
    console.log(`  Chapter ${chapter.index} chunked with RAMP-UP: ${chunks.length} chunks`);
    chunks.forEach((c, i) => {
      const bytes = Buffer.byteLength(c, 'utf8');
      const target = getRampUpChunkSize(i, true);
      console.log(`    Chunk ${i}: ${bytes} bytes (target: ${target})`);
    });
  } else {
    console.log(`  Chapter ${chapter.index} chunked: ${chunks.length} chunks`);
  }
  
  return chunks;
}

/**
 * Chunk a dramatized chapter (with voice tags)
 * 
 * Algorithm:
 * 1. Use twoSpeakerChunker to ensure max 2 speakers per chunk (Gemini TTS limit)
 * 2. Each chunk stays within byte limits
 * 3. Chunks are formatted in SPEAKER: format for TTS processing
 * 
 * @param chapter - Chapter with SPEAKER: format tags
 * @param globalChunkOffset - Starting global chunk index for ramp-up calculation
 * @param useRampUp - Whether to use ramp-up chunk sizing
 * @returns Array of chunk texts with voice tags preserved
 */
export function chunkDramatizedChapter(
  chapter: Chapter,
  globalChunkOffset: number = 0,
  useRampUp: boolean = false
): string[] {
  const rawSegments = extractVoiceSegments(chapter.text);
  
  if (rawSegments.length === 0) {
    // No voice tags found - fallback to regular chunking
    console.warn(`  Chapter ${chapter.index}: Expected voice tags but none found, using regular chunking`);
    return chunkChapter(chapter, SAFE_CHUNK_TARGET, SAFE_CHUNK_MAX, globalChunkOffset, useRampUp);
  }
  
  // Calculate effective max bytes based on ramp-up position
  const effectiveMaxBytes = useRampUp 
    ? getRampUpChunkSize(globalChunkOffset, true)
    : SAFE_CHUNK_MAX;
  
  // Use twoSpeakerChunker to ensure max 2 speakers per chunk
  const twoSpeakerChunks = chunkForTwoSpeakers(chapter.text, {
    maxBytes: effectiveMaxBytes,
    minBytes: 0,  // Allow small chunks when 3rd speaker forces a split
  }, chapter.index);
  
  // Convert TwoSpeakerChunk format to Gemini TTS format
  const chunks: string[] = twoSpeakerChunks.map(chunk => {
    // Build "SPEAKER: text" format for TTS API
    return chunk.segments.map(seg => `${seg.speaker}: ${seg.text}`).join('\n');
  });
  
  if (useRampUp && globalChunkOffset < RAMP_UP_SIZES.length) {
    console.log(`  Chapter ${chapter.index} (dramatized) chunked with RAMP-UP: ${chunks.length} chunks`);
    chunks.forEach((c, i) => {
      const bytes = Buffer.byteLength(c, 'utf8');
      const target = getRampUpChunkSize(globalChunkOffset + i, true);
      console.log(`    Chunk ${globalChunkOffset + i}: ${bytes} bytes (target: ${target})`);
    });
  } else {
    console.log(`  Chapter ${chapter.index} (dramatized) chunked: ${chunks.length} chunks from ${rawSegments.length} voice segments`);
  }
  
  return chunks;
}

/**
 * Chunk entire book by chapters
 * 
 * This is the main entry point for chapter-aware chunking.
 * 
 * Key features:
 * - Chunks never span chapter boundaries
 * - Respects voice tags in dramatized text
 * - Validates all segments against Gemini TTS limits
 * - Returns metadata for each chunk
 * - Uses RAMP-UP strategy for first chunks (fast time-to-first-audio)
 * 
 * @param chapters - Array of chapters from book
 * @param isDramatized - Whether book contains voice tags
 * @param useRampUp - Whether to use ramp-up sizing for first chunks (default: true)
 * @returns Chunking result with metadata
 */
export function chunkBookByChapters(
  chapters: Chapter[],
  isDramatized: boolean = false,
  useRampUp: boolean = true
): ChunkingResult {
  const allChunks: ChunkInfo[] = [];
  const chapterChunkCounts: number[] = [];
  let globalChunkIndex = 0;
  
  console.log(`\n📚 Chunking ${chapters.length} chapters (dramatized: ${isDramatized}, ramp-up: ${useRampUp})...`);
  
  if (useRampUp) {
    console.log(`  🚀 Ramp-up enabled: first ${RAMP_UP_SIZES.length} chunks use progressive sizing`);
    console.log(`     Sizes: ${RAMP_UP_SIZES.join(' → ')} → ${SAFE_CHUNK_TARGET} bytes`);
  }
  
  for (const chapter of chapters) {
    // Use ramp-up for early global chunks (not per-chapter)
    const chapterUseRampUp = useRampUp && globalChunkIndex < RAMP_UP_SIZES.length;
    
    // Choose chunking strategy based on content
    const chunkTexts = isDramatized 
      ? chunkDramatizedChapter(chapter, globalChunkIndex, chapterUseRampUp)
      : chunkChapter(chapter, SAFE_CHUNK_TARGET, SAFE_CHUNK_MAX, globalChunkIndex, chapterUseRampUp);
    
    chapterChunkCounts.push(chunkTexts.length);
    
    // Build chunk metadata
    for (let i = 0; i < chunkTexts.length; i++) {
      const chunkText = chunkTexts[i];
      const byteLength = Buffer.byteLength(chunkText, 'utf8');
      const voiceSegments = extractVoiceSegments(chunkText);
      
      allChunks.push({
        chapterIndex: chapter.index,
        chunkIndexInChapter: i,
        globalChunkIndex,
        text: chunkText,
        byteLength,
        isMultiVoice: voiceSegments.length > 0,
        voiceSegmentCount: voiceSegments.length || undefined,
      });
      
      globalChunkIndex++;
    }
  }
  
  console.log(`✓ Chunking complete: ${allChunks.length} total chunks across ${chapters.length} chapters`);
  console.log(`  Average chunks per chapter: ${(allChunks.length / chapters.length).toFixed(1)}`);
  console.log(`  Chapter chunk counts: ${chapterChunkCounts.join(', ')}`);
  
  return {
    chunks: allChunks,
    totalChunks: allChunks.length,
    chapterChunkCounts,
  };
}

/**
 * Get chunk-to-chapter mapping
 * 
 * Useful for consolidating temp chunks into chapter files
 * 
 * @param chapterChunkCounts - Number of chunks per chapter
 * @returns Map of chapterIndex -> array of global chunk indices
 */
export function getChapterChunkMapping(chapterChunkCounts: number[]): Map<number, number[]> {
  const mapping = new Map<number, number[]>();
  let globalIndex = 0;
  
  for (let chapterIndex = 0; chapterIndex < chapterChunkCounts.length; chapterIndex++) {
    const chunkCount = chapterChunkCounts[chapterIndex];
    const chunkIndices: number[] = [];
    
    for (let i = 0; i < chunkCount; i++) {
      chunkIndices.push(globalIndex);
      globalIndex++;
    }
    
    mapping.set(chapterIndex, chunkIndices);
  }
  
  return mapping;
}
```

---

### Backend: Chapter Translator (multi-language translation pipeline)
**File:** `apps/backend/src/chapterTranslator.ts` | **Size:** 7 KB | **Lines:** 211

```typescript
/**
 * Chapter Translator - Translates ebook chapters to target language
 * 
 * Uses Gemini 2.5 Flash for high-quality literary translation
 * Preserves character names exactly as specified
 */

import { GoogleAuth } from 'google-auth-library';
import { GeminiConfig } from './llmCharacterAnalyzer.js';
import { LLM_MODELS, LLM_TEMPERATURES, LLM_GENERATION_CONFIG, getTranslationPrompt } from './promptConfig.js';

/**
 * Translation result interface
 */
export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  characterNamesPreserved: string[];
}

/**
 * Language display names for logging
 * Added new languages: Chinese, Dutch, French, Hindi, Italian, Japanese, Korean, Portuguese, Spanish, Ukrainian
 */
const LANGUAGE_NAMES: Record<string, string> = {
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  'sk-SK': 'Slovak',
  'cs-CZ': 'Czech',
  'ru-RU': 'Russian',
  'de-DE': 'German',
  'pl-PL': 'Polish',
  'hr-HR': 'Croatian',
  'zh-CN': 'Chinese (Simplified)',
  'nl-NL': 'Dutch',
  'fr-FR': 'French',
  'hi-IN': 'Hindi',
  'it-IT': 'Italian',
  'ja-JP': 'Japanese',
  'ko-KR': 'Korean',
  'pt-BR': 'Portuguese (Brazil)',
  'es-ES': 'Spanish',
  'uk-UA': 'Ukrainian',
};

/**
 * Get display name for language code
 */
export function getLanguageDisplayName(langCode: string): string {
  return LANGUAGE_NAMES[langCode] || langCode;
}

/**
 * Chapter Translator class using Gemini API
 */
export class ChapterTranslator {
  private projectId: string;
  private location: string;
  private model: string = LLM_MODELS.TRANSLATION;
  private auth: GoogleAuth;
  private endpoint: string;

  constructor(config: GeminiConfig) {
    this.projectId = config.projectId;
    this.location = config.location || 'us-central1';
    this.model = config.model || LLM_MODELS.TRANSLATION;
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}:generateContent`;
  }

  /**
   * Call Gemini API with retry logic
   */
  private async callGemini(prompt: string, maxRetries: number = 2): Promise<string> {
    const client = await this.auth.getClient();
    const token = await client.getAccessToken();

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: LLM_TEMPERATURES.TRANSLATION,
        maxOutputTokens: LLM_GENERATION_CONFIG.MAX_TOKENS_TRANSLATION,
        topP: LLM_GENERATION_CONFIG.TOP_P,
      },
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>;
            };
          }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
          throw new Error('No text in Gemini response');
        }

        return text.trim();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.warn(`Translation API retry ${attempt + 1}/${maxRetries} after ${delay}ms:`, lastError.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Translation failed after retries');
  }

  /**
   * Translate a chapter to target language
   * LLM auto-detects the source language
   * 
   * NOTE: With per-chapter character extraction, we no longer need to preserve
   * character names during translation. Names will be extracted from the 
   * translated text and properly associated via alias detection.
   * 
   * @param chapterText - Original chapter text
   * @param targetLanguage - Target language code (e.g., 'en-US', 'de-DE')
   * @returns Translation result with translated text
   */
  async translateChapter(
    chapterText: string,
    targetLanguage: string
  ): Promise<TranslationResult> {
    const targetLangName = getLanguageDisplayName(targetLanguage);
    
    console.log(`🌍 Translating chapter to ${targetLangName}...`);
    console.log(`   Source: auto-detected by LLM`);
    console.log(`   Text length: ${chapterText.length} chars`);

    const prompt = getTranslationPrompt(targetLangName, chapterText);

    const startTime = Date.now();
    const translatedText = await this.callGemini(prompt);
    const elapsed = Date.now() - startTime;

    console.log(`   ✅ Translation complete in ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`   Output length: ${translatedText.length} chars`);

    return {
      translatedText,
      sourceLanguage: 'auto-detected',
      targetLanguage,
      characterNamesPreserved: [], // No longer needed with per-chapter extraction
    };
  }
}

/**
 * Normalize quotes in translated text
 * Converts curly single quotes (used in contractions) to straight apostrophes
 * Preserves curly double quotes for dialogue
 * 
 * Problem: Gemini translator outputs "can't" with curly apostrophe ('),
 * which dramatizer incorrectly treats as dialogue quote marker.
 * 
 * @param text - Translated text with curly quotes
 * @returns Text with normalized quotes
 */
export function normalizeQuotesForDramatization(text: string): string {
  // Replace curly single quotes (U+2018, U+2019) with straight apostrophe
  // This fixes contractions: can't, won't, it's, they've, etc.
  return text
    .replace(/\u2018/g, "'")  // Left single quote → apostrophe
    .replace(/\u2019/g, "'")  // Right single quote → apostrophe
    .replace(/'/g, "'")       // Curly apostrophe → straight (alternative encoding)
    .replace(/'/g, "'");      // Curly apostrophe → straight (alternative encoding)
}

/**
 * Check if translation is needed
 * Simply checks if a target language is specified
 * LLM will auto-detect the source language
 * 
 * @param targetLanguage - User-selected target language (or null/undefined)
 * @returns true if translation should be performed
 */
export function needsTranslation(targetLanguage: string | null | undefined): boolean {
  return !!targetLanguage;
}
```

---

### Backend: Character Registry (voice-to-character mapping persistence)
**File:** `apps/backend/src/characterRegistry.ts` | **Size:** 21 KB | **Lines:** 654

```typescript
/**
 * Character Registry - Per-Chapter Character Extraction with Role
 * 
 * Universal approach for both translated and non-translated books:
 * - Extracts characters per-chapter with LLM-selected voices and roles
 * - Detects aliases (same character, different names)
 * - Maintains cumulative registry with locked voice/role assignments
 * - Provides flat character→voice→role mapping for TTS
 * - Extracts book info for narrator TTS instruction (chapters 1-2, then locked)
 */

import { GoogleAuth } from 'google-auth-library';
import { GeminiConfig, toTTSSpeakerAlias } from './llmCharacterAnalyzer.js';
import { GEMINI_VOICES, getVoiceByName, getVoicesByGender } from './geminiVoices.js';
import { 
  LLM_MODELS, 
  LLM_TEMPERATURES, 
  LLM_GENERATION_CONFIG,
  getCharacterExtractionPrompt,
  buildNarratorInstruction as buildNarratorInstructionFromConfig,
  DEFAULT_NARRATOR_VOICE
} from './promptConfig.js';

function normalizeBookPeriod(raw?: string | null): BookPeriod {
  if (!raw) return 'undefined';
  const normalized = raw.toLowerCase().trim();
  if (!normalized) return 'undefined';

  const directMap: Record<string, BookPeriod> = {
    prehistory: 'prehistory',
    prehistoric: 'prehistory',
    antiquity: 'antiquity',
    ancient: 'antiquity',
    classical: 'antiquity',
    'middle ages': 'middle ages',
    medieval: 'middle ages',
    'modern age': 'modern age',
    modern: 'modern age',
    contemporary: 'contemporary',
    present: 'contemporary',
    current: 'contemporary',
    future: 'future',
    futuristic: 'future',
    'science fiction': 'future',
    scifi: 'future',
    'sci-fi': 'future',
    undefined: 'undefined',
    unknown: 'undefined',
  };

  if (directMap[normalized]) {
    return directMap[normalized];
  }

  return 'undefined';
}

/**
 * Book/document information for narrator TTS instruction
 * Extracted from chapter 1, refined in chapter 2, then LOCKED
 * Each field STRICTLY MAX 10 WORDS
 */
export type BookPeriod = 'prehistory' | 'antiquity' | 'middle ages' | 'modern age' | 'contemporary' | 'future' | 'undefined';

export interface BookInfo {
  /** Genre(s) with adjectives: dark fantasy, gothic horror, etc. (MAX 10 WORDS) */
  genre: string;
  
  /** Tone: atmospheric, suspenseful, humorous, dramatic, etc. (MAX 10 WORDS) */
  tone: string;

  /** Voice tone: EXACTLY two concise adjectives, "adj1, adj2" (MAX 10 WORDS) */
  voiceTone: string;

  /** Historical period/era (normalized) */
  period?: BookPeriod;
  
  /** Whether bookInfo is locked (after chapter 2) */
  locked?: boolean;
}

/**
 * Character with alias support and role
 */
export interface RegisteredCharacter {
  /** Unique ID for this character */
  id: string;
  
  /** Primary name (first encountered) */
  primaryName: string;
  
  /** TTS speaker alias (ALL CAPS, alphanumeric only) */
  ttsAlias: string;
  
  /** All names/aliases for this character */
  aliases: string[];
  
  /** Assigned Gemini voice name (LOCKED after first assignment) */
  voice: string;
  
  /** Role describing who they are (2-3 words, can evolve gradually) */
  role: string;
  
  /** History of role changes: [chapterNum, role][] */
  roleHistory: Array<[number, string]>;
  
  /** Gender */
  gender: 'male' | 'female' | 'neutral' | 'unknown';
  
  /** Chapter where first encountered */
  firstSeenChapter: number;
  
  /** Last chapter where this character appeared */
  lastSeenChapter: number;
}

/**
 * Character extraction result from LLM (per chapter)
 */
export interface ChapterCharacterInfo {
  /** Name as it appears in this chapter */
  name: string;
  
  /** If this is same character as existing one (alias detection) */
  sameAs?: string;
  
  /** Gender */
  gender: 'male' | 'female' | 'neutral' | 'unknown';
  
  /** LLM-selected Gemini voice name */
  voiceName: string;
  
  /** Role describing who they are (2-3 words) */
  role: string;
}

/**
 * LLM extraction response structure
 */
export interface ExtractionResult {
  /** Book/document info (only on chapters 1-2) */
  bookInfo?: BookInfo;
  
  /** Characters found in this chapter */
  characters: ChapterCharacterInfo[];
}

/**
 * Character Registry class
 * Maintains cumulative character state across chapters
 */
export class CharacterRegistry {
  private characters: Map<string, RegisteredCharacter> = new Map();
  private nameToId: Map<string, string> = new Map(); // Fast lookup: any name/alias → character ID
  private nextId: number = 1;
  
  private projectId: string;
  private location: string;
  private model: string = LLM_MODELS.CHARACTER;
  private auth: GoogleAuth;
  private endpoint: string;
  
  // Narrator voice (excluded from character assignments)
  private narratorVoice: string = DEFAULT_NARRATOR_VOICE;
  private usedVoices: Set<string> = new Set();
  
  // Book info for narrator TTS instruction (locked after chapter 2)
  private bookInfo: BookInfo | null = null;
  
  // Pre-built narrator TTS instruction (built from bookInfo)
  private narratorInstruction: string | null = null;
  
  constructor(config: GeminiConfig) {
    this.projectId = config.projectId;
    this.location = config.location || 'us-central1';
    this.model = config.model || LLM_MODELS.CHARACTER;
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}:generateContent`;
  }
  
  /**
   * Set narrator voice (to exclude from character assignments)
   */
  setNarratorVoice(narratorVoice: string): void {
    this.narratorVoice = narratorVoice;
    this.usedVoices.add(narratorVoice);
    console.log(`[CharacterRegistry] Narrator voice "${narratorVoice}" excluded from character assignments`);
  }
  
  /**
   * Call Gemini API for character extraction
   */
  private async callGemini(prompt: string): Promise<string> {
    const client = await this.auth.getClient();
    const token = await client.getAccessToken();

    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: LLM_TEMPERATURES.SPEECH_STYLE,
        maxOutputTokens: LLM_GENERATION_CONFIG.MAX_TOKENS_SPEECH_STYLE,
        topP: LLM_GENERATION_CONFIG.TOP_P,
      },
    };

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error('No text in Gemini response');
    }

    return text.trim();
  }
  
  /**
   * Build Gemini voice list for LLM prompt
   */
  private getVoiceListForPrompt(): string {
    const maleVoices = GEMINI_VOICES.filter(v => v.gender === 'male')
      .map(v => `${v.name} (${v.pitch} pitch, ${v.characteristic})`)
      .join(', ');
    const femaleVoices = GEMINI_VOICES.filter(v => v.gender === 'female')
      .map(v => `${v.name} (${v.pitch} pitch, ${v.characteristic})`)
      .join(', ');
    
    return `MALE VOICES: ${maleVoices}
FEMALE VOICES: ${femaleVoices}`;
  }
  
  /**
   * Build already-assigned voices list for LLM prompt
   */
  private getAssignedVoicesForPrompt(): string {
    if (this.usedVoices.size === 0) {
      return '';
    }
    
    const assignments: string[] = [];
    if (this.narratorVoice) {
      assignments.push(`${this.narratorVoice} (NARRATOR)`);
    }
    for (const char of this.characters.values()) {
      assignments.push(`${char.voice} (${char.primaryName})`);
    }
    
    return `ALREADY ASSIGNED (do NOT reuse): ${assignments.join(', ')}`;
  }
  
  /**
   * Extract characters from a chapter (content only, not sections)
   * Updates registry with new characters, aliases, and book info
   * 
   * IMPORTANT: Only call this for actual chapters (isFrontMatter === false)
   * Front matter sections (TOC, dedication, etc.) should be skipped
   * 
   * @param chapterText - Chapter text (translated if applicable)
   * @param chapterNum - Chapter number (1-based, content chapters only)
   * @param isFrontMatter - If true, skip character extraction (return current state)
   * @returns Updated character list for this chapter
   */
  async extractFromChapter(
    chapterText: string, 
    chapterNum: number,
    isFrontMatter: boolean = false
  ): Promise<RegisteredCharacter[]> {
    // Skip front matter sections - they don't contain character dialogue
    if (isFrontMatter) {
      console.log(`   ⏭️ Skipping section ${chapterNum} (front matter - no character extraction)`);
      return this.getAllCharacters();
    }
    
    // Build known characters list for the prompt
    const knownCharsList = this.getKnownCharactersForPrompt();
    const voiceList = this.getVoiceListForPrompt();
    const assignedVoices = this.getAssignedVoicesForPrompt();
    
    // Include bookInfo request for chapters 1-2 only (unless already locked)
    const needsBookInfo = chapterNum <= 2 && (!this.bookInfo || !this.bookInfo.locked);
    
    // Use centralized prompt from Control Room
    const prompt = getCharacterExtractionPrompt(
      voiceList,
      assignedVoices,
      knownCharsList,
      chapterText,
      needsBookInfo
    );

    try {
      const response = await this.callGemini(prompt);
      
      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(`   ⚠️ Chapter ${chapterNum}: No valid JSON in extraction response`);
        return this.getAllCharacters();
      }
      
      const result: ExtractionResult = JSON.parse(jsonMatch[0]);
      
      // Process bookInfo if present (chapters 1-2)
      if (result.bookInfo && !this.bookInfo?.locked) {
        const normalizedPeriod = normalizeBookPeriod(result.bookInfo.period);
        if (chapterNum === 1) {
          // First extraction
          this.bookInfo = { ...result.bookInfo, period: normalizedPeriod, locked: false };
          console.log(`   📚 Book info extracted: ${this.bookInfo.genre}, ${this.bookInfo.tone}`);
        } else if (chapterNum === 2) {
          // Refine and lock
          this.bookInfo = { ...result.bookInfo, period: normalizedPeriod, locked: true };
          this.buildNarratorInstruction();
          console.log(`   📚 Book info refined and LOCKED: ${this.bookInfo.genre}, ${this.bookInfo.tone}`);
        }
      }
      
      // Process each character
      for (const charInfo of result.characters) {
        this.processCharacter(charInfo, chapterNum);
      }
      
      const newChars = result.characters.filter(c => !c.sameAs).length;
      const aliases = result.characters.filter(c => c.sameAs).length;
      
      if (newChars > 0 || aliases > 0) {
        console.log(`   📋 Chapter ${chapterNum}: ${newChars} new characters, ${aliases} aliases detected`);
      }
      
      return this.getAllCharacters();
      
    } catch (error) {
      console.error(`   ⚠️ Chapter ${chapterNum} extraction failed:`, error);
      return this.getAllCharacters();
    }
  }
  
  /**
   * Build narrator TTS instruction from bookInfo
   * Uses centralized template from Control Room
   */
  private buildNarratorInstruction(): void {
    this.narratorInstruction = buildNarratorInstructionFromConfig(this.bookInfo);
    console.log(`   🎭 Narrator instruction: ${this.narratorInstruction.trim()}`);
  }
  
  /**
  * Get narrator TTS instruction (speechStyle format - natural sentence with action verb)
   */
  getNarratorInstruction(): string {
    if (!this.narratorInstruction) {
      this.buildNarratorInstruction();
    }
    return this.narratorInstruction!;
  }
  
  /**
   * Get book info (if extracted)
   */
  getBookInfo(): BookInfo | null {
    return this.bookInfo;
  }
  
  /**
   * Validate voice name against Gemini voice list
   * Returns valid voice name or fallback based on gender
   */
  private validateVoiceName(voiceName: string, gender: 'male' | 'female' | 'neutral' | 'unknown'): string {
    // Check if voice exists
    const voice = getVoiceByName(voiceName);
    if (voice) {
      return voice.name;
    }
    
    // Fallback: pick random unused voice of matching gender
    console.warn(`   ⚠️ Invalid voice "${voiceName}", using fallback`);
    const genderFilter = gender === 'unknown' || gender === 'neutral' ? 'male' : gender;
    const genderVoices = getVoicesByGender(genderFilter);
    const available = genderVoices.filter(v => !this.usedVoices.has(v.name));
    
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)].name;
    }
    
    // All voices used, reuse any of matching gender
    return genderVoices[Math.floor(Math.random() * genderVoices.length)].name;
  }
  
  /**
  * Process a single character from extraction
  * Voice is LOCKED, but role can evolve gradually
   */
  private processCharacter(charInfo: ChapterCharacterInfo, chapterNum: number): void {
    const normalizedName = charInfo.name.trim();
    
    // Check if this name is already known
    if (this.nameToId.has(normalizedName)) {
      // Already registered - update role if different (evolution)
      const existingId = this.nameToId.get(normalizedName)!;
      const existing = this.characters.get(existingId)!;
      existing.lastSeenChapter = chapterNum;
      
      // Allow role evolution for character development (e.g., child → elderly)
      if (charInfo.role && charInfo.role !== existing.role) {
        const newRole = charInfo.role.toLowerCase().split(/\s+/).slice(0, 3).join(' '); // MAX 3 WORDS
        existing.roleHistory.push([chapterNum, newRole]);
        existing.role = newRole;
        console.log(`   🔄 Role evolved: "${existing.primaryName}" → "${newRole}"`);
      }
      return;
    }
    
    // Check if this is an alias of a known character
    if (charInfo.sameAs) {
      const normalizedSameAs = charInfo.sameAs.trim();
      const existingId = this.nameToId.get(normalizedSameAs);
      
      if (existingId) {
        const existing = this.characters.get(existingId)!;
        
        // Add as alias (inherits voice/role from original)
        if (!existing.aliases.includes(normalizedName)) {
          existing.aliases.push(normalizedName);
          this.nameToId.set(normalizedName, existingId);
          
          // Also add TTS alias for this name
          const ttsAlias = toTTSSpeakerAlias(normalizedName);
          if (!existing.aliases.includes(ttsAlias)) {
            existing.aliases.push(ttsAlias);
            this.nameToId.set(ttsAlias, existingId);
          }
          
          console.log(`   🔗 Alias: "${normalizedName}" → "${existing.primaryName}" (voice: ${existing.voice})`);
        }
        return;
      }
      // sameAs target not found - treat as new character
    }
    
    // New character - use LLM-selected voice (with validation) and role
    const id = `char_${this.nextId++}`;
    
    // Generate TTS alias (ALL CAPS, alphanumeric only)
    const ttsAlias = toTTSSpeakerAlias(normalizedName);
    
    // Validate and get voice
    const voice = this.validateVoiceName(charInfo.voiceName, charInfo.gender);
    this.usedVoices.add(voice);
    
    // Ensure role is MAX 3 WORDS
    const role = charInfo.role
      ? charInfo.role.toLowerCase().split(/\s+/).slice(0, 3).join(' ')
      : 'unknown person';
    
    const newChar: RegisteredCharacter = {
      id,
      primaryName: normalizedName,
      ttsAlias,
      aliases: [normalizedName, ttsAlias],
      voice,
      role,
      roleHistory: [[chapterNum, role]],
      gender: charInfo.gender,
      firstSeenChapter: chapterNum,
      lastSeenChapter: chapterNum,
    };
    
    this.characters.set(id, newChar);
    this.nameToId.set(normalizedName, id);
    this.nameToId.set(ttsAlias, id);
    
    console.log(`   👤 New: "${normalizedName}" (${charInfo.gender}) → ${voice} [${role}]`);
  }
  
  /**
   * Get known characters formatted for prompt
   */
  private getKnownCharactersForPrompt(): string {
    if (this.characters.size === 0) {
      return '';
    }
    
    const lines: string[] = [];
    for (const char of this.characters.values()) {
      const aliases = char.aliases.length > 1 
        ? ` (also: ${char.aliases.filter(a => a !== char.primaryName).join(', ')})`
        : '';
      lines.push(`- ${char.primaryName}${aliases}: ${char.gender}, voice=${char.voice}, role="${char.role}"`);
    }
    return lines.join('\n');
  }
  
  /**
   * Get all registered characters
   */
  getAllCharacters(): RegisteredCharacter[] {
    return Array.from(this.characters.values());
  }
  
  /**
   * Get flat voice map for dramatization
   * Maps ALL names/aliases to their assigned voice
   */
  getVoiceMap(): Record<string, string> {
    const voiceMap: Record<string, string> = {};
    
    for (const char of this.characters.values()) {
      for (const alias of char.aliases) {
        voiceMap[alias] = char.voice;
      }
    }
    
    return voiceMap;
  }
  
  /**
   * Get voice map formatted for dramatization prompt
   * Each line: "name1, name2, alias → Voice"
   */
  getVoiceMapForPrompt(narratorVoice: string): string {
    const lines: string[] = [`- NARRATOR → ${narratorVoice}`];
    
    for (const char of this.characters.values()) {
      const names = char.aliases.join(', ');
      lines.push(`- ${names} → ${char.voice}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Look up voice for any character name (including aliases)
   */
  getVoiceForName(name: string): string | undefined {
    const id = this.nameToId.get(name.trim());
    if (!id) return undefined;
    return this.characters.get(id)?.voice;
  }
  
  /**
   * Look up role for any character name (including aliases)
   * Returns role text (2-3 words)
   */
  getSpeechStyleForName(name: string): string | undefined {
    const id = this.nameToId.get(name.trim());
    if (!id) return undefined;
    const role = this.characters.get(id)?.role;
    return role;
  }
  
  /**
   * Get raw role text for any character name
   */
  getRawSpeechStyleForName(name: string): string | undefined {
    const id = this.nameToId.get(name.trim());
    if (!id) return undefined;
    return this.characters.get(id)?.role;
  }
  
  /**
   * Get all known character names (primary + aliases)
   */
  getAllNames(): string[] {
    return Array.from(this.nameToId.keys());
  }
  
  /**
   * Clear registry (for new book)
   */
  clear(): void {
    this.characters.clear();
    this.nameToId.clear();
    this.usedVoices.clear();
    this.bookInfo = null;
    this.narratorInstruction = null;
    if (this.narratorVoice) {
      this.usedVoices.add(this.narratorVoice);
    }
    this.nextId = 1;
  }
  
  /**
   * Get character count
   */
  get size(): number {
    return this.characters.size;
  }
  
  /**
   * Export registry state to JSON for review and debugging
   * Saved to audiobooks/{bookTitle}/character_registry.json
   */
  toJSON(): object {
    // Ensure narrator instruction is built before export
    if (!this.narratorInstruction) {
      this.buildNarratorInstruction();
    }
    
    return {
      exportedAt: new Date().toISOString(),
      bookInfo: this.bookInfo,
      narratorVoice: this.narratorVoice,
      narratorInstruction: this.narratorInstruction,
      characterCount: this.characters.size,
      characters: Array.from(this.characters.values()).map(char => ({
        id: char.id,
        primaryName: char.primaryName,
        aliases: char.aliases,
        voice: char.voice,
        gender: char.gender,
        role: char.role,
        roleHistory: char.roleHistory,
        firstSeenChapter: char.firstSeenChapter,
        lastSeenChapter: char.lastSeenChapter,
      })),
      voiceMap: this.getVoiceMap(),
    };
  }
  
  /**
   * Save registry to JSON file in audiobook folder
   * @param bookFolder - Path to audiobook folder
   */
  async saveToFile(bookFolder: string): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');
    
    const jsonPath = path.join(bookFolder, 'character_registry.json');
    const jsonContent = JSON.stringify(this.toJSON(), null, 2);
    
    await fs.promises.writeFile(jsonPath, jsonContent, 'utf8');
    console.log(`   📝 Character registry saved: ${jsonPath}`);
    
    return jsonPath;
  }
}
```

---

### Backend: LLM Character Analyzer (character extraction, dialogue attribution)
**File:** `apps/backend/src/llmCharacterAnalyzer.ts` | **Size:** 25.8 KB | **Lines:** 723

```typescript
/**
 * LLM Character Analyzer - Parallel Pipeline Implementation
 * 
 * Integrates Gemini 2.5 Flash for sophisticated character analysis and dramatization
 * 
 * Features:
 * - TWO-PHASE character extraction for fast startup:
 *   Phase 1 (BLOCKING): First 3 chapters → full character DB → assign voices → LOCK
 *   Phase 2 (PARALLEL): Background enrichment from remaining chapters
 * - Progressive chapter-by-chapter dialogue tagging
 * - Intelligent voice-to-character matching
 * - Caching for instant replay
 */

import { GoogleAuth } from 'google-auth-library';
import { cleanText, CleaningConfig } from './textCleaner.js';
import { Chapter } from './bookChunker.js';
import { 
  LLM_MODELS, 
  LLM_TEMPERATURES, 
  LLM_GENERATION_CONFIG,
  getFullBookAnalysisPrompt,
  getChapterEnrichmentPrompt,
  getVoiceTaggingPrompt
} from './promptConfig.js';

/**
 * Convert a character name to valid TTS speaker alias
 * Rules per Gemini TTS official docs:
 * - ALL CAPS
 * - Alphanumeric only (A-Z, 0-9)
 * - No spaces, underscores, hyphens, dots, diacritics, emojis
 * - Multi-word names concatenated (e.g., "Joseph Ragowski" → "JOSEPHRAGOWSKI")
 */
export function toTTSSpeakerAlias(name: string): string {
  // Normalize diacritics (á→a, č→c, etc.)
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Remove all non-alphanumeric characters and convert to uppercase
  return normalized.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Result from initial character analysis (Phase 1)
 */
export interface InitialAnalysisResult {
  characters: CharacterProfile[];
  analyzedChapters: number;
  totalCharsAnalyzed: number;
  analysisTimeMs: number;
}

/**
 * Result from character enrichment (Phase 2)
 */
export interface EnrichmentResult {
  newCharacters: CharacterProfile[];
  enrichedCharacters: CharacterProfile[];  // Existing chars with updated info
  chapterIndex: number;
}

/**
 * Detailed character profile with personality traits
 * 
 * Phase 2: Extracted by LLM from full book context
 */
export interface CharacterProfile {
  /** Character's name as it appears in the book */
  name: string;
  
  /** Inferred biological gender */
  gender: 'male' | 'female' | 'neutral' | 'unknown';
  
  /** Personality and voice characteristics
   * Examples: ["calm", "mature", "deep voice", "energetic", "child-like"]
   * TODO Phase 2: Extract from LLM analysis
   */
  traits: string[];
  
  /** Alternative names/aliases for this character
   * Used for consistent voice assignment across name variations
   * Examples: ["Mrs. Westenra", "old woman", "the widow"]
   */
  aliases?: string[];
  
  /** Suggested Gemini TTS voice name
   * TODO Phase 2: Smart matching based on traits + gender
   * Examples: "Algieba" (male, deep), "Zephyr" (female, young)
   */
  suggestedVoice?: string;
  
  /** Estimated age range
   * TODO Phase 2: Infer from context and descriptions
   * Examples: "child", "young adult", "adult", "elderly"
   */
  ageRange?: string;
  
  /** Character importance/role
   * TODO Phase 2: Determine from appearance frequency and plot significance
   * Examples: "protagonist", "antagonist", "supporting", "minor"
   */
  role?: string;
  
  /** Number of dialogue lines in book */
  dialogueCount?: number;
}

/**
 * Configuration for Gemini LLM client
 */
export interface GeminiConfig {
  projectId: string;
  location: string; // e.g., 'us-central1'
  model?: string; // Default: LLM_MODEL env var or 'gemini-2.5-flash'
}

/**
 * LLM-based character analyzer interface
 */
export interface LlmCharacterAnalyzer {
  /**
   * Analyzes full book text to extract character profiles
   * 
   * TODO Phase 2 Implementation:
   * 1. Send full book text to Gemini 2.5 Flash
   * 2. Use structured prompt for character extraction:
   *    - Identify all speaking characters
   *    - Extract personality traits from dialogue and descriptions
   *    - Infer age, gender, role
   *    - Suggest appropriate voice characteristics
   * 3. Parse LLM response into CharacterProfile[]
   * 
   * Cost estimate: ~$0.10-0.50 per book (depending on length)
   * Time estimate: ~10-30s for full book analysis
   * 
   * @param text - Full book text (up to ~250k-1M tokens)
   * @returns Array of detailed character profiles
   */
  analyzeFullBook(text: string): Promise<CharacterProfile[]>;
  
  /**
   * Refines dialogue detection beyond PoC heuristics
   * 
   * TODO Phase 2 Implementation:
   * Use LLM to:
   * - Detect complex dialogue patterns (nested quotes, implied speech)
   * - Handle unconventional formatting (stream-of-consciousness, etc.)
   * - Attribute dialogues with ambiguous speakers
   * - Identify internal monologues vs. spoken dialogue
   * 
   * @param text - Text segment to analyze
   * @returns Refined dialogue segments with confident speaker attribution
   */
  refineDialogueDetection(text: string): Promise<Array<{
    type: 'dialogue' | 'narrator' | 'internal_monologue';
    speaker: string;
    text: string;
    confidence: number; // 0.0-1.0
  }>>;
  
  /**
   * Assigns optimal Gemini TTS voice based on character profile
   * 
   * TODO Phase 2 Implementation:
   * Smart matching algorithm:
   * 1. Gender → Filter voice list (male/female)
   * 2. Age range → Prefer age-appropriate voices
   * 3. Traits → Match voice characteristics:
   *    - "calm", "mature" → Deeper, slower voices
   *    - "energetic", "young" → Higher, faster voices
   *    - "authoritative" → Strong, clear voices
   * 4. Role → Assign distinctive voices to main characters
   * 
   * Voice examples:
   * - Male deep: Algieba, Alnilam, Rasalgethi
   * - Male energetic: Puck, Charon, Umbriel
   * - Female mature: Achernar, Sulafat, Vindemiatrix
   * - Female young: Zephyr, Aoede, Leda
   * 
   * @param profile - Character profile from analyzeFullBook()
   * @returns Gemini voice name (e.g., "Algieba")
   */
  assignOptimalVoice(profile: CharacterProfile): string;
  
  /**
   * Validates voice assignments for diversity and clarity
   * 
   * TODO Phase 2 Implementation:
   * Ensure:
   * - Main characters have distinctive voices
   * - No similar-sounding voices for characters in same scenes
   * - Narrator voice contrasts with character voices
   * - Gender-appropriate voices (unless intentionally subverted)
   * 
   * @param profiles - All character profiles with assigned voices
   * @returns Validation report with warnings and suggestions
   */
  validateVoiceAssignments(profiles: CharacterProfile[]): {
    valid: boolean;
    warnings: string[];
    suggestions: string[];
  };
}

/**
 * Gemini Character Analyzer - Full Implementation
 * 
 * Uses Vertex AI Gemini 2.5 Flash for character extraction and dialogue tagging
 */
export class GeminiCharacterAnalyzer implements LlmCharacterAnalyzer {
  private projectId: string;
  private location: string;
  private model: string = LLM_MODELS.CHARACTER;
  private auth: GoogleAuth;
  private endpoint: string;
  
  constructor(config: GeminiConfig) {
    this.projectId = config.projectId;
    this.location = config.location || 'us-central1';
    this.model = config.model || LLM_MODELS.CHARACTER;
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}:generateContent`;
  }
  
  /**
   * Call Gemini API with retry logic
   */
  private async callGemini(prompt: string, maxRetries: number = 2): Promise<string> {
    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();
    
    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }
    
    const requestBody = {
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: LLM_TEMPERATURES.CHARACTER_ANALYSIS,
        maxOutputTokens: LLM_GENERATION_CONFIG.MAX_TOKENS_CHARACTER,
        topP: LLM_GENERATION_CONFIG.TOP_P,
      }
    };
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Gemini API error: ${response.status} - ${error}`);
        }
        
        const data: any = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
          throw new Error('No text in Gemini response');
        }
        
        return text;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
    
    throw new Error('Failed to call Gemini after retries');
  }
  
  /**
   * Analyzes full book text to extract character profiles
   */
  async analyzeFullBook(text: string): Promise<CharacterProfile[]> {
    console.log(`🔍 Analyzing book for characters (${(text.length / 1000).toFixed(0)}k chars)...`);
    
    // Clean text first
    const cleanedResult = cleanText(text, {
      removePageNumbers: true,
      removeTableOfContents: true,
      removeEditorialNotes: true,
      removePublisherInfo: true,
      removeHeadersFooters: true,
      preserveCopyright: true,
      preserveAuthor: true,
      aggressive: false,
    });
    
    const cleanedText = cleanedResult.cleanedText;
    console.log(`  Cleaned text: ${(cleanedResult.bytesRemoved / 1000).toFixed(0)}k removed`);
    
    const prompt = `You are an expert literary analyst. Analyze this book and extract information about ALL characters who speak dialogue.

IMPORTANT RULES:
1. Include ONLY characters who speak dialogue (have quoted speech)
2. Minimum 1 dialogue line to qualify as a character (even a single line counts!)
3. Include ALL speaking characters - there is no maximum limit
4. Always include NARRATOR as first character
5. Use character names exactly as they appear in dialogue attributions (e.g., "said John", "poznamenala Lili")
6. Look for names after dialogue in attribution phrases like: "zvolal", "poznamenala", "řekl", "zavrčel"
7. Order characters by importance (most dialogue first)

For each character, provide:
- name: Exact name from book (or "NARRATOR" for narration)
- gender: "male", "female", or "neutral"
- traits: Array of 2-4 personality traits from context (e.g., ["calm", "mature", "wise"])
- ageRange: "child", "young adult", "adult", or "elderly"
- role: "protagonist", "antagonist", "supporting", or "minor"
- dialogueCount: Approximate number of dialogue lines

Return ONLY a valid JSON array with NO additional text or markdown:
[{"name": "NARRATOR", "gender": "neutral", "traits": [...], ...}, ...]

Book text:
${cleanedText.substring(0, 250000)}`;
    
    try {
      const response = await this.callGemini(prompt);
      
      // Extract JSON from response (handle markdown code blocks)
      let jsonText = response.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```json?\s*/, '').replace(/\s*```$/, '');
      }
      
      // Try to parse JSON, with recovery for truncated output
      let characters: CharacterProfile[];
      try {
        characters = JSON.parse(jsonText);
      } catch (parseError) {
        console.warn('  ⚠️ JSON parse failed, attempting recovery...');
        
        // Try to recover from truncated JSON
        // Find the last complete object before truncation
        const lastCompleteObjectEnd = jsonText.lastIndexOf('},');
        if (lastCompleteObjectEnd > 0) {
          const recovered = jsonText.substring(0, lastCompleteObjectEnd + 1) + ']';
          console.log(`  🔧 Attempting recovery with truncated JSON at position ${lastCompleteObjectEnd}`);
          try {
            characters = JSON.parse(recovered);
            console.log(`  ✅ Recovery successful! Found ${characters.length} characters`);
          } catch (recoveryError) {
            // Try simpler recovery - just find valid JSON array start/end
            const firstBracket = jsonText.indexOf('[');
            const lastValidEnd = jsonText.lastIndexOf('}]');
            if (firstBracket >= 0 && lastValidEnd > firstBracket) {
              const simpleRecovery = jsonText.substring(firstBracket, lastValidEnd + 2);
              characters = JSON.parse(simpleRecovery);
              console.log(`  ✅ Simple recovery successful! Found ${characters.length} characters`);
            } else {
              throw recoveryError;
            }
          }
        } else {
          // Can't recover - re-throw original error
          throw parseError;
        }
      }
      
      console.log(`  ✅ Found ${characters.length} characters: ${characters.map(c => c.name).join(', ')}`);
      
      return characters;
    } catch (error) {
      console.error('❌ Character analysis failed:', error);
      
      // Fallback: Return just narrator
      return [{
        name: 'NARRATOR',
        gender: 'neutral',
        traits: ['clear', 'neutral'],
        ageRange: 'adult',
        role: 'supporting',
        dialogueCount: 0,
      }];
    }
  }
  
  /**
   * Tag a single chapter with voice tags using Gemini TTS format
   */
  async tagChapterWithVoices(chapterText: string, characters: CharacterProfile[]): Promise<string> {
    console.log(`  🏷️  Tagging chapter (${(chapterText.length / 1000).toFixed(1)}k chars)...`);
    
    // Convert character names to valid TTS aliases (ALLCAPS, alphanumeric only)
    const characterAliases = characters
      .map(c => {
        const alias = toTTSSpeakerAlias(c.name);
        return `- ${alias} (original: ${c.name}, ${c.gender})`;
      })
      .join('\n');

    const characterRoles = characters
      .filter(c => c.name !== 'NARRATOR')
      .map(c => {
        const alias = toTTSSpeakerAlias(c.name);
        const role = (c.role || 'unknown person').toLowerCase();
        return `- ${alias} → ${role}`;
      })
      .join('\n');

    const prompt = getVoiceTaggingPrompt(characterAliases, characterRoles, chapterText);
    
    try {
      const taggedText = await this.callGemini(prompt);
      
      // Clean up response (remove markdown if present)
      let cleaned = taggedText.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```[a-z]*\s*/, '').replace(/\s*```$/, '');
      }

      console.log(`  📝 Tagged output preview: ${cleaned.substring(0, 500)}...`);
      console.log(`  ✅ Chapter tagged`);
      return cleaned;
    } catch (error) {
      console.error('  ❌ Chapter tagging failed:', error);
      // Fallback: Return original text with NARRATOR prefix
      return `NARRATOR: ${chapterText}`;
    }
  }
  
  /**
   * Assign optimal voice based on character profile
   * NOT NEEDED in current implementation - Voice assignment handled by separate module
   */
  assignOptimalVoice(profile: CharacterProfile): string {
    throw new Error('Use voice assignment module instead');
  }
  
  /**
   * Validate voice assignments
   * NOT NEEDED in current implementation
   */
  validateVoiceAssignments(profiles: CharacterProfile[]): {
    valid: boolean;
    warnings: string[];
    suggestions: string[];
  } {
    throw new Error('Use voice assignment module instead');
  }

  /**
   * Refine dialogue detection
   * NOT NEEDED in current implementation (Phase 2 feature)
   */
  async refineDialogueDetection(text: string): Promise<Array<{
    type: 'dialogue' | 'narrator' | 'internal_monologue';
    speaker: string;
    text: string;
    confidence: number;
  }>> {
    throw new Error('refineDialogueDetection not implemented yet (Phase 2 feature)');
  }

  /**
   * TWO-PHASE CHARACTER EXTRACTION - Phase 1 (BLOCKING)
   * 
   * Analyzes first N chapters to build initial character DB.
   * This is BLOCKING because voice assignment requires character info.
   * 
   * @param chapters - All book chapters
   * @param numChapters - Number of chapters to analyze (default: 3)
   * @returns Initial analysis result with characters for voice assignment
   */
  async analyzeInitialChapters(
    chapters: Chapter[],
    numChapters: number = 3
  ): Promise<InitialAnalysisResult> {
    const startTime = Date.now();
    const chaptersToAnalyze = chapters.slice(0, Math.min(numChapters, chapters.length));
    
    // Combine chapter texts
    const combinedText = chaptersToAnalyze.map(ch => ch.text).join('\n\n---CHAPTER BREAK---\n\n');
    const totalChars = combinedText.length;
    
    console.log(`🔍 Phase 1: Analyzing first ${chaptersToAnalyze.length} chapters (${(totalChars / 1000).toFixed(0)}k chars)...`);
    
    // Clean text first
    const cleanedResult = cleanText(combinedText, {
      removePageNumbers: true,
      removeTableOfContents: true,
      removeEditorialNotes: true,
      removePublisherInfo: true,
      removeHeadersFooters: true,
      preserveCopyright: true,
      preserveAuthor: true,
      aggressive: false,
    });
    
    const cleanedText = cleanedResult.cleanedText;
    
    const prompt = `You are an expert literary analyst. Analyze the FIRST ${chaptersToAnalyze.length} CHAPTERS of this book and extract information about ALL characters who speak dialogue.

IMPORTANT RULES:
1. Include ONLY characters who speak dialogue (have quoted speech)
2. Minimum 1 dialogue line to qualify as a character
3. Include ALL speaking characters found in these chapters
4. Always include NARRATOR as first character
5. Use character names exactly as they appear in dialogue attributions
6. Order characters by importance (most dialogue first)

For each character, provide:
- name: Exact name from book (or "NARRATOR" for narration)
- gender: "male", "female", or "neutral"
- traits: Array of 2-4 personality traits from context (e.g., ["calm", "mature", "wise"])
- ageRange: "child", "young adult", "adult", or "elderly"
- role: "protagonist", "antagonist", "supporting", or "minor"
- dialogueCount: Approximate number of dialogue lines in these chapters

Return ONLY a valid JSON array with NO additional text or markdown:
[{"name": "NARRATOR", "gender": "neutral", "traits": [...], ...}, ...]

First ${chaptersToAnalyze.length} chapters:
${cleanedText.substring(0, 200000)}`;
    
    try {
      const response = await this.callGemini(prompt);
      const characters = this.parseCharacterResponse(response);
      
      const analysisTime = Date.now() - startTime;
      console.log(`  ✅ Phase 1 complete: ${characters.length} characters in ${analysisTime}ms`);
      console.log(`     Characters: ${characters.map(c => c.name).join(', ')}`);
      
      return {
        characters,
        analyzedChapters: chaptersToAnalyze.length,
        totalCharsAnalyzed: totalChars,
        analysisTimeMs: analysisTime,
      };
    } catch (error) {
      console.error('❌ Phase 1 character analysis failed:', error);
      
      return {
        characters: [{
          name: 'NARRATOR',
          gender: 'neutral',
          traits: ['clear', 'neutral'],
          ageRange: 'adult',
          role: 'supporting',
          dialogueCount: 0,
        }],
        analyzedChapters: chaptersToAnalyze.length,
        totalCharsAnalyzed: totalChars,
        analysisTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * TWO-PHASE CHARACTER EXTRACTION - Phase 2 (PARALLEL)
   * 
   * Enriches character DB from additional chapters.
   * Runs in PARALLEL with TTS generation.
   * 
   * NEW characters get added with voice assignment.
   * EXISTING characters get enriched (traits, age, role) but voice stays LOCKED.
   * 
   * @param chapterText - Text of chapter to analyze
   * @param chapterIndex - Index of the chapter
   * @param existingCharacters - Current character DB
   * @returns New and enriched characters
   */
  async enrichFromChapter(
    chapterText: string,
    chapterIndex: number,
    existingCharacters: CharacterProfile[]
  ): Promise<EnrichmentResult> {
    console.log(`  🔄 Phase 2: Enriching from chapter ${chapterIndex + 1} (${(chapterText.length / 1000).toFixed(1)}k chars)...`);
    
    const existingNames = existingCharacters.map(c => c.name.toUpperCase());
    
    const prompt = `You are an expert literary analyst. Analyze this chapter and:
1. Identify any NEW speaking characters not in the existing list
2. Find additional information about EXISTING characters

EXISTING CHARACTERS (already known):
${existingCharacters.map(c => `- ${c.name} (${c.gender}, ${c.ageRange || 'unknown age'}, ${c.role || 'unknown role'})`).join('\n')}

For NEW characters found, provide full profile:
- name, gender, traits, ageRange, role, dialogueCount

For EXISTING characters with NEW information, provide updates:
- Only include if you found NEW traits, age clarification, or role information
- Include the character name and only the NEW/updated fields

Return JSON with two arrays:
{
  "newCharacters": [{"name": "...", "gender": "...", "traits": [...], "ageRange": "...", "role": "...", "dialogueCount": N}],
  "enrichments": [{"name": "EXISTING_NAME", "newTraits": [...], "ageRange": "...", "role": "..."}]
}

Chapter text:
${chapterText.substring(0, 100000)}`;
    
    try {
      const response = await this.callGemini(prompt);
      
      // Parse response
      let jsonText = response.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```json?\s*/, '').replace(/\s*```$/, '');
      }
      
      const result = JSON.parse(jsonText);
      const newCharacters: CharacterProfile[] = result.newCharacters || [];
      const enrichedCharacters: CharacterProfile[] = [];
      
      // Apply enrichments to existing characters
      for (const enrichment of (result.enrichments || [])) {
        const existing = existingCharacters.find(
          c => c.name.toUpperCase() === enrichment.name?.toUpperCase()
        );
        if (existing) {
          const enriched = { ...existing };
          
          // Merge new traits
          if (enrichment.newTraits?.length > 0) {
            enriched.traits = [...new Set([...existing.traits, ...enrichment.newTraits])];
          }
          
          // Update age if not set or more specific
          if (enrichment.ageRange && !existing.ageRange) {
            enriched.ageRange = enrichment.ageRange;
          }
          
          // Update role if more important
          const roleOrder = ['protagonist', 'antagonist', 'supporting', 'minor'];
          if (enrichment.role && roleOrder.indexOf(enrichment.role) < roleOrder.indexOf(existing.role || 'minor')) {
            enriched.role = enrichment.role;
          }
          
          enrichedCharacters.push(enriched);
        }
      }
      
      if (newCharacters.length > 0 || enrichedCharacters.length > 0) {
        console.log(`     ✅ Found ${newCharacters.length} new, enriched ${enrichedCharacters.length} existing`);
      }
      
      return {
        newCharacters,
        enrichedCharacters,
        chapterIndex,
      };
    } catch (error) {
      console.error(`  ⚠️ Phase 2 enrichment failed for chapter ${chapterIndex + 1}:`, error);
      return {
        newCharacters: [],
        enrichedCharacters: [],
        chapterIndex,
      };
    }
  }

  /**
   * Helper to parse character JSON response with recovery
   */
  private parseCharacterResponse(response: string): CharacterProfile[] {
    let jsonText = response.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```json?\s*/, '').replace(/\s*```$/, '');
    }
    
    try {
      return JSON.parse(jsonText);
    } catch (parseError) {
      console.warn('  ⚠️ JSON parse failed, attempting recovery...');
      
      // Try to recover from truncated JSON
      const lastCompleteObjectEnd = jsonText.lastIndexOf('},');
      if (lastCompleteObjectEnd > 0) {
        const recovered = jsonText.substring(0, lastCompleteObjectEnd + 1) + ']';
        try {
          const characters = JSON.parse(recovered);
          console.log(`  ✅ Recovery successful! Found ${characters.length} characters`);
          return characters;
        } catch (recoveryError) {
          // Try simpler recovery
          const firstBracket = jsonText.indexOf('[');
          const lastValidEnd = jsonText.lastIndexOf('}]');
          if (firstBracket >= 0 && lastValidEnd > firstBracket) {
            const simpleRecovery = jsonText.substring(firstBracket, lastValidEnd + 2);
            return JSON.parse(simpleRecovery);
          }
          throw recoveryError;
        }
      }
      throw parseError;
    }
  }
}

/**
 * Gemini Voice Reference (for Phase 2 voice assignment)
 * 
 * Male Voices (16):
 * - Deep/Mature: Algieba, Alnilam, Rasalgethi, Schedar
 * - Medium: Achird, Algenib, Charon, Iapetus, Orus, Sadachbia, Sadaltager
 * - Energetic/Young: Puck, Umbriel, Enceladus, Fenrir, Zubenelgenubi
 * 
 * Female Voices (14):
 * - Mature/Authoritative: Achernar, Sulafat, Vindemiatrix, Gacrux
 * - Medium: Autonoe, Callirrhoe, Despina, Erinome, Kore, Laomedeia
 * - Young/Energetic: Zephyr, Aoede, Leda, Pulcherrima
 * 
 * This classification is approximate and should be refined
 * through empirical testing in Phase 2.
 */
```

---

### Backend: Main Server (API routes, middleware, pipeline orchestration)
**File:** `apps/backend/src/index.ts` | **Size:** 131.5 KB | **Lines:** 3347

```typescript
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
import { concatenateOggBuffers, addSilence } from './audioUtils.js';
import { 
  generateAndSaveTempChunk,
  tempChunkExists, 
  loadTempChunk,
  consolidateChapterSmart,
  consolidateChapterFromSubChunks,
  deleteAllTempChunks,
  deleteChapterSubChunks,
  stopPreDramatization,
  generateSubChunksParallel,
  subChunkExists,
  loadSubChunk,
  findSubChunkByGlobalIndex,
  clearDramatizationCaches,
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
import { resolveChapterAudioPath, getAmbientAudioPath, getIntroAudioPath, applySoundscapeToChapter, startEarlyIntroGeneration, prepareEarlyAmbient } from './soundscapeCompat.js';
import { 
  extractEpubChapters, 
  detectTextChapters, 
  createSingleChapter,
  type Chapter 
} from './bookChunker.js';
import { chunkBookByChapters, type ChunkInfo } from './chapterChunker.js';
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

// ── Intro-as-chapter-0 helper ──────────────────────────────────
/**
 * If a standalone _intro.ogg exists for chapter 1, prepend it to the
 * metadata chapters array as index 0 ("Intro").  Returns a shallow copy
 * of metadata so the on-disk JSON is never mutated.
 */
function injectIntroChapter(
  metadata: AudiobookMetadata,
  bookTitle: string,
): AudiobookMetadata {
  const ch1Path = getChapterPath(bookTitle, 1);
  const introPath = getIntroAudioPath(ch1Path);
  if (!introPath) return metadata;

  // Avoid duplicating if already injected (index 0 already present)
  if (metadata.chapters.length > 0 && metadata.chapters[0].index === 0) {
    return metadata;
  }

  // Build the intro chapter entry
  const introChapter: AudiobookMetadata['chapters'][number] = {
    index: 0,
    title: 'Intro',
    filename: path.basename(introPath),
    duration: 0, // will be filled by client on load
    isGenerated: true,
    isConsolidated: true,
  };

  return {
    ...metadata,
    chapters: [introChapter, ...metadata.chapters],
  };
}

// ES modules dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

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

async function applySoundscapeForChapter(
  bookTitle: string,
  chapterNum: number,
  chapterPath: string
): Promise<void> {
  try {
    const metadata = loadAudiobookMetadata(bookTitle);
    const chapterText = CHAPTER_DRAMATIZED.get(chapterNum) ?? BOOK_CHAPTERS[chapterNum]?.text ?? '';
    const subChunks = CHAPTER_SUBCHUNKS.get(chapterNum);
    await applySoundscapeToChapter({
      bookTitle,
      chapterIndex: chapterNum,
      chapterPath,
      chapterText,
      subChunks,
      preferences: metadata?.userPreferences,
    });
  } catch (error) {
    console.error(`  ⚠️ Soundscape mix failed for chapter ${chapterNum}:`, error);
  }
}

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
      const deletedCount = deleteChapterSubChunks(bookTitle, chapterNum);
      console.log(`   Deleted ${deletedCount} sub-chunk files`);
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
  clearDramatizationCaches();
  CHAPTER_SUBCHUNKS.clear();
  CHAPTER_DRAMATIZED.clear();
  CHAPTER_DRAMATIZATION_LOCK.clear();
  CHAPTER_PLAYED_SUBCHUNKS.clear();
  CHAPTER_WAS_READY_BEFORE_PLAY.clear();
  TOTAL_SUBCHUNKS = 0;
  audioCache.clear();
  
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
          
          // Track character extraction cost (input = chapter text, output = character_registry.json tokens)
          if (COST_TRACKER && !chapter.isFrontMatter) {
            const inputTokens = estimateTokens(chapterTextForExtraction, TARGET_LANGUAGE || 'slavic');
            const registryJson = JSON.stringify(characterRegistry.toJSON(), null, 2);
            const outputTokens = estimateTokens(registryJson, 'english');
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
          
          // Generate intro for chapter 1 (fire-and-forget — runs parallel to chapter TTS)
          if (chapterNum === 1) {
            const ch1Title = BOOK_CHAPTERS[1]?.title;
            const ch1Path = getChapterPath(bookTitle, 1, ch1Title);
            startEarlyIntroGeneration({ bookTitle, chapterPath: ch1Path }).catch(err =>
              console.warn('⚠️ Early intro generation failed:', err)
            );
          }
          
          // Convert registry characters to CharacterProfile[] for hybrid tagger
          const registeredChars = characterRegistry.getAllCharacters();
          const characters: CharacterProfile[] = registeredChars.map(rc => ({
            name: rc.primaryName,
            gender: rc.gender,
            traits: [rc.role], // Use role as single trait for compatibility
            role: rc.role,
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

            const buildFallbackSpeechStyle = (speaker: string): string | undefined => {
              if (speaker === 'NARRATOR') {
                return registry?.getNarratorInstruction?.();
              }
              return undefined;
            };
            
            // Format EXACTLY as TTS will receive it per Gemini multi-speaker docs:
            // [Optional speech directive without period, with colon]
            // SPEAKER: Text to speak
            const ttsLines: string[] = [];
            for (const seg of segments) {
              const speechStyle = seg.speechStyle || buildFallbackSpeechStyle(seg.speaker);
              // Build the EXACT text TTS will receive
              if (speechStyle) {
                // Speech style directive (remove trailing period)
                const directive = speechStyle.replace(/\.$/, '').trim();
                ttsLines.push(`${directive}`);
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
          
          // Fire-and-forget: prepare ambient bed for progressive playback
          prepareEarlyAmbient({
            bookTitle,
            chapterIndex: chapterNum,
            chapterPath: getChapterPath(bookTitle, chapterNum, chapter.title),
            chapterText: chapter.text,
          }).catch(err => console.warn('⚠️ Early ambient prep failed (non-critical):', err));
          
          const chapterParallelism = 3; // Uniform parallelism for all chapters
          await generateSubChunksParallel(
            bookTitle,
            chapterNum,
            newSubChunks,
            VOICE_MAP,
            NARRATOR_VOICE,
            chapterParallelism // TTS parallelism within chapter
          );
          
          // Track audio generation cost (TTS: output tokens = input tokens)
          if (COST_TRACKER) {
            const inputTokens = estimateTokens(result.taggedText, TARGET_LANGUAGE || 'slavic');
            const outputTokens = inputTokens;
            COST_TRACKER.addAudioGeneration(inputTokens, outputTokens);
          }
          
          // Update activity after generation
          dramatizationStatus.lastActivityAt = Date.now();
          
          // AUTO-CONSOLIDATE immediately after all sub-chunks generated
          try {
            const chapterTitle = BOOK_CHAPTERS[chapterNum]?.title;
            const bookTitle = sanitizeBookTitle(BOOK_METADATA?.title || CURRENT_BOOK_FILE || 'Unknown');
            const chapterPath = await consolidateChapterFromSubChunks(bookTitle, chapterNum, chapterTitle);
            await applySoundscapeForChapter(bookTitle, chapterNum, chapterPath);
            console.log(`   📦 Chapter ${chapterNum} consolidated successfully`);
            // Clean up temp sub-chunks now that chapter is consolidated
            const deletedCount = deleteChapterSubChunks(bookTitle, chapterNum);
            if (deletedCount > 0) {
              console.log(`   🗑️  Cleaned up ${deletedCount} temp sub-chunks for chapter ${chapterNum}`);
            }
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
          
          // Fire-and-forget: prepare ambient bed for progressive playback
          prepareEarlyAmbient({
            bookTitle,
            chapterIndex: chapterNum,
            chapterPath: getChapterPath(bookTitle, chapterNum, chapter.title),
            chapterText: chapter.text,
          }).catch(err => console.warn('⚠️ Early ambient prep failed (non-critical):', err));
          
          const chapterParallelism = 3; // Uniform parallelism for all chapters
          await generateSubChunksParallel(
            bookTitle,
            chapterNum,
            newSubChunks,
            VOICE_MAP,
            NARRATOR_VOICE,
            chapterParallelism // TTS parallelism within chapter
          );
          
          // Track audio generation cost for fallback path (output tokens = input tokens)
          if (COST_TRACKER) {
            const inputTokens = estimateTokens(narratorText, TARGET_LANGUAGE || 'slavic');
            const outputTokens = inputTokens;
            COST_TRACKER.addAudioGeneration(inputTokens, outputTokens);
          }
          
          // AUTO-CONSOLIDATE immediately after all sub-chunks generated
          try {
            const chapterTitle = BOOK_CHAPTERS[chapterNum]?.title;
            const bookTitle = sanitizeBookTitle(BOOK_METADATA?.title || CURRENT_BOOK_FILE || 'Unknown');
            const chapterPath = await consolidateChapterFromSubChunks(bookTitle, chapterNum, chapterTitle);
            await applySoundscapeForChapter(bookTitle, chapterNum, chapterPath);
            console.log(`   📦 Chapter ${chapterNum} consolidated (fallback) successfully`);
            // Clean up temp sub-chunks now that chapter is consolidated
            const deletedCount = deleteChapterSubChunks(bookTitle, chapterNum);
            if (deletedCount > 0) {
              console.log(`   🗑️  Cleaned up ${deletedCount} temp sub-chunks for chapter ${chapterNum}`);
            }
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
        ? fs.readdirSync(bookDir).filter(f => f.startsWith(chapterPrefix) && f.endsWith('.ogg'))
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
        await applySoundscapeForChapter(bookTitle, chapterNum, chapterPath);
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
          filename: `${chapterNum.toString().padStart(2, '0')}_${sanitizeChapterTitle(chapter.title)}.ogg`,
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
          filename: `${(i + 1).toString().padStart(2, '0')}_${sanitizeChapterTitle(chapter.title)}.ogg`,
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
      // Top-level fields matching BookSelectResult (same format as /api/book/from-text)
      title: BOOK_METADATA.title,
      author: BOOK_METADATA.author,
      audiobookTitle: bookTitle,
      chapters: BOOK_CHAPTERS.filter((ch: any, i: number) => i > 0 && ch !== null).map((ch: any, i: number) => ({
        index: i + 1,
        title: ch.title,
        subChunkStart: 0,
        subChunkCount: 10, // Estimated
      })),
      _internal: {
        totalChunks: BOOK_INFO.totalChunks,
        durationSeconds: BOOK_INFO.estimatedDuration,
      },
      // Legacy nested format (kept for backward compatibility)
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

    // Set appropriate headers for WAV audio (LINEAR16 PCM from TTS)
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
        
        // Estimate chapter duration from OGG Opus buffer (heuristic: ~6000 bytes/sec)
        const chapterDurationSec = chapterAudio.length / 6000;
        const chapterSubChunks = CHAPTER_SUBCHUNKS.get(chapterNum);
        const totalSubChunks = chapterSubChunks?.length || 1;
        
        // Approximate seek position: (subChunkIndex / totalSubChunks) * totalDuration
        // This assumes roughly equal sub-chunk durations
        const seekOffsetSec = (localSubChunkIndex / totalSubChunks) * chapterDurationSec;
        
        console.log(`   Seek offset: ${seekOffsetSec.toFixed(2)}s (subChunk ${localSubChunkIndex}/${totalSubChunks}, chapter ${chapterDurationSec.toFixed(1)}s)`);
        
        res.setHeader('Content-Type', 'audio/ogg');
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
      let metadata = loadAudiobookMetadata(bookTitle);
      if (metadata) metadata = injectIntroChapter(metadata, bookTitle);
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
    let metadata = loadAudiobookMetadata(bookTitle);
    
    if (!metadata) {
      return res.status(404).json({
        error: 'Audiobook not found',
        message: `No audiobook found with title: ${bookTitle}`,
      });
    }
    
    metadata = injectIntroChapter(metadata, bookTitle);
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
    
    // Clear dramatization caches for clean generation
    clearDramatizationCaches();

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
    const chunkingResult = chunkBookByChapters(chapters, isDramatized, true);

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
        filename: `Chapter_${i.toString().padStart(2, '0')}.ogg`,
        duration: 0,
        isGenerated: false,
        tempChunksCount: chunkingResult.chapterChunkCounts[i] ?? 0,
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
    const idx = parseInt(chapterIndex);

    // Chapter 0 = standalone intro audio
    if (idx === 0) {
      const ch1Path = getChapterPath(bookTitle, 1);
      const introPath = getIntroAudioPath(ch1Path);
      if (!introPath) {
        return res.status(404).json({
          error: 'Intro not found',
          message: 'No intro audio available for this audiobook',
        });
      }
      res.setHeader('Content-Type', 'audio/ogg');
      return res.sendFile(path.resolve(introPath));
    }

    const chapterPath = getChapterPath(bookTitle, idx);
    const resolvedPath = resolveChapterAudioPath(chapterPath);
    
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({
        error: 'Chapter not found',
        message: `Chapter ${chapterIndex} not yet generated`,
      });
    }
    
    res.sendFile(path.resolve(resolvedPath));
  } catch (error) {
    console.error('✗ Error serving chapter:', error);
    res.status(500).json({
      error: 'Failed to serve chapter',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Serve independent ambient track for a chapter
 * 
 * GET /api/audiobooks/:bookTitle/chapters/:chapterIndex/ambient
 * Returns the separate ambient OGG file (not mixed with voice)
 */
app.get('/api/audiobooks/:bookTitle/chapters/:chapterIndex/ambient', (req: Request, res: Response) => {
  try {
    const { bookTitle, chapterIndex } = req.params;
    const chapterPath = getChapterPath(bookTitle, parseInt(chapterIndex));
    const ambientPath = getAmbientAudioPath(chapterPath);
    
    if (!ambientPath) {
      return res.status(404).json({
        error: 'Ambient not found',
        message: `No ambient track for chapter ${chapterIndex}`,
      });
    }
    
    res.setHeader('Content-Type', 'audio/ogg');
    res.sendFile(path.resolve(ambientPath));
  } catch (error) {
    console.error('✗ Error serving ambient:', error);
    res.status(500).json({
      error: 'Failed to serve ambient',
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
    const {
      narratorVoice,
      narratorGender,
      playbackSpeed,
      soundscapeMusicEnabled,
      soundscapeAmbientEnabled,
      soundscapeThemeId,
    } = req.body;
    
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
      ...(soundscapeMusicEnabled !== undefined && { soundscapeMusicEnabled }),
      ...(soundscapeAmbientEnabled !== undefined && { soundscapeAmbientEnabled }),
      ...(soundscapeThemeId !== undefined && { soundscapeThemeId }),
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

/**
 * Soundscape theme picker — removed (themes are now auto-selected by the LLM Director)
 *
 * GET /api/audiobooks/:bookTitle/soundscape/themes
 * @deprecated — returns 410 Gone
 */
app.get('/api/audiobooks/:bookTitle/soundscape/themes', (_req: Request, res: Response) => {
  return res.status(410).json({
    error: 'Gone',
    message: 'Soundscape theme picker has been removed. Scene environments are now detected automatically by the LLM Director.',
  });
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
```

---

### Backend: Parallel Pipeline Manager (concurrent generation orchestration)
**File:** `apps/backend/src/parallelPipelineManager.ts` | **Size:** 1.8 KB | **Lines:** 63

```typescript
/**
 * Pipeline State Manager - Minimal module for book switching
 * 
 * NOTE: This file was reduced from ~470 lines to ~60 lines.
 * The original parallel pipeline orchestration was never fully implemented.
 * Only resetPipeline() is used by the current flow (in index.ts).
 * 
 * Original design preserved in:
 * - Git history
 * - handoffs/HANDOFF_PARALLEL_PIPELINE_REFACTOR.md
 */

// ========================================
// Types (minimal for state reset)
// ========================================

export interface PipelineState {
  /** Character database */
  characterDB: unknown[];
  /** Voice assignments */
  voiceAssignments: Record<string, string>;
  /** Whether voices are locked */
  voicesLocked: boolean;
  /** Per-chapter state */
  chapterStates: Map<number, unknown>;
  /** Current playback position */
  currentChapter: number;
  currentSubChunk: number;
  /** Pipeline status */
  status: 'idle' | 'initializing' | 'running' | 'paused' | 'completed' | 'error';
  /** Error message if status is 'error' */
  errorMessage?: string;
}

// ========================================
// Pipeline State Management
// ========================================

let pipelineState: PipelineState = createEmptyState();

function createEmptyState(): PipelineState {
  return {
    characterDB: [],
    voiceAssignments: {},
    voicesLocked: false,
    chapterStates: new Map(),
    currentChapter: 0,
    currentSubChunk: 0,
    status: 'idle',
  };
}

/**
 * Reset pipeline state (call when loading new book)
 * 
 * This is the ONLY exported function used by the current flow.
 * Called from index.ts when switching books.
 */
export function resetPipeline(): void {
  pipelineState = createEmptyState();
  console.log('🔄 Pipeline state reset');
}
```

---

### Backend: Prompt Config (LLM prompt templates for dramatization)
**File:** `apps/backend/src/promptConfig.ts` | **Size:** 20.2 KB | **Lines:** 517

```typescript
/**
 * VoiceLibri - Prompt Control Room
 * 
 * SINGLE SOURCE OF TRUTH for all LLM and TTS prompts, temperatures, and configuration.
 * All prompts are organized by pipeline sequence:
 * 
 * 1. Book Info Extraction (genre, tone, setting)
 * 2. Character Extraction (per-chapter with speech styles)
 * 3. Translation (chapter translation to target language)
 * 4. Dramatization / Voice Tagging (adding [VOICE=X] markers)
 * 
 * USAGE: Import specific prompts/configs from this file instead of hardcoding them.
 * 
 * @module promptConfig
 */

// =============================================================================
// LLM MODEL CONFIGURATION
// =============================================================================

/**
 * Default LLM models for each pipeline stage
 * Can be overridden via environment variables
 */
export const LLM_MODELS = {
  /** Character extraction and analysis */
  CHARACTER: process.env.LLM_MODEL_CHARACTER || 'gemini-2.5-flash',
  /** Chapter translation */
  TRANSLATION: process.env.LLM_MODEL_TRANSLATION || 'gemini-2.5-flash',
  /** TTS audio generation */
  TTS: process.env.LLM_MODEL_TTS || 'gemini-2.5-flash-preview-tts',
};

// =============================================================================
// LLM TEMPERATURE SETTINGS
// =============================================================================

/**
 * Temperature settings by task type
 * Lower = more deterministic, Higher = more creative
 */
export const LLM_TEMPERATURES = {
  /** Character analysis - low for consistent extraction */
  CHARACTER_ANALYSIS: 0.1,
  /** Speech style generation - slightly higher for creative styles */
  SPEECH_STYLE: 1.0,
  /** Translation - balanced for quality translations */
  TRANSLATION: 0.3,
  /** Dialogue tagging - low for consistent formatting */
  TAGGING: 0.1,
};

/**
 * Other generation config parameters
 */
export const LLM_GENERATION_CONFIG = {
  /** Top-P sampling parameter */
  TOP_P: 0.95,
  /** Max tokens for character analysis */
  MAX_TOKENS_CHARACTER: 32768,
  /** Max tokens for translation (large for full chapters) */
  MAX_TOKENS_TRANSLATION: 65536,
  /** Max tokens for speech style extraction */
  MAX_TOKENS_SPEECH_STYLE: 8192,
};

// =============================================================================
// 1. BOOK INFO EXTRACTION PROMPTS
// =============================================================================

/**
 * Book info extraction prompt template
 * Extracts genre, tone, and voiceTone for narrator TTS instruction
 * Used in: characterRegistry.ts (chapters 1-2 only)
 * 
 * @param needsBookInfo - Whether to include bookInfo in extraction
 * @returns Prompt section for bookInfo extraction
 */
export function getBookInfoExtractionPrompt(needsBookInfo: boolean): string {
  if (!needsBookInfo) return '';
  
  return `ALSO EXTRACT BOOK/DOCUMENT INFO - CRITICAL RULES:
- Total combined output MAX 10 WORDS across all three fields
- Be EXTREMELY concise - each word must add unique semantic value
- MUST AVOID OXYMORONS AND SYNONYMY, INCLUDING SEMANTICALLY EQUIVALENT FORMS ACROSS WORD CLASSES
- BAD example: genre "mystery" + tone "mysterious" = wasted word (mystery already implies mysterious)
- BAD example: tone "mundane, mysterious" = oxymoron (contradictory)
- GOOD example: genre "young adult fantasy" + tone "ominous, wondrous" + voiceTone "ominous, wondrous"

Fields:
- genre: Primary genre (e.g., "gothic horror", "young adult fantasy")
- tone: Mood/atmosphere - NO words derivable from genre (e.g., "tense, melancholic")
- voiceTone: EXACTLY two concise adjectives derived from genre + tone, format "adj1, adj2" (e.g., "ironic, witty")
- period: One word or short phrase describing historical era (NO year numbers). Must be EXACTLY one of:
  prehistory | antiquity | middle ages | modern age | contemporary | future | undefined

`;
}

// =============================================================================
// 2. CHARACTER EXTRACTION PROMPTS
// =============================================================================

/**
 * Per-chapter character extraction prompt
 * Extracts characters with LLM-selected voices and roles
 * Used in: characterRegistry.ts
 * 
 * @param voiceList - Formatted list of available Gemini TTS voices
 * @param assignedVoices - List of already assigned voices
 * @param knownCharsList - Previously extracted characters
 * @param chapterText - Chapter text to analyze (truncated to 30k chars)
 * @param needsBookInfo - Whether to include bookInfo extraction
 * @returns Complete prompt for character extraction
 */
export function getCharacterExtractionPrompt(
  voiceList: string,
  assignedVoices: string,
  knownCharsList: string,
  chapterText: string,
  needsBookInfo: boolean
): string {
  const bookInfoSection = getBookInfoExtractionPrompt(needsBookInfo);
  const bookInfoJson = needsBookInfo ? `
  "bookInfo": {
    "genre": "concise genre (few words)",
    "tone": "unique mood descriptors (few words)",
    "voiceTone": "adj1, adj2",
    "period": "prehistory|antiquity|middle ages|modern age|contemporary|future|undefined"
  },` : '';

  return `You are an expert literary analyst and voice casting director for audiobook production.

AVAILABLE GEMINI TTS VOICES:
${voiceList}

${assignedVoices ? `${assignedVoices}

` : ''}${knownCharsList ? `KNOWN CHARACTERS (already cast - check if any names refer to these):
${knownCharsList}

` : ''}CHAPTER TEXT:
${chapterText.substring(0, 30000)}

TASK: Extract ALL characters who speak dialogue and cast them with the perfect voice.

For EACH character, analyze their:
- Age, personality, social class, nationality/ethnicity, occupation, health/habits
- Extract ROLE as 2-3 lowercase words that represent WHO THEY ARE (NOT how they feel)
- Select the BEST matching Gemini voice from the available list

${bookInfoSection}Return JSON only:
{${bookInfoJson}
  "characters": [
    {
      "name": "exact name as written",
      "sameAs": "known character name if same person (optional)",
      "gender": "male|female|neutral|unknown",
      "voiceName": "ExactGeminiVoiceName",
      "role": "2-3 words describing who they are"
    }
  ]
}

RULES:
1. Include ONLY characters who speak dialogue (have quoted speech)
2. Use the EXACT name as it appears in the text
3. If a character is the SAME PERSON as a known character (different name/alias):
   - Set "sameAs" to the known character's primary name
  - Do NOT assign new voice/role (they inherit from the original)
4. For NEW characters: select voice matching gender and role (age/nationality/identity/function)
5. role MUST be 2-3 words describing who they are (NOT how they feel)
  - Use age modifiers only for minors or seniors (e.g., "little boy", "old woman", "teenage girl")
  - Avoid age modifiers for general adults
  - If characters are not all the same nationality/ethnicity, include it when detectable (e.g., "Russian soldier")
6. Do NOT include NARRATOR - that is handled separately
7. Voice selection: Match voice characteristics to character role and gender (e.g., elderly → low pitch, child → high pitch)

Return ONLY valid JSON, no markdown or explanation.`;
}

// =============================================================================
// 1.1 CHAPTER AMBIENCE MAP PROMPT (Soundscape)
// =============================================================================

export function getChapterAmbienceMapPrompt(
  chapterText: string,
  ambientCatalogList: string
): string {
  return `You are an expert audio scene designer. Build a NON-OVERLAPPING ambience timeline for this chapter.

AVAILABLE AMBIENT ASSETS (use ONLY these IDs):
${ambientCatalogList}

TASK:
1) Identify ambience-worthy environments or sustained sources (e.g., forest, rain, cathedral, city, wind).
2) Select the SINGLE BEST matching ambient asset ID for each segment using precise semantic match with asset tags/filename.
3) Determine when each ambience starts and ends based on the chapter text flow.

OUTPUT RULES:
- Output JSON ONLY (no markdown).
- Use start/end as fractions of chapter progress (0.0 to 1.0).
- No overlaps: only ONE ambience active at a time.
- If overlaps are possible, keep the most important/longest segment and drop the rest.
- If nothing fits, return an empty list.

JSON schema:
{
  "ambience": [
    {
      "assetId": "exact_ambient_asset_id",
      "start": 0.0,
      "end": 0.25
    }
  ]
}

CHAPTER TEXT:
${chapterText.substring(0, 120000)}`;
}

/**
 * Full book character analysis prompt (Phase 1 - first N chapters)
 * Used in: llmCharacterAnalyzer.ts for initial character DB
 */
export function getFullBookAnalysisPrompt(cleanedText: string, chapterCount: number): string {
  return `You are an expert literary analyst. Analyze the FIRST ${chapterCount} CHAPTERS of this book and extract information about ALL characters who speak dialogue.

IMPORTANT RULES:
1. Include ONLY characters who speak dialogue (have quoted speech)
2. Minimum 1 dialogue line to qualify as a character
3. Include ALL speaking characters found in these chapters
4. Always include NARRATOR as first character
5. Use character names exactly as they appear in dialogue attributions
6. Order characters by importance (most dialogue first)

For each character, provide:
- name: Exact name from book (or "NARRATOR" for narration)
- gender: "male", "female", or "neutral"
- traits: Array of 2-4 personality traits from context (e.g., ["calm", "mature", "wise"])
- ageRange: "child", "young adult", "adult", or "elderly"
- role: "protagonist", "antagonist", "supporting", or "minor"
- dialogueCount: Approximate number of dialogue lines in these chapters

Return ONLY a valid JSON array with NO additional text or markdown:
[{"name": "NARRATOR", "gender": "neutral", "traits": [...], ...}, ...]

First ${chapterCount} chapters:
${cleanedText.substring(0, 200000)}`;
}

/**
 * Chapter enrichment prompt (Phase 2 - parallel with TTS)
 * Used in: llmCharacterAnalyzer.ts for character DB enrichment
 */
export function getChapterEnrichmentPrompt(
  existingCharacters: string,
  chapterText: string
): string {
  return `You are an expert literary analyst. Analyze this chapter and:
1. Identify any NEW speaking characters not in the existing list
2. Find additional information about EXISTING characters

EXISTING CHARACTERS (already known):
${existingCharacters}

For NEW characters found, provide full profile:
- name, gender, traits, ageRange, role, dialogueCount

For EXISTING characters with NEW information, provide updates:
- Only include if you found NEW traits, age clarification, or role information
- Include the character name and only the NEW/updated fields

Return JSON with two arrays:
{
  "newCharacters": [{"name": "...", "gender": "...", "traits": [...], "ageRange": "...", "role": "...", "dialogueCount": N}],
  "enrichments": [{"name": "EXISTING_NAME", "newTraits": [...], "ageRange": "...", "role": "..."}]
}

Chapter text:
${chapterText.substring(0, 100000)}`;
}

// =============================================================================
// 3. TRANSLATION PROMPTS
// =============================================================================

/**
 * Chapter translation prompt
 * Used in: chapterTranslator.ts
 * 
 * @param targetLangName - Display name of target language (e.g., "Czech")
 * @param chapterText - Text to translate
 * @returns Complete translation prompt
 */
export function getTranslationPrompt(targetLangName: string, chapterText: string): string {
  return `You are a professional literary translator.

TASK: Translate the following text to ${targetLangName}.

/*
CRITICAL RULES (COMMENTED FOR LITE MODEL TESTING - REVERT IF NEEDED):
1. Translate ALL text naturally, including character names and references.

2. Preserve dialogue formatting:
   - Keep quotation marks style consistent
   - Maintain paragraph breaks
   - Keep dialogue attribution natural in target language

3. Preserve the original tone, style, and literary quality of the text.

4. Return ONLY the translated text - no explanations, notes, or metadata.
*/

TEXT TO TRANSLATE:
${chapterText}`;
}

// =============================================================================
// 4. VOICE TAGGING / DRAMATIZATION PROMPTS
// =============================================================================

/**
 * Chapter voice tagging prompt for Gemini TTS format
 * Used in: llmCharacterAnalyzer.ts
 * @param characterAliases - Formatted list of character TTS aliases
 * @param chapterText - Chapter text to tag
 * @returns Complete tagging prompt
 */
export function getVoiceTaggingPrompt(characterAliases: string, characterRoles: string, chapterText: string): string {
  return `You are tagging text for Gemini TTS multi-speaker synthesis.

  SPEAKER ALIASES (use EXACTLY as shown):
  ${characterAliases}

  ROLES (fixed per character in this chapter):
  ${characterRoles}

  SPEECHSTYLE DIRECTIVE:
  - Output ONE directive line immediately BEFORE each dialogue SPEAKER line
  - Do NOT add a trailing colon to the directive line
  - Format exactly: Action verb + "as" + emotion/state adjective + role
  - Example: "Shout as angry Roman emperor"
  - Avoid generic "Say" unless the quote is neutral/flat
  - Role MUST remain unchanged for the character within this chapter and be lowercase
  - Use correct English article "a" vs "an" when you include an article; do NOT change any other words in the directive

  CRITICAL RULES - DIALOGUE VS NARRATOR:
  1. CHARACTER voice = ONLY the quoted speech itself (text inside „..." or "..." quotes)
  2. NARRATOR voice = EVERYTHING ELSE including:
     - Scene descriptions and actions
     - Dialogue ATTRIBUTION phrases ("said", "began", "whispered", "replied", "zvolal", "řekla")
     - Text AFTER the quote describing how it was said
     - Parenthetical or descriptive text before/after a quote
  3. ALWAYS SPLIT when a sentence has dialogue AND attribution - NEVER combine them!
  4. NEVER repeat quoted text in NARRATOR lines. The quote must appear only once, as the character.
  5. Consecutive narration sentences must be grouped into a single NARRATOR line unless interrupted by dialogue.

  SPEAKER ALIAS FORMAT:
  - ALL CAPS, alphanumeric only (A-Z, 0-9)
  - NO spaces, underscores, or diacritics
  - Use aliases from list above EXACTLY

  EXAMPLES - English:

  EXAMPLE 1 - Quote with attribution and parenthesis:
  INPUT: Mrs. Dursley had a perfectly nice, ordinary day. Over dinner, she told her husband about the neighbour's wife's problems with her daughter, and about Dudley learning a new word ("I won't!").
  CORRECT OUTPUT:
  NARRATOR: Mrs. Dursley had a perfectly nice, ordinary day. Over dinner, she told her husband about the neighbour's wife's problems with her daughter, and about Dudley learning a new word (
  DUDLEY: "I won't!"
  NARRATOR: ).

  EXAMPLE 2 - Quote with attribution MUST be split:
  INPUT: "Well," began the second presenter, "I don't know about that."
  CORRECT OUTPUT:
  THESECONDPRESENTER: "Well,"
  NARRATOR: began the second presenter,
  THESECONDPRESENTER: "I don't know about that."

  EXAMPLE 3 - Attribution before quote:
  INPUT: John said, "Hello there!"
  CORRECT OUTPUT:
  NARRATOR: John said,
  JOHN: "Hello there!"

  EXAMPLE 4 - Description with speaker name:
  INPUT: "Look at this," the presenter smiled.
  CORRECT OUTPUT:
  THEPRESENTER: "Look at this,"
  NARRATOR: the presenter smiled.

  EXAMPLE 5 - Grouping consecutive narration:
  INPUT: Mr. Dursley sat frozen in his armchair. Shooting stars? Owls flying by day? Mysterious people in cloaks? And they were whispering about the Potters...
  Mrs. Dursley came into the living room with two cups of tea. There was nothing for it. 
  CORRECT OUTPUT:
  NARRATOR: Mr. Dursley sat frozen in his armchair. Shooting stars all? Owls flying by day? Mysterious people in cloaks? And they were whispering about the Potters... Mrs. Dursley came into the living room with two cups of tea. There was nothing for it.

  EXAMPLES - Czech:

  EXAMPLE 6 - Attribution AFTER quote:
  INPUT: „Jen se podívejte," zvolal, zatímco si prohlížel mágů.
  OUTPUT:
  JOSEPHRAGOWSKI: „Jen se podívejte,"
  NARRATOR: zvolal, zatímco si prohlížel mágů.

  EXAMPLE 7 - Multiple quotes:
  INPUT: „První věta," řekl John. „Druhá věta!"
  OUTPUT:
  JOHN: „První věta,"
  NARRATOR: řekl John.
  JOHN: „Druhá věta!"

  Now tag this chapter. Output ONLY speechStyle directive lines (for dialogue) and SPEAKER: text lines. CRITICAL: Split dialogue from attribution - character voice gets ONLY quoted text, NARRATOR gets attribution.

  ${chapterText}`;
}

// =============================================================================
// 5. NARRATOR INSTRUCTION TEMPLATE
// =============================================================================

/**
 * Narrator TTS instruction template
 * Format: "Narrate as a {VoiceTone} storyteller, with immersive, nuanced delivery and dynamic pacing:"
 * 
 * @param bookInfo - Book info object with genre, tone, voiceTone
 * @returns Formatted narrator instruction string
 */
export function buildNarratorInstruction(bookInfo: {
  genre?: string;
  tone?: string;
  voiceTone?: string;
} | null): string {
  const fallbackFromTone = (tone?: string): string | null => {
    if (!tone) return null;
    const parts = tone.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];
    return `${parts[0]}, ${parts[1]}`;
  };

  const voiceTone = bookInfo?.voiceTone || fallbackFromTone(bookInfo?.tone) || 'immersive, nuanced';
  const normalizedVoiceTone = voiceTone.toLowerCase().trim();
  return `Narrate as a ${normalizedVoiceTone} storyteller, with immersive, adaptive prosody and timbre:\n`;
}

// =============================================================================
// TTS CONFIGURATION
// =============================================================================

/**
 * TTS chunk size limits per Gemini API
 */
export const TTS_LIMITS = {
  /** Maximum bytes per TTS chunk */
  MAX_CHUNK_BYTES: 4000,
  /** Target chunk size for optimal performance */
  TARGET_CHUNK_BYTES: 3600,
  /** Minimum chunk size */
  MIN_CHUNK_BYTES: 200,
  /** Maximum speakers per chunk (Gemini TTS limit) */
  MAX_SPEAKERS_PER_CHUNK: 2,
};

/**
 * Default narrator voice
 */
export const DEFAULT_NARRATOR_VOICE = 'Enceladus';

/**
 * Silence gap between subchunks in milliseconds
 */
export const SUBCHUNK_SILENCE_GAP_MS = 500;

// =============================================================================
// SOUNDSCAPE CONFIGURATION
// =============================================================================

/**
 * Soundscape pipeline configuration — externalized values.
 * All tuneable parameters for ambient layer, SFX, and embedding search.
 */
export const SOUNDSCAPE_CONFIG = {
  /** Similarity threshold for ambient asset matching (cosine similarity) */
  similarityThresholdAmbient: 0.3,
  /** Similarity threshold for SFX asset matching */
  similarityThresholdSfx: 0.35,
  /** Hysteresis margin — avoid switching ambient if score difference < this */
  hysteresisMargin: 0.05,
  /** Minimum ambient duration in seconds */
  ambientMinDurationSec: 10,
  /** Cooldown between ambient switches in seconds */
  ambientCooldownSec: 30,
  /** Cooldown between SFX triggers in seconds */
  sfxCooldownSec: 5,
  /** Fade-in duration for ambient layer in ms */
  fadeInMs: 2000,
  /** Fade-out duration for ambient layer in ms */
  fadeOutMs: 2000,
  /** Max parallel subchunk TTS generation */
  maxParallelSubchunks: 3,
  /** Ambient volume in dB under narration */
  ambientVolumeDb: -6,
  /** Ambient LUFS target for loudnorm (speech-friendly) */
  ambientLufsTarget: -35,
  /** Ambient true peak limit */
  ambientTruePeak: -2,
  /** Ambient loudness range */
  ambientLra: 11,
  /** SFX volume in dB */
  sfxVolumeDb: -3,
  /** Embedding dimensions (gemini-embedding-001: 768 balances quality vs memory) */
  embeddingDimensions: 768,
  /** Max SFX duration to be considered SFX (longer = ambient) */
  sfxMaxDurationSec: 20,
};
```

---

### Backend: Temp Chunk Manager (chunk caching, WAV generation, retry logic)
**File:** `apps/backend/src/tempChunkManager.ts` | **Size:** 68.7 KB | **Lines:** 1852

```typescript
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
import crypto from 'crypto';
import { synthesizeText, synthesizeMultiSpeaker, SpeakerConfig } from './ttsClient.js';
import { extractVoiceSegments, removeVoiceTags } from './dramatizedChunkerSimple.js';
import { concatenateWavBuffers, addSilence, estimateWavDuration, convertWavToOgg } from './audioUtils.js';
import { validateVoiceSegment, GEMINI_TTS_HARD_LIMIT } from './chapterChunker.js';
import { 
  getTempChunkPath, 
  getChapterPath, 
  getTempFolder,
  createAudiobookFolder,
  sanitizeChapterTitle,
  getSubChunkPath, 
  listChapterSubChunks,
} from './audiobookManager.js';
import { Chapter } from './bookChunker.js';
import { formatForMultiSpeakerTTS, getUniqueSpeakers, chunkForTwoSpeakers, TwoSpeakerChunk } from './twoSpeakerChunker.js';

/**
 * Flag to control pre-dramatization pipeline
 */
let preDramatizationRunning = false;
let preDramatizationAbort: AbortController | null = null;

/**
 * In-memory cache for pre-dramatized chunk text
 */
const dramatizationCache = new Map<number, string>();
const dramatizationInProgress = new Set<number>();

function hashText(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

// ========================================
// Core Dramatization Logic (shared)
// ========================================

/**
 * Core dramatization logic - used by both on-demand and pre-dramatization
 * @param plainText - Raw text without voice tags
 * @returns Tagged text with SPEAKER: format
 */
async function dramatizeTextCore(plainText: string): Promise<string> {
  const characters = (global as any).DRAMATIZATION_CHARACTERS;
  const geminiConfig = (global as any).DRAMATIZATION_CONFIG;
  
  if (!characters || !geminiConfig) {
    console.log('[Dramatization Debug] No characters or geminiConfig, returning narrator only.');
    return `NARRATOR: ${plainText}`;
  }

  try {
    const { GeminiCharacterAnalyzer } = await import('./llmCharacterAnalyzer.js');
    const { hasDialogue, applyRuleBasedTagging, calculateConfidence, extractDialogueParagraphs, mergeWithNarration } = await import('./hybridTagger.js');

    // Check if this chunk has any dialogue
    if (!hasDialogue(plainText)) {
      console.log('[Dramatization Debug] No dialogue detected, returning narrator only.');
      return `NARRATOR: ${plainText}`;
    }

    // Try rule-based first (free, instant)
    const { taggedText: ruleTagged } = applyRuleBasedTagging(plainText, characters);
    const finalConfidence = calculateConfidence(ruleTagged, characters);
    console.log('[Dramatization Debug] Rule-based taggedText:', ruleTagged);
    console.log('[Dramatization Debug] Rule-based confidence:', finalConfidence);

    if (finalConfidence >= 0.85) {
      console.log('[Dramatization Debug] Using rule-based tagging.');
      return ruleTagged;
    }

    // LLM fallback for complex dialogue
    const analyzer = new GeminiCharacterAnalyzer(geminiConfig);
    const dialogueParagraphs = extractDialogueParagraphs(plainText);
    const dialogueText = dialogueParagraphs.length > 0 ? dialogueParagraphs.join('\n\n') : plainText;

    const llmTagged = await analyzer.tagChapterWithVoices(dialogueText, characters);
    console.log('[Dramatization Debug] LLM-tagged output:', llmTagged);
    const mergedText = mergeWithNarration(plainText, llmTagged, characters);
    console.log('[Dramatization Debug] Merged output:', mergedText);

    return mergedText;

  } catch (error) {
    console.error('  ❌ Dramatization failed:', error);
    return `NARRATOR: ${plainText}`;
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
      
      // Skip if chunk already has voice tags (SPEAKER: format)
      if (/^[A-Z][A-Z0-9]*:\s/m.test(chunks[currentIndex])) {
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
        dramatizationCache.set(currentIndex, `NARRATOR: ${chunks[currentIndex]}`);
      } finally {
        dramatizationInProgress.delete(currentIndex);
      }
      
      currentIndex++;
    }
    
    if (!preDramatizationAbort.signal.aborted) {
      console.log(`🎭 Pre-dramatization complete: ${dramatizationCache.size} chunks cached`);
    }
  } catch (error) {
  // (Removed redundant chunking log)
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
 * @returns Tagged text with SPEAKER: format
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
  
  // Convert UPPERCASE to Title Case
  // Handles both underscore-separated (JOSEPH_RAGOWSKI) and space-separated (JOSEPH RAGOWSKI)
  // e.g., "JOSEPH_RAGOWSKI" → "Joseph Ragowski"
  // e.g., "JOSEPH RAGOWSKI" → "Joseph Ragowski"
  const normalizedName = speaker
    .replace(/_/g, ' ')  // First convert underscores to spaces
    .split(' ')          // Then split on spaces
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

/**
 * Map short language codes to BCP-47 format for TTS API
 */
const LANG_CODE_TO_BCP47: Record<string, string> = {
  'sk': 'sk-SK',
  'cs': 'cs-CZ',
  'en': 'en-US',
  'de': 'de-DE',
  'ru': 'ru-RU',
  'pl': 'pl-PL',
  'hr': 'hr-HR',
  'zh': 'cmn-CN',
  'nl': 'nl-NL',
  'fr': 'fr-FR',
  'hi': 'hi-IN',
  'it': 'it-IT',
  'ja': 'ja-JP',
  'ko': 'ko-KR',
  'pt': 'pt-BR',
  'es': 'es-ES',
  'uk': 'uk-UA',
};

/**
 * Convert language code to BCP-47 format for TTS API
 * Handles both short codes ('sk') and full BCP-47 codes ('sk-SK')
 */
function toBCP47(langCode: string): string {
  // If already BCP-47 format (contains hyphen), return as-is
  if (langCode.includes('-')) {
    return langCode;
  }
  // Map short code to BCP-47
  return LANG_CODE_TO_BCP47[langCode.toLowerCase()] || `${langCode}-${langCode.toUpperCase()}`;
}

/**
 * DISABLED: Get language code for single-word texts to prevent TTS misdetection
 * 
 * Reason: Speech style instructions were interfering with TTS language detection.
 * Now we rely on TTS auto-detection by NOT adding speech styles to short texts (≤3 words).
 * 
 * To re-enable: Uncomment this function and restore all getLanguageForSingleWord() calls below.
 * 
 * Logic (when enabled):
 * 1. IF single word THEN force language
 *    - IF TARGET_LANGUAGE set (translation) → use TARGET_LANGUAGE
 *    - ELSE → use BOOK_METADATA.language (original book language)
 * 2. ELSE (multiple words) → let TTS auto-detect
 * 
 * @param text - The text to check
 * @returns BCP-47 language code (e.g., 'sk-SK') if single word, undefined otherwise
 */
/*
function getLanguageForSingleWord(text: string): string | undefined {
  // Strip punctuation and count words
  const cleanText = text.replace(/["„"'«»‹›,\.!?;:—–-]/g, '').trim();
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);
  
  if (words.length === 1) {
    // Single word - force book's language to prevent misdetection
    // Priority: TARGET_LANGUAGE (if translating) > BOOK_METADATA.language (original)
    const targetLang = (global as any).TARGET_LANGUAGE;
    const bookLang = (global as any).BOOK_METADATA?.language;
    const langToUse = targetLang || bookLang;
    
    if (langToUse) {
      const bcp47Lang = toBCP47(langToUse);
      console.log(`  🌍 Single word "${words[0]}" (from "${text}") → forcing language: ${bcp47Lang} (from ${targetLang ? 'TARGET' : 'BOOK'}=${langToUse})`);
      return bcp47Lang;
    } else {
      console.log(`  ⚠️ Single word "${words[0]}" - no language info available`);
    }
  }
  
  // Multiple words - let TTS auto-detect
  return undefined;
}
*/

/**
 * Look up role for a speaker from the global CharacterRegistry
 * Returns role text (same format for narrator and characters)
 * 
 * @param speaker - Speaker name from voice tag (e.g., "JOSEPH_RAGOWSKI" or "NARRATOR")
 * @returns Role text, or undefined
 */
function lookupSpeechStyle(speaker: string): string | undefined {
  const registry = (global as any).CHARACTER_REGISTRY;
  
  // NARRATOR uses special narrator instruction
  if (speaker === 'NARRATOR') {
    if (registry?.getNarratorInstruction) {
      return registry.getNarratorInstruction();
    }
    return undefined; // No narrator instruction yet
  }
  
  if (!registry?.getSpeechStyleForName) {
    return undefined;
  }
  
  // Try exact match first
  const directStyle = registry.getSpeechStyleForName(speaker);
  if (directStyle) return directStyle;
  
  // Try normalized name (UPPERCASE_WITH_UNDERSCORES → Title Case)
  const normalizedName = speaker
    .replace(/_/g, ' ')
    .split(' ')
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  const normalizedStyle = registry.getSpeechStyleForName(normalizedName);
  if (normalizedStyle) return normalizedStyle;
  
  // Try just the last word (surname)
  const lastName = normalizedName.split(' ').pop();
  if (lastName && lastName.length >= 3) {
    const surnameStyle = registry.getSpeechStyleForName(lastName);
    if (surnameStyle) return surnameStyle;
  }
  
  return undefined;
}

function buildFallbackSpeechStyle(speaker: string): string | undefined {
  const registry = (global as any).CHARACTER_REGISTRY;
  if (speaker === 'NARRATOR') {
    return registry?.getNarratorInstruction?.();
  }
  return undefined;
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
 * @param chunkText - Text to synthesize (with SPEAKER: format for multi-voice)
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
  let taggedTextToPersist: string | null = null;
  // If chunkText already has voice tags, that's the tagged text; otherwise, it may be dramatized below
  if (voiceSegments.length > 0) {
    // MULTI-VOICE MODE: Chunk has voice tags
    // Using TRUE multi-speaker TTS via Gemini's multiSpeakerVoiceConfig
    const uniqueSpeakers = [...new Set(voiceSegments.map(s => s.speaker))];
    console.log(`  Multi-voice chunk: ${voiceSegments.length} segments, ${uniqueSpeakers.length} speakers`);
    // Persist the tagged text (with SPEAKER: format) for this chunk
    taggedTextToPersist = chunkText;
    // CRITICAL: Gemini TTS multi-speaker requires EXACTLY 2 speakers
    if (uniqueSpeakers.length === 1) {
      // Only 1 speaker - preserve per-segment speechStyle when present
      const speaker = uniqueSpeakers[0];
      const voice = lookupVoice(speaker, voiceMap, defaultVoice);
      console.log(`  📢 Single speaker chunk: ${speaker} → ${voice}`);

      const hasSegmentStyles = voiceSegments.some(s => s.speechStyle);
      if (hasSegmentStyles) {
        const audioBuffers: Buffer[] = [];
        for (const seg of voiceSegments) {
          const speechStyle = seg.speechStyle || buildFallbackSpeechStyle(seg.speaker);
          const segAudio = await synthesizeText(seg.text, voice, 'normal', speechStyle, undefined);
          audioBuffers.push(segAudio);
        }
        audioBuffer = concatenateWavBuffers(audioBuffers);
        console.log(`  ✓ Generated and concatenated ${audioBuffers.length} single-speaker segments`);
      } else {
        // Concatenate all segment texts (they're all from the same speaker)
        const combinedText = voiceSegments.map(s => s.text).join(' ');
        const speechStyle = buildFallbackSpeechStyle(speaker);
        audioBuffer = await synthesizeText(combinedText, voice, 'normal', speechStyle, undefined);
      }
      
    } else {
      // BYPASS TEST: Force single-speaker TTS for all segments (PART 1: pre-tagged chunks)
      console.log(`  🧪 BYPASS: ${uniqueSpeakers.length} speakers - using single-speaker TTS for each segment`);
      const audioBuffers: Buffer[] = [];
      
      for (const seg of voiceSegments) {
        const voice = lookupVoice(seg.speaker, voiceMap, defaultVoice);
        const speechStyle = seg.speechStyle || buildFallbackSpeechStyle(seg.speaker);
        // Language forcing disabled - TTS auto-detects (no speech style for short texts)
        const segAudio = await synthesizeText(seg.text, voice, 'normal', speechStyle, undefined);
        audioBuffers.push(segAudio);
      }
      
      // Concatenate all audio buffers
      audioBuffer = concatenateWavBuffers(audioBuffers);
      console.log(`  ✓ Generated and concatenated ${audioBuffers.length} single-speaker segments`);
    }
    
    /* ORIGINAL MULTI-SPEAKER CODE (bypassed for testing):
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
        let subBuffer: Buffer;
        
        if (subChunk.speakers.length === 1) {
          // Single speaker
          const voice = lookupVoice(subChunk.speakers[0], voiceMap, defaultVoice);
          const text = subChunk.segments.map(s => s.text).join(' ');
          const langOverride = getLanguageForSingleWord(text);
          subBuffer = await synthesizeText(text, voice, 'normal', undefined, langOverride);
        } else {
          // 2 speakers - true multi-speaker
          const speakerConfigs: SpeakerConfig[] = subChunk.speakers.map(speaker => ({
            speaker,
            voiceName: lookupVoice(speaker, voiceMap, defaultVoice),
          }));
          console.log(
            `\n==================== TTS SUB-CHUNK ====================\n` +
            `SPEAKER CONFIGS:\n${JSON.stringify(speakerConfigs, null, 2)}\n` +
            `FORMATTED TEXT:\n-----\n${subChunk.formattedText}\n-----\n` +
            `=======================================================\n`
          );
          subBuffer = await synthesizeMultiSpeaker(subChunk.formattedText, speakerConfigs);
        }
        
        audioBuffers.push(subBuffer);
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
      
      // Format text for multi-speaker TTS: "Speaker: text" format
      const formattedText = formatForMultiSpeakerTTS(voiceSegments);
      const textBytes = Buffer.byteLength(formattedText, 'utf8');
      console.log(
        `\n==================== TTS MULTI-SPEAKER ====================\n` +
        `SPEAKER CONFIGS:\n${JSON.stringify(speakerConfigs, null, 2)}\n` +
        `FORMATTED TEXT:\n-----\n${formattedText}\n-----\n` +
        `BYTES: ${textBytes}\n` +
        `========================================================\n`
      );
      audioBuffer = await synthesizeMultiSpeaker(formattedText, speakerConfigs);
    }
    */
    
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
      // Persist the dramatized (tagged) text for this chunk
      taggedTextToPersist = dramatizedText;
      if (dramatizedSegments.length > 0) {
        // Successfully dramatized - now generate multi-voice audio
        const uniqueSpeakers = [...new Set(dramatizedSegments.map(s => s.speaker))];
        console.log(`    ✓ Dramatized: ${dramatizedSegments.length} segments, ${uniqueSpeakers.length} speakers`);
        
        // BYPASS TEST: Force single-speaker TTS for all segments to eliminate voice bleed
        console.log(`    🧪 BYPASS: Using single-speaker TTS for each segment (testing voice consistency)`);
        const audioBuffers: Buffer[] = [];
        
        for (const seg of dramatizedSegments) {
          const voice = lookupVoice(seg.speaker, voiceMap, defaultVoice);
          const speechStyle = seg.speechStyle || buildFallbackSpeechStyle(seg.speaker);
          // Language forcing disabled - TTS auto-detects (no speech style for short texts)
          const segAudio = await synthesizeText(seg.text, voice, 'normal', speechStyle, undefined);
          audioBuffers.push(segAudio);
        }
        
        // Concatenate all audio buffers
        audioBuffer = concatenateWavBuffers(audioBuffers);
        console.log(`    ✓ Generated and concatenated ${audioBuffers.length} single-speaker segments`);
        
        /* ORIGINAL MULTI-SPEAKER CODE (bypassed for testing):
        if (uniqueSpeakers.length === 1) {
          // Single speaker after dramatization
          const speaker = uniqueSpeakers[0];
          const voice = lookupVoice(speaker, voiceMap, defaultVoice);
          const combinedText = dramatizedSegments
            .map(s => s.text)
            .join(' ');
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
        */
      } else {
        // Dramatization didn't produce voice tags - use single voice
        console.log(`    📝 No dialogue found, using narrator voice`);
        const cleanText = removeVoiceTags(chunkText);
        const narratorSpeechStyle = lookupSpeechStyle('NARRATOR');
        // Language forcing disabled - TTS auto-detects (no speech style for short texts)
        audioBuffer = await synthesizeText(cleanText, defaultVoice, 'normal', narratorSpeechStyle, undefined);
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
      
      const narratorSpeechStyle = lookupSpeechStyle('NARRATOR');
      // Language forcing disabled - TTS auto-detects (no speech style for short texts)
      audioBuffer = await synthesizeText(cleanText, defaultVoice, 'normal', narratorSpeechStyle, undefined);
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
      const speechStyle = lookupSpeechStyle(speaker);
      // Language forcing disabled - TTS auto-detects (no speech style for short texts)
      
      console.log(`     Batch ${i + 1}/${batches.length}: Single-voice (${speaker} → ${voice})`);
      batchAudio = await synthesizeText(combinedText, voice, 'normal', speechStyle, undefined);
      
    } else {
      // 2 speakers - use true multi-speaker TTS
      const speakerConfigs: SpeakerConfig[] = batchSpeakers.map(speaker => ({
        speaker,
        voiceName: lookupVoice(speaker, voiceMap, defaultVoice),
      }));
      
      const formattedText = formatForMultiSpeakerTTS(batch);
      
      console.log(`     Batch ${i + 1}/${batches.length}: Multi-speaker (${speakerConfigs.map(s => `${s.speaker}→${s.voiceName}`).join(', ')})`);
      batchAudio = await synthesizeMultiSpeaker(formattedText, speakerConfigs);
          // Log for batching
          console.log(
            `\n==================== TTS BATCH ====================\n` +
            `SPEAKER CONFIGS:\n${JSON.stringify(speakerConfigs, null, 2)}\n` +
            `FORMATTED TEXT:\n-----\n${formattedText}\n-----\n` +
            `========================================================\n`
          );
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
  let currentByte = 0;
  
  for (const chunkIndex of chunkIndices) {
    const tempFile = getTempChunkPath(bookTitle, chunkIndex);
    
    if (!fs.existsSync(tempFile)) {
      throw new Error(`Temp chunk ${chunkIndex} not found: ${tempFile}`);
    }
    
    const buffer = fs.readFileSync(tempFile);
    chunkBuffers.push(buffer);
    
    // Track chunk boundaries (WAV sub-chunks — exact byte boundaries from PCM data)
    const chunkSize = buffer.length;
    const duration = estimateAudioDuration(buffer);
    
    chunkBoundaries.push({
      chunkIndex,
      startByte: currentByte,
      endByte: currentByte + chunkSize,
      duration,
    });
    
    currentByte += chunkSize;
  }
  
  // 2. Concatenate WAV sub-chunks into single WAV
  const chapterWav = concatenateWavBuffers(chunkBuffers);
  
  // 3. Convert WAV → OGG Opus (single encode, 70kbps VBR)
  const chapterAudio = await convertWavToOgg(chapterWav);
  
  // 4. Save consolidated chapter file (OGG Opus)
  fs.writeFileSync(outputPath, chapterAudio);
  const duration = estimateAudioDuration(chapterAudio);
  
  // 4. Save chunk boundaries metadata for extraction
  const boundariesPath = outputPath.replace('.ogg', '_boundaries.json');
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
    
    const chapterWav = concatenateWavBuffers(chunkBuffers);
    const chapterAudio = await convertWavToOgg(chapterWav);
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
        const partWav = concatenateWavBuffers(currentPartBuffers);
        const partAudio = await convertWavToOgg(partWav);
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
    const partWav = concatenateWavBuffers(currentPartBuffers);
    const partAudio = await convertWavToOgg(partWav);
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
 * Estimate audio duration from buffer (format-aware)
 * 
 * - WAV (LINEAR16 PCM): Exact calculation from header fields
 * - OGG Opus: Heuristic based on typical bitrate (~6000 bytes/sec)
 * 
 * Detects format by checking for RIFF header magic bytes.
 * 
 * @param audioBuffer - WAV or OGG Opus audio buffer
 * @returns Duration in seconds
 */
export function estimateAudioDuration(audioBuffer: Buffer): number {
  // Detect WAV by RIFF header magic bytes
  if (audioBuffer.length >= 44 && audioBuffer.toString('ascii', 0, 4) === 'RIFF') {
    // WAV: Exact calculation from header
    return estimateWavDuration(audioBuffer);
  }
  
  // OGG Opus heuristic: ~6000 bytes per second at typical Gemini TTS bitrate
  // This is an approximation; for exact duration use ffprobe
  const OPUS_BYTES_PER_SEC = 6000;
  return audioBuffer.length / OPUS_BYTES_PER_SEC;
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
  const boundariesPath = chapterPath.replace('.ogg', '_boundaries.json');
  
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
  // Match both old format (chunk_001.wav) and new format (subchunk_001_000.wav)
  const chunkFiles = files.filter(f => f.match(/^(chunk_\d{3}|subchunk_\d{3}_\d{3})\.wav$/));
  
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
// ========================================
// NEW: Sub-chunk Generation (Parallel Pipeline)
// ========================================

/**
 * Result of sub-chunk generation
 */
export interface SubChunkResult {
  chapterIndex: number;
  subChunkIndex: number;
  audioBuffer: Buffer;
  filePath: string;
  fromCache: boolean;
  duration: number;
}

// ========================================
// GENERATION LOCK: Prevent duplicate TTS calls
// ========================================

// Map of "chapterIndex:subChunkIndex" -> Promise<SubChunkResult>
// If a generation is in progress, other callers wait for the same promise
const generationInProgress: Map<string, Promise<SubChunkResult>> = new Map();

export function clearDramatizationCaches(): void {
  dramatizationCache.clear();
  dramatizationInProgress.clear();
  generationInProgress.clear();
}

/**
 * Get lock key for a sub-chunk
 */
function getSubChunkLockKey(chapterIndex: number, subChunkIndex: number): string {
  return `${chapterIndex}:${subChunkIndex}`;
}

/**
 * Generate TTS audio for a single sub-chunk and save to temp file
 * 
 * NEW NAMING: subchunk_CCC_SSS.wav (chapter_subchunk)
 * THREAD-SAFE: Uses lock to prevent duplicate TTS calls for same sub-chunk
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterIndex - Chapter index (0-based)
 * @param subChunk - Sub-chunk data from twoSpeakerChunker
 * @param voiceMap - Character to voice mapping
 * @param defaultVoice - Default voice for narrator
 * @returns Sub-chunk result with audio buffer and metadata
 */
export async function generateSubChunk(
  bookTitle: string,
  chapterIndex: number,
  subChunk: TwoSpeakerChunk,
  voiceMap: Record<string, string> = {},
  defaultVoice: string = 'Algieba'
): Promise<SubChunkResult> {
  const subChunkIndex = subChunk.index;
  const lockKey = getSubChunkLockKey(chapterIndex, subChunkIndex);
  const tempFile = getSubChunkPath(bookTitle, chapterIndex, subChunkIndex);
  const metadataPath = tempFile.replace(/\.wav$/i, '.json');
  const subChunkSignature = hashText(JSON.stringify(subChunk.segments));
  
  // 1. Check if sub-chunk file already exists (resume capability)
  if (fs.existsSync(tempFile)) {
    if (fs.existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        if (metadata?.signature === subChunkSignature) {
          console.log(`💾 Sub-chunk ${chapterIndex}:${subChunkIndex} exists, loading from disk`);
          const audioBuffer = fs.readFileSync(tempFile);
          const duration = estimateAudioDuration(audioBuffer);
          
          return {
            chapterIndex,
            subChunkIndex,
            audioBuffer,
            filePath: tempFile,
            fromCache: true,
            duration,
          };
        }
      } catch (error) {
        console.warn(`⚠️ Failed to read sub-chunk metadata for ${chapterIndex}:${subChunkIndex}:`, error);
      }
    }
    console.log(`♻️ Sub-chunk ${chapterIndex}:${subChunkIndex} cache mismatch, regenerating`);
  }
  
  // 2. CHECK LOCK: If generation is in progress, wait for it
  if (generationInProgress.has(lockKey)) {
    console.log(`⏳ Sub-chunk ${chapterIndex}:${subChunkIndex} generation in progress, waiting...`);
    return generationInProgress.get(lockKey)!;
  }
  
  // 3. ACQUIRE LOCK: Create promise and store it
  const generationPromise = (async (): Promise<SubChunkResult> => {
    try {
      const startTime = Date.now();
      console.log(`🎤 Generating sub-chunk ${chapterIndex}:${subChunkIndex} (${subChunk.speakers.join(', ')})...`);
      
      // Generate TTS audio based on speaker count
      let audioBuffer: Buffer;
      
      // BYPASS TEST: Force single-speaker TTS for all segments (PART 3: sub-chunk generation)
      // Group consecutive same-speaker segments to avoid redundant speech instructions
      console.log(`  🧪 BYPASS: ${subChunk.speakers.length} speakers - generating ${subChunk.segments.length} single-speaker segments`);
      const audioBuffers: Buffer[] = [];
      
      // Group consecutive same-speaker segments
      const groupedSegments: { speaker: string; text: string }[] = [];
      for (const seg of subChunk.segments) {
        const lastGroup = groupedSegments[groupedSegments.length - 1];
        if (lastGroup && lastGroup.speaker === seg.speaker) {
          // Same speaker - combine text with space separator
          lastGroup.text += ' ' + seg.text;
        } else {
          // New speaker - create new group
          groupedSegments.push({ speaker: seg.speaker, text: seg.text });
        }
      }
      
      console.log(`  📦 Grouped into ${groupedSegments.length} speaker groups (from ${subChunk.segments.length} segments)`);
      
      // Generate TTS for each grouped segment
      for (const group of groupedSegments) {
        const voice = lookupVoice(group.speaker, voiceMap, defaultVoice);
        const speechStyle = lookupSpeechStyle(group.speaker);
        // Language forcing disabled - TTS auto-detects (no speech style for short texts)
        const segAudio = await synthesizeText(group.text, voice, 'normal', speechStyle, undefined);
        audioBuffers.push(segAudio);
      }
      
      // Concatenate all audio buffers
      audioBuffer = concatenateWavBuffers(audioBuffers);
      console.log(`  ✅ Concatenated ${audioBuffers.length} grouped segments`);
      
      /* ORIGINAL SUB-CHUNK MULTI-SPEAKER CODE (bypassed for testing):
      if (subChunk.speakers.length === 1) {
        // Single speaker - use single-voice synthesis
        const speaker = subChunk.speakers[0];
        const voice = lookupVoice(speaker, voiceMap, defaultVoice);
        const text = subChunk.segments.map(s => s.text).join(' ');
        
        console.log(`  📢 Single speaker: ${speaker} → ${voice}`);
        audioBuffer = await synthesizeText(text, voice);
        
      } else {
        // 2 speakers - use true multi-speaker TTS
        const speakerConfigs: SpeakerConfig[] = subChunk.speakers.map(speaker => ({
          speaker,
          voiceName: lookupVoice(speaker, voiceMap, defaultVoice),
        }));
        
        console.log(`  🎭 Multi-speaker: ${speakerConfigs.map(s => `${s.speaker}→${s.voiceName}`).join(', ')}`);
        audioBuffer = await synthesizeMultiSpeaker(subChunk.formattedText, speakerConfigs);
      }
      */
    
      // Save to temp file
      const tempDir = getTempFolder(bookTitle);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      fs.writeFileSync(tempFile, audioBuffer);
      fs.writeFileSync(metadataPath, JSON.stringify({
        signature: subChunkSignature,
        chapterIndex,
        subChunkIndex,
        generatedAt: new Date().toISOString(),
      }));
      
      const elapsedMs = Date.now() - startTime;
      const duration = estimateAudioDuration(audioBuffer);
      
      console.log(`  ✅ Sub-chunk ${chapterIndex}:${subChunkIndex} saved (${audioBuffer.length} bytes, ~${duration.toFixed(1)}s, ${elapsedMs}ms)`);
      
      return {
        chapterIndex,
        subChunkIndex,
        audioBuffer,
        filePath: tempFile,
        fromCache: false,
        duration,
      };
    } finally {
      // RELEASE LOCK
      generationInProgress.delete(lockKey);
    }
  })();
  
  // Store promise in lock map
  generationInProgress.set(lockKey, generationPromise);
  
  return generationPromise;
}

/**
 * Worker pool pattern for TTS generation
 * N independent workers continuously pull from a shared queue
 * Much more efficient than batching when sub-chunks have varying sizes
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterIndex - Chapter index
 * @param subChunks - Array of sub-chunks to generate
 * @param voiceMap - Character to voice mapping
 * @param defaultVoice - Default voice for narrator
 * @param numWorkers - Number of concurrent workers (default: 2)
 * @returns Array of sub-chunk results
 */
export async function generateSubChunksWorkerPool(
  bookTitle: string,
  chapterIndex: number,
  subChunks: TwoSpeakerChunk[],
  voiceMap: Record<string, string> = {},
  defaultVoice: string = 'Algieba',
  numWorkers: number = 2
): Promise<SubChunkResult[]> {
  console.log(`🏭 Worker pool: Chapter ${chapterIndex}, ${subChunks.length} sub-chunks (${numWorkers} workers)`);
  const startTime = Date.now();
  
  // Create a shared queue (just an index counter)
  let nextIndex = 0;
  let completedCount = 0;
  const results: SubChunkResult[] = new Array(subChunks.length);
  
  // Worker function - continuously pulls from queue until empty
  async function worker(workerId: number): Promise<void> {
    while (true) {
      // Atomically get next index (JS is single-threaded, so this is safe)
      const myIndex = nextIndex++;
      if (myIndex >= subChunks.length) break; // Queue empty
      
      const subChunk = subChunks[myIndex];
      console.log(`  🔧 Worker ${workerId}: sub-chunk ${chapterIndex}:${subChunk.index}`);
      
      try {
        const result = await generateSubChunk(bookTitle, chapterIndex, subChunk, voiceMap, defaultVoice);
        results[myIndex] = result;
        completedCount++;
        console.log(`  ✅ Worker ${workerId}: done ${chapterIndex}:${subChunk.index} (${completedCount}/${subChunks.length})`);
      } catch (error) {
        console.error(`  ❌ Worker ${workerId}: failed ${chapterIndex}:${subChunk.index}:`, error);
        // Store error result with empty buffer
        results[myIndex] = {
          chapterIndex,
          subChunkIndex: subChunk.index,
          audioBuffer: Buffer.alloc(0),
          filePath: '',
          fromCache: false,
          duration: 0
        };
        completedCount++;
      }
    }
  }
  
  // Start all workers in parallel
  const workerPromises = Array.from({ length: numWorkers }, (_, i) => worker(i + 1));
  await Promise.all(workerPromises);
  
  const elapsedMs = Date.now() - startTime;
  const fromCacheCount = results.filter(r => r?.fromCache).length;
  
  console.log(`✅ Chapter ${chapterIndex + 1} complete: ${completedCount} sub-chunks in ${elapsedMs}ms (${fromCacheCount} from cache)`);
  
  return results.filter(r => r !== undefined);
}

/**
 * Generate multiple sub-chunks in parallel (LEGACY - batch-based)
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterIndex - Chapter index
 * @param subChunks - Array of sub-chunks to generate
 * @param voiceMap - Character to voice mapping
 * @param defaultVoice - Default voice for narrator
 * @param parallelism - Number of concurrent TTS calls (default: 3)
 * @returns Array of sub-chunk results
 */
export async function generateSubChunksParallel(
  bookTitle: string,
  chapterIndex: number,
  subChunks: TwoSpeakerChunk[],
  voiceMap: Record<string, string> = {},
  defaultVoice: string = 'Algieba',
  parallelism: number = 3
): Promise<SubChunkResult[]> {
  console.log(`🚀 Parallel generation: Chapter ${chapterIndex}, ${subChunks.length} sub-chunks (parallelism: ${parallelism})`);
  const startTime = Date.now();
  
  const results: SubChunkResult[] = [];
  
  // Generate first sub-chunk alone (sequential) to minimize first-listen latency.
  // The frontend polls for subchunk 0 first — it must be on disk ASAP.
  if (subChunks.length > 0) {
    const firstResult = await generateSubChunk(bookTitle, chapterIndex, subChunks[0], voiceMap, defaultVoice);
    results.push(firstResult);
    console.log(`  📊 Progress: 1/${subChunks.length} sub-chunks (first ready)`);
  }
  
  // Process remaining sub-chunks in parallel batches
  for (let i = 1; i < subChunks.length; i += parallelism) {
    const batch = subChunks.slice(i, i + parallelism);
    
    const batchResults = await Promise.all(
      batch.map(subChunk => 
        generateSubChunk(bookTitle, chapterIndex, subChunk, voiceMap, defaultVoice)
      )
    );
    
    results.push(...batchResults);
    
    // Log progress
    const completed = Math.min(i + parallelism, subChunks.length);
    console.log(`  📊 Progress: ${completed}/${subChunks.length} sub-chunks`);
  }
  
  const elapsedMs = Date.now() - startTime;
  const fromCacheCount = results.filter(r => r.fromCache).length;
  
  console.log(`✅ Chapter ${chapterIndex + 1} complete: ${results.length} sub-chunks in ${elapsedMs}ms (${fromCacheCount} from cache)`);
  
  return results;
}

/**
 * Consolidate sub-chunks into a single chapter WAV file
 * 
 * NEW: Works directly with sub-chunk files (no intermediate chunk layer)
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterIndex - Chapter index
 * @param chapterTitle - Chapter title for filename
 * @returns Path to consolidated chapter file
 */
export async function consolidateChapterFromSubChunks(
  bookTitle: string,
  chapterIndex: number,
  chapterTitle?: string
): Promise<string> {
  const tempDir = getTempFolder(bookTitle);
  const subChunkFiles = listChapterSubChunks(bookTitle, chapterIndex);
  
  if (subChunkFiles.length === 0) {
    throw new Error(`No sub-chunks found for chapter ${chapterIndex}`);
  }
  
  console.log(`📦 Consolidating chapter ${chapterIndex} from ${subChunkFiles.length} sub-chunks...`);
  
  // Load and concatenate all sub-chunk audio
  const chunkBuffers: Buffer[] = [];
  for (const filePath of subChunkFiles) {
    const buffer = fs.readFileSync(filePath);
    chunkBuffers.push(buffer);
  }
  
  const chapterWav = concatenateWavBuffers(chunkBuffers);
  const chapterAudio = await convertWavToOgg(chapterWav);
  const outputPath = getChapterPath(bookTitle, chapterIndex, chapterTitle);
  fs.writeFileSync(outputPath, chapterAudio);
  
  console.log(`✅ Consolidated: ${path.basename(outputPath)} (${chapterAudio.length} bytes)`);
  
  return outputPath;
}

/**
 * Delete sub-chunks for a specific chapter
 */
export function deleteChapterSubChunks(bookTitle: string, chapterIndex: number): number {
  const tempDir = getTempFolder(bookTitle);
  const subChunkFiles = listChapterSubChunks(bookTitle, chapterIndex);
  
  for (const filePath of subChunkFiles) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  
  // Check if temp folder is now empty and delete it
  if (fs.existsSync(tempDir)) {
    const remainingFiles = fs.readdirSync(tempDir);
    if (remainingFiles.length === 0) {
      fs.rmdirSync(tempDir);
      console.log(`  🗑️  Removed empty temp folder`);
    }
  }
  
  return subChunkFiles.length;
}

/**
 * Check if a sub-chunk exists on disk
 */
export function subChunkExists(bookTitle: string, chapterIndex: number, subChunkIndex: number): boolean {
  const filePath = getSubChunkPath(bookTitle, chapterIndex, subChunkIndex);
  return fs.existsSync(filePath);
}

/**
 * Load existing sub-chunk from disk
 */
export function loadSubChunk(bookTitle: string, chapterIndex: number, subChunkIndex: number): Buffer | null {
  const filePath = getSubChunkPath(bookTitle, chapterIndex, subChunkIndex);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  return fs.readFileSync(filePath);
}

/**
 * Find and load a sub-chunk by global index by scanning temp folder
 * This is a fallback when CHAPTER_SUBCHUNKS memory map is unreliable
 * 
 * @returns { audio: Buffer, chapterIndex: number, subChunkIndex: number } or null
 */
export function findSubChunkByGlobalIndex(
  bookTitle: string, 
  globalIndex: number,
  chapterSubChunkCounts: Map<number, number>
): { audio: Buffer; chapterIndex: number; subChunkIndex: number } | null {
  const tempDir = getTempFolder(bookTitle);
  
  if (!fs.existsSync(tempDir)) {
    return null;
  }
  
  // Method 1: Calculate from known chapter sub-chunk counts
  let runningTotal = 0;
  for (const [chapIdx, count] of chapterSubChunkCounts.entries()) {
    if (globalIndex < runningTotal + count) {
      const localIdx = globalIndex - runningTotal;
      const filePath = getSubChunkPath(bookTitle, chapIdx, localIdx);
      if (fs.existsSync(filePath)) {
        return {
          audio: fs.readFileSync(filePath),
          chapterIndex: chapIdx,
          subChunkIndex: localIdx,
        };
      }
    }
    runningTotal += count;
  }
  
  // Method 2: Scan all files and build mapping
  try {
    const files = fs.readdirSync(tempDir);
    const subChunkPattern = /^subchunk_(\d{3})_(\d{3})\.wav$/;
    
    // Build sorted list of all sub-chunks
    const allChunks: Array<{ chapIdx: number; subIdx: number; path: string }> = [];
    
    for (const file of files) {
      const match = file.match(subChunkPattern);
      if (match) {
        allChunks.push({
          chapIdx: parseInt(match[1], 10),
          subIdx: parseInt(match[2], 10),
          path: path.join(tempDir, file),
        });
      }
    }
    
    // Sort by chapter, then by sub-chunk index
    allChunks.sort((a, b) => {
      if (a.chapIdx !== b.chapIdx) return a.chapIdx - b.chapIdx;
      return a.subIdx - b.subIdx;
    });
    
    // Return the chunk at globalIndex position
    if (globalIndex >= 0 && globalIndex < allChunks.length) {
      const chunk = allChunks[globalIndex];
      return {
        audio: fs.readFileSync(chunk.path),
        chapterIndex: chunk.chapIdx,
        subChunkIndex: chunk.subIdx,
      };
    }
  } catch (error) {
    console.error('Error scanning temp folder:', error);
  }
  
  return null;
}
```

---

### Backend: Text Cleaner (pre-processing, normalization)
**File:** `apps/backend/src/textCleaner.ts` | **Size:** 11.3 KB | **Lines:** 418

```typescript
/**
 * Text Cleaner - Remove Non-Content Elements
 * 
 * Intelligently removes:
 * - Page numbers
 * - Table of contents
 * - Editorial notes (footnotes, annotations)
 * - Publisher info
 * - Headers/footers
 * - Chapter numbering artifacts
 * 
 * Preserves:
 * - Legally required copyright statements
 * - Author attributions
 * - Essential footnotes (part of story)
 * - Chapter titles (for navigation)
 */

/**
 * Configuration for text cleaning behavior
 */
export interface CleaningConfig {
  /** Remove page numbers */
  removePageNumbers: boolean;
  /** Remove table of contents */
  removeTableOfContents: boolean;
  /** Remove editorial notes */
  removeEditorialNotes: boolean;
  /** Remove publisher info */
  removePublisherInfo: boolean;
  /** Remove headers/footers */
  removeHeadersFooters: boolean;
  /** Preserve copyright notices */
  preserveCopyright: boolean;
  /** Preserve author attributions */
  preserveAuthor: boolean;
  /** Aggressive mode (more removal, higher risk) */
  aggressive: boolean;
}

/**
 * Default cleaning configuration (conservative)
 */
export const DEFAULT_CLEANING_CONFIG: CleaningConfig = {
  removePageNumbers: true,
  removeTableOfContents: true,
  removeEditorialNotes: true,
  removePublisherInfo: true,
  removeHeadersFooters: true,
  preserveCopyright: true,
  preserveAuthor: true,
  aggressive: false,
};

/**
 * Result of text cleaning operation
 */
export interface CleaningResult {
  cleanedText: string;
  originalLength: number;
  cleanedLength: number;
  bytesRemoved: number;
  patternsMatched: string[];
  warnings: string[];
}

/**
 * Remove page numbers from text
 * 
 * Patterns detected:
 * - Standalone numbers on lines: "42", "  156  "
 * - Page X of Y: "Page 42 of 200"
 * - Roman numerals: "xii", "XXIII"
 * - With dashes: "- 42 -", "—42—"
 */
function removePageNumbers(text: string): { text: string; count: number } {
  let count = 0;
  
  // Pattern 1: Standalone numbers (likely page numbers)
  // Matches: "\n  42  \n" or "\n156\n"
  text = text.replace(/\n\s*\d{1,4}\s*\n/g, (match) => {
    count++;
    return '\n';
  });
  
  // Pattern 2: "Page X" or "Page X of Y"
  text = text.replace(/\n\s*Page\s+\d+(\s+of\s+\d+)?\s*\n/gi, (match) => {
    count++;
    return '\n';
  });
  
  // Pattern 3: Roman numerals (for preface/intro pages)
  text = text.replace(/\n\s*[ivxlcdm]{1,6}\s*\n/gi, (match) => {
    // Only if all lowercase or all uppercase (consistent formatting)
    if (match === match.toLowerCase() || match === match.toUpperCase()) {
      count++;
      return '\n';
    }
    return match;
  });
  
  // Pattern 4: Numbers with decorative dashes
  text = text.replace(/\n\s*[-—]\s*\d{1,4}\s*[-—]\s*\n/g, (match) => {
    count++;
    return '\n';
  });
  
  return { text, count };
}

/**
 * Remove table of contents sections
 * 
 * Heuristics:
 * - "Contents", "Table of Contents" headers
 * - Multiple lines with "Chapter X ... page Y" pattern
 * - Dotted leaders: "Chapter One ..... 15"
 */
function removeTableOfContents(text: string): { text: string; removed: boolean } {
  let removed = false;
  
  // Look for TOC header followed by chapter listings
  const tocPattern = /(Table of )?Contents?\s*\n([\s\S]{50,2000}?)\n\n/gi;
  
  text = text.replace(tocPattern, (match, prefix, content) => {
    // Check if content looks like TOC (has chapter references)
    const hasChapterRefs = /Chapter\s+\w+\s*[.\s]+\d+/gi.test(content);
    const hasDottedLeaders = /\.{3,}/g.test(content);
    const hasPageNumbers = /\d+\s*\n/g.test(content);
    
    if (hasChapterRefs || (hasDottedLeaders && hasPageNumbers)) {
      removed = true;
      return '\n\n';
    }
    
    return match;
  });
  
  return { text, removed };
}

/**
 * Remove editorial notes and footnotes
 * 
 * Patterns:
 * - Footnote markers: [1], *, †, ‡
 * - Footnote text: "1. This is a note..."
 * - Editorial comments: [Editor's note: ...]
 * - Translator notes: [Translator: ...]
 * 
 * PRESERVES story-essential footnotes (detected by context)
 */
function removeEditorialNotes(text: string, aggressive: boolean): { text: string; count: number } {
  let count = 0;
  
  // Pattern 1: [Editor's note: ...] or [Translator: ...]
  text = text.replace(/\[(?:Editor'?s?\s+note|Translator|Note):\s*[^\]]+\]/gi, (match) => {
    count++;
    return '';
  });
  
  // Pattern 2: Footnote markers in text (but keep if part of story)
  // Only remove if followed by corresponding footnote text
  if (aggressive) {
    // Remove superscript numbers/symbols not part of dialogue
    text = text.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/g, (match) => {
      count++;
      return '';
    });
  }
  
  // Pattern 3: Footnote text at bottom of page
  // Format: "1. This is explanatory text..."
  text = text.replace(/\n\s*\d+\.\s+[A-Z][^\n]{20,200}\n/g, (match) => {
    // Only remove if it looks like editorial (has key words)
    if (/\b(originally|published|translation|edition|note|circa|approximately)\b/i.test(match)) {
      count++;
      return '\n';
    }
    return match;
  });
  
  return { text, count };
}

/**
 * Remove publisher information
 * 
 * Patterns:
 * - Copyright notices (except legally required)
 * - Publisher names and addresses
 * - ISBN numbers
 * - Printing information
 */
function removePublisherInfo(text: string, preserveCopyright: boolean): { text: string; count: number } {
  let count = 0;
  
  // Pattern 1: ISBN numbers
  text = text.replace(/ISBN[:\s]*[\d-]{10,17}/gi, (match) => {
    count++;
    return '';
  });
  
  // Pattern 2: Copyright lines (if not preserving)
  if (!preserveCopyright) {
    text = text.replace(/Copyright\s+©?\s*\d{4}[^\n]{0,100}\n/gi, (match) => {
      count++;
      return '';
    });
  }
  
  // Pattern 3: Publisher addresses
  text = text.replace(/\n\s*\d+\s+[A-Z][a-z]+\s+(Street|Avenue|Road|Lane)[^\n]{0,100}\n/g, (match) => {
    count++;
    return '\n';
  });
  
  // Pattern 4: "Printed in [country]" statements
  text = text.replace(/\n\s*Printed\s+in\s+[A-Z][a-z]+[^\n]*\n/gi, (match) => {
    count++;
    return '\n';
  });
  
  return { text, count };
}

/**
 * Remove headers and footers (running heads)
 * 
 * Heuristics:
 * - Repeated text at top/bottom of pages
 * - Book title or author name repeated
 * - Chapter title repeated
 */
function removeHeadersFooters(text: string): { text: string; count: number } {
  let count = 0;
  
  // Detect repeated short lines (likely headers)
  const lines = text.split('\n');
  const lineFrequency = new Map<string, number>();
  
  // Count short lines that appear multiple times
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length < 60 && !/^Chapter/i.test(trimmed)) {
      lineFrequency.set(trimmed, (lineFrequency.get(trimmed) || 0) + 1);
    }
  }
  
  // Remove lines that appear 3+ times (likely headers/footers)
  const repeatedLines = new Set(
    Array.from(lineFrequency.entries())
      .filter(([_, freq]) => freq >= 3)
      .map(([line, _]) => line)
  );
  
  if (repeatedLines.size > 0) {
    text = lines
      .map(line => {
        const trimmed = line.trim();
        if (repeatedLines.has(trimmed)) {
          count++;
          return '';
        }
        return line;
      })
      .join('\n');
  }
  
  return { text, count };
}

/**
 * Clean up excessive whitespace
 * 
 * - Multiple blank lines → 2 blank lines max
 * - Trailing spaces
 * - Mixed line endings
 */
function normalizeWhitespace(text: string): string {
  // Normalize line endings
  text = text.replace(/\r\n/g, '\n');
  
  // Remove trailing spaces
  text = text.replace(/ +$/gm, '');
  
  // Max 2 consecutive blank lines
  text = text.replace(/\n{4,}/g, '\n\n\n');
  
  // Remove leading/trailing whitespace
  text = text.trim();
  
  return text;
}

/**
 * Main text cleaning function
 * 
 * @param text - Raw text to clean
 * @param config - Cleaning configuration
 * @returns Cleaning result with cleaned text and statistics
 */
export function cleanText(
  text: string,
  config: CleaningConfig = DEFAULT_CLEANING_CONFIG
): CleaningResult {
  const originalLength = text.length;
  const patternsMatched: string[] = [];
  const warnings: string[] = [];
  
  let cleanedText = text;
  
  // Step 1: Remove page numbers
  if (config.removePageNumbers) {
    const result = removePageNumbers(cleanedText);
    cleanedText = result.text;
    if (result.count > 0) {
      patternsMatched.push(`Page numbers (${result.count})`);
    }
  }
  
  // Step 2: Remove table of contents
  if (config.removeTableOfContents) {
    const result = removeTableOfContents(cleanedText);
    cleanedText = result.text;
    if (result.removed) {
      patternsMatched.push('Table of contents');
    }
  }
  
  // Step 3: Remove editorial notes
  if (config.removeEditorialNotes) {
    const result = removeEditorialNotes(cleanedText, config.aggressive);
    cleanedText = result.text;
    if (result.count > 0) {
      patternsMatched.push(`Editorial notes (${result.count})`);
    }
  }
  
  // Step 4: Remove publisher info
  if (config.removePublisherInfo) {
    const result = removePublisherInfo(cleanedText, config.preserveCopyright);
    cleanedText = result.text;
    if (result.count > 0) {
      patternsMatched.push(`Publisher info (${result.count})`);
    }
  }
  
  // Step 5: Remove headers/footers
  if (config.removeHeadersFooters) {
    const result = removeHeadersFooters(cleanedText);
    cleanedText = result.text;
    if (result.count > 0) {
      patternsMatched.push(`Headers/footers (${result.count})`);
      if (result.count > 100) {
        warnings.push('Many repeated lines removed - verify no story content lost');
      }
    }
  }
  
  // Step 6: Normalize whitespace
  cleanedText = normalizeWhitespace(cleanedText);
  
  // Calculate statistics
  const cleanedLength = cleanedText.length;
  const bytesRemoved = originalLength - cleanedLength;
  const percentRemoved = ((bytesRemoved / originalLength) * 100).toFixed(1);
  
  // Warnings
  if (bytesRemoved > originalLength * 0.3) {
    warnings.push(`${percentRemoved}% of text removed - verify accuracy`);
  }
  
  return {
    cleanedText,
    originalLength,
    cleanedLength,
    bytesRemoved,
    patternsMatched,
    warnings,
  };
}

/**
 * Clean text for EPUB format specifically
 * 
 * EPUB-specific considerations:
 * - HTML tags already stripped by parser
 * - Focus on structural elements
 * - More aggressive cleaning possible
 */
export function cleanEpubText(text: string): CleaningResult {
  const config: CleaningConfig = {
    ...DEFAULT_CLEANING_CONFIG,
    aggressive: true, // EPUBs have cleaner structure
    removeHeadersFooters: false, // Usually already handled by EPUB parser
  };
  
  return cleanText(text, config);
}

/**
 * Clean text for plain TXT format
 * 
 * TXT-specific considerations:
 * - More varied formatting
 * - More conservative approach
 * - Preserve more potential story content
 */
export function cleanPlainText(text: string): CleaningResult {
  const config: CleaningConfig = {
    ...DEFAULT_CLEANING_CONFIG,
    aggressive: false, // Conservative for plain text
  };
  
  return cleanText(text, config);
}
```

---

### Backend: Token Count Test (LLM token estimation utilities)
**File:** `apps/backend/src/tokenCountTest.ts` | **Size:** 9.3 KB | **Lines:** 200

```typescript
/**
 * Token Count Test - Validate tokens/word coefficient for Czech/Slovak
 * 
 * Uses Google Vertex AI CountTokens API to get exact token counts.
 * Run with: npx ts-node src/tokenCountTest.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || '';
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const MODEL = 'gemini-2.5-flash';

interface TokenCountResponse {
  totalTokens: number;
  totalBillableCharacters?: number;
}

// Slovak text sample (Harry Potter opening paragraph)
const SLOVAK_TEXT = `Pán a pani Dursleyoví z domu číslo štyri na Privátnej ulici boli hrdí na to, že sú úplne normálni, 
ďakujeme pekne. Boli to poslední ľudia, od ktorých by ste čakali, že budú zapletení do niečoho zvláštneho 
alebo tajomného, pretože o takých nezmysloch jednoducho nechceli nič počuť. Pán Dursley bol riaditeľom 
firmy menom Grunnings, ktorá vyrábala vrtáky. Bol to veľký, mäsitý muž takmer bez krku, hoci mal 
veľmi veľké fúzy. Pani Dursleyová bola chudá a plavovlasá a mala takmer dvakrát taký dlhý krk ako 
normálni ľudia, čo sa jej veľmi hodilo, keďže trávila toľko času naťahovaním sa ponad záhradný plot 
a špehovaním susedov. Dursleyoví mali malého syna menom Dudley a podľa ich názoru neexistovalo 
krajšie dieťa na celom svete.`;

// Czech text sample (Harry Potter opening paragraph)  
const CZECH_TEXT = `Pan a paní Dursleyovi z domu číslo čtyři v Zobí ulici byli hrdi na to, že jsou naprosto 
normální, moc vám děkuji. Byli to poslední lidé, od kterých byste čekali, že budou zapleteni do něčeho 
zvláštního nebo tajemného, protože o takových nesmyslech prostě nechtěli nic slyšet. Pan Dursley byl 
ředitelem firmy jménem Grunnings, která vyráběla vrtáky. Byl to velký, masitý muž téměř bez krku, 
i když měl velice velké kníry. Paní Dursleyová byla hubená a plavovlasá a měla téměř dvakrát tak 
dlouhý krk jako normální lidé, což se jí velmi hodilo, protože trávila tolik času natahováním se přes 
zahradní plot a šmírováním sousedů. Dursleyovi měli malého syna jménem Dudley a podle jejich názoru 
neexistovalo krásnější dítě na celém světě.`;

// English text sample (Harry Potter opening paragraph) - for comparison
const ENGLISH_TEXT = `Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were 
perfectly normal, thank you very much. They were the last people you'd expect to be involved in anything 
strange or mysterious, because they just didn't hold with such nonsense. Mr. Dursley was the director of 
a firm called Grunnings, which made drills. He was a big, beefy man with hardly any neck, although he 
did have a very large mustache. Mrs. Dursley was thin and blonde and had nearly twice the usual amount 
of neck, which came in very useful as she spent so much of her time craning over garden fences, spying 
on the neighbors. The Dursleys had a small son called Dudley and in their opinion there was no finer 
boy anywhere.`;

async function countTokens(text: string): Promise<TokenCountResponse> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  
  if (!accessToken.token) {
    throw new Error('Failed to get access token');
  }
  
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:countTokens`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text }]
      }]
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CountTokens API error: ${response.status} - ${error}`);
  }
  
  return await response.json() as TokenCountResponse;
}

function countWords(text: string): number {
  // Remove punctuation and split by whitespace
  const cleaned = text.replace(/[„""\'''«»‹›,\.!?;:—–\-\(\)\[\]]/g, ' ');
  return cleaned.split(/\s+/).filter(w => w.length > 0).length;
}

function countChars(text: string): number {
  return text.length;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('        VOICELIBRI - TOKEN COEFFICIENT VALIDATION');
  console.log('        Using Google Vertex AI CountTokens API');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  
  const samples = [
    { name: 'Slovak', text: SLOVAK_TEXT },
    { name: 'Czech', text: CZECH_TEXT },
    { name: 'English', text: ENGLISH_TEXT },
  ];
  
  const results: Array<{
    name: string;
    tokens: number;
    words: number;
    chars: number;
    tokensPerWord: number;
    charsPerToken: number;
  }> = [];
  
  for (const sample of samples) {
    console.log(`\n📊 Analyzing ${sample.name} text...`);
    
    try {
      const tokenResult = await countTokens(sample.text);
      const words = countWords(sample.text);
      const chars = countChars(sample.text);
      const tokens = tokenResult.totalTokens;
      
      const tokensPerWord = tokens / words;
      const charsPerToken = chars / tokens;
      
      results.push({
        name: sample.name,
        tokens,
        words,
        chars,
        tokensPerWord,
        charsPerToken,
      });
      
      console.log(`   Characters: ${chars}`);
      console.log(`   Words: ${words}`);
      console.log(`   Tokens: ${tokens}`);
      console.log(`   Tokens/Word: ${tokensPerWord.toFixed(3)}`);
      console.log(`   Chars/Token: ${charsPerToken.toFixed(3)}`);
      
    } catch (error) {
      console.error(`   ❌ Error: ${error}`);
    }
  }
  
  // Calculate average for Slavic languages (SK + CZ)
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('                           RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════');
  
  const slavicResults = results.filter(r => r.name === 'Slovak' || r.name === 'Czech');
  const englishResult = results.find(r => r.name === 'English');
  
  if (slavicResults.length === 2) {
    const avgTokensPerWord = (slavicResults[0].tokensPerWord + slavicResults[1].tokensPerWord) / 2;
    const avgCharsPerToken = (slavicResults[0].charsPerToken + slavicResults[1].charsPerToken) / 2;
    
    console.log('\n📌 SLAVIC LANGUAGES (Czech + Slovak average):');
    console.log(`   Slovak tokens/word:  ${slavicResults.find(r => r.name === 'Slovak')?.tokensPerWord.toFixed(3)}`);
    console.log(`   Czech tokens/word:   ${slavicResults.find(r => r.name === 'Czech')?.tokensPerWord.toFixed(3)}`);
    console.log(`   ────────────────────────────────────────`);
    console.log(`   AVERAGE tokens/word: ${avgTokensPerWord.toFixed(3)}`);
    console.log(`   AVERAGE chars/token: ${avgCharsPerToken.toFixed(3)}`);
    
    console.log('\n📌 ENGLISH (for comparison):');
    if (englishResult) {
      console.log(`   tokens/word: ${englishResult.tokensPerWord.toFixed(3)}`);
      console.log(`   chars/token: ${englishResult.charsPerToken.toFixed(3)}`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('                    RECOMMENDED CONSTANTS FOR VOICELIBRI');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`
// Token estimation by language
export const TOKEN_COEFFICIENTS = {
  // Slavic languages (validated with Gemini CountTokens API)
  SLAVIC_TOKENS_PER_WORD: ${avgTokensPerWord.toFixed(2)},
  
  // English (for comparison)
  ENGLISH_TOKENS_PER_WORD: ${englishResult?.tokensPerWord.toFixed(2) || '1.33'},
  
  // Fallback for unknown languages
  DEFAULT_TOKENS_PER_WORD: ${((avgTokensPerWord + (englishResult?.tokensPerWord || 1.33)) / 2).toFixed(2)},
};

// Usage: 
// const tokens = wordCount * TOKEN_COEFFICIENTS.SLAVIC_TOKENS_PER_WORD;
`);
  }
}

main().catch(console.error);
```

---

### Backend: TTS Client (Gemini TTS integration, multi-speaker synthesis)
**File:** `apps/backend/src/ttsClient.ts` | **Size:** 17.5 KB | **Lines:** 495

```typescript
import { GoogleAuth } from 'google-auth-library';

interface TTSConfig {
  projectId: string;
  location: string;
}

/**
 * Speaker configuration for multi-speaker TTS
 */
export interface SpeakerConfig {
  speaker: string;
  voiceName: string;
}

// Note: TTS functions return Buffer directly (simplified - no metadata extraction needed)

/**
 * Map short language codes to BCP-47 format required by Cloud TTS API.
 * Cloud TTS VoiceSelectionParams.languageCode is REQUIRED.
 */
const LANG_CODE_TO_BCP47: Record<string, string> = {
  'sk': 'sk-SK',
  'cs': 'cs-CZ',
  'en': 'en-US',
  'de': 'de-DE',
  'ru': 'ru-RU',
  'pl': 'pl-PL',
  'hr': 'hr-HR',
  'zh': 'cmn-CN',
  'nl': 'nl-NL',
  'fr': 'fr-FR',
  'hi': 'hi-IN',
  'it': 'it-IT',
  'ja': 'ja-JP',
  'ko': 'ko-KR',
  'pt': 'pt-BR',
  'es': 'es-ES',
  'uk': 'uk-UA',
};

/**
 * Convert language code to BCP-47 format.
 * Handles short codes ('sk') and full BCP-47 codes ('sk-SK').
 */
function toBCP47(langCode: string): string {
  if (langCode.includes('-')) return langCode;
  return LANG_CODE_TO_BCP47[langCode.toLowerCase()] || `${langCode}-${langCode.toUpperCase()}`;
}

/**
 * Resolve BCP-47 language code for TTS API (required field).
 * Priority: explicit param > TARGET_LANGUAGE global > BOOK_METADATA.language > fallback 'en-US'
 */
function resolveLanguageCode(explicitCode?: string): string {
  if (explicitCode) return toBCP47(explicitCode);
  const targetLang = (global as any).TARGET_LANGUAGE;
  if (targetLang) return toBCP47(targetLang);
  const bookLang = (global as any).BOOK_METADATA?.language;
  if (bookLang) return toBCP47(bookLang);
  return 'en-US'; // safe fallback
}

/**
 * Gemini TTS model to use
 * TTS model configured via environment variable
 */
const TTS_MODEL = process.env.TTS_MODEL || 'gemini-2.5-flash-tts';

/**
 * Resolves the Cloud Text-to-Speech API endpoint based on location.
 * 
 * Cloud TTS API endpoint format per official docs:
 *   - Global: texttospeech.googleapis.com
 *   - Regional: {REGION}-texttospeech.googleapis.com
 * 
 * Supported regions for Gemini TTS: global, us, eu
 * We map Vertex AI region names to Cloud TTS region names.
 */
function getTtsEndpoint(location: string): string {
  // Map Vertex AI locations to Cloud TTS regions
  // Cloud TTS supports: global, us, eu, northamerica-northeast1
  // Vertex AI uses: us-central1, europe-west1, etc.
  const regionMap: Record<string, string> = {
    'us-central1': 'us',
    'us-east1': 'us',
    'us-east4': 'us',
    'us-east5': 'us',
    'us-south1': 'us',
    'us-west1': 'us',
    'us-west4': 'us',
    'europe-west1': 'eu',
    'europe-west4': 'eu',
    'europe-central2': 'eu',
    'europe-north1': 'eu',
    'europe-southwest1': 'eu',
    'northamerica-northeast1': 'northamerica-northeast1',
    'global': 'global',
  };

  const ttsRegion = regionMap[location] || 'us';
  if (ttsRegion === 'global') {
    return 'https://texttospeech.googleapis.com';
  }
  return `https://${ttsRegion}-texttospeech.googleapis.com`;
}



export class TTSClient {
  private projectId: string;
  private location: string;
  private ttsBaseUrl: string;
  private auth: GoogleAuth;

  constructor(config: TTSConfig) {
    this.projectId = config.projectId;
    this.location = config.location;
    this.ttsBaseUrl = getTtsEndpoint(config.location);
    // GoogleAuth will automatically use GOOGLE_APPLICATION_CREDENTIALS env var
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }

  /**
   * Synthesizes text to audio using Cloud Text-to-Speech API (Gemini TTS)
   * Single-speaker mode using voice name
   * 
   * Uses the Cloud TTS API with LINEAR16 encoding for lossless PCM quality.
   * Returns WAV buffer (with header) — downstream pipeline handles WAV→OGG conversion
   * at chapter consolidation for optimal single-encode quality.
   * 
   * @param text - The text to synthesize
   * @param voiceName - The Gemini voice name to use (e.g., 'Algieba', 'Puck', 'Zephyr')
   * @param style - Voice style modifier: 'normal', 'whisper', 'thought', 'letter'
   * @param speechStyle - Optional custom speech style instruction (natural sentence like "Speak slowly with gravelly voice.")
   * @param languageCode - Optional language code to force (e.g., 'cs-CZ') - used for single-word texts to prevent misdetection
   * @returns Buffer containing audio data (WAV LINEAR16 format)
   */
  async synthesizeText(
    text: string, 
    voiceName: string = 'Algieba',
    style: 'normal' | 'whisper' | 'thought' | 'letter' = 'normal',
    speechStyle?: string,
    languageCode?: string
  ): Promise<Buffer> {
    const endpoint = `${this.ttsBaseUrl}/v1/text:synthesize`;

    // Get access token
    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }

    // Cloud TTS API has separate `text` and `prompt` fields in SynthesisInput.
    // `text`: the actual text to speak (passed unedited to TTS)
    // `prompt`: style/voice instructions (system instruction for controllable models)
    let promptText: string | undefined;
    
    // Check word count (after removing punctuation)
    const cleanText = text.replace(/["„"'«»‹›,\.!?;:—–-]/g, '').trim();
    const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;
    const isShortText = wordCount <= 3;
    
    if (speechStyle) {
      // Use speech style directive directly as prompt
      promptText = speechStyle.replace(/\.$/, '').trim();
    } else if (!isShortText) {
      // Apply basic style presets (only for >3 words)
      switch (style) {
        case 'whisper':
          promptText = 'Speak in a hushed whisper';
          break;
        case 'thought':
          promptText = 'Speak as an internal thought';
          break;
        case 'letter':
          promptText = 'Read aloud';
          break;
        case 'normal':
        default:
          // No prompt for normal style
          break;
      }
    }

    // Build SynthesisInput per Cloud TTS API spec
    const input: any = { text };
    if (promptText) {
      input.prompt = promptText;
    }

    // Build VoiceSelectionParams per Cloud TTS API spec
    // languageCode is REQUIRED by the Cloud TTS API
    const resolvedLang = resolveLanguageCode(languageCode);
    const voice: any = {
      name: voiceName,
      modelName: TTS_MODEL,
      languageCode: resolvedLang,
    };
    console.log(`  \uD83D\uDD24 TTS language_code: ${resolvedLang}${languageCode ? ' (explicit)' : ' (auto-resolved)'}`);

    // AudioConfig: LINEAR16 (lossless PCM) — WAV→OGG conversion happens at chapter consolidation
    const audioConfig = {
      audioEncoding: 'LINEAR16',
    };

    const requestBody = { input, voice, audioConfig };

    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`  🔄 Retry ${attempt}/${maxRetries} after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const styleDesc = speechStyle 
          ? ` ${speechStyle.substring(0, 50)}...` 
          : (style !== 'normal' ? ` [${style.toUpperCase()}]` : '');
        console.log(`🎤 TTS API call - Text: ${text.length} chars, Voice: ${voiceName}${styleDesc}`);
        const startTime = Date.now();
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(120000), // 120 second timeout
        });

        const fetchTime = Date.now() - startTime;
        console.log(`⏱️ TTS API response received in ${fetchTime}ms`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Cloud TTS API Error:', errorText);
          
          // Retry on 500 errors (server-side issues)
          if (response.status >= 500 && attempt < maxRetries) {
            lastError = new Error(`Cloud TTS API returned ${response.status}: ${errorText}`);
            continue;
          }
          
          throw new Error(`Cloud TTS API returned ${response.status}: ${errorText}`);
        }

        // Cloud TTS API returns { audioContent: "<base64 encoded LINEAR16 WAV>" }
        const jsonResponse: any = await response.json();
        const audioContent = jsonResponse.audioContent;
        
        if (!audioContent) {
          console.error('Full response:', JSON.stringify(jsonResponse, null, 2));
          throw new Error('No audioContent received from Cloud TTS API');
        }

        // LINEAR16 returns WAV with header — lossless, ready for sub-chunk storage
        const wavBuffer = Buffer.from(audioContent, 'base64');
        console.log(`✅ WAV audio received: ${wavBuffer.length} bytes (LINEAR16 from API)`);
        
        return wavBuffer;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Retry on network/timeout errors
        if (attempt < maxRetries && (
          lastError.message.includes('500') ||
          lastError.message.includes('timeout') ||
          lastError.message.includes('ECONNRESET') ||
          lastError.message.includes('fetch failed')
        )) {
          continue;
        }
        
        console.error('❌ Cloud TTS Error:', error);
        throw new Error(`Failed to synthesize text: ${lastError.message}`);
      }
    }
    
    // All retries exhausted
    throw new Error(`Failed to synthesize text after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Synthesizes multi-speaker text to audio using Gemini TTS
   * 
   * Uses the Cloud TTS API multiSpeakerVoiceConfig for true multi-voice synthesis
   * in a SINGLE API call (up to 2 speakers per call per API limitation).
   * 
   * Text format must use "Speaker: text" format, e.g.:
   *   "NARRATOR: Once upon a time...
   *    JOE: Hello there!"
   * 
   * @param text - Text with speaker labels
   * @param speakers - Array of speaker configurations (max 2)
   * @returns Buffer containing audio data (WAV LINEAR16 format)
   */
  async synthesizeMultiSpeaker(
    text: string,
    speakers: SpeakerConfig[]
  ): Promise<Buffer> {
    if (speakers.length > 2) {
      throw new Error('Gemini TTS supports maximum 2 speakers per API call');
    }

    if (speakers.length === 0) {
      throw new Error('At least one speaker configuration is required');
    }

    const endpoint = `${this.ttsBaseUrl}/v1/text:synthesize`;

    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }

    // Build multi-speaker voice config per Cloud TTS API spec
    // Uses speakerAlias (label in text) and speakerId (voice name)
    const speakerVoiceConfigs = speakers.map(s => ({
      speakerAlias: s.speaker,
      speakerId: s.voiceName,
    }));

    // Cloud TTS API has a dedicated `prompt` field for style instructions
    // This is separate from the text and goes into SynthesisInput.prompt
    const speakerList = speakers.map(s => s.speaker).join(', ');
    const promptText = `VOICE RULE: SWITCH VOICE IMMEDIATELY AT EACH SPEAKER LABEL! Labels: ${speakerList}\nSTYLE: Read as a world-class voice artist with immersive, expressive, yet natural elocution, rich variety of expressive means, expressing the speakers emotions, story events and environment by highly adaptive prosody.`;

    // Build request per Cloud TTS API spec
    // languageCode is REQUIRED by the Cloud TTS API
    const resolvedLang = resolveLanguageCode();
    console.log(`  \uD83D\uDD24 Multi-speaker TTS language_code: ${resolvedLang}`);
    const requestBody = {
      input: {
        text: text,
        prompt: promptText,
      },
      voice: {
        languageCode: resolvedLang,
        modelName: TTS_MODEL,
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: speakerVoiceConfigs,
        },
      },
      audioConfig: {
        audioEncoding: 'LINEAR16',
      },
    };

    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`  🔄 Multi-speaker retry ${attempt}/${maxRetries} after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        console.log(`🎤 Multi-speaker TTS: ${text.length} chars, ${speakers.length} speakers: ${speakers.map(s => `${s.speaker}→${s.voiceName}`).join(', ')}`);
        const startTime = Date.now();

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(180000), // 3 minute timeout for longer texts
        });

        const fetchTime = Date.now() - startTime;
        console.log(`⏱️ Multi-speaker TTS response in ${fetchTime}ms`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Cloud TTS Multi-Speaker Error:', errorText);
          
          // Retry on 500 errors
          if (response.status >= 500 && attempt < maxRetries) {
            lastError = new Error(`Cloud TTS API returned ${response.status}: ${errorText}`);
            continue;
          }
          
          throw new Error(`Cloud TTS API returned ${response.status}: ${errorText}`);
        }

        // Cloud TTS API returns { audioContent: "<base64 encoded LINEAR16 WAV>" }
        const jsonResponse: any = await response.json();
        const audioContent = jsonResponse.audioContent;

        if (!audioContent) {
          console.error('Full response:', JSON.stringify(jsonResponse, null, 2));
          throw new Error('No audioContent received from multi-speaker TTS');
        }

        // LINEAR16 returns WAV with header — lossless, ready for sub-chunk storage
        const wavBuffer = Buffer.from(audioContent, 'base64');
        console.log(`✅ Multi-speaker WAV audio: ${wavBuffer.length} bytes (LINEAR16 from API)`);

        return wavBuffer;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Retry on network/timeout/500 errors
        if (attempt < maxRetries && (
          lastError.message.includes('500') ||
          lastError.message.includes('timeout') ||
          lastError.message.includes('ECONNRESET') ||
          lastError.message.includes('fetch failed')
        )) {
          continue;
        }
        
        console.error('❌ Multi-speaker Cloud TTS Error:', error);
        throw new Error(`Multi-speaker synthesis failed: ${lastError.message}`);
      }
    }
    
    // All retries exhausted
    throw new Error(`Multi-speaker synthesis failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`);
  }
}

// ========================================
// Convenience functions (stateless)
// ========================================

export async function synthesizeText(
  text: string, 
  voiceName: string = 'Algieba',
  style: 'normal' | 'whisper' | 'thought' | 'letter' = 'normal',
  speechStyle?: string,
  languageCode?: string
): Promise<Buffer> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT is not set in environment variables');
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set in environment variables');
  }

  const ttsClient = new TTSClient({ projectId, location });
  return ttsClient.synthesizeText(text, voiceName, style, speechStyle, languageCode);
}

/**
 * Synthesize multi-speaker audio (up to 2 speakers per API call)
 * 
 * Text format: "Speaker: text" on each line
 * Example:
 *   NARRATOR: Once upon a time...
 *   JOE: Hello there!
 * 
 * @param text - Text with speaker labels matching speaker configs
 * @param speakers - Speaker configurations (max 2)
 * @returns WAV LINEAR16 audio buffer
 */
export async function synthesizeMultiSpeaker(
  text: string,
  speakers: SpeakerConfig[]
): Promise<Buffer> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT is not set in environment variables');
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set in environment variables');
  }

  const ttsClient = new TTSClient({ projectId, location });
  return ttsClient.synthesizeMultiSpeaker(text, speakers);
}
```

---

### Backend: Two-Speaker Chunker (Gemini 2-speaker limit enforcement)
**File:** `apps/backend/src/twoSpeakerChunker.ts` | **Size:** 13.7 KB | **Lines:** 404

```typescript
/**
 * Two-Speaker Chunker - Smart chunking for Gemini TTS multi-speaker API
 * 
 * Gemini TTS multiSpeakerVoiceConfig supports maximum 2 speakers per API call.
 * This module chunks dramatized text into segments that:
 * 1. Contain at most 2 unique speakers (NARRATOR + 1 character, or 2 characters)
 * 2. Stay within 2500 bytes limit (Gemini TTS hard limit is 4000 bytes, leaving allowance for sentence completion and directives)
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
  /** Maximum bytes per chunk (Gemini TTS hard limit is 4000 bytes) */
  maxBytes: number;
  /** Preferred minimum bytes per chunk (avoid tiny chunks) */
  minBytes: number;
}

const DEFAULT_CONFIG: TwoSpeakerChunkConfig = {
  maxBytes: 2500,   // 4000 byte hard limit - allowance for sentence completion and directives
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
export function formatForMultiSpeakerTTS(segments: Array<{ speaker: string; text: string; speechStyle?: string }>): string {
  // CRITICAL FIX: Merge consecutive segments from same speaker to avoid very short segments
  // Short segments (especially narrator interruptions) cause TTS voice errors 80%+ of the time
  const mergedSegments: Array<{ speaker: string; text: string; speechStyle?: string }> = [];
  
  for (const seg of segments) {
    const lastSeg = mergedSegments[mergedSegments.length - 1];
    
    if (lastSeg && lastSeg.speaker === seg.speaker && lastSeg.speechStyle === seg.speechStyle) {
      // Same speaker - merge text with a space
      lastSeg.text += ' ' + seg.text;
    } else {
      // Different speaker or first segment - add new entry
      mergedSegments.push({ speaker: seg.speaker, text: seg.text, speechStyle: seg.speechStyle });
    }
  }
  
  // Format: "Speaker: text" on each line (Gemini TTS official format)
  const lines: string[] = [];
  for (const seg of mergedSegments) {
    if (seg.speechStyle) {
      lines.push(`${seg.speechStyle.replace(/\.$/, '').trim()}`);
    }
    lines.push(`${seg.speaker}: ${seg.text}`);
  }
  return lines.join('\n');
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
    const directiveText = segment.speechStyle ? `${segment.speechStyle.replace(/\.$/, '').trim()}:\n` : '';
    const segmentBytes = Buffer.byteLength(directiveText + segmentText, 'utf8') + 1; // +1 for newline

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
```

---

### Backend: Voice Assigner (character-to-voice mapping logic)
**File:** `apps/backend/src/voiceAssigner.ts` | **Size:** 5.8 KB | **Lines:** 188

```typescript
/**
 * Voice Assigner - Character to Voice Mapping
 * 
 * Automatically assigns unique Gemini TTS voices to characters based on:
 * - Gender matching
 * - Pitch preferences (age, authority)
 * - Character traits
 * 
 * Part of Dramatized TTS implementation (PoC Phase)
 */

import { selectVoiceForCharacter, GeminiVoice } from './geminiVoices.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Character profile from LLM analysis
 */
export interface Character {
  name: string;
  gender: 'male' | 'female' | 'neutral';
  traits: string[];
  dialogueExamples?: string[];
  ageRange?: string;  // 'child', 'young adult', 'adult', 'elderly'
  dialogueCount?: number;  // For sorting by importance
}

/**
 * Voice mapping: Character name -> Gemini voice name
 * Special key: "NARRATOR" -> "USER_SELECTED" (runtime placeholder)
 */
export interface VoiceMap {
  [characterName: string]: string;
}

/**
 * Assign unique Gemini voices to all characters
 * 
 * Algorithm:
 * 1. NARRATOR always gets "USER_SELECTED" placeholder
 * 2. For each character, select best matching voice based on:
 *    - Gender match (priority)
 *    - Pitch match (age inference)
 *    - Trait characteristics
 * 3. Ensure each character gets a UNIQUE voice (no duplicates)
 * 4. Exclude narrator's voice from character assignments (if provided)
 * 
 * @param characters - Array of character profiles from LLM analysis
 * @param narratorVoiceName - Optional narrator voice to exclude from character assignments
 * @returns VoiceMap object with character -> voice mappings
 */
export function assignVoices(characters: Character[], narratorVoiceName?: string): VoiceMap {
  const voiceMap: VoiceMap = {};
  
  const usedVoices = new Set<string>();
  
  // Exclude narrator's voice from character assignments
  if (narratorVoiceName && narratorVoiceName !== 'USER_SELECTED') {
    usedVoices.add(narratorVoiceName);
    console.log(`[VoiceAssigner] Narrator voice "${narratorVoiceName}" excluded from character assignments`);
  }
  
  // Sort characters by dialogue count (main characters first)
  const sortedCharacters = [...characters].sort((a, b) => {
    const aDialogue = a.dialogueCount || a.dialogueExamples?.length || 0;
    const bDialogue = b.dialogueCount || b.dialogueExamples?.length || 0;
    return bDialogue - aDialogue;
  });
  
  for (const char of sortedCharacters) {
    const voice = selectVoiceForCharacter(
      char.name,
      char.gender,
      char.traits,
      Array.from(usedVoices),
      char.ageRange  // Pass age range for pitch selection
    );
    
    voiceMap[char.name] = voice.name;
    usedVoices.add(voice.name);
    
    console.log(`[VoiceAssigner] ${char.name} (${char.gender}, age:${char.ageRange || 'unknown'}, ${char.traits.join(', ')}) -> ${voice.name} (${voice.pitch} pitch, ${voice.characteristic})`);
  }
  
  return voiceMap;
}

/**
 * Save voice map to JSON file
 * 
 * Output format:
 * {
 *   "NARRATOR": "USER_SELECTED",
 *   "RAGOWSKI": "Schedar",
 *   "LILI": "Vindemiatrix"
 * }
 * 
 * @param voiceMap - Voice mapping object
 * @param outputPath - Absolute path to output JSON file
 */
export async function saveVoiceMap(voiceMap: VoiceMap, outputPath: string): Promise<void> {
  try {
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write JSON with pretty formatting
    await fs.writeFile(
      outputPath,
      JSON.stringify(voiceMap, null, 2),
      'utf-8'
    );
    
    console.log(`[VoiceAssigner] Voice map saved to: ${outputPath}`);
    console.log(`[VoiceAssigner] Total characters: ${Object.keys(voiceMap).length - 1} (+ NARRATOR)`);
  } catch (error) {
    console.error('[VoiceAssigner] Failed to save voice map:', error);
    throw error;
  }
}

/**
 * Load voice map from JSON file
 * 
 * @param inputPath - Absolute path to voice map JSON file
 * @returns VoiceMap object
 */
export async function loadVoiceMap(inputPath: string): Promise<VoiceMap> {
  try {
    const content = await fs.readFile(inputPath, 'utf-8');
    const voiceMap: VoiceMap = JSON.parse(content);
    
    console.log(`[VoiceAssigner] Voice map loaded from: ${inputPath}`);
    console.log(`[VoiceAssigner] Characters found: ${Object.keys(voiceMap).join(', ')}`);
    
    return voiceMap;
  } catch (error) {
    console.error('[VoiceAssigner] Failed to load voice map:', error);
    throw error;
  }
}

/**
 * Validate voice map
 * 
 * Checks:
 * - NARRATOR exists
 * - All character names are UPPERCASE
 * - No duplicate voice assignments (except USER_SELECTED)
 * 
 * @param voiceMap - Voice mapping object
 * @returns true if valid, throws error otherwise
 */
export function validateVoiceMap(voiceMap: VoiceMap): boolean {
  // Check NARRATOR exists
  if (!voiceMap.NARRATOR) {
    throw new Error('Voice map must contain NARRATOR');
  }
  
  // Check character names are uppercase
  for (const charName of Object.keys(voiceMap)) {
    if (charName !== charName.toUpperCase()) {
      throw new Error(`Character name must be uppercase: ${charName}`);
    }
  }
  
  // Check for duplicate voice assignments
  const voiceUsage = new Map<string, string[]>();
  for (const [charName, voiceName] of Object.entries(voiceMap)) {
    if (voiceName === 'USER_SELECTED') continue; // Skip placeholder
    
    if (!voiceUsage.has(voiceName)) {
      voiceUsage.set(voiceName, []);
    }
    voiceUsage.get(voiceName)!.push(charName);
  }
  
  // Report duplicates
  for (const [voiceName, characters] of voiceUsage.entries()) {
    if (characters.length > 1) {
      throw new Error(`Voice ${voiceName} assigned to multiple characters: ${characters.join(', ')}`);
    }
  }
  
  console.log('[VoiceAssigner] Voice map validation passed ✓');
  return true;
}
```

---

### Config: Backend package.json (dependencies)
**File:** `apps/backend/package.json` | **Size:** 1.1 KB | **Lines:** 44

```json
{
  "name": "backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:once": "vitest run"
  },
  "dependencies": {
    "@google-cloud/text-to-speech": "^5.4.0",
    "@google-cloud/vertexai": "^1.7.0",
    "@google/generative-ai": "^0.24.1",
    "@lingo-reader/mobi-parser": "^0.4.5",
    "@types/cheerio": "^0.22.35",
    "adm-zip": "^0.5.16",
    "cheerio": "^1.1.2",
    "cors": "^2.8.5",
    "dotenv": "^16.6.1",
    "express": "^4.18.2",
    "fast-xml-parser": "^5.3.2",
    "google-auth-library": "^9.0.0",
    "mammoth": "^1.11.0",
    "marked": "^17.0.1",
    "odt2html": "^1.0.1",
    "pdf-parse": "^2.4.5",
    "rtf-parser": "^1.3.3",
    "wav": "^1.0.2"
  },
  "devDependencies": {
    "@types/adm-zip": "^0.5.7",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.5",
    "@types/wav": "^1.0.2",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.0.4"
  }
}
```

---

### Config: Backend TypeScript config
**File:** `apps/backend/tsconfig.json` | **Size:** 0.6 KB | **Lines:** 22

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "../../",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*", "../../soundscape/src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

### Config: Mobile app.json (Expo config)
**File:** `apps/mobile/app.json` | **Size:** 1 KB | **Lines:** 47

```json
{
  "expo": {
    "name": "VoiceLibri",
    "slug": "voicelibri",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "newArchEnabled": true,
    "scheme": "voicelibri",
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#0f172a"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.voicelibri.app",
      "infoPlist": {
        "UIBackgroundModes": ["audio"]
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0f172a"
      },
      "package": "com.voicelibri.app",
      "edgeToEdgeEnabled": true,
      "predictiveBackGestureEnabled": true
    },
    "web": {
      "bundler": "metro",
      "output": "single"
    },
    "plugins": [
      "expo-router",
      [
        "expo-audio",
        {
          "microphonePermission": false
        }
      ]
    ]
  }
}
```

---

### Config: Mobile package.json (dependencies)
**File:** `apps/mobile/package.json` | **Size:** 1.3 KB | **Lines:** 47

```json
{
  "name": "mobile",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios"
  },
  "dependencies": {
    "@expo/vector-icons": "^15.0.3",
    "@gorhom/bottom-sheet": "^5.2.8",
    "@react-native-async-storage/async-storage": "2.2.0",
    "@react-native-community/slider": "5.0.1",
    "@shopify/flash-list": "2.0.2",
    "@tanstack/react-query": "^5.64.0",
    "axios": "^1.7.0",
    "expo": "~54.0.31",
    "expo-audio": "~1.1.1",
    "expo-av": "~16.0.8",
    "expo-blur": "~15.0.8",
    "expo-document-picker": "~14.0.8",
    "expo-file-system": "~19.0.21",
    "expo-haptics": "~15.0.8",
    "expo-linear-gradient": "~15.0.8",
    "expo-linking": "~8.0.11",
    "expo-router": "~6.0.21",
    "expo-status-bar": "~3.0.9",
    "lottie-react-native": "~7.3.1",
    "moti": "^0.30.0",
    "react": "19.1.0",
    "react-native": "0.81.5",
    "react-native-gesture-handler": "~2.28.0",
    "react-native-reanimated": "~4.1.1",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0",
    "react-native-worklets": "0.5.1",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@babel/core": "^7.26.10",
    "@types/react": "~19.1.0",
    "typescript": "~5.9.2"
  },
  "private": true
}
```

---

### Config: Root package.json (workspace structure)
**File:** `package.json` | **Size:** 0.7 KB | **Lines:** 26

```json
{
  "name": "voicelibri",
  "version": "1.0.0",
  "description": "VoiceLibri - AI-Powered Multi-Voice Dramatized Audiobook Platform",
  "private": true,
  "workspaces": [
    "apps/backend",
    "apps/pwa-v2",
    "packages/*"
  ],
  "scripts": {
    "dev:backend": "npm run dev --workspace=apps/backend",
    "dev:pwa": "npm run dev --workspace=apps/pwa-v2 -- --port 5180",
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:pwa\"",
    "build:backend": "npm run build --workspace=apps/backend",
    "build:pwa": "npm run build --workspace=apps/pwa-v2",
    "build": "npm run build:backend && npm run build:pwa"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

### Config: Soundscape package.json
**File:** `soundscape/package.json` | **Size:** 0.1 KB | **Lines:** 7

```json
{
  "name": "soundscape",
  "version": "1.0.0",
  "private": true,
  "type": "module"
}
```

---

### Mobile: Audio Player Screen (playback UI)
**File:** `apps/mobile/app/player.tsx` | **Size:** 14.8 KB | **Lines:** 490

```tsx
/**
 * Full Player Screen
 * Immersive audio player with controls and chapter navigation
 * Integrates with expo-audio via audioService
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  Pressable,
  ScrollView,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Slider from '@react-native-community/slider';
import { usePlayerStore, useSettingsStore } from '../src/stores';
import { Text, Button } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeContext';
import { spacing, borderRadius, colors } from '../src/theme';
import {
  togglePlayPause,
  seekTo,
  skipForward as audioSkipForward,
  skipBackward as audioSkipBackward,
  nextChapter as audioNextChapter,
  previousChapter as audioPreviousChapter,
  setPlaybackRate as audioSetPlaybackRate,
} from '../src/services/audioService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const COVER_SIZE = SCREEN_WIDTH * 0.7;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function PlayerScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const {
    nowPlaying,
    currentChapterIndex,
    position,
    duration,
    isPlaying,
    playbackRate,
    setIsPlaying,
    setPosition,
    setPlaybackRate,
    skipForward,
    skipBackward,
    nextChapter,
    previousChapter,
  } = usePlayerStore();
  const { defaultPlaybackRate } = useSettingsStore();
  
  const [showChapters, setShowChapters] = useState(false);
  const [localPosition, setLocalPosition] = useState(position);
  const [isSeeking, setIsSeeking] = useState(false);
  
  const playButtonScale = useSharedValue(1);
  const coverRotation = useSharedValue(0);
  
  useEffect(() => {
    if (!isSeeking) {
      setLocalPosition(position);
    }
  }, [position, isSeeking]);
  
  // Subtle cover animation when playing
  useEffect(() => {
    if (isPlaying) {
      coverRotation.value = withRepeat(
        withTiming(360, { duration: 30000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      coverRotation.value = withTiming(0, { duration: 500 });
    }
  }, [isPlaying]);
  
  const handleBack = () => {
    Haptics.selectionAsync();
    router.back();
  };
  
  const handlePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playButtonScale.value = withSpring(0.9, {}, () => {
      playButtonScale.value = withSpring(1);
    });
    // Toggle playback via audio service
    togglePlayPause();
  };
  
  const handleSkipForward = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    audioSkipForward(30);
  };
  
  const handleSkipBackward = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    audioSkipBackward(15);
  };
  
  const handleNextChapter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    audioNextChapter();
  };
  
  const handlePreviousChapter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    audioPreviousChapter();
  };
  
  const handleSeekStart = () => {
    setIsSeeking(true);
  };
  
  const handleSeekEnd = (value: number) => {
    setIsSeeking(false);
    setPosition(value);
    seekTo(value);
  };
  
  const handlePlaybackRateCycle = () => {
    Haptics.selectionAsync();
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    const newRate = rates[nextIndex];
    setPlaybackRate(newRate);
    audioSetPlaybackRate(newRate);
  };
  
  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playButtonScale.value }],
  }));
  
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    backgroundImage: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 0.15,
    },
    gradient: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    headerButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitleText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    content: {
      flex: 1,
      justifyContent: 'space-between',
      paddingBottom: spacing.xl,
    },
    coverContainer: {
      alignItems: 'center',
      marginTop: spacing.xl,
    },
    cover: {
      width: COVER_SIZE,
      height: COVER_SIZE,
      borderRadius: borderRadius.xl,
      backgroundColor: theme.colors.cardElevated,
    },
    coverPlaceholder: {
      width: COVER_SIZE,
      height: COVER_SIZE,
      borderRadius: borderRadius.xl,
      backgroundColor: theme.colors.cardElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoContainer: {
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      marginTop: spacing.xl,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
    },
    author: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      marginTop: spacing.xs,
    },
    chapterInfo: {
      fontSize: 14,
      color: theme.colors.primary,
      marginTop: spacing.sm,
    },
    sliderContainer: {
      paddingHorizontal: spacing.lg,
      marginTop: spacing.xl,
    },
    slider: {
      width: '100%',
      height: 40,
    },
    timeContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: -spacing.sm,
    },
    timeText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    controlsContainer: {
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    mainControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
    },
    controlButton: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
    },
    skipButton: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    skipLabel: {
      fontSize: 10,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    playButton: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryControls: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      marginTop: spacing.xl,
    },
    speedButton: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.card,
    },
    speedText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
  });
  
  if (!nowPlaying) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <Pressable style={styles.headerButton} onPress={handleBack}>
            <Ionicons name="chevron-down" size={28} color={theme.colors.text} />
          </Pressable>
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="musical-notes-outline" size={60} color={theme.colors.textMuted} />
          <Text size="lg" color={theme.colors.textSecondary} center style={{ marginTop: spacing.md }}>
            No audiobook playing
          </Text>
          <Button
            title="Browse Library"
            variant="outline"
            onPress={handleBack}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      </SafeAreaView>
    );
  }
  
  const currentChapter = nowPlaying.chapters[currentChapterIndex];
  const progress = duration > 0 ? (localPosition / duration) * 100 : 0;
  
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Background */}
      {nowPlaying.coverUrl && (
        <Image
          source={{ uri: nowPlaying.coverUrl }}
          style={styles.backgroundImage}
          blurRadius={50}
        />
      )}
      <LinearGradient
        colors={[
          isDark ? 'rgba(15,23,42,0.5)' : 'rgba(255,255,255,0.7)',
          theme.colors.background,
        ]}
        style={styles.gradient}
      />
      
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <Animated.View entering={FadeIn} style={styles.header}>
          <Pressable style={styles.headerButton} onPress={handleBack}>
            <Ionicons name="chevron-down" size={28} color={theme.colors.text} />
          </Pressable>
          <View style={styles.headerTitle}>
            <Text style={styles.headerTitleText}>Now Playing</Text>
          </View>
          <Pressable style={styles.headerButton} onPress={() => setShowChapters(true)}>
            <Ionicons name="list" size={24} color={theme.colors.text} />
          </Pressable>
        </Animated.View>
        
        <View style={styles.content}>
          {/* Cover */}
          <Animated.View entering={FadeInDown.delay(100)} style={styles.coverContainer}>
            {nowPlaying.coverUrl ? (
              <Image source={{ uri: nowPlaying.coverUrl }} style={styles.cover} />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="book" size={80} color={theme.colors.textMuted} />
              </View>
            )}
          </Animated.View>
          
          {/* Info */}
          <Animated.View entering={FadeInDown.delay(200)} style={styles.infoContainer}>
            <Text style={styles.title} numberOfLines={2}>
              {nowPlaying.bookTitle}
            </Text>
            <Text style={styles.author}>{nowPlaying.author}</Text>
            {currentChapter && (
              <Text style={styles.chapterInfo}>
                Chapter {currentChapterIndex + 1}: {currentChapter.title}
              </Text>
            )}
          </Animated.View>
          
          {/* Progress Slider */}
          <Animated.View entering={FadeInDown.delay(300)} style={styles.sliderContainer}>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={duration || 100}
              value={localPosition}
              onValueChange={setLocalPosition}
              onSlidingStart={handleSeekStart}
              onSlidingComplete={handleSeekEnd}
              minimumTrackTintColor={theme.colors.primary}
              maximumTrackTintColor={theme.colors.progressTrack}
              thumbTintColor={theme.colors.primary}
            />
            <View style={styles.timeContainer}>
              <Text style={styles.timeText}>{formatTime(localPosition)}</Text>
              <Text style={styles.timeText}>-{formatTime(duration - localPosition)}</Text>
            </View>
          </Animated.View>
          
          {/* Controls */}
          <Animated.View entering={FadeInDown.delay(400)} style={styles.controlsContainer}>
            <View style={styles.mainControls}>
              {/* Previous Chapter */}
              <Pressable style={styles.controlButton} onPress={handlePreviousChapter}>
                <Ionicons name="play-skip-back" size={28} color={theme.colors.text} />
              </Pressable>
              
              {/* Skip Back */}
              <Pressable style={styles.skipButton} onPress={handleSkipBackward}>
                <Ionicons name="play-back" size={32} color={theme.colors.text} />
                <Text style={styles.skipLabel}>30s</Text>
              </Pressable>
              
              {/* Play/Pause */}
              <Animated.View style={playButtonStyle}>
                <Pressable style={styles.playButton} onPress={handlePlayPause}>
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={36}
                    color="#fff"
                    style={!isPlaying ? { marginLeft: 4 } : {}}
                  />
                </Pressable>
              </Animated.View>
              
              {/* Skip Forward */}
              <Pressable style={styles.skipButton} onPress={handleSkipForward}>
                <Ionicons name="play-forward" size={32} color={theme.colors.text} />
                <Text style={styles.skipLabel}>30s</Text>
              </Pressable>
              
              {/* Next Chapter */}
              <Pressable style={styles.controlButton} onPress={handleNextChapter}>
                <Ionicons name="play-skip-forward" size={28} color={theme.colors.text} />
              </Pressable>
            </View>
            
            {/* Secondary Controls */}
            <View style={styles.secondaryControls}>
              <Pressable style={styles.speedButton} onPress={handlePlaybackRateCycle}>
                <Text style={styles.speedText}>{playbackRate}x</Text>
              </Pressable>
              
              <Pressable style={styles.controlButton}>
                <Ionicons name="moon-outline" size={24} color={theme.colors.text} />
              </Pressable>
              
              <Pressable style={styles.controlButton}>
                <Ionicons name="bookmark-outline" size={24} color={theme.colors.text} />
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}
```

---

### Mobile: Audio Service (playback engine)
**File:** `apps/mobile/src/services/audioService.ts` | **Size:** 24.5 KB | **Lines:** 797

```typescript
/**
 * VoiceLibri Audio Service
 * Advanced audio playback using expo-audio with:
 * - Lock screen controls (Control Center on iOS, notification controls on Android)
 * - Background audio playback
 * - Headphone button support
 * - Remote control events
 * - Progressive subchunk playback during real-time generation
 * 
 * Based on official Expo Audio documentation:
 * https://docs.expo.dev/versions/latest/sdk/audio/
 */

import { 
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import { usePlayerStore } from '../stores/playerStore';
import type { NowPlaying, Chapter } from '../stores/playerStore';
import { getSubChunkAudioUrl, updatePlaybackPosition as apiUpdatePlaybackPosition } from './voiceLibriApi';
import {
  consolidateChapterFromSubChunks,
  downloadSubChunk,
  getDownloadedSubChunks,
  getLocalChapterUri,
  getLocalSubChunkUri,
  isChapterDownloaded,
} from './audioStorageService';

// ============================================================================
// TYPES
// ============================================================================

export interface AudioServiceState {
  isInitialized: boolean;
  player: AudioPlayer | null;
}

// ============================================================================
// SINGLETON STATE
// ============================================================================

let audioPlayer: AudioPlayer | null = null;
let isInitialized = false;
let positionUpdateInterval: NodeJS.Timeout | null = null;

// Progressive playback state
let currentSubChunkIndex = 0;
let currentChapterSubChunkCount = 0;
let isProgressiveMode = false;
let progressiveBookTitle = '';
let progressiveChapterIndex = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the audio service
 * Call this once when the app starts (in root layout)
 */
export async function initializeAudioService(): Promise<void> {
  if (isInitialized) {
    console.log('🎵 Audio service already initialized');
    return;
  }
  
  try {
    // Configure audio mode for background playback per official docs
    await setAudioModeAsync({
      // Allow audio to play when phone is silent/muted
      playsInSilentMode: true,
      // Enable background audio playback
      shouldPlayInBackground: true,
      // How to handle interruptions (e.g., phone calls)
      interruptionMode: 'doNotMix',
    });
    
    isInitialized = true;
    console.log('✓ Audio service initialized with background playback enabled');
  } catch (error) {
    console.error('✗ Failed to initialize audio service:', error);
    throw error;
  }
}

// ============================================================================
// PLAYER MANAGEMENT
// ============================================================================

/**
 * Create a new audio player instance using the official createAudioPlayer function
 */
export function createPlayer(): AudioPlayer {
  if (audioPlayer) {
    console.log('🎵 Reusing existing audio player');
    return audioPlayer;
  }
  
  // Use createAudioPlayer() per official docs for players that persist beyond component lifecycle
  audioPlayer = createAudioPlayer();
  console.log('✓ Created new audio player');
  return audioPlayer;
}

/**
 * Get the current audio player instance
 */
export function getPlayer(): AudioPlayer | null {
  return audioPlayer;
}

/**
 * Cleanup the audio player
 */
export async function cleanupPlayer(): Promise<void> {
  if (positionUpdateInterval) {
    clearInterval(positionUpdateInterval);
    positionUpdateInterval = null;
  }
  
  if (audioPlayer) {
    try {
      await audioPlayer.remove();
      audioPlayer = null;
      console.log('✓ Audio player cleaned up');
    } catch (error) {
      console.error('✗ Error cleaning up audio player:', error);
    }
  }
  
  // Reset progressive state
  isProgressiveMode = false;
  currentSubChunkIndex = 0;
}

// ============================================================================
// PROGRESSIVE PLAYBACK (Subchunks during real-time generation)
// ============================================================================

/**
 * Check if a subchunk is available
 */
async function isSubChunkAvailable(bookTitle: string, chapterIndex: number, subChunkIndex: number): Promise<boolean> {
  try {
    const localUri = getLocalSubChunkUri(bookTitle, chapterIndex, subChunkIndex);
    if (localUri) return true;
    const url = getSubChunkAudioUrl(bookTitle, chapterIndex, subChunkIndex);
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for first subchunk to be ready (with timeout)
 */
async function waitForFirstSubChunk(
  bookTitle: string, 
  chapterIndex: number, 
  maxWaitMs: number = 60000
): Promise<boolean> {
  const pollIntervalMs = 500;
  const startTime = Date.now();
  
  console.log(`⏳ Waiting for first subchunk of chapter ${chapterIndex}...`);
  
  while (Date.now() - startTime < maxWaitMs) {
    if (await isSubChunkAvailable(bookTitle, chapterIndex, 0)) {
      console.log(`✅ First subchunk ready after ${Date.now() - startTime}ms`);
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  console.log(`❌ Timeout waiting for first subchunk`);
  return false;
}

/**
 * Play a specific subchunk
 */
async function playSubChunk(
  bookTitle: string,
  chapterIndex: number,
  subChunkIndex: number,
  chapter: Chapter
): Promise<void> {
  const player = createPlayer();
  const store = usePlayerStore.getState();
  const storageChapterIndex = chapter.index ?? chapterIndex;
  const localUri = getLocalSubChunkUri(bookTitle, storageChapterIndex, subChunkIndex);

  if (!localUri) {
    console.log(`📥 Downloading subchunk ${chapterIndex}:${subChunkIndex} for local playback...`);
    await downloadSubChunk(bookTitle, storageChapterIndex, subChunkIndex);
  }

  const resolvedUri = getLocalSubChunkUri(bookTitle, storageChapterIndex, subChunkIndex);
  if (!resolvedUri) {
    throw new Error(`Subchunk ${storageChapterIndex}:${subChunkIndex} not available locally`);
  }
  
  console.log(`🎵 Playing subchunk ${chapterIndex}:${subChunkIndex} (LOCAL)`);
  console.log(`   URI: ${resolvedUri}`);
  
  try {
    store.setIsBuffering(true);
    
    // Replace the current source
    await player.replace({ uri: resolvedUri });
    
    // Start playback
    await player.play();
    
    // Update store state (UI index)
    store.setCurrentChapter(chapterIndex);
    store.setIsPlaying(true);
    store.setIsBuffering(false);
    
    // Track progressive state
    isProgressiveMode = true;
    progressiveBookTitle = bookTitle;
    progressiveChapterIndex = storageChapterIndex;
    currentSubChunkIndex = subChunkIndex;
    
    // Set up onEnd handler for next subchunk
    setupSubChunkEndHandler(bookTitle, chapterIndex, chapter);
    
    // If we have all subchunks for this chapter, consolidate into a chapter file
    if (typeof chapter.subChunkCount === 'number') {
      const downloaded = getDownloadedSubChunks(bookTitle, storageChapterIndex);
      if (downloaded.length >= chapter.subChunkCount) {
        try {
          await consolidateChapterFromSubChunks(bookTitle, storageChapterIndex);
          console.log(`✅ Chapter ${storageChapterIndex} consolidated locally`);
        } catch (error) {
          console.warn('⚠ Failed to consolidate chapter:', error);
        }
      }
    }
    
    console.log(`✓ Playing subchunk ${chapterIndex}:${subChunkIndex}`);
  } catch (error) {
    console.error('✗ Error playing subchunk:', error);
    store.setIsBuffering(false);
    throw error;
  }
}

/**
 * Set up handler for when current subchunk ends
 */
function setupSubChunkEndHandler(bookTitle: string, chapterIndex: number, chapter: Chapter): void {
  const player = getPlayer();
  if (!player) return;
  const storageChapterIndex = chapter.index ?? chapterIndex;
  
  // Add listener for playback status updates to detect when audio finishes
  const handlePlaybackStatus = async (status: { didJustFinish?: boolean }) => {
    if (!isProgressiveMode) return;
    if (!status.didJustFinish) return;
    
    const nextSubChunkIndex = currentSubChunkIndex + 1;
    console.log(`🎵 Subchunk ${chapterIndex}:${currentSubChunkIndex} ended, checking next...`);
    
    // Check if next subchunk is available
    if (await isSubChunkAvailable(bookTitle, storageChapterIndex, nextSubChunkIndex)) {
      await playSubChunk(bookTitle, chapterIndex, nextSubChunkIndex, chapter);
    } else {
      // Wait a bit and try again
      console.log(`⏳ Waiting for next subchunk ${chapterIndex}:${nextSubChunkIndex}...`);
      setTimeout(async () => {
        if (await isSubChunkAvailable(bookTitle, storageChapterIndex, nextSubChunkIndex)) {
          await playSubChunk(bookTitle, chapterIndex, nextSubChunkIndex, chapter);
        } else {
          // Check if we should move to next chapter
          const store = usePlayerStore.getState();
          const { nowPlaying } = store;
          if (nowPlaying && chapterIndex < nowPlaying.chapters.length - 1) {
            console.log(`📚 Moving to next chapter`);
            const nextChapter = nowPlaying.chapters[chapterIndex + 1];
            await playChapter(bookTitle, nextChapter, chapterIndex + 1);
          } else {
            console.log(`📚 Audiobook playback complete or waiting for more content`);
            store.setIsPlaying(false);
          }
        }
      }, 2000);
    }
  };
  
  // Use playbackStatusUpdate event to detect when audio finishes
  player.addListener('playbackStatusUpdate', handlePlaybackStatus);
}

// ============================================================================
// PLAYBACK CONTROL
// ============================================================================

/**
 * Load and play a chapter
 * Tries: 1) Local storage, 2) Chapter file, 3) Progressive subchunks
 */
export async function playChapter(
  bookTitle: string,
  chapter: Chapter,
  chapterIndex: number,
  startPosition: number = 0
): Promise<void> {
  const player = createPlayer();
  const store = usePlayerStore.getState();
  const storageChapterIndex = chapter.index ?? chapterIndex;
  
  // Check for local file first
  const localUri = getLocalChapterUri(bookTitle, storageChapterIndex);
  if (localUri) {
    console.log(`🎵 Loading chapter ${storageChapterIndex} from LOCAL: ${chapter.title}`);
    await playFromUri(player, store, localUri, chapter, chapterIndex, startPosition, bookTitle);
    return;
  }
  
  // Fall back to progressive subchunk playback
  console.log(`🎵 Chapter ${chapterIndex} not ready, trying progressive subchunk playback...`);
  
  // Wait for first subchunk
  const firstSubChunkReady = await waitForFirstSubChunk(bookTitle, storageChapterIndex);
  
  if (firstSubChunkReady) {
    await playSubChunk(bookTitle, chapterIndex, 0, chapter);
  } else {
    console.error(`✗ Could not start playback for chapter ${chapterIndex} - no content available`);
    store.setIsBuffering(false);
    throw new Error('No audio content available yet. Please wait for generation to start.');
  }
}

/**
 * Internal helper to play from a URI (chapter or local file)
 */
async function playFromUri(
  player: AudioPlayer,
  store: ReturnType<typeof usePlayerStore.getState>,
  audioUri: string,
  chapter: Chapter,
  chapterIndex: number,
  startPosition: number,
  bookTitle: string
): Promise<void> {
  try {
    // Reset progressive mode
    isProgressiveMode = false;
    
    // Set buffering state
    store.setIsBuffering(true);
    
    // Replace the current source
    await player.replace({ uri: audioUri });
    
    // Seek to position if needed
    if (startPosition > 0) {
      await player.seekTo(startPosition);
    }
    
    // Start playback
    await player.play();
    
    // Update store state
    store.setCurrentChapter(chapterIndex);
    store.setIsPlaying(true);
    store.setIsBuffering(false);
    
    // Enable lock screen controls with metadata (if available)
    try {
      if (typeof player.setActiveForLockScreen === 'function') {
        player.setActiveForLockScreen(true, {
          title: chapter.title,
          artist: store.nowPlaying?.author || 'Unknown Author',
          albumTitle: store.nowPlaying?.bookTitle || 'VoiceLibri',
        });
      } else {
        console.log('⚠ Lock screen controls not available on this player instance');
      }
    } catch (lockScreenError) {
      console.warn('⚠ Could not enable lock screen controls:', lockScreenError);
    }
    
    // Start position tracking
    startPositionTracking(bookTitle, chapterIndex);
    
    console.log(`✓ Playing chapter: ${chapter.title}`);
  } catch (error) {
    console.error('✗ Error playing chapter:', error);
    store.setIsBuffering(false);
    throw error;
  }
}

/**
 * Toggle play/pause
 */
export async function togglePlayPause(): Promise<void> {
  const player = getPlayer();
  if (!player) return;
  
  const store = usePlayerStore.getState();
  
  if (store.isPlaying) {
    await player.pause();
    store.setIsPlaying(false);
  } else {
    await player.play();
    store.setIsPlaying(true);
  }
}

/**
 * Pause playback
 */
export async function pause(): Promise<void> {
  const player = getPlayer();
  if (!player) return;
  
  await player.pause();
  usePlayerStore.getState().setIsPlaying(false);
}

/**
 * Resume playback
 */
export async function play(): Promise<void> {
  const player = getPlayer();
  if (!player) return;
  
  await player.play();
  usePlayerStore.getState().setIsPlaying(true);
}

/**
 * Seek to a specific position
 */
export async function seekTo(position: number): Promise<void> {
  const player = getPlayer();
  if (!player) return;
  
  await player.seekTo(position);
  usePlayerStore.getState().setPosition(position);
}

/**
 * Skip forward by seconds
 */
export async function skipForward(seconds: number = 30): Promise<void> {
  const player = getPlayer();
  if (!player) return;
  
  const store = usePlayerStore.getState();
  const newPosition = Math.min(store.position + seconds, store.duration);
  await seekTo(newPosition);
}

/**
 * Skip backward by seconds
 */
export async function skipBackward(seconds: number = 15): Promise<void> {
  const player = getPlayer();
  if (!player) return;
  
  const store = usePlayerStore.getState();
  const newPosition = Math.max(store.position - seconds, 0);
  await seekTo(newPosition);
}

/**
 * Set playback rate (speed)
 */
export async function setPlaybackRate(rate: number): Promise<void> {
  const player = getPlayer();
  if (!player) return;
  
  player.playbackRate = rate;
  usePlayerStore.getState().setPlaybackRate(rate);
}

/**
 * Go to next chapter
 */
export async function nextChapter(): Promise<void> {
  const store = usePlayerStore.getState();
  const { nowPlaying, currentChapterIndex } = store;
  
  if (!nowPlaying || currentChapterIndex >= nowPlaying.chapters.length - 1) {
    console.log('📚 No next chapter available');
    return;
  }
  
  const nextIndex = currentChapterIndex + 1;
  const nextChapter = nowPlaying.chapters[nextIndex];
  await playChapter(nowPlaying.bookTitle, nextChapter, nextIndex);
}

/**
 * Go to previous chapter
 */
export async function previousChapter(): Promise<void> {
  const store = usePlayerStore.getState();
  const { nowPlaying, currentChapterIndex, position } = store;
  
  if (!nowPlaying) return;
  
  // If more than 3 seconds into chapter, restart current chapter
  if (position > 3) {
    await seekTo(0);
    return;
  }
  
  // Otherwise go to previous chapter
  if (currentChapterIndex > 0) {
    const prevIndex = currentChapterIndex - 1;
    const prevChapter = nowPlaying.chapters[prevIndex];
    await playChapter(nowPlaying.bookTitle, prevChapter, prevIndex);
  }
}

// ============================================================================
// BOOK PLAYBACK
// ============================================================================

/**
 * Start playing a book from the beginning or last position
 * @param downloadFirst - If true, download chapter to local storage before playing (default: false for immediate streaming)
 */
export async function startBook(
  nowPlaying: NowPlaying, 
  resumePosition?: { chapterIndex: number; position: number },
  options?: { downloadFirst?: boolean }
): Promise<void> {
  const store = usePlayerStore.getState();
  
  // Set the book as now playing
  store.setNowPlaying(nowPlaying);
  
  // Determine where to start
  const chapterIndex = resumePosition?.chapterIndex ?? 0;
  const position = resumePosition?.position ?? 0;
  const chapter = nowPlaying.chapters[chapterIndex];
  
  if (!chapter) {
    console.error('✗ Chapter not found:', chapterIndex);
    return;
  }
  
  // Optionally download chapter first for offline playback
  if (options?.downloadFirst && !isChapterDownloaded(nowPlaying.bookTitle, chapterIndex)) {
    console.log(`📥 Pre-downloading chapter ${chapterIndex} before playback...`);
    const { downloadChapter } = await import('./audioStorageService');
    try {
      await downloadChapter(nowPlaying.bookTitle, chapterIndex);
      console.log(`✓ Chapter ${chapterIndex} downloaded to local storage`);
    } catch (err) {
      console.warn(`⚠ Could not download chapter, will stream instead:`, err);
    }
  }
  
  // Start playing
  await playChapter(nowPlaying.bookTitle, chapter, chapterIndex, position);
}

/**
 * Play audiobook from local device storage
 * This is the primary playback method for downloaded audiobooks
 * 
 * @param bookTitle - Sanitized book title (same as folder name in storage)
 * @param chapterIndex - Chapter to start playing from
 */
export async function playFromLocalStorage(
  bookTitle: string,
  chapterIndex: number = 0
): Promise<void> {
  const player = createPlayer();
  const store = usePlayerStore.getState();
  const nowPlaying = store.nowPlaying;
  const uiChapterIndex = nowPlaying?.chapters.findIndex((ch) => ch.index === chapterIndex) ?? 0;
  
  // Get local chapter file URI
  const localUri = getLocalChapterUri(bookTitle, chapterIndex);
  
  if (!localUri) {
    console.error(`✗ Chapter ${chapterIndex} not found in local storage for "${bookTitle}"`);
    throw new Error(`Chapter ${chapterIndex} is not available on your device. Please download the audiobook first.`);
  }
  
  console.log(`🎵 Playing from LOCAL storage: ${bookTitle} chapter ${chapterIndex}`);
  console.log(`   URI: ${localUri}`);
  
  try {
    // Reset progressive mode
    isProgressiveMode = false;
    
    // Set buffering state
    store.setIsBuffering(true);
    
    // Replace the current source with local file
    await player.replace({ uri: localUri });
    
    // Start playback
    await player.play();
    
    // Update store state
    store.setCurrentChapter(uiChapterIndex);
    store.setIsPlaying(true);
    store.setIsBuffering(false);
    
    // Enable lock screen controls
    try {
      if (typeof player.setActiveForLockScreen === 'function') {
        player.setActiveForLockScreen(true, {
          title: `Chapter ${chapterIndex + 1}`,
          artist: store.nowPlaying?.author || 'Unknown Author',
          albumTitle: store.nowPlaying?.bookTitle || bookTitle,
        });
      }
    } catch (lockScreenError) {
      console.warn('⚠ Could not enable lock screen controls:', lockScreenError);
    }
    
    // Start position tracking (for progress sync)
    startPositionTracking(bookTitle, chapterIndex);
    
    // Set up handler for when chapter ends (to auto-play next chapter)
    setupLocalChapterEndHandler(bookTitle, chapterIndex);
    
    console.log(`✓ Playing from local storage: chapter ${chapterIndex}`);
  } catch (error) {
    console.error('✗ Error playing from local storage:', error);
    store.setIsBuffering(false);
    throw error;
  }
}

/**
 * Set up handler for when local chapter playback ends
 */
function setupLocalChapterEndHandler(bookTitle: string, currentChapterIndex: number): void {
  const player = getPlayer();
  if (!player) return;
  
  const handleChapterEnd = async (status: { didJustFinish?: boolean }) => {
    if (!status.didJustFinish) return;
    
    const store = usePlayerStore.getState();
    const { nowPlaying } = store;
    
    console.log(`📚 Chapter ${currentChapterIndex} finished`);
    
    // Check if there's a next chapter available locally
    const nextChapterIndex = currentChapterIndex + 1;
    const nextLocalUri = getLocalChapterUri(bookTitle, nextChapterIndex);
    
    if (nextLocalUri) {
      console.log(`📚 Auto-playing next chapter ${nextChapterIndex}`);
      await playFromLocalStorage(bookTitle, nextChapterIndex);
    } else if (nowPlaying && nextChapterIndex < nowPlaying.chapters.length) {
      // Next chapter exists in book but not downloaded
      console.log(`📚 Next chapter ${nextChapterIndex} not downloaded locally`);
      store.setIsPlaying(false);
    } else {
      // Book complete
      console.log(`📚 Audiobook playback complete`);
      store.setIsPlaying(false);
    }
  };
  
  player.addListener('playbackStatusUpdate', handleChapterEnd);
}

/**
 * Stop playback and clear now playing
 */
export async function stopPlayback(): Promise<void> {
  await cleanupPlayer();
  usePlayerStore.getState().setNowPlaying(null);
}

// ============================================================================
// POSITION TRACKING
// ============================================================================

/**
 * Start tracking position and sync to backend
 */
function startPositionTracking(bookTitle: string, chapterIndex: number): void {
  // Clear any existing interval
  if (positionUpdateInterval) {
    clearInterval(positionUpdateInterval);
  }
  
  // Update position every second
  positionUpdateInterval = setInterval(() => {
    const player = getPlayer();
    if (!player) return;
    
    const store = usePlayerStore.getState();
    
    // Get current position from player
    const currentTime = player.currentTime;
    const duration = player.duration;
    
    // Update store
    if (currentTime !== undefined) {
      store.setPosition(currentTime);
    }
    if (duration !== undefined && duration > 0) {
      store.setDuration(duration);
    }
    
    // Check if playback is still active
    if (!player.playing && store.isPlaying) {
      store.setIsPlaying(false);
    }
  }, 1000);
  
  // Save position to backend every 10 seconds
  const saveInterval = setInterval(async () => {
    const store = usePlayerStore.getState();
    if (store.nowPlaying && store.position > 0) {
      try {
        await apiUpdatePlaybackPosition(bookTitle, chapterIndex, store.position);
      } catch (error) {
        // Silently fail - position will be saved next time
        console.log('Could not save playback position');
      }
    }
  }, 10000);
  
  // Store save interval for cleanup
  (positionUpdateInterval as any).saveInterval = saveInterval;
}

// ============================================================================
// REACT HOOKS
// ============================================================================

/**
 * Hook to use the audio player with automatic state updates
 * Use this in components that need real-time player status
 */
export function useAudioService() {
  const player = audioPlayer;
  
  return {
    player,
    isInitialized,
    // Control methods
    play,
    pause,
    togglePlayPause,
    seekTo,
    skipForward,
    skipBackward,
    setPlaybackRate,
    nextChapter,
    previousChapter,
    startBook,
    stopPlayback,
    playChapter,
    playFromLocalStorage,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializeAudioService,
  createPlayer,
  getPlayer,
  cleanupPlayer,
  playChapter,
  playFromLocalStorage,
  togglePlayPause,
  pause,
  play,
  seekTo,
  skipForward,
  skipBackward,
  setPlaybackRate,
  nextChapter,
  previousChapter,
  startBook,
  stopPlayback,
  useAudioService,
};
```

---

### Mobile: Audio Storage Service (download, offline)
**File:** `apps/mobile/src/services/audioStorageService.ts` | **Size:** 17.8 KB | **Lines:** 594

```typescript
/**
 * VoiceLibri Audio Storage Service
 * 
 * Handles downloading and storing audiobook audio files to device local storage.
 * Uses the official expo-file-system API (SDK 54+).
 * 
 * Storage locations:
 * - Paths.document: Persistent storage, backed up to iCloud (for completed audiobooks)
 * - Paths.cache: Temporary storage (for in-progress downloads)
 * 
 * Based on official Expo FileSystem documentation:
 * https://docs.expo.dev/versions/latest/sdk/filesystem/
 */

import { File, Directory, Paths } from 'expo-file-system';
import { API_BASE_URL } from './voiceLibriApi';

// ============================================================================
// TYPES
// ============================================================================

export interface LocalAudiobook {
  title: string;
  chaptersDownloaded: number;
  totalChapters: number;
  totalSize: number; // bytes
  downloadedAt: string;
  localPath: string;
}

export interface ChapterDownloadProgress {
  chapterIndex: number;
  subChunksDownloaded: number;
  totalSubChunks: number;
  status: 'pending' | 'downloading' | 'complete' | 'error';
  error?: string;
}

export interface DownloadProgress {
  bookTitle: string;
  chapters: ChapterDownloadProgress[];
  overallProgress: number; // 0-100
  status: 'idle' | 'downloading' | 'consolidating' | 'complete' | 'error';
}

// ============================================================================
// STORAGE PATHS
// ============================================================================

/**
 * Get the audiobooks directory in document storage (persistent, backed up)
 */
function getAudiobooksDirectory(): Directory {
  return new Directory(Paths.document, 'voicelibri', 'audiobooks');
}

/**
 * Get directory for a specific audiobook
 */
function getBookDirectory(bookTitle: string): Directory {
  const sanitizedTitle = sanitizeFilename(bookTitle);
  return new Directory(getAudiobooksDirectory(), sanitizedTitle);
}

/**
 * Get the temp directory for downloads in progress
 */
function getTempDirectory(): Directory {
  return new Directory(Paths.cache, 'voicelibri', 'temp');
}

/**
 * Sanitize filename to remove special characters
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_\s]/g, '').replace(/\s+/g, '_').substring(0, 100);
}

// ============================================================================
// DIRECTORY MANAGEMENT
// ============================================================================

/**
 * Ensure audiobooks directory structure exists
 */
export function ensureDirectoriesExist(): void {
  try {
    const audiobooksDir = getAudiobooksDirectory();
    if (!audiobooksDir.exists) {
      audiobooksDir.create({ intermediates: true });
      console.log('✓ Created audiobooks directory:', audiobooksDir.uri);
    }
    
    const tempDir = getTempDirectory();
    if (!tempDir.exists) {
      tempDir.create({ intermediates: true });
      console.log('✓ Created temp directory:', tempDir.uri);
    }
  } catch (error) {
    console.error('✗ Error creating directories:', error);
    throw error;
  }
}

// ============================================================================
// DOWNLOAD FUNCTIONS
// ============================================================================

/**
 * Download a single subchunk from backend and save to device storage
 */
export async function downloadSubChunk(
  bookTitle: string,
  chapterIndex: number,
  subChunkIndex: number
): Promise<string> {
  ensureDirectoriesExist();
  
  const url = `${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/subchunks/${chapterIndex}/${subChunkIndex}`;
  const bookDir = getBookDirectory(bookTitle);
  
  // Create book directory if it doesn't exist
  if (!bookDir.exists) {
    bookDir.create({ intermediates: true });
  }
  
  // Create chapter subdirectory
  const chapterDir = new Directory(bookDir, `chapter_${chapterIndex}`);
  if (!chapterDir.exists) {
    chapterDir.create();
  }
  
  console.log(`📥 Downloading subchunk ${chapterIndex}:${subChunkIndex}`);
  
  try {
    // Use official File.downloadFileAsync per Expo docs
    const downloadedFile = await File.downloadFileAsync(url, chapterDir, {
      idempotent: true, // Overwrite if exists
    });
    
    // Rename to our expected filename
    // Use Paths.basename to get current filename from URI per official docs
    const expectedName = `subchunk_${subChunkIndex}.wav`;
    const currentName = Paths.basename(downloadedFile.uri);
    if (currentName !== expectedName) {
      downloadedFile.rename(expectedName);
    }
    
    console.log(`✓ Downloaded subchunk ${chapterIndex}:${subChunkIndex} (${downloadedFile.size} bytes)`);
    return downloadedFile.uri;
  } catch (error) {
    console.error(`✗ Failed to download subchunk ${chapterIndex}:${subChunkIndex}:`, error);
    throw error;
  }
}

/**
 * Download result with file info
 */
export interface DownloadResult {
  uri: string;
  size: number;
}

/**
 * Download a complete chapter from backend
 * Returns both URI and size to avoid incorrect File constructor usage
 */
export async function downloadChapter(
  bookTitle: string,
  chapterIndex: number
): Promise<DownloadResult> {
  ensureDirectoriesExist();
  
  const url = `${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/chapters/${chapterIndex}`;
  const bookDir = getBookDirectory(bookTitle);
  
  // Create book directory if it doesn't exist
  if (!bookDir.exists) {
    bookDir.create({ intermediates: true });
  }
  
  console.log(`📥 Downloading chapter ${chapterIndex} for "${bookTitle}"`);
  
  try {
    // Download directly to book directory per official Expo docs
    // File.downloadFileAsync returns a File instance
    const downloadedFile = await File.downloadFileAsync(url, bookDir, {
      idempotent: true,
    });
    
    // Rename to our expected filename per official docs: file.rename(newName)
    // Use Paths.basename to get current filename from URI per official docs
    const expectedName = `chapter_${chapterIndex}.wav`;
    const currentName = Paths.basename(downloadedFile.uri);
    if (currentName !== expectedName) {
      downloadedFile.rename(expectedName);
    }
    
    const fileSize = downloadedFile.size || 0;
    console.log(`✓ Downloaded chapter ${chapterIndex} (${fileSize} bytes)`);
    
    // Return both URI and size from the File instance
    return {
      uri: downloadedFile.uri,
      size: fileSize,
    };
  } catch (error) {
    console.error(`✗ Failed to download chapter ${chapterIndex}:`, error);
    throw error;
  }
}

/**
 * Download all chapters for an audiobook with progress tracking
 */
export async function downloadAudiobook(
  bookTitle: string,
  totalChapters: number,
  onProgress?: (progress: DownloadProgress) => void
): Promise<LocalAudiobook> {
  ensureDirectoriesExist();
  
  const progress: DownloadProgress = {
    bookTitle,
    chapters: Array.from({ length: totalChapters }, (_, i) => ({
      chapterIndex: i,
      subChunksDownloaded: 0,
      totalSubChunks: 0, // Unknown until we fetch
      status: 'pending' as const,
    })),
    overallProgress: 0,
    status: 'downloading',
  };
  
  onProgress?.(progress);
  
  const bookDir = getBookDirectory(bookTitle);
  let totalSize = 0;
  
  for (let i = 0; i < totalChapters; i++) {
    progress.chapters[i].status = 'downloading';
    onProgress?.(progress);
    
    try {
      // downloadChapter now returns { uri, size } per official docs pattern
      const downloadResult = await downloadChapter(bookTitle, i);
      totalSize += downloadResult.size;
      
      progress.chapters[i].status = 'complete';
      progress.overallProgress = Math.round(((i + 1) / totalChapters) * 100);
      onProgress?.(progress);
    } catch (error) {
      progress.chapters[i].status = 'error';
      progress.chapters[i].error = error instanceof Error ? error.message : 'Download failed';
      onProgress?.(progress);
      // Continue with other chapters
    }
  }
  
  progress.status = 'complete';
  onProgress?.(progress);
  
  const localAudiobook: LocalAudiobook = {
    title: bookTitle,
    chaptersDownloaded: progress.chapters.filter(c => c.status === 'complete').length,
    totalChapters,
    totalSize,
    downloadedAt: new Date().toISOString(),
    localPath: bookDir.uri,
  };
  
  // Save metadata
  await saveAudiobookMetadata(bookTitle, localAudiobook);
  
  return localAudiobook;
}

// ============================================================================
// LOCAL PLAYBACK
// ============================================================================

/**
 * Get local file URI for a chapter (for playback)
 * Returns null if chapter is not downloaded
 */
export function getLocalChapterUri(bookTitle: string, chapterIndex: number): string | null {
  const bookDir = getBookDirectory(bookTitle);
  const chapterFile = new File(bookDir, `chapter_${chapterIndex}.wav`);
  
  if (chapterFile.exists) {
    return chapterFile.uri;
  }
  
  return null;
}

/**
 * Check if a chapter is available locally
 */
export function isChapterDownloaded(bookTitle: string, chapterIndex: number): boolean {
  return getLocalChapterUri(bookTitle, chapterIndex) !== null;
}

/**
 * Get local file URI for a subchunk (for progressive playback)
 * Returns null if subchunk is not downloaded
 */
export function getLocalSubChunkUri(
  bookTitle: string,
  chapterIndex: number,
  subChunkIndex: number
): string | null {
  const bookDir = getBookDirectory(bookTitle);
  const chapterDir = new Directory(bookDir, `chapter_${chapterIndex}`);
  const subChunkFile = new File(chapterDir, `subchunk_${subChunkIndex}.wav`);
  return subChunkFile.exists ? subChunkFile.uri : null;
}

/**
 * List downloaded subchunks for a chapter
 */
export function getDownloadedSubChunks(bookTitle: string, chapterIndex: number): number[] {
  const bookDir = getBookDirectory(bookTitle);
  const chapterDir = new Directory(bookDir, `chapter_${chapterIndex}`);
  if (!chapterDir.exists) return [];

  const subChunks: number[] = [];
  const contents = chapterDir.list();
  for (const item of contents) {
    if (item instanceof File && item.name.startsWith('subchunk_') && item.name.endsWith('.wav')) {
      const match = item.name.match(/subchunk_(\d+)\.wav/);
      if (match) {
        subChunks.push(parseInt(match[1], 10));
      }
    }
  }

  return subChunks.sort((a, b) => a - b);
}

/**
 * Consolidate downloaded subchunks into a single chapter WAV file
 * Uses WAV header from first subchunk and concatenates PCM data
 */
export async function consolidateChapterFromSubChunks(
  bookTitle: string,
  chapterIndex: number
): Promise<string> {
  const bookDir = getBookDirectory(bookTitle);
  const chapterDir = new Directory(bookDir, `chapter_${chapterIndex}`);
  if (!chapterDir.exists) {
    throw new Error(`Chapter directory not found for ${bookTitle} chapter ${chapterIndex}`);
  }

  const subChunkFiles = chapterDir
    .list()
    .filter((item): item is File => item instanceof File)
    .filter((file) => file.name.startsWith('subchunk_') && file.name.endsWith('.wav'))
    .sort((a, b) => {
      const aMatch = a.name.match(/subchunk_(\d+)\.wav/);
      const bMatch = b.name.match(/subchunk_(\d+)\.wav/);
      const aIndex = aMatch ? parseInt(aMatch[1], 10) : 0;
      const bIndex = bMatch ? parseInt(bMatch[1], 10) : 0;
      return aIndex - bIndex;
    });

  if (subChunkFiles.length === 0) {
    throw new Error(`No subchunks found for ${bookTitle} chapter ${chapterIndex}`);
  }

  // Read all subchunk bytes
  const dataChunks: Uint8Array[] = [];
  let totalPcmBytes = 0;
  let header: Uint8Array | null = null;

  for (const file of subChunkFiles) {
    const bytes = await file.bytes();
    if (bytes.length <= 44) {
      continue;
    }

    if (!header) {
      header = bytes.slice(0, 44);
    }

    const pcm = bytes.slice(44);
    totalPcmBytes += pcm.length;
    dataChunks.push(pcm);
  }

  if (!header) {
    throw new Error(`Unable to read WAV header for ${bookTitle} chapter ${chapterIndex}`);
  }

  // Build output buffer: header + concatenated PCM data
  const output = new Uint8Array(44 + totalPcmBytes);
  output.set(header, 0);

  // Update WAV header sizes (little-endian)
  const view = new DataView(output.buffer);
  // ChunkSize at offset 4 = 36 + data size
  view.setUint32(4, 36 + totalPcmBytes, true);
  // Subchunk2Size at offset 40 = data size
  view.setUint32(40, totalPcmBytes, true);

  let offset = 44;
  for (const chunk of dataChunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  // Write consolidated chapter file
  const chapterFile = new File(bookDir, `chapter_${chapterIndex}.wav`);
  chapterFile.create({ intermediates: true, overwrite: true });
  chapterFile.write(output);

  console.log(`✅ Consolidated chapter ${chapterIndex} (${totalPcmBytes} PCM bytes)`);
  return chapterFile.uri;
}

/**
 * Get all downloaded chapters for a book
 */
export function getDownloadedChapters(bookTitle: string): number[] {
  const bookDir = getBookDirectory(bookTitle);
  
  // DEBUG: Log the directory being checked
  console.log('📂 [getDownloadedChapters] Checking for bookTitle:', bookTitle);
  console.log('📂 [getDownloadedChapters] Book directory URI:', bookDir.uri);
  console.log('📂 [getDownloadedChapters] Directory exists:', bookDir.exists);
  
  if (!bookDir.exists) {
    console.log('📂 [getDownloadedChapters] Directory does NOT exist, returning []');
    return [];
  }
  
  const chapters: number[] = [];
  const contents = bookDir.list();
  
  // DEBUG: Log directory contents
  console.log('📂 [getDownloadedChapters] Directory contents:', contents.map(item => ({
    name: item.name || 'unknown',
    isFile: item instanceof File,
  })));
  
  for (const item of contents) {
    if (item instanceof File && item.name.startsWith('chapter_') && item.name.endsWith('.wav')) {
      const match = item.name.match(/chapter_(\d+)\.wav/);
      if (match) {
        chapters.push(parseInt(match[1], 10));
      }
    }
  }
  
  console.log('📂 [getDownloadedChapters] Found chapters:', chapters);
  return chapters.sort((a, b) => a - b);
}

// ============================================================================
// METADATA MANAGEMENT
// ============================================================================

/**
 * Save audiobook metadata to local storage
 */
async function saveAudiobookMetadata(bookTitle: string, metadata: LocalAudiobook): Promise<void> {
  const bookDir = getBookDirectory(bookTitle);
  const metadataFile = new File(bookDir, 'metadata.json');
  
  try {
    metadataFile.write(JSON.stringify(metadata, null, 2));
    console.log('✓ Saved audiobook metadata');
  } catch (error) {
    console.error('✗ Failed to save metadata:', error);
  }
}

/**
 * Load audiobook metadata from local storage
 */
export function loadAudiobookMetadata(bookTitle: string): LocalAudiobook | null {
  const bookDir = getBookDirectory(bookTitle);
  const metadataFile = new File(bookDir, 'metadata.json');
  
  if (!metadataFile.exists) {
    return null;
  }
  
  try {
    const content = metadataFile.textSync();
    return JSON.parse(content) as LocalAudiobook;
  } catch (error) {
    console.error('✗ Failed to load metadata:', error);
    return null;
  }
}

/**
 * Get all locally stored audiobooks
 */
export function getLocalAudiobooks(): LocalAudiobook[] {
  const audiobooksDir = getAudiobooksDirectory();
  
  if (!audiobooksDir.exists) {
    return [];
  }
  
  const audiobooks: LocalAudiobook[] = [];
  const contents = audiobooksDir.list();
  
  for (const item of contents) {
    if (item instanceof Directory) {
      const metadataFile = new File(item, 'metadata.json');
      if (metadataFile.exists) {
        try {
          const content = metadataFile.textSync();
          audiobooks.push(JSON.parse(content) as LocalAudiobook);
        } catch {
          // Skip invalid metadata
        }
      }
    }
  }
  
  return audiobooks;
}

// ============================================================================
// STORAGE MANAGEMENT
// ============================================================================

/**
 * Delete a locally stored audiobook
 */
export function deleteLocalAudiobook(bookTitle: string): void {
  const bookDir = getBookDirectory(bookTitle);
  
  if (bookDir.exists) {
    bookDir.delete();
    console.log(`✓ Deleted local audiobook: ${bookTitle}`);
  }
}

/**
 * Get total storage used by audiobooks
 */
export function getStorageUsed(): number {
  const audiobooksDir = getAudiobooksDirectory();
  
  if (!audiobooksDir.exists) {
    return 0;
  }
  
  return audiobooksDir.size || 0;
}

/**
 * Get available storage space
 */
export function getAvailableSpace(): number {
  return Paths.availableDiskSpace;
}

/**
 * Clear all cached/temp files
 */
export function clearCache(): void {
  const tempDir = getTempDirectory();
  
  if (tempDir.exists) {
    tempDir.delete();
    tempDir.create({ intermediates: true });
    console.log('✓ Cleared audio cache');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
```

---

### Mobile: Book Card Component (book thumbnail, metadata display)
**File:** `apps/mobile/src/components/ui/BookCard.tsx` | **Size:** 6.3 KB | **Lines:** 251

```tsx
/**
 * BookCard Component
 * Animated book cover card with shadow and 3D effect
 * Inspired by himanchau/react-native-book-app Book.jsx
 */

import React, { useEffect } from 'react';
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CatalogBook } from '../../services/catalogService';
import { useTheme } from '../../theme/ThemeContext';
import { shadows, borderRadius, colors } from '../../theme';
import Text from './Text';

// Default cover image
const DEFAULT_COVER = require('../../../assets/default-cover.png');

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface BookCardProps {
  book: CatalogBook;
  size?: 'small' | 'medium' | 'large';
  onPress?: () => void;
  onLongPress?: () => void;
  showAuthor?: boolean;
  showProgress?: boolean;
  progress?: number;
  isGenerating?: boolean;
}

const SIZES = {
  small: { width: 100, height: 150 },
  medium: { width: 120, height: 180 },
  large: { width: 160, height: 240 },
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function BookCard({
  book,
  size = 'medium',
  onPress,
  onLongPress,
  showAuthor = true,
  showProgress = false,
  progress = 0,
  isGenerating = false,
}: BookCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.3);
  const dimensions = SIZES[size];
  
  // Pulse animation for generating state
  useEffect(() => {
    if (isGenerating) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 800 }),
          withTiming(0.3, { duration: 800 })
        ),
        -1, // Infinite
        false
      );
    } else {
      pulseOpacity.value = 0.3;
    }
  }, [isGenerating]);
  
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));
  
  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15 });
  };
  
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };
  
  const handlePress = () => {
    Haptics.selectionAsync();
    onPress?.();
  };
  
  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress?.();
  };
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { perspective: 1000 },
      { rotateY: '-15deg' },
    ],
  }));
  
  const styles = StyleSheet.create({
    container: {
      marginRight: 16,
    },
    imageContainer: {
      width: dimensions.width,
      height: dimensions.height,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.card,
      overflow: 'hidden',
      ...shadows.lg,
      shadowColor: '#000',
      shadowOffset: { width: 8, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 10,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    placeholder: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.colors.cardElevated,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
    },
    placeholderText: {
      textAlign: 'center',
      color: theme.colors.textSecondary,
      fontSize: 12,
    },
    titleContainer: {
      width: dimensions.width,
      marginTop: 8,
    },
    title: {
      fontSize: size === 'small' ? 12 : 13,
      fontWeight: '500',
      color: theme.colors.text,
    },
    author: {
      fontSize: size === 'small' ? 10 : 11,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    progressBar: {
      height: 3,
      backgroundColor: theme.colors.progressTrack,
      borderRadius: 2,
      marginTop: 6,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: theme.colors.progressFill,
      borderRadius: 2,
    },
    generatingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.primary[500],
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.lg,
    },
    generatingText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '600',
      marginTop: 4,
      textAlign: 'center',
    },
    defaultCover: {
      width: '70%',
      height: '70%',
      opacity: 0.8,
    },
  });
  
  return (
    <AnimatedPressable
      style={[styles.container, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      onLongPress={handleLongPress}
    >
      <View style={styles.imageContainer}>
        {book.coverUrl ? (
          <Image
            source={{ uri: book.coverUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholder}>
            <Image
              source={DEFAULT_COVER}
              style={styles.defaultCover}
              resizeMode="contain"
            />
          </View>
        )}
        
        {/* Generation indicator overlay */}
        {isGenerating && (
          <Animated.View style={[styles.generatingOverlay, pulseStyle]}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.generatingText}>Creating...</Text>
          </Animated.View>
        )}
      </View>
      
      {showAuthor && (
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {book.title}
          </Text>
          {book.authors && book.authors.length > 0 && (
            <Text style={styles.author} numberOfLines={1}>
              {book.authors[0]}
            </Text>
          )}
          {showProgress && progress > 0 && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          )}
        </View>
      )}
    </AnimatedPressable>
  );
}
```

---

### Mobile: Book List Component (scrollable book collection)
**File:** `apps/mobile/src/components/ui/BookList.tsx` | **Size:** 8.3 KB | **Lines:** 252

```tsx
/**
 * BookList Component - Horizontal scrollable book list
 * Inspired by himanchau/react-native-book-app BookList.jsx
 */

import React from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { CatalogBook } from '../../services/catalogService';
import { LibraryBook } from '../../stores/bookStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme';
import BookCard from './BookCard';
import Text from './Text';
import { getDownloadedChapters, getDownloadedSubChunks } from '../../services/audioStorageService';
import { playChapter } from '../../services/audioService';

interface BookListProps {
  title: string;
  books: (CatalogBook | LibraryBook)[];
  showCount?: boolean;
  showProgress?: boolean;
  onSeeAll?: () => void;
  emptyMessage?: string;
  /** Set to true when used inside a ScrollView to avoid nesting warnings */
  nestedInScrollView?: boolean;
}

export default function BookList({
  title,
  books,
  showCount = true,
  showProgress = false,
  onSeeAll,
  emptyMessage = 'No books yet',
  nestedInScrollView = false,
}: BookListProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const scrollX = useSharedValue(0);
  
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const { setNowPlaying, setShowMiniPlayer } = usePlayerStore();
  
  const handleBookPress = async (book: CatalogBook | LibraryBook) => {
    // Check if this is a generated audiobook
    const isLibraryBook = 'isGenerated' in book;
    const isGeneratedAudiobook = isLibraryBook && (book as LibraryBook).isGenerated;
    const isGeneratingAudiobook = isLibraryBook && (book as LibraryBook).isGenerating;
    
    // DEBUG: Trace audiobook detection
    console.log('📚 [BookList.handleBookPress] Book pressed:', {
      id: book.id,
      title: book.title,
      isLibraryBook,
      isGeneratedAudiobook,
      isGeneratingAudiobook,
      isGeneratedFlag: isLibraryBook ? (book as LibraryBook).isGenerated : 'N/A',
    });
    
    if (isGeneratedAudiobook || isGeneratingAudiobook) {
      // For generated audiobooks, check if we have local files
      const libBook = book as LibraryBook;
      const downloadedChapters = getDownloadedChapters(book.id);
      const firstChapterIndex = libBook.chapters?.[0]?.index ?? 1;
      const downloadedSubChunks = getDownloadedSubChunks(book.id, firstChapterIndex);
      console.log('📚 [BookList.handleBookPress] Downloaded chapters:', downloadedChapters);
      console.log('📚 [BookList.handleBookPress] Downloaded subchunks (chapter 0):', downloadedSubChunks);
      
      // Get chapters from book or create default
      const bookChapters = libBook.chapters || [{ id: 'ch-0', title: 'Full Text', index: 1, duration: 0, url: '' }];
      
      // Prepare now playing data
      const nowPlayingData = {
        bookId: book.id,
        bookTitle: book.id,
        author: 'authors' in book ? (book as CatalogBook).authors?.join(', ') || 'Unknown' : libBook.authors?.join(', ') || 'Unknown',
        coverUrl: book.coverUrl || null,
        chapters: bookChapters,
        totalDuration: libBook.totalDuration || 0,
      };
      
      if (downloadedChapters.length > 0) {
        // Play from local storage
        console.log(`🎵 Playing from LOCAL storage: ${book.title}`);
        
        setNowPlaying(nowPlayingData);
        setShowMiniPlayer(true);
        
        try {
          await playChapter(book.id, bookChapters[0], 0);
          router.push('/player');
        } catch (error) {
          console.error('Failed to start local playback:', error);
          router.push({ pathname: '/book/[id]', params: { id: book.id } });
        }
        return;
      }

      // No local chapter yet - start progressive playback from local subchunks
      console.log(`🎵 Starting progressive playback (local subchunks): ${book.title}`);
      
      setNowPlaying(nowPlayingData);
      setShowMiniPlayer(true);
      router.push('/player');
      
      try {
        await playChapter(book.id, bookChapters[0], 0);
        console.log('✅ Progressive playback started!');
      } catch (error) {
        console.log('⏳ Playback will start when audio is ready:', error);
      }
      return;
    }
    
    // For catalog books or non-generated audiobooks, go to book details
    router.push({
      pathname: '/book/[id]',
      params: { id: book.id },
    });
  };
  
  const styles = StyleSheet.create({
    container: {
      marginBottom: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    titleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    count: {
      color: theme.colors.textSecondary,
    },
    seeAll: {
      color: theme.colors.primary,
    },
    listContainer: {
      paddingHorizontal: spacing.md,
    },
    emptyContainer: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing['2xl'],
      alignItems: 'center',
    },
    emptyText: {
      color: theme.colors.textSecondary,
    },
  });
  
  if (books.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text size="lg" weight="semibold">{title}</Text>
          </View>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text size="lg" weight="semibold">{title}</Text>
          {showCount && (
            <Text size="sm" style={styles.count}>{books.length}</Text>
          )}
        </View>
        {onSeeAll && (
          <Pressable onPress={onSeeAll}>
            <Text size="sm" weight="medium" style={styles.seeAll}>
              See All
            </Text>
          </Pressable>
        )}
      </View>
      
      {/* Per React Native docs: When nested in ScrollView, use regular horizontal ScrollView 
          instead of FlatList to avoid VirtualizedList nesting warning */}
      {nestedInScrollView ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
        >
          {books.map((item, index) => {
            const isGenerating = 'isGenerating' in item && (item as LibraryBook).isGenerating;
            return (
              <BookCard
                key={item.id ? `${item.id}-${index}` : `book-${index}`}
                book={item}
                size="medium"
                onPress={() => handleBookPress(item)}
                showProgress={showProgress}
                progress={'progress' in item ? item.progress : 0}
                isGenerating={isGenerating}
              />
            );
          })}
        </ScrollView>
      ) : (
        <Animated.FlatList
          horizontal
          data={books}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          renderItem={({ item }) => {
            const isGenerating = 'isGenerating' in item && (item as LibraryBook).isGenerating;
            return (
              <BookCard
                book={item}
                size="medium"
                onPress={() => handleBookPress(item)}
                showProgress={showProgress}
                progress={'progress' in item ? item.progress : 0}
                isGenerating={isGenerating}
              />
            );
          }}
        />
      )}
    </View>
  );
}
```

---

### Mobile: Book Store (Zustand state)
**File:** `apps/mobile/src/stores/bookStore.ts` | **Size:** 7.7 KB | **Lines:** 218

```typescript
/**
 * Book Store - Zustand state management for catalog and library
 * Using Zustand persist with AsyncStorage per official docs
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CatalogBook } from '../services/catalogService';

// ============================================================================
// TYPES
// ============================================================================

export type ReadingStatus = 'listening' | 'completed' | 'wishlist' | 'none';

export interface LibraryBook extends CatalogBook {
  status: ReadingStatus;
  addedAt: number;
  lastPlayedAt?: number;
  progress?: number; // 0-100
  currentChapter?: number;
  currentPosition?: number; // in seconds
  totalDuration?: number;
  isGenerated?: boolean; // Has audiobook been generated
  hasGeneratedAudiobook?: boolean; // Alias for isGenerated
  isGenerating?: boolean; // Currently generating audio
  generationProgress?: number;
  chapters?: Array<{ id: string; title: string; index: number; duration: number; url: string; subChunkCount?: number }>;
}

export interface BookState {
  // Library - user's books
  library: LibraryBook[];
  
  // Currently selected book for details
  selectedBook: CatalogBook | null;
  
  // Actions
  addToLibrary: (book: CatalogBook, status: ReadingStatus) => void;
  addBook: (book: Partial<LibraryBook> & { id: string; title: string }) => void;
  removeFromLibrary: (bookId: string) => void;
  updateBookStatus: (bookId: string, status: ReadingStatus) => void;
  updateBookProgress: (bookId: string, progress: number, position?: number, chapter?: number) => void;
  updateGenerationProgress: (bookId: string, progress: number) => void;
  markAsGenerated: (bookId: string, totalDuration: number) => void;
  setSelectedBook: (book: CatalogBook | null) => void;
  clearLibrary: () => void; // Clear all books from library
  
  // Getters
  getBookById: (bookId: string) => LibraryBook | undefined;
  getBooksByStatus: (status: ReadingStatus) => LibraryBook[];
  isInLibrary: (bookId: string) => boolean;
  getLastPlayed: () => LibraryBook | undefined;
  getGeneratingBooks: () => LibraryBook[];
}

// ============================================================================
// STORE
// ============================================================================

export const useBookStore = create<BookState>()(
  persist(
    (set, get) => ({
      library: [],
      selectedBook: null,
      
      addToLibrary: (book: CatalogBook, status: ReadingStatus) => {
        set((state) => {
          // Check if already in library
          const existingIndex = state.library.findIndex(b => b.id === book.id);
          if (existingIndex >= 0) {
            // Update status
            const updated = [...state.library];
            updated[existingIndex] = { ...updated[existingIndex], status };
            return { library: updated };
          }
          
          // Add new book
          const libraryBook: LibraryBook = {
            ...book,
            status,
            addedAt: Date.now(),
            progress: 0,
          };
          return { library: [libraryBook, ...state.library] };
        });
      },
      
      // Add book from backend API response (used by Create screen and Library sync)
      addBook: (book: Partial<LibraryBook> & { id: string; title: string }) => {
        set((state) => {
          const existingIndex = state.library.findIndex(b => b.id === book.id);
          if (existingIndex >= 0) {
            // Update existing book
            const updated = [...state.library];
            updated[existingIndex] = { ...updated[existingIndex], ...book };
            return { library: updated };
          }
          
          // Add new book with defaults
          const libraryBook: LibraryBook = {
            id: book.id,
            title: book.title,
            authors: book.authors || ['Unknown Author'],
            description: book.description || '',
            coverUrl: book.coverUrl ?? null,
            status: book.status || 'listening',
            addedAt: Date.now(),
            progress: book.progress || 0,
            isGenerated: book.isGenerated || false,
            isGenerating: book.isGenerating || false,
            generationProgress: book.generationProgress || 0,
            totalDuration: book.totalDuration || 0,
            chapters: book.chapters || undefined,
            // Required CatalogBook fields
            subjects: book.subjects || [],
            languages: book.languages || [],
            hasFullText: book.hasFullText ?? false,
            _source: book._source || 'gutendex',
            _sourceId: book._sourceId || book.id,
          };
          return { library: [libraryBook, ...state.library] };
        });
      },
      
      removeFromLibrary: (bookId: string) => {
        set((state) => ({
          library: state.library.filter(b => b.id !== bookId),
        }));
      },
      
      updateBookStatus: (bookId: string, status: ReadingStatus) => {
        set((state) => ({
          library: state.library.map(b =>
            b.id === bookId ? { ...b, status } : b
          ),
        }));
      },
      
      updateBookProgress: (bookId: string, progress: number, position?: number, chapter?: number) => {
        set((state) => ({
          library: state.library.map(b =>
            b.id === bookId
              ? {
                  ...b,
                  progress,
                  currentPosition: position ?? b.currentPosition,
                  currentChapter: chapter ?? b.currentChapter,
                  lastPlayedAt: Date.now(),
                }
              : b
          ),
        }));
      },
      
      updateGenerationProgress: (bookId: string, progress: number) => {
        set((state) => ({
          library: state.library.map(b =>
            b.id === bookId
              ? { ...b, generationProgress: progress }
              : b
          ),
        }));
      },
      
      markAsGenerated: (bookId: string, totalDuration: number) => {
        set((state) => ({
          library: state.library.map(b =>
            b.id === bookId
              ? { ...b, isGenerated: true, totalDuration, generationProgress: 100 }
              : b
          ),
        }));
      },
      
      setSelectedBook: (book: CatalogBook | null) => {
        set({ selectedBook: book });
      },
      
      getBookById: (bookId: string) => {
        return get().library.find(b => b.id === bookId);
      },
      
      getBooksByStatus: (status: ReadingStatus) => {
        return get().library.filter(b => b.status === status);
      },
      
      isInLibrary: (bookId: string) => {
        return get().library.some(b => b.id === bookId);
      },
      
      getLastPlayed: () => {
        const listening = get().library.filter(b => b.status === 'listening' && b.lastPlayedAt);
        if (listening.length === 0) return undefined;
        return listening.sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))[0];
      },
      
      getGeneratingBooks: () => {
        return get().library.filter(b => 
          b.generationProgress !== undefined && 
          b.generationProgress > 0 && 
          b.generationProgress < 100
        );
      },
      
      clearLibrary: () => {
        set({ library: [] });
      },
    }),
    {
      name: 'voicelibri-books',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ library: state.library }), // Only persist library
    }
  )
);
```

---

### Mobile: Catalog Service (audiobook catalog)
**File:** `apps/mobile/src/services/catalogService.ts` | **Size:** 13.3 KB | **Lines:** 394

```typescript
/**
 * VoiceLibri Unified Book Catalog
 * Seamlessly merges Gutendex + Open Library into one catalog experience
 * User sees only "VoiceLibri Catalog" - no awareness of underlying sources
 */

import * as gutendex from './gutendexApi';
import * as openLibrary from './openLibraryApi';

// ============================================================================
// UNIFIED BOOK TYPE - Single format for all books regardless of source
// Only books with SUPPORTED FORMATS are shown (EPUB, TXT, HTML, MOBI)
// PDF is excluded due to OCR quality issues that result in poor audiobooks
// ============================================================================

export type BookSource = 'gutendex' | 'openlibrary';

export interface CatalogBook {
  id: string; // Unified ID: "g_123" for gutendex, "ol_OL123W" for openlibrary
  title: string;
  authors: string[];
  coverUrl: string | null;
  description?: string;
  subjects: string[];
  languages: string[];
  publishYear?: number;
  rating?: number;
  downloadCount?: number;
  
  // For audiobook generation - supported formats: EPUB, TXT, HTML, MOBI
  hasFullText: boolean;
  textUrl?: string;   // Plain text (.txt)
  epubUrl?: string;   // EPUB format (preferred)
  htmlUrl?: string;   // HTML format
  mobiUrl?: string;   // MOBI/KF8 format
  
  // Internal - hidden from UI
  _source: BookSource;
  _sourceId: string | number;
}

export interface CatalogSearchResult {
  books: CatalogBook[];
  totalCount: number;
  hasMore: boolean;
  nextPage?: number;
}

// ============================================================================
// CURATED GENRES - Unified genres for both sources
// ============================================================================

export interface Genre {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export const GENRES: Genre[] = [
  { id: 'fiction', name: 'Fiction', icon: '📖', color: '#6366f1' },
  { id: 'science-fiction', name: 'Sci-Fi', icon: '🚀', color: '#8b5cf6' },
  { id: 'fantasy', name: 'Fantasy', icon: '🧙', color: '#a855f7' },
  { id: 'romance', name: 'Romance', icon: '💕', color: '#ec4899' },
  { id: 'mystery', name: 'Mystery', icon: '🔍', color: '#f43f5e' },
  { id: 'adventure', name: 'Adventure', icon: '🗺️', color: '#f97316' },
  { id: 'horror', name: 'Horror', icon: '👻', color: '#64748b' },
  { id: 'classics', name: 'Classics', icon: '🏛️', color: '#0ea5e9' },
  { id: 'history', name: 'History', icon: '📜', color: '#14b8a6' },
  { id: 'philosophy', name: 'Philosophy', icon: '🤔', color: '#22c55e' },
  { id: 'poetry', name: 'Poetry', icon: '✨', color: '#eab308' },
  { id: 'children', name: 'Children', icon: '🧸', color: '#f472b6' },
];

// ============================================================================
// CONVERTERS - Transform API responses to unified format
// Only books with SUPPORTED FORMATS are included (EPUB, TXT, HTML, MOBI)
// PDF is excluded due to OCR quality issues
// ============================================================================

function gutendexToCatalogBook(book: gutendex.GutendexBook): CatalogBook | null {
  // Get best available download URL - only show books we can convert to audiobooks
  const downloadInfo = gutendex.getBestDownloadUrl(book);
  
  // Filter out books without supported formats
  if (!downloadInfo) {
    return null;
  }
  
  return {
    id: `g_${book.id}`,
    title: book.title,
    authors: book.authors.map(a => a.name),
    coverUrl: gutendex.getBookCoverUrl(book),
    description: book.summaries?.[0],
    subjects: [...book.subjects, ...book.bookshelves],
    languages: book.languages,
    publishYear: book.authors[0]?.birth_year ? book.authors[0].birth_year + 30 : undefined,
    downloadCount: book.download_count,
    hasFullText: true, // We only include books with downloadable text
    textUrl: gutendex.getTextUrl(book) || undefined,
    epubUrl: gutendex.getEpubUrl(book) || undefined,
    htmlUrl: gutendex.getHtmlUrl(book) || undefined,
    mobiUrl: gutendex.getMobiUrl(book) || undefined,
    _source: 'gutendex',
    _sourceId: book.id,
  };
}

function openLibraryToCatalogBook(doc: openLibrary.OpenLibraryDoc): CatalogBook {
  const coverId = doc.cover_i;
  return {
    id: `ol_${doc.key.replace('/works/', '')}`,
    title: doc.title,
    authors: doc.author_name || [],
    coverUrl: coverId ? openLibrary.getCoverUrl(coverId, 'M') : null,
    subjects: doc.subject?.slice(0, 10) || [],
    languages: doc.language || ['en'],
    publishYear: doc.first_publish_year,
    rating: doc.ratings_average,
    hasFullText: doc.has_fulltext || false,
    _source: 'openlibrary',
    _sourceId: doc.key,
  };
}

// ============================================================================
// DEDUPLICATION - Merge results from both sources
// ============================================================================

function deduplicateBooks(books: CatalogBook[]): CatalogBook[] {
  const seen = new Map<string, CatalogBook>();
  
  for (const book of books) {
    // Create a normalized key for deduplication
    const normalizedTitle = book.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const firstAuthor = book.authors[0]?.toLowerCase().replace(/[^a-z]/g, '') || '';
    const dedupKey = `${normalizedTitle}_${firstAuthor}`;
    
    if (!seen.has(dedupKey)) {
      seen.set(dedupKey, book);
    } else {
      // Prefer Gutendex (has full text) over OpenLibrary
      const existing = seen.get(dedupKey)!;
      if (book._source === 'gutendex' && existing._source === 'openlibrary') {
        seen.set(dedupKey, book);
      }
    }
  }
  
  return Array.from(seen.values());
}

// ============================================================================
// UNIFIED CATALOG API
// ============================================================================

/**
 * Search the unified VoiceLibri catalog
 * Only returns books with supported formats (EPUB, TXT, HTML, MOBI)
 */
export async function searchCatalog(
  query: string,
  options: { page?: number; limit?: number } = {}
): Promise<CatalogSearchResult> {
  const { page = 1, limit = 20 } = options;
  
  try {
    // Search both sources in parallel
    const [gutendexResults, olResults] = await Promise.allSettled([
      gutendex.searchBooks({ search: query, page }),
      openLibrary.searchBooks(query, { limit, offset: (page - 1) * limit }),
    ]);
    
    const books: CatalogBook[] = [];
    let totalCount = 0;
    
    // Process Gutendex results - filter out books without supported formats
    if (gutendexResults.status === 'fulfilled') {
      const gBooks = gutendexResults.value.results
        .map(gutendexToCatalogBook)
        .filter((b): b is CatalogBook => b !== null); // Filter nulls (unsupported formats)
      books.push(...gBooks);
      totalCount += gBooks.length; // Count only books we can use
    }
    
    // Process OpenLibrary results - only include books with full text
    if (olResults.status === 'fulfilled') {
      const olBooks = olResults.value.docs
        .filter(doc => doc.has_fulltext) // Only books with downloadable text
        .map(openLibraryToCatalogBook);
      books.push(...olBooks);
      totalCount += olBooks.length;
    }
    
    // Deduplicate and sort by relevance (prefer books with covers and full text)
    const dedupedBooks = deduplicateBooks(books);
    dedupedBooks.sort((a, b) => {
      // Prioritize books with full text
      if (a.hasFullText && !b.hasFullText) return -1;
      if (!a.hasFullText && b.hasFullText) return 1;
      // Then by cover availability
      if (a.coverUrl && !b.coverUrl) return -1;
      if (!a.coverUrl && b.coverUrl) return 1;
      // Then by download count (Gutendex)
      return (b.downloadCount || 0) - (a.downloadCount || 0);
    });
    
    return {
      books: dedupedBooks.slice(0, limit),
      totalCount,
      hasMore: dedupedBooks.length > limit || page * limit < totalCount,
      nextPage: page + 1,
    };
  } catch (error) {
    console.error('Catalog search error:', error);
    return { books: [], totalCount: 0, hasMore: false };
  }
}

/**
 * Get popular/trending books
 * Only returns books with supported formats (EPUB, TXT, HTML, MOBI)
 */
export async function getPopularBooks(
  options: { page?: number; limit?: number } = {}
): Promise<CatalogSearchResult> {
  const { page = 1, limit = 20 } = options;
  
  try {
    // Gutendex returns popular by default
    const gutendexResults = await gutendex.getPopularBooks('en', page);
    const books = gutendexResults.results
      .map(gutendexToCatalogBook)
      .filter((b): b is CatalogBook => b !== null); // Filter unsupported formats
    
    return {
      books: books.slice(0, limit),
      totalCount: books.length,
      hasMore: !!gutendexResults.next,
      nextPage: page + 1,
    };
  } catch (error) {
    console.error('Popular books error:', error);
    return { books: [], totalCount: 0, hasMore: false };
  }
}

/**
 * Get books by genre
 * Only returns books with supported formats (EPUB, TXT, HTML, MOBI)
 */
export async function getBooksByGenre(
  genreId: string,
  options: { page?: number; limit?: number } = {}
): Promise<CatalogSearchResult> {
  const { page = 1, limit = 20 } = options;
  
  try {
    // Search both sources for the genre
    const [gutendexResults, olResults] = await Promise.allSettled([
      gutendex.getBooksByTopic(genreId, 'en', page),
      openLibrary.searchBySubject(genreId, { limit, offset: (page - 1) * limit }),
    ]);
    
    const books: CatalogBook[] = [];
    let totalCount = 0;
    
    // Process Gutendex - filter out unsupported formats
    if (gutendexResults.status === 'fulfilled') {
      const gBooks = gutendexResults.value.results
        .map(gutendexToCatalogBook)
        .filter((b): b is CatalogBook => b !== null);
      books.push(...gBooks);
      totalCount += gBooks.length;
    }
    
    // Process OpenLibrary - only books with full text
    if (olResults.status === 'fulfilled') {
      const olBooks = olResults.value.docs
        .filter(doc => doc.has_fulltext)
        .map(openLibraryToCatalogBook);
      books.push(...olBooks);
      totalCount += olBooks.length;
    }
    
    const dedupedBooks = deduplicateBooks(books);
    dedupedBooks.sort((a, b) => {
      if (a.hasFullText && !b.hasFullText) return -1;
      if (!a.hasFullText && b.hasFullText) return 1;
      return (b.downloadCount || 0) - (a.downloadCount || 0);
    });
    
    return {
      books: dedupedBooks.slice(0, limit),
      totalCount,
      hasMore: dedupedBooks.length > limit,
      nextPage: page + 1,
    };
  } catch (error) {
    console.error('Genre books error:', error);
    return { books: [], totalCount: 0, hasMore: false };
  }
}

/**
 * Get curated featured books for home screen
 */
export async function getFeaturedBooks(): Promise<CatalogBook[]> {
  try {
    // Get top popular books with good covers
    const result = await getPopularBooks({ limit: 10 });
    return result.books.filter(b => b.coverUrl);
  } catch (error) {
    console.error('Featured books error:', error);
    return [];
  }
}

/**
 * Get book details by unified ID
 */
export async function getBookDetails(id: string): Promise<CatalogBook | null> {
  try {
    if (id.startsWith('g_')) {
      // Gutendex book
      const bookId = parseInt(id.replace('g_', ''), 10);
      const book = await gutendex.getBook(bookId);
      return gutendexToCatalogBook(book);
    } else if (id.startsWith('ol_')) {
      // OpenLibrary book
      const workId = id.replace('ol_', '');
      const work = await openLibrary.getWork(workId);
      
      // Convert work to CatalogBook format
      const coverId = work.covers?.[0];
      return {
        id,
        title: work.title,
        authors: [], // Need separate author fetch
        coverUrl: coverId ? openLibrary.getCoverUrl(coverId, 'L') : null,
        description: openLibrary.getDescriptionText(work.description),
        subjects: work.subjects || [],
        languages: ['en'],
        publishYear: work.first_publish_date ? parseInt(work.first_publish_date) : undefined,
        hasFullText: false,
        _source: 'openlibrary',
        _sourceId: work.key,
      };
    }
    return null;
  } catch (error) {
    console.error('Book details error:', error);
    return null;
  }
}

/**
 * Get the best text content URL for audiobook generation
 * Priority: EPUB > TXT > HTML > MOBI
 */
export function getTextContentUrl(book: CatalogBook): string | null {
  // Priority order - EPUB is best for chapters, then TXT for clean text
  if (book.epubUrl) return book.epubUrl;
  if (book.textUrl) return book.textUrl;
  if (book.htmlUrl) return book.htmlUrl;
  if (book.mobiUrl) return book.mobiUrl;
  return null;
}

/**
 * Check if book can be converted to audiobook
 * Must have at least one supported format (EPUB, TXT, HTML, MOBI)
 */
export function canGenerateAudiobook(book: CatalogBook): boolean {
  return book.hasFullText && (
    !!book.epubUrl || 
    !!book.textUrl || 
    !!book.htmlUrl || 
    !!book.mobiUrl
  );
}

export default {
  searchCatalog,
  getPopularBooks,
  getBooksByGenre,
  getFeaturedBooks,
  getBookDetails,
  getTextContentUrl,
  canGenerateAudiobook,
  GENRES,
};
```

---

### Mobile: Create Audiobook Sheet (book upload, generation trigger)
**File:** `apps/mobile/src/components/ui/CreateAudiobookSheet.tsx` | **Size:** 40.1 KB | **Lines:** 1084

```tsx
/**
 * CreateAudiobookSheet - Bottom sheet modal for audiobook creation
 * Triggered from Library screen FAB and Book detail "Create Audiobook" button
 * 
 * Features:
 * - File selection from backend
 * - Text paste
 * - URL import
 * - Voice selection (male/female)
 * - Target language
 * - Multi-voice toggle
 */

import React, { useState, useCallback, useMemo, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Alert,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, borderRadius, typography, colors } from '../../theme';
import Text from './Text';
import Button from './Button';
import { usePlayerStore, useBookStore } from '../../stores';
import {
  createFromText,
  createFromUrl,
  type BookSelectResult,
  type AvailableBook,
} from '../../services/voiceLibriApi';

// ============================================================================
// VOICE OPTIONS (matches PWA-V2 GenerateScreen)
// ============================================================================

const MALE_VOICES = [
  { alias: 'Arthur', geminiName: 'Achird' },
  { alias: 'Albert', geminiName: 'Algieba' },
  { alias: 'Alex', geminiName: 'Algenib' },
  { alias: 'Charles', geminiName: 'Charon' },
  { alias: 'Eric', geminiName: 'Enceladus' },
  { alias: 'Fero', geminiName: 'Fenrir' },
  { alias: 'Ian', geminiName: 'Iapetus' },
  { alias: 'Milan', geminiName: 'Alnilam' },
  { alias: 'Oliver', geminiName: 'Orus' },
  { alias: 'Peter', geminiName: 'Puck' },
  { alias: 'Ross', geminiName: 'Rasalgethi' },
  { alias: 'Scott', geminiName: 'Schedar' },
  { alias: 'Simon', geminiName: 'Sadaltager' },
  { alias: 'Stan', geminiName: 'Sadachbia' },
  { alias: 'Umberto', geminiName: 'Umbriel' },
  { alias: 'Zachary', geminiName: 'Zubenelgenubi' },
];

const FEMALE_VOICES = [
  { alias: 'Ada', geminiName: 'Aoede' },
  { alias: 'Ash', geminiName: 'Achernar' },
  { alias: 'Callie', geminiName: 'Callirrhoe' },
  { alias: 'Cora', geminiName: 'Kore' },
  { alias: 'Desi', geminiName: 'Despina' },
  { alias: 'Erin', geminiName: 'Erinome' },
  { alias: 'Grace', geminiName: 'Gacrux' },
  { alias: 'Laura', geminiName: 'Laomedeia' },
  { alias: 'Lea', geminiName: 'Leda' },
  { alias: 'Paula', geminiName: 'Pulcherrima' },
  { alias: 'Sue', geminiName: 'Sulafat' },
  { alias: 'Toni', geminiName: 'Autonoe' },
  { alias: 'Vinnie', geminiName: 'Vindemiatrix' },
  { alias: 'Zara', geminiName: 'Zephyr' },
];

const LANGUAGES = [
  { label: 'Original', value: 'original' },
  { label: 'English', value: 'en-US' },
  { label: 'Czech', value: 'cs-CZ' },
  { label: 'German', value: 'de-DE' },
  { label: 'Spanish', value: 'es-ES' },
  { label: 'French', value: 'fr-FR' },
  { label: 'Italian', value: 'it-IT' },
  { label: 'Japanese', value: 'ja-JP' },
  { label: 'Korean', value: 'ko-KR' },
  { label: 'Polish', value: 'pl-PL' },
  { label: 'Portuguese', value: 'pt-BR' },
  { label: 'Russian', value: 'ru-RU' },
  { label: 'Slovak', value: 'sk-SK' },
  { label: 'Ukrainian', value: 'uk-UA' },
  { label: 'Chinese', value: 'zh-CN' },
];

// ============================================================================
// TYPES
// ============================================================================

export interface CreateAudiobookSheetRef {
  open: (preselectedFile?: AvailableBook) => void;
  close: () => void;
}

interface CreateAudiobookSheetProps {
  onCreated?: (bookTitle: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

const CreateAudiobookSheet = forwardRef<CreateAudiobookSheetRef, CreateAudiobookSheetProps>(
  ({ onCreated }, ref) => {
    const { theme, isDark } = useTheme();
    const router = useRouter();
    const bottomSheetRef = useRef<BottomSheet>(null);
    const { setShowMiniPlayer, setNowPlaying } = usePlayerStore();
    const { addBook } = useBookStore();
    
    // Snap points for bottom sheet
    const snapPoints = useMemo(() => ['92%'], []);
    
    // Input state
    const [inputMode, setInputMode] = useState<'file' | 'text' | 'url'>('file');
    const [selectedFile, setSelectedFile] = useState<AvailableBook | null>(null);
    const [localFileUri, setLocalFileUri] = useState<string | null>(null);
    const [localFileName, setLocalFileName] = useState<string | null>(null);
    const [pastedText, setPastedText] = useState('');
    const [urlInput, setUrlInput] = useState('');
    const [customTitle, setCustomTitle] = useState('');
    
    // Settings state
    const [narratorGender, setNarratorGender] = useState<'female' | 'male'>('female');
    const [narratorVoice, setNarratorVoice] = useState('Ada');
    const [targetLanguage, setTargetLanguage] = useState('original');
    const [multiVoice, setMultiVoice] = useState(true);
    
    // UI state
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingFile, setIsLoadingFile] = useState(false);
    const [showVoicePicker, setShowVoicePicker] = useState(false);
    const [showLanguagePicker, setShowLanguagePicker] = useState(false);
    
    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      open: (preselectedFile?: AvailableBook) => {
        if (preselectedFile) {
          setSelectedFile(preselectedFile);
          setInputMode('file');
        }
        bottomSheetRef.current?.expand();
      },
      close: () => {
        bottomSheetRef.current?.close();
      },
    }));
    
    // Get voices based on gender
    const availableVoices = narratorGender === 'female' ? FEMALE_VOICES : MALE_VOICES;
    
    // Handle gender change - reset voice to first of new gender
    const handleGenderChange = (gender: 'female' | 'male') => {
      Haptics.selectionAsync();
      setNarratorGender(gender);
      setNarratorVoice(gender === 'female' ? FEMALE_VOICES[0].alias : MALE_VOICES[0].alias);
    };
    
    // Convert voice alias to Gemini name
    const aliasToGeminiName = (alias: string): string => {
      const allVoices = [...MALE_VOICES, ...FEMALE_VOICES];
      const voice = allVoices.find(v => v.alias === alias);
      return voice?.geminiName || 'Aoede';
    };
    
    // Poll for first subchunk in background, then auto-start playback
    const startBackgroundPlaybackPolling = async (
      bookTitle: string,
      chapters: Array<{ id: string; title: string; index: number; duration: number; url: string; subChunkCount?: number }>,
      author: string
    ) => {
      const { playChapter } = await import('../../services/audioService');
      const { downloadSubChunk } = await import('../../services/audioStorageService');
      const { getSubChunkAudioUrl } = await import('../../services/voiceLibriApi');
      
      const maxWaitMs = 120000; // 2 minutes max wait
      const pollIntervalMs = 2000; // Check every 2 seconds
      const startTime = Date.now();
      
      console.log(`⏳ [BackgroundPoll] Waiting for first subchunk of "${bookTitle}"...`);
      
      const firstChapterIndex = chapters[0]?.index ?? 1;

      while (Date.now() - startTime < maxWaitMs) {
        try {
          const url = getSubChunkAudioUrl(bookTitle, firstChapterIndex, 0);
          const response = await fetch(url, { method: 'HEAD' });

          if (response.ok) {
            await downloadSubChunk(bookTitle, firstChapterIndex, 0);
            console.log(`✅ [BackgroundPoll] First subchunk ready after ${Date.now() - startTime}ms`);
            
            // Update book state: no longer generating, now generated
            addBook({
              id: bookTitle,
              title: bookTitle,
              isGenerating: false,
              isGenerated: true,
            });
            
            // Set up now playing for mini player
            const nowPlayingData = {
              bookId: bookTitle,
              bookTitle: bookTitle,
              author: author,
              coverUrl: null,
              chapters: chapters,
              totalDuration: 0,
            };
            
            // Show mini player and start playback
            setNowPlaying(nowPlayingData);
            setShowMiniPlayer(true);
            
            // Start playing
            try {
              await playChapter(bookTitle, chapters[0], 0);
              console.log('🎵 [BackgroundPoll] Auto-playback started!');
            } catch (playError) {
              console.error('❌ [BackgroundPoll] Failed to start playback:', playError);
            }
            
            return; // Success - exit polling
          }
        } catch (error) {
          // Continue polling
        }
        
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
      
      console.log(`⚠️ [BackgroundPoll] Timeout waiting for first subchunk of "${bookTitle}"`);
      // Mark as no longer generating but keep in library
      addBook({
        id: bookTitle,
        title: bookTitle,
        isGenerating: false,
        isGenerated: false,
      });
    };
    
    // Supported file extensions for audiobook generation
    const SUPPORTED_EXTENSIONS = ['epub', 'txt', 'md', 'markdown', 'html', 'htm', 'docx', 'doc', 'odt', 'rtf', 'pdf', 'mobi', 'azw', 'azw3', 'kf8', 'pages', 'wps'];
    
    // MIME types that are explicitly NOT supported (audio, video, images, etc.)
    const UNSUPPORTED_MIME_PREFIXES = ['audio/', 'video/', 'image/', 'font/', 'model/'];
    
    // MIME types for supported formats (per expo-document-picker docs)
    // Only these file types will be visible in the file picker
    // NOTE: iOS may still show some files in browse mode due to UTI limitations
    const SUPPORTED_MIME_TYPES = [
      // Ebooks
      'application/epub+zip',                                              // EPUB
      'application/x-mobipocket-ebook',                                    // MOBI
      'application/vnd.amazon.ebook',                                      // AZW/KF8
      // Documents
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
      'application/msword',                                                // DOC
      'application/vnd.oasis.opendocument.text',                          // ODT
      'application/rtf',                                                   // RTF
      'text/rtf',                                                          // RTF alt
      'application/pdf',                                                   // PDF
      'application/vnd.apple.pages',                                       // Pages
      'application/vnd.ms-works',                                          // WPS
      // Text
      'text/plain',                                                        // TXT
      'text/markdown',                                                     // MD
      'text/x-markdown',                                                   // MD alt
      'text/html',                                                         // HTML
    ];
    
    // Check if a MIME type is explicitly unsupported
    const isUnsupportedMimeType = (mimeType: string | undefined): boolean => {
      if (!mimeType) return false;
      return UNSUPPORTED_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix));
    };
    
    // Handle file selection from device using expo-document-picker (per official docs)
    const handleSelectFile = async () => {
      try {
        Haptics.selectionAsync();
        setIsLoadingFile(true);
        setError(null);
        
        // Use getDocumentAsync per official expo-document-picker docs
        // Only show supported file types - no */* wildcard
        // copyToCacheDirectory: true allows expo-file-system to read immediately
        const result = await DocumentPicker.getDocumentAsync({
          type: SUPPORTED_MIME_TYPES,
          copyToCacheDirectory: true,
        });
        
        if (result.canceled) {
          console.log('Document picker cancelled');
          setIsLoadingFile(false);
          return;
        }
        
        // Get the first picked asset
        const asset = result.assets[0];
        console.log('📄 Selected file:', asset.name, asset.uri, asset.mimeType);
        
        // First check: Reject explicitly unsupported MIME types (audio, video, images)
        // This catches cases where iOS UTI filtering didn't work perfectly
        if (isUnsupportedMimeType(asset.mimeType)) {
          const mimeCategory = asset.mimeType?.split('/')[0] || 'unknown';
          const categoryName = mimeCategory.charAt(0).toUpperCase() + mimeCategory.slice(1);
          setError(`❌ ${categoryName} files cannot be converted\n\nVoiceLibri creates audiobooks from text-based files like ebooks and documents.\n\n${categoryName} files don't contain readable text to narrate.`);
          setIsLoadingFile(false);
          return;
        }
        
        // Second check: Validate file extension
        const ext = asset.name.toLowerCase().split('.').pop() || '';
        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
          setError(`❌ .${ext.toUpperCase()} files are not supported\n\nVoiceLibri converts text-based files to audiobooks:\n\n📚 Ebooks: EPUB, MOBI, AZW\n📄 Documents: DOCX, PDF, ODT, RTF\n📝 Text: TXT, MD, HTML`);
          setIsLoadingFile(false);
          return;
        }
        
        // Store file info - show filename in the text input area
        setLocalFileUri(asset.uri);
        setLocalFileName(asset.name);
        setSelectedFile(null);
        setPastedText(asset.name); // Show filename in the text input
        setUrlInput('');
        setInputMode('file');
        
        // Auto-fill title from filename (remove extension)
        const titleFromFile = asset.name.replace(/\.[^.]+$/i, '');
        setCustomTitle(titleFromFile);
        
        setIsLoadingFile(false);
      } catch (err) {
        console.error('Document picker error:', err);
        setError(err instanceof Error ? err.message : 'Failed to pick file');
        setIsLoadingFile(false);
      }
    };
    
    // Clear selected local file
    const handleClearLocalFile = () => {
      setLocalFileUri(null);
      setLocalFileName(null);
      setPastedText(''); // Clear the text input showing filename
      setCustomTitle('');
      setError(null);
      setInputMode('file');
    };
    
    // Handle text input change
    const handleTextChange = (text: string) => {
      // If a file is selected, ignore text changes (filename is shown)
      if (localFileName) return;
      
      // Check if it looks like a URL
      if (text.startsWith('http://') || text.startsWith('https://')) {
        setUrlInput(text);
        setPastedText('');
        setSelectedFile(null);
        setInputMode('url');
      } else {
        setPastedText(text);
        setUrlInput('');
        if (text) setSelectedFile(null);
        setInputMode(text ? 'text' : 'file');
      }
      setError(null);
    };
    
    // Reset form
    const resetForm = () => {
      setSelectedFile(null);
      setLocalFileUri(null);
      setLocalFileName(null);
      setPastedText('');
      setUrlInput('');
      setCustomTitle('');
      setInputMode('file');
      setIsGenerating(false);
      setProgress(0);
      setError(null);
    };
    
    // Handle create audiobook
    const handleCreate = async () => {
      if (!localFileUri && !pastedText && !urlInput) {
        setError('Please select a book from your device, paste text, or enter a URL');
        return;
      }
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsGenerating(true);
      setError(null);
      setProgress(0);
      
      try {
        const geminiVoice = aliasToGeminiName(narratorVoice);
        let result: BookSelectResult;
        
        // Choose API based on input mode
        if (inputMode === 'text' && pastedText) {
          result = await createFromText({
            text: pastedText,
            title: customTitle || 'Pasted Text',
            detectChapters: true,
            narratorVoice: geminiVoice,
            targetLanguage,
          });
        } else if (inputMode === 'url' && urlInput) {
          result = await createFromUrl({
            url: urlInput,
            narratorVoice: geminiVoice,
            targetLanguage,
          });
        } else if (localFileUri && localFileName) {
          // Read file content using expo-file-system (per official docs)
          // For document picker results, create File from the asset object
          console.log('📖 Reading local file:', localFileName, 'from:', localFileUri);
          
          // Create File object from URI (per expo-file-system docs)
          const file = new File(localFileUri);
          
          // Check file extension to determine how to process
          const ext = localFileName.toLowerCase().split('.').pop() || '';
          
          // Define format categories
          const BINARY_FORMATS = ['epub', 'docx', 'doc', 'odt', 'rtf', 'pdf', 'mobi', 'azw', 'azw3', 'kf8', 'pages', 'wps'];
          const TEXT_FORMATS = ['txt', 'md', 'markdown', 'html', 'htm'];
          
          const isBinaryFormat = BINARY_FORMATS.includes(ext);
          const isTextFormat = TEXT_FORMATS.includes(ext);
          
          console.log(`📄 File type: ${ext}, isBinary: ${isBinaryFormat}, isText: ${isTextFormat}`);
          
          if (!isBinaryFormat && !isTextFormat) {
            throw new Error(`❌ .${ext.toUpperCase()} files are not supported\n\nVoiceLibri converts text-based files to audiobooks:\n\n📚 Ebooks: EPUB, MOBI, AZW\n📄 Documents: DOCX, PDF, ODT, RTF\n📝 Text: TXT, MD, HTML`);
          }
          
          if (isBinaryFormat) {
            // For binary files (EPUB, DOCX, PDF, etc.), read as base64 and send to backend
            const base64Content = await file.base64();
            console.log(`📚 ${ext.toUpperCase()} file size (base64):`, base64Content.length);
            
            // Send as base64 to backend for processing
            result = await createFromText({
              text: base64Content,
              title: customTitle || localFileName.replace(new RegExp(`\\.${ext}$`, 'i'), ''),
              detectChapters: true,
              narratorVoice: geminiVoice,
              targetLanguage,
              isBase64File: true,          // Signal to backend this is base64 binary file
              fileExtension: ext,           // Tell backend the file type
            });
          } else {
            // For text files (TXT, MD, HTML), read as string
            const textContent = await file.text();
            console.log('📄 Text file length:', textContent.length);
            
            if (!textContent || textContent.trim().length === 0) {
              throw new Error('The selected file appears to be empty or could not be read.');
            }
            
            result = await createFromText({
              text: textContent,
              title: customTitle || localFileName.replace(/\.[^.]+$/i, ''),
              detectChapters: true,
              narratorVoice: geminiVoice,
              targetLanguage,
              fileExtension: ext,           // Tell backend the file type for proper processing
            });
          }
        } else {
          throw new Error('No valid input provided');
        }
        
        const bookTitle = result.audiobookTitle || result.title;
        
        // NOTE: createFromText/createFromUrl already triggers background dramatization and TTS
        // generation via loadBookFile(). No need to call generateAudiobook separately.
        // The backend will automatically process the book and generate audio.
        console.log(`✅ Book loaded and generation started: ${bookTitle}`);
        
        // Create book object for library with generation in progress
        const hasChapters = result.chapters && result.chapters.length > 0;
        const chaptersForBook = hasChapters ? result.chapters!.map((ch, i) => ({
          id: `ch-${i}`,
          title: ch.title,
          index: ch.index,
          duration: 0,
          url: '',
          subChunkCount: ch.subChunkCount,
        })) : [{
          id: 'ch-0',
          title: 'Full Text',
          index: 1,
          duration: 0,
          url: '',
        }];
        
        const book = {
          id: bookTitle,
          title: result.title,
          author: result.author || 'Unknown Author',
          coverUrl: null,
          totalDuration: result._internal?.durationSeconds || 0,
          chapters: chaptersForBook,
          isGenerated: false, // Not yet generated
          isGenerating: true, // Currently generating
          generationProgress: 0,
        };
        
        // Add to library - will show with generating indicator
        console.log('📖 [CreateAudiobookSheet] Adding book to library (generating):', {
          id: book.id,
          title: book.title,
          isGenerating: book.isGenerating,
        });
        addBook(book);
        
        // Close sheet - DO NOT navigate to player or show MiniPlayer yet
        bottomSheetRef.current?.close();
        resetForm();
        setIsGenerating(false);
        
        // Poll for first subchunk in background, then start playback automatically
        startBackgroundPlaybackPolling(bookTitle, chaptersForBook, result.author || 'Unknown Author');
        
        onCreated?.(bookTitle);
        console.log(`✅ Audiobook "${bookTitle}" generation started! Will auto-play when ready.`);
      } catch (err) {
        console.error('Generation error:', err);
        setError(err instanceof Error ? err.message : 'Failed to generate audiobook');
        setIsGenerating(false);
      }
    };
    
    // Render backdrop
    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.6}
        />
      ),
      []
    );
    
    // Styles
    const styles = StyleSheet.create({
      container: {
        flex: 1,
        backgroundColor: theme.colors.card,
      },
      header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      title: {
        fontSize: typography['2xl'],
        fontWeight: typography.bold,
        color: theme.colors.text,
      },
      closeButton: {
        padding: spacing.xs,
      },
      content: {
        flex: 1,
        paddingHorizontal: spacing.lg,
      },
      section: {
        marginTop: spacing.lg,
      },
      sectionTitle: {
        fontSize: typography.sm,
        fontWeight: typography.semibold,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: spacing.sm,
      },
      card: {
        backgroundColor: theme.colors.cardElevated,
        borderRadius: borderRadius.xl,
        padding: spacing.md,
      },
      inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
      },
      textInput: {
        flex: 1,
        backgroundColor: theme.colors.background,
        borderRadius: borderRadius.lg,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        fontSize: typography.base,
        color: theme.colors.text,
        minHeight: 48,
      },
      uploadButton: {
        width: 48,
        height: 48,
        borderRadius: borderRadius.lg,
        backgroundColor: theme.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      },
      selectedFile: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginTop: spacing.sm,
        gap: spacing.sm,
      },
      selectedFileName: {
        flex: 1,
        fontSize: typography.sm,
        color: theme.colors.text,
      },
      clearButton: {
        padding: spacing.xs,
      },
      settingsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      settingsLabel: {
        fontSize: typography.base,
        color: theme.colors.text,
      },
      settingsValue: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
      },
      settingsValueText: {
        fontSize: typography.base,
        color: theme.colors.textSecondary,
      },
      genderToggle: {
        flexDirection: 'row',
        backgroundColor: theme.colors.background,
        borderRadius: borderRadius.lg,
        padding: 2,
      },
      genderButton: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.md,
      },
      genderButtonActive: {
        backgroundColor: theme.colors.primary,
      },
      genderText: {
        fontSize: typography.sm,
        color: theme.colors.textMuted,
      },
      genderTextActive: {
        color: '#fff',
        fontWeight: typography.medium,
      },
      toggleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.sm,
      },
      toggle: {
        width: 50,
        height: 28,
        borderRadius: 14,
        padding: 2,
        justifyContent: 'center',
      },
      toggleOff: {
        backgroundColor: theme.colors.border,
      },
      toggleOn: {
        backgroundColor: theme.colors.primary,
      },
      toggleKnob: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#fff',
      },
      toggleKnobOn: {
        alignSelf: 'flex-end',
      },
      error: {
        backgroundColor: colors.error + '20',
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginTop: spacing.md,
      },
      errorText: {
        flex: 1,
        fontSize: typography.sm,
        color: colors.error,
      },
      createButton: {
        marginTop: spacing.xl,
        marginBottom: spacing['2xl'],
      },
      progressContainer: {
        alignItems: 'center',
        padding: spacing.xl,
      },
      progressText: {
        fontSize: typography.base,
        color: theme.colors.textSecondary,
        marginTop: spacing.md,
      },
      // Picker modal styles
      pickerOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
      },
      pickerContent: {
        backgroundColor: theme.colors.card,
        borderTopLeftRadius: borderRadius['2xl'],
        borderTopRightRadius: borderRadius['2xl'],
        maxHeight: Dimensions.get('window').height * 0.5,
      },
      pickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      pickerTitle: {
        fontSize: typography.lg,
        fontWeight: typography.semibold,
        color: theme.colors.text,
      },
      pickerList: {
        padding: spacing.md,
      },
      pickerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        borderRadius: borderRadius.lg,
        marginBottom: spacing.xs,
      },
      pickerItemSelected: {
        backgroundColor: theme.colors.primary + '20',
      },
      pickerItemText: {
        flex: 1,
        fontSize: typography.base,
        color: theme.colors.text,
      },
      pickerItemTextSelected: {
        color: theme.colors.primary,
        fontWeight: typography.medium,
      },
      formatHint: {
        fontSize: typography.xs,
        color: theme.colors.textMuted,
        textAlign: 'center',
        marginTop: spacing.sm,
        fontStyle: 'italic',
      },
    });
    
    // Voice picker
    const renderVoicePicker = () => (
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerContent}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select Voice</Text>
            <TouchableOpacity onPress={() => setShowVoicePicker(false)}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerList}>
            {availableVoices.map((voice) => (
              <TouchableOpacity
                key={voice.alias}
                style={[
                  styles.pickerItem,
                  narratorVoice === voice.alias && styles.pickerItemSelected,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setNarratorVoice(voice.alias);
                  setShowVoicePicker(false);
                }}
              >
                <Ionicons
                  name="mic"
                  size={20}
                  color={theme.colors.textSecondary}
                  style={{ marginRight: spacing.sm }}
                />
                <Text
                  style={[
                    styles.pickerItemText,
                    narratorVoice === voice.alias && styles.pickerItemTextSelected,
                  ]}
                >
                  {voice.alias}
                </Text>
                {narratorVoice === voice.alias && (
                  <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    );
    
    // Language picker
    const renderLanguagePicker = () => (
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerContent}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Target Language</Text>
            <TouchableOpacity onPress={() => setShowLanguagePicker(false)}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerList}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.value}
                style={[
                  styles.pickerItem,
                  targetLanguage === lang.value && styles.pickerItemSelected,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setTargetLanguage(lang.value);
                  setShowLanguagePicker(false);
                }}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    targetLanguage === lang.value && styles.pickerItemTextSelected,
                  ]}
                >
                  {lang.label}
                </Text>
                {targetLanguage === lang.value && (
                  <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    );
    
    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: theme.colors.card }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.textMuted }}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create Audiobook</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => bottomSheetRef.current?.close()}
            >
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          
          <BottomSheetScrollView contentContainerStyle={styles.content}>
            {/* Error message */}
            {error && (
              <View style={styles.error}>
                <Ionicons name="alert-circle" size={20} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => setError(null)}>
                  <Ionicons name="close" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            )}
            
            {/* Input Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Source</Text>
              <View style={styles.card}>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Paste text or URL..."
                    placeholderTextColor={theme.colors.textMuted}
                    value={pastedText || urlInput}
                    onChangeText={handleTextChange}
                    multiline
                    editable={!localFileName} // Disable editing when file is selected
                  />
                  {localFileName ? (
                    <TouchableOpacity
                      style={styles.uploadButton}
                      onPress={handleClearLocalFile}
                    >
                      <Ionicons name="close" size={22} color="#fff" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.uploadButton}
                      onPress={handleSelectFile}
                    >
                      <Ionicons name="folder-open" size={22} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
                {/* Supported formats hint */}
                <Text style={styles.formatHint}>
                  Supported: EPUB, MOBI, DOCX, PDF, TXT, MD, HTML
                </Text>
              </View>
            </View>
            
            {/* Settings Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Settings</Text>
              <View style={styles.card}>
                {/* Target Language */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => setShowLanguagePicker(true)}
                >
                  <Text style={styles.settingsLabel}>Target Language</Text>
                  <View style={styles.settingsValue}>
                    <Text style={styles.settingsValueText}>
                      {LANGUAGES.find(l => l.value === targetLanguage)?.label || 'Original'}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                  </View>
                </TouchableOpacity>
                
                {/* Narrator Gender */}
                <View style={styles.settingsRow}>
                  <Text style={styles.settingsLabel}>Narrator Gender</Text>
                  <View style={styles.genderToggle}>
                    <TouchableOpacity
                      style={[
                        styles.genderButton,
                        narratorGender === 'female' && styles.genderButtonActive,
                      ]}
                      onPress={() => handleGenderChange('female')}
                    >
                      <Text
                        style={[
                          styles.genderText,
                          narratorGender === 'female' && styles.genderTextActive,
                        ]}
                      >
                        Female
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.genderButton,
                        narratorGender === 'male' && styles.genderButtonActive,
                      ]}
                      onPress={() => handleGenderChange('male')}
                    >
                      <Text
                        style={[
                          styles.genderText,
                          narratorGender === 'male' && styles.genderTextActive,
                        ]}
                      >
                        Male
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                
                {/* Narrator Voice */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => setShowVoicePicker(true)}
                >
                  <Text style={styles.settingsLabel}>Narrator Voice</Text>
                  <View style={styles.settingsValue}>
                    <Text style={styles.settingsValueText}>{narratorVoice}</Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                  </View>
                </TouchableOpacity>
                
                {/* Multi-voice Toggle */}
                <View style={[styles.toggleRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.settingsLabel}>Multi-voice Dramatization</Text>
                  <TouchableOpacity
                    style={[styles.toggle, multiVoice ? styles.toggleOn : styles.toggleOff]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setMultiVoice(!multiVoice);
                    }}
                  >
                    <View style={[styles.toggleKnob, multiVoice && styles.toggleKnobOn]} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            
            {/* Create Button or Progress */}
            {isGenerating ? (
              <View style={styles.progressContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.progressText}>
                  Creating audiobook... {progress > 0 ? `${progress}%` : ''}
                </Text>
              </View>
            ) : (
              <Button
                title="Create Audiobook"
                onPress={handleCreate}
                disabled={!localFileUri && !pastedText && !urlInput}
                icon={<Ionicons name="sparkles" size={20} color="#fff" />}
                style={styles.createButton}
              />
            )}
          </BottomSheetScrollView>
          
          {/* Pickers */}
          {showVoicePicker && renderVoicePicker()}
          {showLanguagePicker && renderLanguagePicker()}
        </View>
      </BottomSheet>
    );
  }
);

CreateAudiobookSheet.displayName = 'CreateAudiobookSheet';

export default CreateAudiobookSheet;
```

---

### Mobile: Explore Screen (home/browse)
**File:** `apps/mobile/app/(tabs)/index.tsx` | **Size:** 8.5 KB | **Lines:** 293

```tsx
/**
 * Explore Screen - Main catalog browsing
 * Features: Search, Genres, Featured, Popular books
 * All from unified VoiceLibri catalog
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  FlatList,
  Pressable,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  FadeInRight,
} from 'react-native-reanimated';
import {
  searchCatalog,
  getPopularBooks,
  getFeaturedBooks,
  GENRES,
  Genre,
} from '../../src/services/catalogService';
import {
  Text,
  BookCard,
  BookList,
  GenreCard,
  SearchBar,
} from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeContext';
import { spacing } from '../../src/theme';

export default function ExploreScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Fetch featured books
  const { data: featuredBooks, refetch: refetchFeatured, isLoading: loadingFeatured } = useQuery({
    queryKey: ['featuredBooks'],
    queryFn: getFeaturedBooks,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
  
  // Fetch popular books
  const { data: popularData, refetch: refetchPopular, isLoading: loadingPopular } = useQuery({
    queryKey: ['popularBooks'],
    queryFn: () => getPopularBooks(),
    staleTime: 1000 * 60 * 30,
  });
  const popularBooks = popularData?.books || [];
  
  // Search query
  const { data: searchData, isLoading: searching } = useQuery({
    queryKey: ['search', searchQuery],
    queryFn: () => searchCatalog(searchQuery),
    enabled: searchQuery.length >= 2,
  });
  const searchResults = searchData?.books || [];
  
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchFeatured(), refetchPopular()]);
    setRefreshing(false);
  }, [refetchFeatured, refetchPopular]);
  
  const handleGenrePress = (genre: Genre) => {
    router.push({
      pathname: '/genre/[genre]',
      params: { genre: genre.id, name: genre.name },
    });
  };
  
  const handleBookPress = (bookId: string) => {
    router.push({
      pathname: '/book/[id]',
      params: { id: bookId },
    });
  };
  
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    greeting: {
      marginBottom: spacing.md,
    },
    greetingText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
    },
    titleText: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: '700',
      marginTop: 4,
    },
    searchContainer: {
      marginTop: spacing.sm,
    },
    content: {
      flex: 1,
    },
    section: {
      marginTop: spacing.lg,
    },
    sectionTitle: {
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    genresContainer: {
      paddingHorizontal: spacing.md,
    },
    searchResultsContainer: {
      flex: 1,
      paddingHorizontal: spacing.md,
    },
    searchResultItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    searchResultCover: {
      width: 50,
      height: 70,
      borderRadius: 6,
      backgroundColor: theme.colors.cardElevated,
    },
    searchResultInfo: {
      flex: 1,
      marginLeft: spacing.sm,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing['2xl'],
    },
    emptyText: {
      color: theme.colors.textSecondary,
      textAlign: 'center',
      paddingVertical: spacing['2xl'],
    },
  });
  
  // Show search results when searching
  if (searchQuery.length >= 2) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.searchContainer}>
            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search the VoiceLibri catalog..."
              autoFocus={isSearchFocused}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
          </View>
        </View>
        
        {searching ? (
          <View style={styles.loadingContainer}>
            <Text color={theme.colors.textSecondary}>Searching...</Text>
          </View>
        ) : searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.md }}
            renderItem={({ item }) => (
              <Pressable
                style={styles.searchResultItem}
                onPress={() => handleBookPress(item.id)}
              >
                <BookCard
                  book={item}
                  size="small"
                  showAuthor={false}
                  onPress={() => handleBookPress(item.id)}
                />
                <View style={styles.searchResultInfo}>
                  <Text weight="semibold" numberOfLines={2}>{item.title}</Text>
                  <Text size="sm" color={theme.colors.textSecondary}>
                    {item.authors.join(', ')}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        ) : (
          <Text style={styles.emptyText}>No books found</Text>
        )}
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          <View style={styles.greeting}>
            <Text style={styles.greetingText}>Welcome to</Text>
            <Text style={styles.titleText}>VoiceLibri</Text>
          </View>
          
          <View style={styles.searchContainer}>
            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search the VoiceLibri catalog..."
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
          </View>
        </Animated.View>
        
        {/* Genres */}
        <Animated.View entering={FadeInRight.delay(200)} style={styles.section}>
          <Text size="lg" weight="semibold" style={styles.sectionTitle}>
            Browse by Genre
          </Text>
          <FlatList
            horizontal
            data={GENRES}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.genresContainer}
            renderItem={({ item }) => (
              <GenreCard
                genre={item}
                onPress={() => handleGenrePress(item)}
              />
            )}
          />
        </Animated.View>
        
        {/* Featured Books */}
        <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
          <BookList
            title="Featured Books"
            books={featuredBooks || []}
            emptyMessage={loadingFeatured ? 'Loading...' : 'No featured books'}
            nestedInScrollView
          />
        </Animated.View>
        
        {/* Popular Books */}
        <Animated.View entering={FadeInDown.delay(400)} style={styles.section}>
          <BookList
            title="Popular Classics"
            books={popularBooks}
            emptyMessage={loadingPopular ? 'Loading...' : 'No popular books'}
            nestedInScrollView
          />
        </Animated.View>
        
        {/* Bottom spacing for tab bar */}
        <View style={{ height: 150 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
```

---

### Mobile: Gutendex API (Project Gutenberg public domain books)
**File:** `apps/mobile/src/services/gutendexApi.ts` | **Size:** 5.7 KB | **Lines:** 200

```typescript
/**
 * Gutendex API Service
 * JSON web API for Project Gutenberg ebook metadata
 * API Docs: https://gutendex.com/
 */

import axios from 'axios';

const BASE_URL = 'https://gutendex.com';

// Types based on official API response format
export interface GutendexPerson {
  name: string;
  birth_year: number | null;
  death_year: number | null;
}

export interface GutendexBook {
  id: number;
  title: string;
  authors: GutendexPerson[];
  translators: GutendexPerson[];
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  copyright: boolean | null;
  media_type: string;
  formats: Record<string, string>;
  download_count: number;
  summaries?: string[];
}

export interface GutendexBooksResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutendexBook[];
}

export interface GutendexSearchParams {
  search?: string;
  languages?: string; // comma-separated, e.g., 'en,fr'
  topic?: string; // search in subjects/bookshelves
  author_year_start?: number;
  author_year_end?: number;
  copyright?: 'true' | 'false' | 'null';
  ids?: string; // comma-separated book IDs
  sort?: 'ascending' | 'descending' | 'popular';
  page?: number;
}

const gutendexApi = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Accept': 'application/json',
  },
});

/**
 * Search for books in the Gutenberg catalog
 */
export async function searchBooks(params: GutendexSearchParams = {}): Promise<GutendexBooksResponse> {
  const response = await gutendexApi.get<GutendexBooksResponse>('/books', { params });
  return response.data;
}

/**
 * Get a single book by ID
 */
export async function getBook(id: number): Promise<GutendexBook> {
  const response = await gutendexApi.get<GutendexBook>(`/books/${id}`);
  return response.data;
}

/**
 * Get popular books (default sort)
 */
export async function getPopularBooks(language: string = 'en', page: number = 1): Promise<GutendexBooksResponse> {
  return searchBooks({ languages: language, page, sort: 'popular' });
}

/**
 * Search books by topic/genre
 */
export async function getBooksByTopic(topic: string, language: string = 'en', page: number = 1): Promise<GutendexBooksResponse> {
  return searchBooks({ topic, languages: language, page });
}

// ============================================================================
// SUPPORTED FORMATS FOR AUDIOBOOK GENERATION
// ============================================================================
// We only show books that can be converted to audiobooks.
// SUPPORTED: EPUB, TXT, HTML, MOBI
// EXCLUDED: PDF (OCR quality issues), images, audio, metadata-only

/**
 * Get book cover URL (from formats)
 */
export function getBookCoverUrl(book: GutendexBook): string | null {
  // Try to find cover image in formats
  const coverKey = Object.keys(book.formats).find(key => key.startsWith('image/'));
  if (coverKey) {
    return book.formats[coverKey];
  }
  return null;
}

/**
 * Get EPUB download URL (preferred format)
 */
export function getEpubUrl(book: GutendexBook): string | null {
  return book.formats['application/epub+zip'] || null;
}

/**
 * Get plain text download URL
 */
export function getTextUrl(book: GutendexBook): string | null {
  const textKey = Object.keys(book.formats).find(key => key.startsWith('text/plain'));
  return textKey ? book.formats[textKey] : null;
}

/**
 * Get HTML download URL (Gutenberg HTML books)
 */
export function getHtmlUrl(book: GutendexBook): string | null {
  const htmlKey = Object.keys(book.formats).find(key => key.startsWith('text/html'));
  return htmlKey ? book.formats[htmlKey] : null;
}

/**
 * Get MOBI/KF8 download URL (Kindle format)
 */
export function getMobiUrl(book: GutendexBook): string | null {
  return book.formats['application/x-mobipocket-ebook'] || null;
}

/**
 * Get the best available download URL for audiobook generation
 * Priority: EPUB > TXT > HTML > MOBI
 * Returns null if no supported format is available
 */
export function getBestDownloadUrl(book: GutendexBook): { url: string; format: string } | null {
  // Priority order - EPUB is best, then TXT, then HTML, then MOBI
  const epub = getEpubUrl(book);
  if (epub) return { url: epub, format: 'epub' };
  
  const txt = getTextUrl(book);
  if (txt) return { url: txt, format: 'txt' };
  
  const html = getHtmlUrl(book);
  if (html) return { url: html, format: 'html' };
  
  const mobi = getMobiUrl(book);
  if (mobi) return { url: mobi, format: 'mobi' };
  
  return null;
}

/**
 * Check if book has any supported format for audiobook generation
 */
export function hasAudiobookFormat(book: GutendexBook): boolean {
  return getBestDownloadUrl(book) !== null;
}

/**
 * Curated topics for Explore screen
 */
export const CURATED_TOPICS = [
  { id: 'fiction', label: 'Fiction', icon: '📚' },
  { id: 'science-fiction', label: 'Sci-Fi', icon: '🚀' },
  { id: 'romance', label: 'Romance', icon: '💕' },
  { id: 'mystery', label: 'Mystery', icon: '🔍' },
  { id: 'adventure', label: 'Adventure', icon: '🗺️' },
  { id: 'horror', label: 'Horror', icon: '👻' },
  { id: 'fantasy', label: 'Fantasy', icon: '🧙' },
  { id: 'history', label: 'History', icon: '📜' },
  { id: 'philosophy', label: 'Philosophy', icon: '🤔' },
  { id: 'poetry', label: 'Poetry', icon: '✨' },
  { id: 'children', label: 'Children', icon: '🧸' },
  { id: 'classics', label: 'Classics', icon: '🏛️' },
];

export default {
  searchBooks,
  getBook,
  getPopularBooks,
  getBooksByTopic,
  getBookCoverUrl,
  getEpubUrl,
  getTextUrl,
  getHtmlUrl,
  getMobiUrl,
  getBestDownloadUrl,
  hasAudiobookFormat,
  CURATED_TOPICS,
};
```

---

### Mobile: Library Screen (user's audiobook collection)
**File:** `apps/mobile/app/(tabs)/library.tsx` | **Size:** 13.8 KB | **Lines:** 413

```tsx
/**
 * Library Screen - User's book collection
 * Shows: Currently Listening, Completed, Wishlist
 * 
 * Architecture:
 * - Backend generates audiobooks and stores on server temporarily
 * - Mobile downloads generated audiobooks to device storage (sandboxed)
 * - Library displays locally stored audiobooks for offline playback
 */

import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBookStore } from '../../src/stores';
import { BookList, Text, Button, CreateAudiobookSheet } from '../../src/components/ui';
import type { CreateAudiobookSheetRef } from '../../src/components/ui/CreateAudiobookSheet';
import { useTheme } from '../../src/theme/ThemeContext';
import { spacing, borderRadius, colors } from '../../src/theme';
import { getAudiobooks, getAudiobook, deleteAudiobook } from '../../src/services/voiceLibriApi';
import { 
  getLocalAudiobooks, 
  downloadAudiobook, 
  loadAudiobookMetadata,
  type LocalAudiobook 
} from '../../src/services/audioStorageService';

export default function LibraryScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { library, addBook, removeFromLibrary } = useBookStore();
  const createSheetRef = useRef<CreateAudiobookSheetRef>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingBooks, setDownloadingBooks] = useState<Set<string>>(new Set());

  // Get locally stored audiobooks (on device)
  const [localAudiobooks, setLocalAudiobooks] = useState<LocalAudiobook[]>([]);
  
  // Load local audiobooks on mount
  useEffect(() => {
    const loadLocalBooks = () => {
      try {
        const books = getLocalAudiobooks();
        setLocalAudiobooks(books);
        console.log(`📚 Loaded ${books.length} local audiobooks from device storage`);
      } catch (error) {
        console.error('Failed to load local audiobooks:', error);
      }
    };
    loadLocalBooks();
  }, []);

  // Fetch audiobooks from backend (to check for new ones to download)
  const { data: backendAudiobooks, refetch } = useQuery({
    queryKey: ['audiobooks'],
    queryFn: getAudiobooks,
    refetchInterval: 30000, // Check every 30s for new audiobooks
  });

  // Sync: Download new backend audiobooks to device, remove stale library entries
  useEffect(() => {
    if (!backendAudiobooks) return;
    
    const syncAudiobooks = async () => {
      const localTitles = localAudiobooks.map(ab => ab.title);
      
      // Filter to only completed audiobooks - don't download while still generating
      const completedBooks = backendAudiobooks.filter(
        book => book.metadata?.generationStatus === 'completed'
      );
      
      // Find new completed audiobooks on backend that aren't downloaded yet
      for (const backendBook of completedBooks) {
        if (!localTitles.includes(backendBook.title) && !downloadingBooks.has(backendBook.title)) {
          console.log(`📥 Completed audiobook found on backend: ${backendBook.title}, starting download...`);
          
          // Mark as downloading
          setDownloadingBooks(prev => new Set(prev).add(backendBook.title));
          
          try {
            // Get chapter count from backend
            const bookDetails = await getAudiobook(backendBook.title);
            const totalChapters = bookDetails.chapters?.length || bookDetails.chapterCount || 1;
            
            // Download to device storage
            const localBook = await downloadAudiobook(
              backendBook.title,
              totalChapters,
              (progress) => {
                console.log(`📥 Download progress for ${backendBook.title}: ${progress.overallProgress}%`);
              }
            );
            
            // Update local audiobooks list
            setLocalAudiobooks(prev => [...prev, localBook]);
            
            // Add to library store
            addBook({
              id: backendBook.title,
              title: backendBook.metadata?.title || backendBook.title,
              authors: [backendBook.metadata?.author || 'Unknown Author'],
              status: 'listening',
              isGenerated: true,
              totalDuration: backendBook.metadata?.totalDuration || 0,
            });
            
            console.log(`✅ Downloaded audiobook to device: ${backendBook.title}`);
          } catch (error) {
            console.error(`❌ Failed to download ${backendBook.title}:`, error);
          } finally {
            setDownloadingBooks(prev => {
              const newSet = new Set(prev);
              newSet.delete(backendBook.title);
              return newSet;
            });
          }
        }
      }
      
      // Log books still generating
      const generatingBooks = backendAudiobooks.filter(
        book => book.metadata?.generationStatus === 'in-progress'
      );
      if (generatingBooks.length > 0) {
        console.log(`⏳ Books still generating: ${generatingBooks.map(b => b.title).join(', ')}`);
      }
      
      // Remove stale library entries (books not on device and not being downloaded)
      const localLibrary = useBookStore.getState().library;
      const localBookTitles = localAudiobooks.map(ab => ab.title);
      const backendTitles = backendAudiobooks.map(b => b.title);
      const staleBooks = localLibrary.filter(
        book => book.isGenerated && 
                !localBookTitles.includes(book.id) && 
                !downloadingBooks.has(book.id) &&
                !backendTitles.includes(book.id) // Don't remove if still on backend (might be generating)
      );
      
      staleBooks.forEach(book => {
        console.log(`🗑️ Removing stale book from library (not on device or backend): ${book.title}`);
        removeFromLibrary(book.id);
      });
    };
    
    syncAudiobooks();
  }, [backendAudiobooks, localAudiobooks, addBook, removeFromLibrary, downloadingBooks]);

  // Filter books by status
  const listeningBooks = useMemo(
    () => library.filter((book) => book.status === 'listening'),
    [library]
  );

  const completedBooks = useMemo(
    () => library.filter((book) => book.status === 'completed'),
    [library]
  );

  const wishlistBooks = useMemo(
    () => library.filter((book) => book.status === 'wishlist'),
    [library]
  );

  const handleExplore = () => {
    router.push('/(tabs)');
  };

  const handleCreateAudiobook = () => {
    createSheetRef.current?.open();
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Reload local audiobooks from device storage
    try {
      const books = getLocalAudiobooks();
      setLocalAudiobooks(books);
    } catch (error) {
      console.error('Failed to reload local audiobooks:', error);
    }
    // Also check backend for new audiobooks
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.text,
    },
    subtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginTop: 4,
    },
    content: {
      flex: 1,
    },
    section: {
      marginTop: spacing.lg,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing['2xl'],
      paddingVertical: spacing['4xl'],
    },
    emptyIcon: {
      marginBottom: spacing.lg,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.text,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
      lineHeight: 20,
    },
    statsContainer: {
      flexDirection: 'row',
      paddingHorizontal: spacing.md,
      marginTop: spacing.lg,
      gap: spacing.sm,
    },
    statCard: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      alignItems: 'center',
    },
    statNumber: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    statLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 4,
    },
    createButton: {
      position: 'absolute',
      bottom: 140, // Higher to avoid MiniPlayer overlap
      right: spacing.lg,
      left: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: colors.primary[500],
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.sm,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    createButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });

  const isEmpty = library.length === 0;

  if (isEmpty) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>My Library</Text>
        </View>

        <View style={styles.emptyContainer}>
          <Ionicons
            name="library-outline"
            size={80}
            color={theme.colors.textMuted}
            style={styles.emptyIcon}
          />
          <Text style={styles.emptyTitle}>Your library is empty</Text>
          <Text style={styles.emptyText}>
            Explore our catalog of classic literature and{'\n'}
            generate AI-powered audiobooks with{'\n'}
            multi-voice dramatization.
          </Text>
          <Button
            title="Explore Catalog"
            onPress={handleExplore}
            icon={<Ionicons name="compass-outline" size={20} color="#fff" />}
          />
          <View style={{ height: spacing.md }} />
          <Button
            title="Create Audiobook"
            variant="outline"
            onPress={handleCreateAudiobook}
            icon={<Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />}
          />
        </View>

        <CreateAudiobookSheet ref={createSheetRef} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          <Text style={styles.title}>My Library</Text>
          <Text style={styles.subtitle}>
            {library.length} {library.length === 1 ? 'book' : 'books'} in your collection
          </Text>
        </Animated.View>

        {/* Stats */}
        <Animated.View entering={FadeInDown.delay(150)} style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{listeningBooks.length}</Text>
            <Text style={styles.statLabel}>Listening</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{completedBooks.length}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{wishlistBooks.length}</Text>
            <Text style={styles.statLabel}>Wishlist</Text>
          </View>
        </Animated.View>

        {/* Currently Listening */}
        {listeningBooks.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
            <BookList
              title="Continue Listening"
              books={listeningBooks}
              showProgress
              showCount={false}
              nestedInScrollView
            />
          </Animated.View>
        )}

        {/* Completed */}
        {completedBooks.length > 0 && (
          <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
            <BookList
              title="Completed"
              books={completedBooks}
              showCount
              nestedInScrollView
            />
          </Animated.View>
        )}

        {/* Wishlist */}
        {wishlistBooks.length > 0 && (
          <Animated.View entering={FadeInDown.delay(400)} style={styles.section}>
            <BookList
              title="Wishlist"
              books={wishlistBooks}
              emptyMessage="Add books to your wishlist"
              nestedInScrollView
            />
          </Animated.View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 200 }} />
      </ScrollView>

      {/* Create Audiobook Button */}
      <Pressable style={styles.createButton} onPress={handleCreateAudiobook}>
        <Ionicons name="add-circle-outline" size={24} color="#fff" />
        <Text style={styles.createButtonText}>Create Audiobook</Text>
      </Pressable>

      <CreateAudiobookSheet ref={createSheetRef} />
    </SafeAreaView>
  );
}
```

---

### Mobile: Mini Player Component (persistent playback bar)
**File:** `apps/mobile/src/components/ui/MiniPlayer.tsx` | **Size:** 4.8 KB | **Lines:** 186

```tsx
/**
 * MiniPlayer Component - Persistent bottom player bar
 * Shows when audio is playing, tappable to expand to full player
 * Integrates with expo-audio via audioService
 */

import React from 'react';
import { View, Image, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  interpolate,
  useSharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { usePlayerStore } from '../../stores';
import { useTheme } from '../../theme/ThemeContext';
import { borderRadius, spacing } from '../../theme';
import Text from './Text';
import { togglePlayPause } from '../../services/audioService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MINI_PLAYER_HEIGHT = 64;

export default function MiniPlayer() {
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const {
    nowPlaying,
    isPlaying,
    showMiniPlayer,
    position,
    duration,
    setIsPlaying,
  } = usePlayerStore();
  
  const scale = useSharedValue(1);
  
  if (!showMiniPlayer || !nowPlaying) {
    return null;
  }
  
  const progress = duration > 0 ? (position / duration) * 100 : 0;
  
  const handlePress = () => {
    Haptics.selectionAsync();
    router.push('/player');
  };
  
  const handlePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    togglePlayPause();
  };
  
  const handlePressIn = () => {
    scale.value = withSpring(0.98);
  };
  
  const handlePressOut = () => {
    scale.value = withSpring(1);
  };
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const styles = StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: 90, // Above tab bar
      left: spacing.md,
      right: spacing.md,
      height: MINI_PLAYER_HEIGHT,
      borderRadius: borderRadius.xl,
      overflow: 'hidden',
    },
    blur: {
      flex: 1,
    },
    content: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
    },
    cover: {
      width: 48,
      height: 48,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.cardElevated,
    },
    info: {
      flex: 1,
      marginLeft: spacing.sm,
      marginRight: spacing.sm,
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },
    author: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    playButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    progressBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: theme.colors.progressTrack,
    },
    progressFill: {
      height: '100%',
      backgroundColor: theme.colors.progressFill,
    },
  });
  
  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={styles.blur}>
        <Pressable
          style={styles.content}
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          {nowPlaying.coverUrl ? (
            <Image source={{ uri: nowPlaying.coverUrl }} style={styles.cover} />
          ) : (
            <View style={styles.cover} />
          )}
          
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>
              {nowPlaying.bookTitle}
            </Text>
            <Text style={styles.author} numberOfLines={1}>
              {nowPlaying.author}
            </Text>
          </View>
          
          <View style={styles.controls}>
            <Pressable
              style={styles.playButton}
              onPress={handlePlayPause}
              hitSlop={8}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={20}
                color="#fff"
              />
            </Pressable>
          </View>
          
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </Pressable>
      </BlurView>
    </Animated.View>
  );
}

export { MINI_PLAYER_HEIGHT };
```

---

### Mobile: OpenLibrary API (book metadata, covers)
**File:** `apps/mobile/src/services/openLibraryApi.ts` | **Size:** 6 KB | **Lines:** 243

```typescript
/**
 * Open Library API Service
 * API Docs: https://openlibrary.org/developers/api
 * Search: https://openlibrary.org/dev/docs/api/search
 * Books: https://openlibrary.org/dev/docs/api/books
 * Covers: https://openlibrary.org/dev/docs/api/covers
 */

import axios from 'axios';

const BASE_URL = 'https://openlibrary.org';
const COVERS_URL = 'https://covers.openlibrary.org';

// User-Agent header required per API docs
const USER_AGENT = 'VoiceLibri/1.0 (contact@voicelibri.com)';

export interface OpenLibraryAuthor {
  key: string;
  name: string;
}

export interface OpenLibraryDoc {
  key: string; // e.g., "/works/OL45804W"
  title: string;
  author_name?: string[];
  author_key?: string[];
  first_publish_year?: number;
  edition_count?: number;
  cover_i?: number; // Cover ID for covers API
  cover_edition_key?: string;
  subject?: string[];
  has_fulltext?: boolean;
  ia?: string[]; // Internet Archive IDs
  language?: string[];
  public_scan_b?: boolean;
  ratings_average?: number;
  ratings_count?: number;
}

export interface OpenLibrarySearchResponse {
  numFound: number;
  start: number;
  numFoundExact: boolean;
  docs: OpenLibraryDoc[];
}

export interface OpenLibraryWork {
  title: string;
  key: string;
  authors?: { author: { key: string } }[];
  description?: string | { value: string };
  subjects?: string[];
  subject_places?: string[];
  subject_times?: string[];
  covers?: number[];
  first_publish_date?: string;
}

export interface OpenLibraryEdition {
  title: string;
  key: string;
  authors?: { key: string }[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  covers?: number[];
  isbn_10?: string[];
  isbn_13?: string[];
  languages?: { key: string }[];
}

const openLibraryApi = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Accept': 'application/json',
    'User-Agent': USER_AGENT,
  },
});

/**
 * Search for books
 */
export async function searchBooks(
  query: string,
  options: {
    limit?: number;
    offset?: number;
    language?: string;
    sort?: 'new' | 'old' | 'random' | 'key';
    fields?: string;
  } = {}
): Promise<OpenLibrarySearchResponse> {
  const { limit = 20, offset = 0, language, sort, fields } = options;
  
  const params: Record<string, any> = {
    q: query,
    limit,
    offset,
  };
  
  if (language) params.lang = language;
  if (sort) params.sort = sort;
  if (fields) params.fields = fields;
  
  const response = await openLibraryApi.get<OpenLibrarySearchResponse>('/search.json', { params });
  return response.data;
}

/**
 * Search by author
 */
export async function searchByAuthor(
  author: string,
  options: { limit?: number; offset?: number } = {}
): Promise<OpenLibrarySearchResponse> {
  const { limit = 20, offset = 0 } = options;
  const response = await openLibraryApi.get<OpenLibrarySearchResponse>('/search.json', {
    params: { author, limit, offset },
  });
  return response.data;
}

/**
 * Search by subject
 */
export async function searchBySubject(
  subject: string,
  options: { limit?: number; offset?: number } = {}
): Promise<OpenLibrarySearchResponse> {
  const { limit = 20, offset = 0 } = options;
  const response = await openLibraryApi.get<OpenLibrarySearchResponse>('/search.json', {
    params: { subject, limit, offset },
  });
  return response.data;
}

/**
 * Get work details by OLID
 */
export async function getWork(workId: string): Promise<OpenLibraryWork> {
  // workId can be like "OL45804W" or "/works/OL45804W"
  const id = workId.startsWith('/works/') ? workId : `/works/${workId}`;
  const response = await openLibraryApi.get<OpenLibraryWork>(`${id}.json`);
  return response.data;
}

/**
 * Get edition details
 */
export async function getEdition(editionId: string): Promise<OpenLibraryEdition> {
  const id = editionId.startsWith('/books/') ? editionId : `/books/${editionId}`;
  const response = await openLibraryApi.get<OpenLibraryEdition>(`${id}.json`);
  return response.data;
}

/**
 * Get book by ISBN
 */
export async function getBookByISBN(isbn: string): Promise<OpenLibraryEdition> {
  const response = await openLibraryApi.get<OpenLibraryEdition>(`/isbn/${isbn}.json`);
  return response.data;
}

/**
 * Get cover URL by cover ID
 * Size: S (small), M (medium), L (large)
 */
export function getCoverUrl(coverId: number, size: 'S' | 'M' | 'L' = 'M'): string {
  return `${COVERS_URL}/b/id/${coverId}-${size}.jpg`;
}

/**
 * Get cover URL by ISBN
 */
export function getCoverByISBN(isbn: string, size: 'S' | 'M' | 'L' = 'M'): string {
  return `${COVERS_URL}/b/isbn/${isbn}-${size}.jpg`;
}

/**
 * Get cover URL by OLID
 */
export function getCoverByOLID(olid: string, size: 'S' | 'M' | 'L' = 'M'): string {
  return `${COVERS_URL}/b/olid/${olid}-${size}.jpg`;
}

/**
 * Get author photo URL
 */
export function getAuthorPhotoUrl(authorOlid: string, size: 'S' | 'M' | 'L' = 'M'): string {
  return `${COVERS_URL}/a/olid/${authorOlid}-${size}.jpg`;
}

/**
 * Extract work ID from key
 */
export function extractWorkId(key: string): string {
  return key.replace('/works/', '');
}

/**
 * Get description as string (handles both formats)
 */
export function getDescriptionText(description?: string | { value: string }): string {
  if (!description) return '';
  if (typeof description === 'string') return description;
  return description.value || '';
}

/**
 * Trending/popular subjects for discovery
 */
export const POPULAR_SUBJECTS = [
  'fiction',
  'fantasy',
  'science_fiction',
  'romance',
  'mystery_and_detective_stories',
  'thriller',
  'historical_fiction',
  'young_adult',
  'biography',
  'self-help',
  'business',
  'psychology',
];

export default {
  searchBooks,
  searchByAuthor,
  searchBySubject,
  getWork,
  getEdition,
  getBookByISBN,
  getCoverUrl,
  getCoverByISBN,
  getCoverByOLID,
  getAuthorPhotoUrl,
  extractWorkId,
  getDescriptionText,
  POPULAR_SUBJECTS,
};
```

---

### Mobile: Player Store (Zustand state)
**File:** `apps/mobile/src/stores/playerStore.ts` | **Size:** 4.3 KB | **Lines:** 150

```typescript
/**
 * Player Store - Zustand state management for audio playback
 * Manages react-native-track-player state
 * Mobile-only (iOS/Android)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// TYPES
// ============================================================================

export interface Chapter {
  id: string;
  title: string;
  index?: number;
  duration: number;
  url: string;
  subChunkCount?: number;
}

export interface NowPlaying {
  bookId: string;
  bookTitle: string;
  author: string;
  coverUrl: string | null;
  chapters: Chapter[];
  totalDuration: number;
}

export interface PlayerState {
  // Current playback
  nowPlaying: NowPlaying | null;
  currentChapterIndex: number;
  position: number; // seconds
  duration: number; // seconds
  isPlaying: boolean;
  isBuffering: boolean;
  
  // Settings
  playbackRate: number;
  sleepTimer: number | null; // minutes remaining, null = off
  
  // Mini player visibility
  showMiniPlayer: boolean;
  
  // Actions
  setNowPlaying: (nowPlaying: NowPlaying | null) => void;
  setCurrentChapter: (index: number) => void;
  setPosition: (position: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsBuffering: (isBuffering: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setSleepTimer: (minutes: number | null) => void;
  setShowMiniPlayer: (show: boolean) => void;
  
  // Helpers
  nextChapter: () => void;
  previousChapter: () => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
}

// ============================================================================
// STORE
// ============================================================================

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      nowPlaying: null,
      currentChapterIndex: 0,
      position: 0,
      duration: 0,
      isPlaying: false,
      isBuffering: false,
      playbackRate: 1.0,
      sleepTimer: null,
      showMiniPlayer: false,
      
      setNowPlaying: (nowPlaying) => {
        set({
          nowPlaying,
          currentChapterIndex: 0,
          position: 0,
          isPlaying: false,
          showMiniPlayer: !!nowPlaying,
        });
      },
      
      setCurrentChapter: (index) => {
        set({ currentChapterIndex: index, position: 0 });
      },
      
      setPosition: (position) => set({ position }),
      
      setDuration: (duration) => set({ duration }),
      
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      
      setIsBuffering: (isBuffering) => set({ isBuffering }),
      
      setPlaybackRate: (rate) => set({ playbackRate: rate }),
      
      setSleepTimer: (minutes) => set({ sleepTimer: minutes }),
      
      setShowMiniPlayer: (show) => set({ showMiniPlayer: show }),
      
      nextChapter: () => {
        const { nowPlaying, currentChapterIndex } = get();
        if (nowPlaying && currentChapterIndex < nowPlaying.chapters.length - 1) {
          set({ currentChapterIndex: currentChapterIndex + 1, position: 0 });
        }
      },
      
      previousChapter: () => {
        const { currentChapterIndex, position } = get();
        if (position > 3) {
          // If more than 3 seconds in, restart current chapter
          set({ position: 0 });
        } else if (currentChapterIndex > 0) {
          // Go to previous chapter
          set({ currentChapterIndex: currentChapterIndex - 1, position: 0 });
        }
      },
      
      skipForward: (seconds = 30) => {
        const { position, duration } = get();
        set({ position: Math.min(position + seconds, duration) });
      },
      
      skipBackward: (seconds = 15) => {
        const { position } = get();
        set({ position: Math.max(position - seconds, 0) });
      },
    }),
    {
      name: 'voicelibri-player',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        playbackRate: state.playbackRate,
        // Don't persist now playing - reload on app start
      }),
    }
  )
);
```

---

### Mobile: Root Layout (providers, navigation setup)
**File:** `apps/mobile/app/_layout.tsx` | **Size:** 1.3 KB | **Lines:** 36

```tsx
/**
 * Root Layout - App entry point with providers
 * Initializes audio service for background playback and lock screen controls
 */
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "../src/theme/ThemeContext";
import { initializeAudioService } from "../src/services/audioService";

const queryClient = new QueryClient();

export default function RootLayout() {
  // Initialize audio service for background playback
  useEffect(() => {
    initializeAudioService().catch(console.error);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="player" options={{ presentation: "modal" }} />
            <Stack.Screen name="book/[id]" />
          </Stack>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
```

---

### Mobile: Settings Screen
**File:** `apps/mobile/app/(tabs)/settings.tsx` | **Size:** 10.8 KB | **Lines:** 351

```tsx
/**
 * Settings Screen
 * App preferences and configurations
 */

import React from 'react';
import { View, ScrollView, StyleSheet, Pressable, Switch, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSettingsStore, useBookStore } from '../../src/stores';
import { Text } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeContext';
import { spacing, borderRadius } from '../../src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface SettingRowProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  hasSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  onPress?: () => void;
}

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  hasSwitch,
  switchValue,
  onSwitchChange,
  onPress,
}: SettingRowProps) {
  const { theme } = useTheme();
  
  const handlePress = () => {
    Haptics.selectionAsync();
    onPress?.();
  };
  
  const styles = StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    iconContainer: {
      width: 36,
      height: 36,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.cardElevated,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    content: {
      flex: 1,
    },
    title: {
      fontSize: 16,
      color: theme.colors.text,
    },
    subtitle: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    value: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginRight: 4,
    },
  });
  
  return (
    <Pressable
      style={styles.row}
      onPress={!hasSwitch ? handlePress : undefined}
      disabled={hasSwitch}
    >
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {value && <Text style={styles.value}>{value}</Text>}
      {hasSwitch && (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: theme.colors.progressTrack, true: theme.colors.primary }}
          thumbColor="#fff"
        />
      )}
      {!hasSwitch && onPress && (
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
      )}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { clearLibrary, library } = useBookStore();
  const {
    themeMode,
    setThemeMode,
    defaultPlaybackRate,
    setDefaultPlaybackRate,
    autoPlayNext,
    setAutoPlayNext,
    downloadOverWifiOnly,
    setDownloadOverWifiOnly,
    notificationsEnabled,
    setNotificationsEnabled,
  } = useSettingsStore();
  
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  
  const handlePlaybackRateCycle = () => {
    const currentIndex = playbackRates.indexOf(defaultPlaybackRate);
    const nextIndex = (currentIndex + 1) % playbackRates.length;
    setDefaultPlaybackRate(playbackRates[nextIndex]);
    Haptics.selectionAsync();
  };
  
  const handleThemeCycle = () => {
    const modes: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark'];
    const currentIndex = modes.indexOf(themeMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setThemeMode(modes[nextIndex]);
    Haptics.selectionAsync();
  };
  
  const handleClearLibrary = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Clear Library',
      `Are you sure you want to remove all ${library.length} books from your library? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear All', 
          style: 'destructive',
          onPress: () => {
            clearLibrary();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Library Cleared', 'All books have been removed from your library.');
          }
        },
      ]
    );
  };
  
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.text,
    },
    section: {
      marginTop: spacing.lg,
    },
    sectionHeader: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionContent: {
      backgroundColor: theme.colors.card,
      marginHorizontal: spacing.md,
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
    },
    footer: {
      alignItems: 'center',
      paddingVertical: spacing['2xl'],
    },
    footerText: {
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    version: {
      fontSize: 12,
      color: theme.colors.textMuted,
      marginTop: 4,
    },
  });
  
  const themeModeLabel = themeMode === 'system' ? 'System' : themeMode === 'light' ? 'Light' : 'Dark';
  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </Animated.View>
        
        {/* Playback Section */}
        <Animated.View entering={FadeInDown.delay(150)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Playback</Text>
          </View>
          <View style={styles.sectionContent}>
            <SettingRow
              icon="speedometer-outline"
              title="Default Speed"
              subtitle="Initial playback speed for new audiobooks"
              value={`${defaultPlaybackRate}x`}
              onPress={handlePlaybackRateCycle}
            />
            <SettingRow
              icon="play-forward-outline"
              title="Auto-play Next"
              subtitle="Continue to next chapter automatically"
              hasSwitch
              switchValue={autoPlayNext}
              onSwitchChange={setAutoPlayNext}
            />
          </View>
        </Animated.View>
        
        {/* Appearance Section */}
        <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Appearance</Text>
          </View>
          <View style={styles.sectionContent}>
            <SettingRow
              icon={isDark ? 'moon-outline' : 'sunny-outline'}
              title="Theme"
              subtitle="Choose your preferred appearance"
              value={themeModeLabel}
              onPress={handleThemeCycle}
            />
          </View>
        </Animated.View>
        
        {/* Downloads Section */}
        <Animated.View entering={FadeInDown.delay(250)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Downloads</Text>
          </View>
          <View style={styles.sectionContent}>
            <SettingRow
              icon="wifi-outline"
              title="Wi-Fi Only"
              subtitle="Only download audiobooks on Wi-Fi"
              hasSwitch
              switchValue={downloadOverWifiOnly}
              onSwitchChange={setDownloadOverWifiOnly}
            />
          </View>
        </Animated.View>
        
        {/* Notifications Section */}
        <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Notifications</Text>
          </View>
          <View style={styles.sectionContent}>
            <SettingRow
              icon="notifications-outline"
              title="Push Notifications"
              subtitle="Get updates on audiobook generation"
              hasSwitch
              switchValue={notificationsEnabled}
              onSwitchChange={setNotificationsEnabled}
            />
          </View>
        </Animated.View>
        
        {/* About Section */}
        <Animated.View entering={FadeInDown.delay(350)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>About</Text>
          </View>
          <View style={styles.sectionContent}>
            <SettingRow
              icon="information-circle-outline"
              title="About VoiceLibri"
              onPress={() => {}}
            />
            <SettingRow
              icon="document-text-outline"
              title="Terms of Service"
              onPress={() => Linking.openURL('https://voicelibri.app/terms')}
            />
            <SettingRow
              icon="shield-checkmark-outline"
              title="Privacy Policy"
              onPress={() => Linking.openURL('https://voicelibri.app/privacy')}
            />
          </View>
        </Animated.View>
        
        {/* Storage/Debug Section */}
        <Animated.View entering={FadeInDown.delay(400)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Storage</Text>
          </View>
          <View style={styles.sectionContent}>
            <SettingRow
              icon="trash-outline"
              title="Clear Library"
              subtitle={`Remove all ${library.length} books from library`}
              onPress={handleClearLibrary}
            />
          </View>
        </Animated.View>
        
        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>VoiceLibri</Text>
          <Text style={styles.version}>Version 1.0.0</Text>
        </View>
        
        {/* Bottom spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
```

---

### Mobile: Settings Store (Zustand, user preferences)
**File:** `apps/mobile/src/stores/settingsStore.ts` | **Size:** 2.2 KB | **Lines:** 67

```typescript
/**
 * Settings Store - App preferences and settings
 * Using Zustand persist with AsyncStorage per official docs
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface SettingsState {
  // Appearance
  themeMode: ThemeMode;
  
  // Playback defaults
  defaultPlaybackRate: number;
  autoPlayNext: boolean;
  skipSilence: boolean;
  
  // Audio generation
  defaultNarrator: string;
  defaultLanguage: string;
  
  // Notifications
  notificationsEnabled: boolean;
  downloadOverWifiOnly: boolean;
  
  // Actions
  setThemeMode: (mode: ThemeMode) => void;
  setDefaultPlaybackRate: (rate: number) => void;
  setAutoPlayNext: (enabled: boolean) => void;
  setSkipSilence: (enabled: boolean) => void;
  setDefaultNarrator: (narrator: string) => void;
  setDefaultLanguage: (language: string) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setDownloadOverWifiOnly: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      defaultPlaybackRate: 1.0,
      autoPlayNext: true,
      skipSilence: false,
      defaultNarrator: 'Algieba',
      defaultLanguage: 'en',
      notificationsEnabled: true,
      downloadOverWifiOnly: true,
      
      setThemeMode: (mode) => set({ themeMode: mode }),
      setDefaultPlaybackRate: (rate) => set({ defaultPlaybackRate: rate }),
      setAutoPlayNext: (enabled) => set({ autoPlayNext: enabled }),
      setSkipSilence: (enabled) => set({ skipSilence: enabled }),
      setDefaultNarrator: (narrator) => set({ defaultNarrator: narrator }),
      setDefaultLanguage: (language) => set({ defaultLanguage: language }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      setDownloadOverWifiOnly: (enabled) => set({ downloadOverWifiOnly: enabled }),
    }),
    {
      name: 'voicelibri-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

---

### Mobile: Storage Service (AsyncStorage wrapper)
**File:** `apps/mobile/src/services/storage.ts` | **Size:** 1.5 KB | **Lines:** 43

```typescript
/**
 * VoiceLibri - Storage Service (Mobile-only)
 * Uses AsyncStorage per official Expo/Zustand documentation
 * 
 * References:
 * - https://docs.expo.dev/versions/latest/sdk/async-storage/
 * - https://zustand.docs.pmnd.rs/integrations/persisting-store-data
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

// Zustand storage adapter using createJSONStorage (official pattern)
export const zustandStorage = createJSONStorage(() => AsyncStorage);

// Legacy export name for backward compatibility
export const zustandMMKVStorage = zustandStorage;

// Storage utilities
export async function clearAllStorage(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const voiceLibriKeys = keys.filter(key => key.startsWith('voicelibri-'));
    await AsyncStorage.multiRemove(voiceLibriKeys);
    console.log(`✓ Cleared ${voiceLibriKeys.length} items from AsyncStorage`);
  } catch (e) {
    console.warn('clearAllStorage failed:', e);
  }
}

export async function getStorageSize(): Promise<{ keys: number; estimatedSize: string }> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const voiceLibriKeys = keys.filter(key => key.startsWith('voicelibri-'));
    return {
      keys: voiceLibriKeys.length,
      estimatedSize: 'N/A (AsyncStorage)',
    };
  } catch (e) {
    return { keys: 0, estimatedSize: '0 bytes' };
  }
}
```

---

### Mobile: Tab Layout (bottom navigation config)
**File:** `apps/mobile/app/(tabs)/_layout.tsx` | **Size:** 2.5 KB | **Lines:** 86

```tsx
/**
 * Tab Navigator Layout
 * Premium bottom tab navigation with custom styling
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../src/theme/ThemeContext';
import { MiniPlayer } from '../../src/components/ui';
import { usePlayerStore } from '../../src/stores';

export default function TabsLayout() {
  const { theme, isDark } = useTheme();
  const { showMiniPlayer } = usePlayerStore();
  
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
            borderTopWidth: 0,
            height: 85,
            paddingBottom: 24,
            paddingTop: 8,
          },
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '500',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Explore',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'compass' : 'compass-outline'}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Library',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'library' : 'library-outline'}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'settings' : 'settings-outline'}
                size={24}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
      
      {/* Mini Player - Shows above tab bar when audio is playing */}
      {showMiniPlayer && <MiniPlayer />}
    </View>
  );
}
```

---

### Mobile: Theme Context (dark/light mode provider)
**File:** `apps/mobile/src/theme/ThemeContext.tsx` | **Size:** 1.3 KB | **Lines:** 57

```tsx
/**
 * Theme Context and Hook
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, Theme } from './index';
import { useSettingsStore } from '../stores';

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  isDark: false,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  
  const value = useMemo(() => {
    let isDark: boolean;
    
    if (themeMode === 'system') {
      isDark = systemScheme === 'dark';
    } else {
      isDark = themeMode === 'dark';
    }
    
    const toggleTheme = () => {
      setThemeMode(isDark ? 'light' : 'dark');
    };
    
    return {
      theme: isDark ? darkTheme : lightTheme,
      isDark,
      toggleTheme,
    };
  }, [themeMode, systemScheme, setThemeMode]);
  
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

---

### Mobile: Theme System
**File:** `apps/mobile/src/theme/index.ts` | **Size:** 3.9 KB | **Lines:** 203

```typescript
/**
 * VoiceLibri Theme Configuration
 * Premium AI-tech aesthetic with minimalistic, emotionally positive feel
 */

export const colors = {
  // Primary brand colors
  primary: {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1', // Main brand color
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
  },
  
  // Accent colors
  accent: {
    purple: '#8b5cf6',
    pink: '#ec4899',
    cyan: '#06b6d4',
    emerald: '#10b981',
  },
  
  // Neutral grays
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#030712',
  },
  
  // Semantic colors
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
};

export const lightTheme = {
  dark: false,
  colors: {
    primary: colors.primary[500],
    background: colors.gray[50],
    card: '#ffffff',
    cardElevated: '#ffffff',
    text: colors.gray[900],
    textSecondary: colors.gray[500],
    textMuted: colors.gray[400],
    border: colors.gray[200],
    notification: colors.primary[500],
    
    // Player
    playerBackground: '#ffffff',
    playerControls: colors.gray[900],
    progressTrack: colors.gray[200],
    progressFill: colors.primary[500],
    
    // Semantic
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    
    // Status bar
    statusBar: 'dark-content' as const,
  },
};

export const darkTheme = {
  dark: true,
  colors: {
    primary: colors.primary[400],
    background: colors.gray[950],
    card: colors.gray[900],
    cardElevated: colors.gray[800],
    text: colors.gray[50],
    textSecondary: colors.gray[400],
    textMuted: colors.gray[500],
    border: colors.gray[800],
    notification: colors.primary[400],
    
    // Player
    playerBackground: colors.gray[900],
    playerControls: colors.gray[50],
    progressTrack: colors.gray[700],
    progressFill: colors.primary[400],
    
    // Semantic
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    
    // Status bar
    statusBar: 'light-content' as const,
  },
};

export type Theme = typeof lightTheme;

// Spacing scale
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
  '4xl': 80,
};

// Border radius
export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
};

// Typography
export const typography = {
  // Font sizes
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  
  // Font weights (as string for React Native)
  light: '300' as const,
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

// Shadows
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 6,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 25,
    elevation: 10,
  },
};

// Animation durations
export const animation = {
  fast: 150,
  normal: 300,
  slow: 500,
};

export default {
  colors,
  lightTheme,
  darkTheme,
  spacing,
  borderRadius,
  typography,
  shadows,
  animation,
};
```

---

### Mobile: VoiceLibri API Client (backend integration)
**File:** `apps/mobile/src/services/voiceLibriApi.ts` | **Size:** 9 KB | **Lines:** 333

```typescript
/**
 * VoiceLibri Backend API Service
 * Connects to the Express backend for audiobook generation
 */

import axios from 'axios';
import { Platform } from 'react-native';

// Platform-aware base URL per React Native official networking documentation
// https://reactnative.dev/docs/network
const getBaseUrl = () => {
  if (Platform.OS === 'android') {
    // Android emulator: 10.0.2.2 is special alias for host machine's localhost
    return 'http://10.0.2.2:3001/api';
  } else if (Platform.OS === 'ios') {
    // iOS: Use computer's local network IP for physical devices
    // For iOS Simulator on same machine, localhost would work, but using
    // local IP works for both simulator and physical device
    return 'http://192.168.1.20:3001/api';
  }
  return 'http://192.168.1.20:3001/api'; // Default for physical devices
};

// Export for use in other services (e.g., audioStorageService)
export const API_BASE_URL = getBaseUrl();

export interface AudiobookMetadata {
  title: string;
  author?: string;
  language?: string;
  chapterCount: number;
  totalDuration?: number;
  coverUrl?: string;
  createdAt?: string;
  generationStatus?: 'not-started' | 'in-progress' | 'completed';
  progress?: number;
}

// Backend returns this structure from /api/audiobooks
export interface BackendAudiobookEntry {
  title: string;
  metadata: AudiobookMetadata | null;
  progress: {
    current: number;
    total: number;
    status: string;
  } | null;
  tempChunksCount: number;
}

export interface ChapterMetadata {
  index: number;
  title: string;
  duration?: number;
  subChunkCount: number;
}

export interface GenerationStatus {
  status: 'idle' | 'generating' | 'completed' | 'failed';
  progress: number;
  currentChapter?: number;
  totalChapters?: number;
  message?: string;
}

export interface BookInfo {
  title: string;
  author?: string;
  language: string;
  chapterCount: number;
  totalChunks: number;
}

export interface AvailableBook {
  filename: string;
  extension: string;
  size: number;
}

export interface BookSelectResult {
  title: string;
  author?: string;
  audiobookTitle?: string;
  chapters?: Array<{
    index: number;
    title: string;
    subChunkStart: number;
    subChunkCount: number;
  }>;
  _internal?: {
    totalChunks: number;
    durationSeconds: number;
  };
}

const voiceLibriApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  // Increase max content lengths for large base64-encoded files (PDFs, EPUBs up to 50MB)
  maxContentLength: 60 * 1024 * 1024, // 60MB
  maxBodyLength: 60 * 1024 * 1024,    // 60MB
});

/**
 * Get list of available source books (EPUB, TXT files)
 */
export async function getAvailableBooks(): Promise<AvailableBook[]> {
  const response = await voiceLibriApi.get<{ books: AvailableBook[] }>('/books');
  return response.data.books;
}

/**
 * Select a book to process
 * Large EPUBs can take time to parse and chunk
 */
export async function selectBook(filename: string, targetLanguage: string = 'en'): Promise<BookInfo> {
  const response = await voiceLibriApi.post<BookInfo>('/book/select', {
    filename,
    targetLanguage,
  }, {
    timeout: 120000, // 2 minutes for large EPUBs like Dracula
  });
  return response.data;
}

/**
 * Get current book info
 */
export async function getBookInfo(): Promise<BookInfo | null> {
  try {
    const response = await voiceLibriApi.get<BookInfo>('/book/info');
    return response.data;
  } catch {
    return null;
  }
}

/**
 * Get list of generated audiobooks
 */
export async function getAudiobooks(): Promise<BackendAudiobookEntry[]> {
  const response = await voiceLibriApi.get<{ audiobooks: BackendAudiobookEntry[] }>('/audiobooks');
  return response.data.audiobooks || [];
}

/**
 * Get audiobook details
 */
export async function getAudiobook(title: string): Promise<AudiobookMetadata & { chapters: ChapterMetadata[] }> {
  const encodedTitle = encodeURIComponent(title);
  const response = await voiceLibriApi.get(`/audiobooks/${encodedTitle}`);
  return response.data;
}

/**
 * Start audiobook generation
 */
export async function generateAudiobook(options: {
  bookFile: string;
  voiceMap?: Record<string, string>;
  defaultVoice?: string;
}): Promise<{ message: string; jobId?: string }> {
  const response = await voiceLibriApi.post('/audiobooks/generate', options, {
    timeout: 60000, // 1 minute - just queues the job
  });
  return response.data;
}

/**
 * Get generation status
 */
export async function getGenerationStatus(): Promise<GenerationStatus> {
  const response = await voiceLibriApi.get<GenerationStatus>('/audiobooks/worker/status');
  return response.data;
}

/**
 * Get chapter audio URL
 */
export function getChapterAudioUrl(title: string, chapterIndex: number): string {
  const encodedTitle = encodeURIComponent(title);
  return `${API_BASE_URL}/audiobooks/${encodedTitle}/chapters/${chapterIndex}`;
}

/**
 * Get subchunk audio URL (for streaming during generation)
 */
export function getSubChunkAudioUrl(title: string, chapterIndex: number, subChunkIndex: number): string {
  const encodedTitle = encodeURIComponent(title);
  return `${API_BASE_URL}/audiobooks/${encodedTitle}/subchunks/${chapterIndex}/${subChunkIndex}`;
}

/**
 * Delete an audiobook
 */
export async function deleteAudiobook(title: string): Promise<void> {
  const encodedTitle = encodeURIComponent(title);
  await voiceLibriApi.delete(`/audiobooks/${encodedTitle}`);
}

/**
 * Update playback position for resume functionality
 */
export async function updatePlaybackPosition(
  title: string,
  chapterIndex: number,
  currentTime: number
): Promise<void> {
  const encodedTitle = encodeURIComponent(title);
  await voiceLibriApi.put(`/audiobooks/${encodedTitle}/position`, {
    currentChapter: chapterIndex,
    currentTime,
  });
}

/**
 * Get playback position for resume
 */
export async function getPlaybackPosition(title: string): Promise<{
  currentChapter: number;
  currentTime: number;
  lastPlayedAt: string;
} | null> {
  try {
    const encodedTitle = encodeURIComponent(title);
    const response = await voiceLibriApi.get(`/audiobooks/${encodedTitle}/position`);
    return response.data.playback;
  } catch {
    return null;
  }
}

/**
 * Get generation progress for a specific book
 */
export async function getGenerationProgress(title: string): Promise<{
  bookTitle: string;
  totalChapters: number;
  chaptersGenerated: number;
  status: string;
  progress: number;
}> {
  const encodedTitle = encodeURIComponent(title);
  const response = await voiceLibriApi.get(`/audiobooks/${encodedTitle}/progress`);
  return response.data;
}

/**
 * Create audiobook from pasted text or base64 binary file (EPUB, DOCX, PDF, etc.)
 */
export async function createFromText(options: {
  text: string;
  title?: string;
  detectChapters?: boolean;
  narratorVoice?: string;
  targetLanguage?: string;
  isBase64Epub?: boolean;       // Legacy: text contains base64-encoded EPUB file
  isBase64File?: boolean;       // New: text contains base64-encoded binary file
  fileExtension?: string;       // File extension to determine format (epub, docx, pdf, etc.)
}): Promise<BookSelectResult> {
  // Longer timeout for processing large texts/files
  const response = await voiceLibriApi.post('/book/from-text', options, {
    timeout: 180000, // 3 minutes for large EPUBs
    maxContentLength: 60 * 1024 * 1024, // 60MB for this specific request
    maxBodyLength: 60 * 1024 * 1024,
  });
  return response.data;
}

/**
 * Create audiobook from URL (direct link to ebook file)
 * Downloads the ebook on backend and processes it
 */
export async function createFromUrl(options: {
  url: string;
  narratorVoice?: string;
  targetLanguage?: string;
}): Promise<BookSelectResult> {
  // Longer timeout for downloading and processing EPUBs
  const response = await voiceLibriApi.post('/book/from-url', options, {
    timeout: 180000, // 3 minutes for large ebooks
  });
  return response.data;
}

/**
 * Upload a book file (for future use)
 */
export async function uploadBook(formData: FormData): Promise<{ filename: string }> {
  const response = await voiceLibriApi.post('/books/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    await voiceLibriApi.get('/health');
    return true;
  } catch {
    return false;
  }
}

export default {
  getAvailableBooks,
  selectBook,
  getBookInfo,
  getAudiobooks,
  getAudiobook,
  generateAudiobook,
  getGenerationStatus,
  getGenerationProgress,
  getChapterAudioUrl,
  getSubChunkAudioUrl,
  deleteAudiobook,
  uploadBook,
  healthCheck,
  updatePlaybackPosition,
  getPlaybackPosition,
  createFromText,
  createFromUrl,
  API_BASE_URL,
};
```

---

### PWA: API Service (backend integration, all endpoints)
**File:** `apps/pwa-v2/src/services/api.ts` | **Size:** 12.7 KB | **Lines:** 419

```typescript
/**
 * VoiceLibri API Service
 * Connects PWA frontend to backend audiobook generation API
 */

import type { Book, Chapter } from '../types';

const API_BASE_URL = 'http://localhost:3001/api';

// ============================================
// AUDIOBOOK LIBRARY API
// ============================================

export interface AudiobookMetadata {
  title: string;
  author: string;
  language: string;
  totalChapters: number;
  chapters: ChapterMetadata[];
  generationStatus: 'not-started' | 'in-progress' | 'completed';
  lastUpdated: string;
  playback?: {
    currentChapter: number;
    currentTime: number;
    lastPlayedAt: string;
  };
}

export interface ChapterMetadata {
  index: number;
  title: string;
  filename: string;
  duration: number;
  isGenerated: boolean;
  isConsolidated?: boolean;
}

export interface SubChunkInfo {
  chapterIndex: number;
  subChunkIndex: number;
  isReady: boolean;
  audioUrl?: string;
}

export interface BookSelectResult {
  title: string;
  author: string;
  audiobookTitle?: string;
  chapters?: Array<{
    index: number;
    title: string;
    subChunkStart: number;
    subChunkCount: number;
  }>;
  _internal?: {
    totalChunks: number;
    durationSeconds: number;
  };
}

/**
 * Get list of all audiobooks in library
 */
export async function getAudiobooks(): Promise<AudiobookMetadata[]> {
  const response = await fetch(`${API_BASE_URL}/audiobooks`);
  if (!response.ok) throw new Error('Failed to fetch audiobooks');
  const data = await response.json();
  // Backend returns wrapper objects {title, metadata, progress, tempChunksCount}
  // Unwrap to flat AudiobookMetadata, merging generation status from progress
  return (data.audiobooks ?? []).map((item: any) => {
    const meta = item.metadata;
    if (!meta) return null;
    return {
      ...meta,
      generationStatus: item.progress?.status === 'completed' ? 'completed'
        : item.progress?.status ? 'in-progress'
        : meta.generationStatus ?? 'not-started',
    } as AudiobookMetadata;
  }).filter(Boolean) as AudiobookMetadata[];
}

/**
 * Get metadata for specific audiobook
 */
export async function getAudiobook(bookTitle: string): Promise<AudiobookMetadata> {
  const response = await fetch(`${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}`);
  if (!response.ok) throw new Error('Failed to fetch audiobook');
  return response.json();
}

/**
 * Select a book and start the correct pipeline
 * This is the working API that triggers: translation → character extraction → dramatization → audio
 */
export async function selectBook(options: {
  filename: string;
  narratorVoice?: string;
  targetLanguage?: string;
  dramatize?: boolean;
}): Promise<BookSelectResult> {
  const response = await fetch(`${API_BASE_URL}/book/select?dramatize=${options.dramatize ?? true}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: options.filename,
      narratorVoice: options.narratorVoice,
      targetLanguage: options.targetLanguage,
    }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to select book' }));
    throw new Error(errorData.message || 'Failed to select book');
  }
  return response.json();
}

/**
 * Get dramatization/generation status
 */
export async function getGenerationStatus(): Promise<{
  phase: string;
  currentChapter: number;
  totalChapters: number;
  currentOperation: string;
  error: string | null;
}> {
  const response = await fetch(`${API_BASE_URL}/dramatization/status`);
  if (!response.ok) throw new Error('Failed to fetch status');
  return response.json();
}

/**
 * Legacy: Generate audiobook from file (uses worker queue - not recommended)
 */
export async function generateAudiobook(options: {
  bookFile: string;
  targetLanguage?: string;
  voiceMap?: Record<string, string>;
  defaultVoice?: string;
}): Promise<{
  success: boolean;
  bookTitle: string;
  metadata: AudiobookMetadata;
  totalChunks: number;
  message: string;
}> {
  const response = await fetch(`${API_BASE_URL}/audiobooks/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to generate audiobook' }));
    throw new Error(errorData.message || 'Failed to generate audiobook');
  }
  return response.json();
}

/**
 * Get generation progress for audiobook.
 * Tries audiobookWorker progress first, falls back to dramatization status
 * (used when generation was triggered via /api/book/select flow).
 */
export async function getGenerationProgress(bookTitle: string): Promise<{
  bookTitle: string;
  totalChapters: number;
  chaptersGenerated: number;
  status: string;
  progress: number;
}> {
  // Try worker progress endpoint first
  const response = await fetch(`${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/progress`);
  if (response.ok) {
    return response.json();
  }

  // Fallback: use dramatization status endpoint (selectBook flow)
  try {
    const dramResponse = await fetch(`${API_BASE_URL}/dramatization/status`);
    if (dramResponse.ok) {
      const dramStatus = await dramResponse.json();
      const totalChapters = dramStatus.totalChapters || 1;
      const completedChapters = dramStatus.completedChapters || 0;
      const isComplete = dramStatus.phase === 'complete' || 
        (!dramStatus.isActive && completedChapters >= totalChapters);
      const progress = totalChapters > 0 
        ? Math.round((completedChapters / totalChapters) * 100) 
        : 0;
      return {
        bookTitle,
        totalChapters,
        chaptersGenerated: completedChapters,
        status: isComplete ? 'completed' : 'in-progress',
        progress,
      };
    }
  } catch {
    // Both endpoints failed
  }

  // If both fail, return a default in-progress response
  return {
    bookTitle,
    totalChapters: 0,
    chaptersGenerated: 0,
    status: 'in-progress',
    progress: 0,
  };
}

/**
 * Delete audiobook from library
 */
export async function deleteAudiobook(bookTitle: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to delete audiobook' }));
    throw new Error(errorData.message || 'Failed to delete audiobook');
  }
  return response.json();
}

/**
 * Get chapter audio URL
 */
export function getChapterAudioUrl(bookTitle: string, chapterIndex: number): string {
  return `${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/chapters/${chapterIndex}`;
}

/**
 * Get chapter ambient audio URL (independent ambient track)
 */
export function getChapterAmbientUrl(bookTitle: string, chapterIndex: number): string {
  return `${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/chapters/${chapterIndex}/ambient`;
}

/**
 * Check if ambient track exists for a chapter
 */
export async function isAmbientReady(bookTitle: string, chapterIndex: number): Promise<boolean> {
  try {
    const response = await fetch(getChapterAmbientUrl(bookTitle, chapterIndex), { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get subchunk audio URL for real-time streaming during generation
 */
export function getSubChunkAudioUrl(bookTitle: string, chapterIndex: number, subChunkIndex: number): string {
  return `${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/subchunks/${chapterIndex}/${subChunkIndex}`;
}

/**
 * Check if a specific chapter is consolidated (ready for normal playback)
 */
export async function isChapterReady(bookTitle: string, chapterIndex: number): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/chapters/${chapterIndex}`, {
      method: 'HEAD'
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get the highest consolidated chapter number (all chapters <= this number are ready)
 */
export async function getHighestReadyChapter(bookTitle: string): Promise<number> {
  try {
    const metadata = await getAudiobook(bookTitle);
    // Count consecutive chapters that are consolidated
    let highestReady = 0;
    for (const chapter of metadata.chapters) {
      if (chapter.isConsolidated) {
        highestReady = Math.max(highestReady, chapter.index);
      } else {
        break; // Stop at first non-consolidated chapter
      }
    }
    return highestReady;
  } catch {
    return 0;
  }
}

/**
 * Update playback position
 */
export async function updatePlaybackPosition(
  bookTitle: string,
  chapterIndex: number,
  currentTime: number
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/position`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentChapter: chapterIndex, currentTime }),
  });
  if (!response.ok) throw new Error('Failed to update position');
}

/**
 * Get playback position
 */
export async function getPlaybackPosition(bookTitle: string): Promise<{
  currentChapter: number;
  currentTime: number;
  lastPlayedAt: string;
}> {
  const response = await fetch(`${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/position`);
  if (!response.ok) throw new Error('Failed to fetch position');
  const data = await response.json();
  return data.playback;
}

// ============================================
// TEXT PASTE AND URL IMPORT
// ============================================

/**
 * Create audiobook from pasted text
 * @param text - The text content to convert to audiobook
 * @param options - Narrator voice, language, title
 */
export async function createFromText(options: {
  text: string;
  title?: string;
  detectChapters?: boolean;
  narratorVoice?: string;
  targetLanguage?: string;
}): Promise<BookSelectResult> {
  const response = await fetch(`${API_BASE_URL}/book/from-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to create from text' }));
    throw new Error(errorData.message || 'Failed to create audiobook from text');
  }
  return response.json();
}

/**
 * Create audiobook from URL (direct link to ebook file)
 * @param url - Direct link to .txt or .epub file
 * @param options - Narrator voice, language
 */
export async function createFromUrl(options: {
  url: string;
  narratorVoice?: string;
  targetLanguage?: string;
}): Promise<BookSelectResult> {
  const response = await fetch(`${API_BASE_URL}/book/from-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to create from URL' }));
    throw new Error(errorData.message || 'Failed to create audiobook from URL');
  }
  return response.json();
}

// ============================================
// CONVERSION UTILITIES
// ============================================

/**
 * Convert backend AudiobookMetadata to frontend Book type
 */
export function convertToBook(metadata: AudiobookMetadata): Book {
  const chapters: Chapter[] = metadata.chapters.map((ch) => ({
    id: `ch-${ch.index}`,
    title: ch.title,
    index: ch.index,
    start: 0, // Will be calculated from cumulative duration
    end: ch.duration,
    duration: ch.duration,
  }));

  // Calculate cumulative start/end times
  let cumulative = 0;
  chapters.forEach((ch) => {
    ch.start = cumulative;
    ch.end = cumulative + ch.duration;
    cumulative = ch.end;
  });

  const totalDuration = cumulative;
  
  const book: Book = {
    id: metadata.title,
    title: metadata.title,
    author: metadata.author,
    totalDuration,
    chapters,
    audioUrl: '', // Not needed for streaming
    isFinished: metadata.generationStatus === 'completed',
    createdAt: new Date(metadata.lastUpdated),
    lastPlayedAt: metadata.playback ? new Date(metadata.playback.lastPlayedAt) : undefined,
    progress: metadata.playback ? {
      position: metadata.playback.currentTime,
      chapterIndex: metadata.playback.currentChapter,
      updatedAt: new Date(metadata.playback.lastPlayedAt),
    } : undefined,
  };

  return book;
}
```

---

### PWA: App Entry (routing, layout structure)
**File:** `apps/pwa-v2/src/App.tsx` | **Size:** 1.1 KB | **Lines:** 42

```tsx
// VoiceLibri - Premium Audiobook Player PWA
// Main Application Entry Point

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/layout';
import { 
  LibraryScreen, 
  GenerateScreen, 
  ClassicsScreen, 
  SettingsScreen 
} from './screens';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<LibraryScreen />} />
            <Route path="/generate" element={<GenerateScreen />} />
            <Route path="/classics" element={<ClassicsScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
```

---

### PWA: Player Store (Zustand playback state management)
**File:** `apps/pwa-v2/src/stores/playerStore.ts` | **Size:** 11.6 KB | **Lines:** 337

```typescript
// VoiceLibri - Player Store
// State management inspired by BookPlayer's PlayerManager

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Book, Chapter, PlaybackState, SleepTimerState, UserSettings } from '../types';

interface PlayerStore {
  // Current playback state
  currentBook: Book | null;
  currentChapter: Chapter | null;
  playbackState: PlaybackState;
  currentTime: number;
  speed: number;
  volume: number;
  
  // Progressive playback mode for new audiobooks
  playbackMode: 'chapters' | 'subchunks' | 'progressive';
  currentSubChunk: { chapterIndex: number; subChunkIndex: number } | null;
  highestReadyChapter: number; // Tracks which chapters are fully consolidated
  
  // Ambient/soundscape controls (dual-player architecture)
  ambientVolume: number; // 0.0 – 1.0
  ambientEnabled: boolean; // enable/disable ambient layer
  
  // Sleep timer (BookPlayer pattern)
  sleepTimer: SleepTimerState;
  
  // Settings
  settings: UserSettings;
  
  // Mini player visibility
  isMiniPlayerVisible: boolean;
  isFullPlayerOpen: boolean;
  
  // Computed getters
  playbackSpeed: number;
  
  // Actions
  setCurrentBook: (book: Book | null) => void;
  setCurrentChapter: (chapter: Chapter | null) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setCurrentTime: (time: number) => void;
  setSpeed: (speed: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  
  // Playback controls (BookPlayer-style)
  play: () => void;
  pause: () => void;
  playPause: () => void;
  seekTo: (time: number) => void;
  skipForward: () => void;
  skipBackward: () => void;
  jumpToChapter: (target: Chapter | number | 'next' | 'previous') => void;
  nextChapter: () => void;
  previousChapter: () => void;
  
  // Sleep timer controls
  setSleepTimer: (state: SleepTimerState) => void;
  cancelSleepTimer: () => void;
  
  // Player visibility
  showMiniPlayer: () => void;
  hideMiniPlayer: () => void;
  openFullPlayer: () => void;
  closeFullPlayer: () => void;
  
  // Progressive playback controls
  setPlaybackMode: (mode: 'chapters' | 'subchunks' | 'progressive') => void;
  setCurrentSubChunk: (subChunk: { chapterIndex: number; subChunkIndex: number } | null) => void;
  setHighestReadyChapter: (chapterIndex: number) => void;
  startProgressivePlayback: (book: Book) => void;
  switchToChapterMode: () => void;
  nextSubChunk: () => boolean; // Returns true if there's a next subchunk
  shouldSwitchToChapter: (chapterIndex: number) => Promise<boolean>;
  
  // Settings
  updateSettings: (settings: Partial<UserSettings>) => void;
  
  // Ambient controls
  setAmbientVolume: (volume: number) => void;
  setAmbientEnabled: (enabled: boolean) => void;
  toggleAmbient: () => void;
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      // Initial state
      currentBook: null,
      currentChapter: null,
      playbackState: 'stopped',
      currentTime: 0,
      speed: 1.0,
      volume: 1.0,
      playbackMode: 'chapters',
      currentSubChunk: null,
      highestReadyChapter: 0,
      ambientVolume: 0.5,
      ambientEnabled: true,
      sleepTimer: { type: 'off' },
      settings: {
        playbackSpeed: 1.0,
        skipForwardDuration: 30,
        skipBackwardDuration: 15,
        autoPlay: true,
        preferChapterContext: true,
        preferRemainingTime: true,
      },
      isMiniPlayerVisible: false,
      isFullPlayerOpen: false,
      
      // Computed - actually just alias for speed
      get playbackSpeed() {
        return get().speed;
      },
      
      // Setters
      setCurrentBook: (book) => {
        const shouldShowPlayer = book !== null;
        set({ 
          currentBook: book,
          isMiniPlayerVisible: shouldShowPlayer,
          currentChapter: book?.chapters[0] ?? null,
          playbackMode: 'chapters',
          currentSubChunk: null,
          currentTime: 0,
        });
      },
      setCurrentChapter: (chapter) => set({ currentChapter: chapter }),
      setPlaybackState: (state) => set({ playbackState: state }),
      setCurrentTime: (time) => set({ currentTime: time }),
      setSpeed: (speed) => set({ speed }),
      setVolume: (volume) => set({ volume }),
      
      // Playback speed alias for convenience
      setPlaybackSpeed: (speed: number) => set({ speed }),
      
      // Playback controls
      play: () => set({ playbackState: 'playing' }),
      pause: () => set({ playbackState: 'paused' }),
      playPause: () => {
        const { playbackState } = get();
        set({ 
          playbackState: playbackState === 'playing' ? 'paused' : 'playing' 
        });
      },
      seekTo: (time) => set({ currentTime: time }),
      skipForward: () => {
        const { currentTime, settings, currentBook } = get();
        const newTime = Math.min(
          currentTime + settings.skipForwardDuration,
          currentBook?.totalDuration ?? currentTime
        );
        set({ currentTime: newTime });
      },
      skipBackward: () => {
        const { currentTime, settings } = get();
        const newTime = Math.max(currentTime - settings.skipBackwardDuration, 0);
        set({ currentTime: newTime });
      },
      jumpToChapter: (target) => {
        const { currentBook, currentChapter } = get();
        if (!currentBook) return;
        
        let chapter: Chapter | undefined;
        
        if (target === 'next') {
          if (!currentChapter) return;
          const currentIndex = currentBook.chapters.findIndex(c => c.id === currentChapter.id);
          chapter = currentBook.chapters[currentIndex + 1];
        } else if (target === 'previous') {
          if (!currentChapter) return;
          const currentIndex = currentBook.chapters.findIndex(c => c.id === currentChapter.id);
          chapter = currentBook.chapters[currentIndex - 1];
        } else if (typeof target === 'number') {
          chapter = currentBook.chapters[target];
        } else {
          chapter = target;
        }
        
        if (chapter) {
          set({ 
            currentChapter: chapter,
            currentTime: chapter.start,
          });
        }
      },
      nextChapter: () => {
        const { currentBook, currentChapter } = get();
        if (!currentBook || !currentChapter) return;
        
        const currentIndex = currentBook.chapters.findIndex(c => c.id === currentChapter.id);
        const nextChapter = currentBook.chapters[currentIndex + 1];
        if (nextChapter) {
          set({ 
            currentChapter: nextChapter,
            currentTime: nextChapter.start,
          });
        }
      },
      previousChapter: () => {
        const { currentBook, currentChapter, currentTime } = get();
        if (!currentBook || !currentChapter) return;
        
        const currentIndex = currentBook.chapters.findIndex(c => c.id === currentChapter.id);
        
        // If more than 3 seconds into chapter, restart current chapter
        if (currentTime - currentChapter.start > 3) {
          set({ currentTime: currentChapter.start });
          return;
        }
        
        // Otherwise go to previous chapter
        const prevChapter = currentBook.chapters[currentIndex - 1];
        if (prevChapter) {
          set({ 
            currentChapter: prevChapter,
            currentTime: prevChapter.start,
          });
        }
      },
      
      // Sleep timer
      setSleepTimer: (state) => set({ sleepTimer: state }),
      cancelSleepTimer: () => set({ sleepTimer: { type: 'off' } }),
      
      // Player visibility
      showMiniPlayer: () => set({ isMiniPlayerVisible: true }),
      hideMiniPlayer: () => set({ isMiniPlayerVisible: false }),
      openFullPlayer: () => set({ isFullPlayerOpen: true }),
      closeFullPlayer: () => set({ isFullPlayerOpen: false }),
      
      // Settings
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings },
      })),
      
      // Progressive playback controls
      setPlaybackMode: (mode) => set({ playbackMode: mode }),
      setCurrentSubChunk: (subChunk) => set({ currentSubChunk: subChunk }),
      setHighestReadyChapter: (chapterIndex) => set({ highestReadyChapter: chapterIndex }),
      
      startProgressivePlayback: (book) => {
        const firstChapter = book.chapters[0];
        const firstChapterIndex = firstChapter?.index ?? 1;
        set({
          currentBook: book,
          currentChapter: firstChapter || null,
          playbackMode: 'progressive',
          playbackState: 'playing',
          currentSubChunk: { chapterIndex: firstChapterIndex, subChunkIndex: 0 },
          highestReadyChapter: 0,
          isMiniPlayerVisible: true,
        });
      },
      
      switchToChapterMode: () => {
        set({ 
          playbackMode: 'chapters',
          currentSubChunk: null,
        });
      },
      
      nextSubChunk: () => {
        const { currentSubChunk, currentBook } = get();
        if (!currentSubChunk || !currentBook) return false;
        
        const nextSubChunk = {
          chapterIndex: currentSubChunk.chapterIndex,
          subChunkIndex: currentSubChunk.subChunkIndex + 1
        };
        
        // Check if we're moving to next chapter's first subchunk
        if (nextSubChunk.subChunkIndex >= 50) { // Assuming max 50 subchunks per chapter
          if (nextSubChunk.chapterIndex + 1 < currentBook.chapters.length) {
            nextSubChunk.chapterIndex++;
            nextSubChunk.subChunkIndex = 0;
          } else {
            return false; // No more content
          }
        }
        
        set({ currentSubChunk: nextSubChunk });
        return true;
      },
      
      shouldSwitchToChapter: async (chapterIndex: number) => {
        const { currentBook, highestReadyChapter } = get();
        if (!currentBook) return false;
        
        // If this chapter is already ready, switch to chapter mode
        if (chapterIndex <= highestReadyChapter) {
          return true;
        }
        
        // Check if chapter became ready since last check
        try {
          const { isChapterReady } = await import('../services/api');
          const isReady = await isChapterReady(currentBook.title, chapterIndex);
          if (isReady) {
            set({ highestReadyChapter: Math.max(chapterIndex, highestReadyChapter) });
            return true;
          }
        } catch (error) {
          console.error('Error checking chapter readiness:', error);
        }
        
        return false;
      },
      
      // Ambient controls
      setAmbientVolume: (volume) => set({ ambientVolume: Math.max(0, Math.min(1, volume)) }),
      setAmbientEnabled: (enabled) => set({ ambientEnabled: enabled }),
      toggleAmbient: () => set((s) => ({ ambientEnabled: !s.ambientEnabled })),
    }),
    {
      name: 'voicelibri-player',
      partialize: (state) => ({
        settings: state.settings,
        speed: state.speed,
        volume: state.volume,
        ambientVolume: state.ambientVolume,
        ambientEnabled: state.ambientEnabled,
        currentBook: state.currentBook,
        currentChapter: state.currentChapter,
        isMiniPlayerVisible: state.isMiniPlayerVisible,
        currentTime: state.currentTime,
        playbackMode: state.playbackMode,
        currentSubChunk: state.currentSubChunk,
        highestReadyChapter: state.highestReadyChapter,
      }),
    }
  )
);
```

---

### PWA: Progressive Audio Playback Hook (streaming audio)
**File:** `apps/pwa-v2/src/hooks/useProgressiveAudioPlayback.ts` | **Size:** 19.2 KB | **Lines:** 530

```typescript
/**
 * Progressive Audio Playback Hook
 * Handles real-time subchunk streaming during generation and automatic chapter switching.
 * Includes dual-player support: voice (master) + ambient (follower).
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import {
  getChapterAudioUrl,
  getSubChunkAudioUrl,
  isChapterReady,
  getHighestReadyChapter,
  getChapterAmbientUrl,
  isAmbientReady,
} from '../services/api';

// Audio cache for blob URLs
interface AudioCache {
  [key: string]: string; // blob URL
}

/**
 * Enhanced audio playback hook with progressive subchunk support
 * and independent ambient track playback.
 */
export function useProgressiveAudioPlayback() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ambientRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<AudioCache>({});
  const driftIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastShownChaptersRef = useRef<Set<number>>(new Set());
  const [soundscapeToast, setSoundscapeToast] = useState<string | null>(null);
  
  const {
    currentBook,
    currentChapter,
    playbackState,
    currentTime,
    playbackMode,
    currentSubChunk,
    highestReadyChapter,
    ambientVolume,
    ambientEnabled,
    setPlaybackState,
    setCurrentTime,
    setCurrentSubChunk,
    setHighestReadyChapter,
    nextSubChunk,
    shouldSwitchToChapter,
    switchToChapterMode,
  } = usePlayerStore();

  // Initialize audio elements (voice + ambient)
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'metadata';
    }
    if (!ambientRef.current) {
      ambientRef.current = new Audio();
      ambientRef.current.preload = 'metadata';
      ambientRef.current.loop = true; // Loop ambient in case it's shorter than voice
      ambientRef.current.volume = ambientEnabled ? ambientVolume : 0;
    }

    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = async () => {
      console.log('🎵 Audio ended, determining next action...');
      
      if (playbackMode === 'progressive' && currentSubChunk) {
        await handleProgressiveEnd();
      } else if (playbackMode === 'chapters') {
        await handleChapterEnd();
      }
    };

    const handleError = (e: Event) => {
      console.error('Audio error:', e);
      setPlaybackState('error');
    };

    const handleCanPlayThrough = () => {
      // Only set paused if we're explicitly in loading state AND not in auto-play flow
      // (loadSubChunkAudio with autoPlay handles its own state transition)
      if (playbackState === 'loading' && !audioRef.current?.dataset.autoPlay) {
        setPlaybackState('paused');
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplaythrough', handleCanPlayThrough);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplaythrough', handleCanPlayThrough);
      audio.pause();
      audio.src = '';
      // Also stop ambient
      if (ambientRef.current) {
        ambientRef.current.pause();
        ambientRef.current.src = '';
      }
    };
  }, [playbackMode, currentSubChunk, playbackState, setPlaybackState, setCurrentTime]);

  // Sync ambient volume and enabled state
  useEffect(() => {
    if (ambientRef.current) {
      ambientRef.current.volume = ambientEnabled ? ambientVolume : 0;
    }
  }, [ambientVolume, ambientEnabled]);

  // Drift correction: keep ambient in sync with voice (chapter mode only)
  useEffect(() => {
    if (driftIntervalRef.current) {
      clearInterval(driftIntervalRef.current);
      driftIntervalRef.current = null;
    }

    if (playbackMode === 'chapters' && playbackState === 'playing') {
      driftIntervalRef.current = setInterval(() => {
        const voice = audioRef.current;
        const ambient = ambientRef.current;
        if (!voice || !ambient || !ambient.src || ambient.readyState < 2) return;
        
        const drift = Math.abs(voice.currentTime - ambient.currentTime);
        if (drift > 0.05) { // 50ms tolerance
          ambient.currentTime = voice.currentTime;
        }
      }, 500);
    }

    return () => {
      if (driftIntervalRef.current) {
        clearInterval(driftIntervalRef.current);
        driftIntervalRef.current = null;
      }
    };
  }, [playbackMode, playbackState]);

  // Handle progressive playback end (subchunk finished)
  const handleProgressiveEnd = useCallback(async () => {
    if (!currentBook || !currentSubChunk) return;
    
    const { chapterIndex, subChunkIndex } = currentSubChunk;
    
    console.log(`🎵 Subchunk ${chapterIndex}:${subChunkIndex} finished, checking next...`);
    
    // Check if current chapter is now ready (consolidated)
    if (await shouldSwitchToChapter(chapterIndex)) {
      console.log(`✅ Chapter ${chapterIndex} is ready, switching to chapter mode`);
      switchToChapterMode();
      await loadChapterAudio(chapterIndex);
      return;
    }
    
    // Try to play next subchunk
    if (nextSubChunk()) {
      const newSubChunk = usePlayerStore.getState().currentSubChunk;
      if (newSubChunk) {
        console.log(`▶️ Playing next subchunk: ${newSubChunk.chapterIndex}:${newSubChunk.subChunkIndex}`);
        await loadSubChunkAudio(newSubChunk.chapterIndex, newSubChunk.subChunkIndex, { autoPlay: true });
      }
    } else {
      // No more subchunks, check if next chapter is ready
      const nextChapterIndex = chapterIndex + 1;
      if (nextChapterIndex < currentBook.chapters.length) {
        if (await shouldSwitchToChapter(nextChapterIndex)) {
          console.log(`✅ Next chapter ${nextChapterIndex} is ready, switching to chapter mode`);
          switchToChapterMode();
          await loadChapterAudio(nextChapterIndex);
        } else {
          console.log(`⏳ Waiting for chapter ${nextChapterIndex} to be ready...`);
          // Wait and try playing first subchunk of next chapter
          setCurrentSubChunk({ chapterIndex: nextChapterIndex, subChunkIndex: 0 });
          await loadSubChunkAudio(nextChapterIndex, 0, { autoPlay: true });
        }
      } else {
        console.log('📚 Audiobook finished!');
        setPlaybackState('stopped');
      }
    }
  }, [currentBook, currentSubChunk, shouldSwitchToChapter, switchToChapterMode, nextSubChunk, setCurrentSubChunk, setPlaybackState]);

  // Handle chapter end (normal chapter playback)
  const handleChapterEnd = useCallback(async () => {
    if (!currentBook || !currentChapter) return;
    
    const currentIndex = currentBook.chapters.findIndex(c => c.id === currentChapter.id);
    const nextChapter = currentBook.chapters[currentIndex + 1];
    
    if (nextChapter) {
      console.log(`▶️ Playing next chapter: ${nextChapter.title}`);
      await loadChapterAudio(nextChapter.index);
    } else {
      console.log('📚 Audiobook finished!');
      setPlaybackState('stopped');
    }
  }, [currentBook, currentChapter, setPlaybackState]);

  // Load subchunk audio with real-time streaming
  const loadSubChunkAudio = useCallback(async (
    chapterIndex: number,
    subChunkIndex: number,
    options: { autoPlay?: boolean } = {}
  ) => {
    if (!currentBook || !audioRef.current) return;
    const autoPlay = options.autoPlay ?? (playbackState === 'playing');
    
    const cacheKey = `${currentBook.title}-subchunk-${chapterIndex}-${subChunkIndex}`;
    
    // Check cache first
    if (audioCacheRef.current[cacheKey]) {
      audioRef.current.src = audioCacheRef.current[cacheKey];
      if (autoPlay) {
        audioRef.current.play().catch(err => {
          console.error('Failed to play cached subchunk:', err);
          setPlaybackState('error');
        });
      }
      return;
    }
    
    setPlaybackState('loading');
    
    try {
      console.log(`🔄 Loading subchunk: ${chapterIndex}:${subChunkIndex}`);
      
      const subChunkUrl = getSubChunkAudioUrl(currentBook.title, chapterIndex, subChunkIndex);
      const response = await fetch(subChunkUrl);
      
      if (!response.ok) {
        throw new Error(`Subchunk not ready: ${response.status}`);
      }
      
      const audioBlob = await response.blob();
      const blobUrl = URL.createObjectURL(audioBlob);
      
      // Cache the blob URL
      audioCacheRef.current[cacheKey] = blobUrl;
      
      // Load voice
      if (autoPlay) {
        audioRef.current.dataset.autoPlay = 'true'; // Prevent handleCanPlayThrough interference
      }
      audioRef.current.src = blobUrl;

      // Step 10: Show soundscape toast if ambient is not ready yet (once per chapter)
      if (ambientEnabled && !toastShownChaptersRef.current.has(chapterIndex)) {
        isAmbientReady(currentBook.title, chapterIndex).then(ready => {
          if (!ready) {
            toastShownChaptersRef.current.add(chapterIndex);
            setSoundscapeToast('✨ Creating your soundscape...');
            setTimeout(() => setSoundscapeToast(null), 5000);
          }
        }).catch(() => { /* non-critical */ });
      }
      
      if (autoPlay) {
        setPlaybackState('playing');
        audioRef.current.play().catch(err => {
          console.error('Failed to play subchunk:', err);
          setPlaybackState('error');
        }).finally(() => {
          delete audioRef.current?.dataset.autoPlay;
        });
      } else {
        setPlaybackState('paused');
      }
      
    } catch (error) {
      console.error('Failed to load subchunk:', error);
      setPlaybackState('error');
    }
  }, [currentBook, playbackState, setPlaybackState]);

  // Load chapter audio (normal playback) with ambient track
  const loadChapterAudio = useCallback(async (chapterIndex: number) => {
    if (!currentBook || !audioRef.current) return;
    
    const cacheKey = `${currentBook.title}-chapter-${chapterIndex}`;
    
    // Check cache first
    if (audioCacheRef.current[cacheKey]) {
      audioRef.current.src = audioCacheRef.current[cacheKey];
      if (playbackState === 'playing') {
        audioRef.current.play();
      }
      // Load ambient for cached chapter too
      loadAmbientForChapter(chapterIndex);
      return;
    }
    
    setPlaybackState('loading');
    
    try {
      console.log(`🔄 Loading chapter: ${chapterIndex}`);
      
      const chapterUrl = getChapterAudioUrl(currentBook.title, chapterIndex);
      const response = await fetch(chapterUrl);
      
      if (!response.ok) {
        throw new Error(`Chapter not ready: ${response.status}`);
      }
      
      const audioBlob = await response.blob();
      const blobUrl = URL.createObjectURL(audioBlob);
      
      // Cache the blob URL
      audioCacheRef.current[cacheKey] = blobUrl;
      
      // Load and play
      audioRef.current.src = blobUrl;
      
      if (playbackState === 'loading') {
        setPlaybackState('playing');
        audioRef.current.play();
      }
      
      // Load ambient (fire-and-forget, non-blocking)
      loadAmbientForChapter(chapterIndex);
      
    } catch (error) {
      console.error('Failed to load chapter:', error);
      setPlaybackState('error');
    }
  }, [currentBook, playbackState, setPlaybackState]);

  // Update highest ready chapter periodically during progressive mode
  // Also handles ambient hot-swap (Step 11)
  useEffect(() => {
    if (playbackMode !== 'progressive' || !currentBook) return;
    
    const checkChapterReadiness = async () => {
      try {
        const newHighestReady = await getHighestReadyChapter(currentBook.title);
        if (newHighestReady > highestReadyChapter) {
          setHighestReadyChapter(newHighestReady);
          console.log(`📦 Chapters 1-${newHighestReady} are now ready`);
        }
      } catch (error) {
        console.error('Error checking chapter readiness:', error);
      }

      // Step 11: Ambient hot-swap — check if chapter ambient is ready during progressive playback
      if (currentSubChunk && ambientRef.current) {
        try {
          const chapterIndex = currentSubChunk.chapterIndex;
          const expectedAmbientUrl = getChapterAmbientUrl(currentBook.title, chapterIndex);
          const currentAmbientSrc = ambientRef.current.src || '';

          // Only check if we haven't already loaded the chapter ambient
          if (!currentAmbientSrc.includes(`/chapters/${chapterIndex}/ambient`)) {
            const ready = await isAmbientReady(currentBook.title, chapterIndex);
            if (ready) {
              ambientRef.current.src = expectedAmbientUrl;
              if (audioRef.current) {
                ambientRef.current.currentTime = audioRef.current.currentTime;
              }
              ambientRef.current.volume = ambientEnabled ? ambientVolume : 0;
              if (audioRef.current && !audioRef.current.paused && ambientEnabled) {
                ambientRef.current.play().catch(() => { /* autoplay blocked */ });
              }
              console.log('🔊 Ambient upgraded to full soundscape');
            }
          }
        } catch {
          // Non-critical
        }
      }
    };
    
    // Check every 3 seconds during progressive playback
    const interval = setInterval(checkChapterReadiness, 3000);
    
    return () => clearInterval(interval);
  }, [playbackMode, currentBook, highestReadyChapter, setHighestReadyChapter, currentSubChunk, ambientEnabled, ambientVolume]);

  // Load ambient track for a chapter (non-blocking)
  const loadAmbientForChapter = useCallback(async (chapterIndex: number) => {    if (!currentBook || !ambientRef.current) return;
    
    try {
      const ready = await isAmbientReady(currentBook.title, chapterIndex);
      if (!ready) {
        console.log(`🔊 Ambient: Not ready for chapter ${chapterIndex}`);
        return;
      }
      
      const ambientUrl = getChapterAmbientUrl(currentBook.title, chapterIndex);
      const ambient = ambientRef.current;
      ambient.src = ambientUrl;
      ambient.volume = ambientEnabled ? ambientVolume : 0;
      ambient.currentTime = 0;
      
      // Wait for the ambient to be loadable, then sync with voice
      ambient.addEventListener('canplay', () => {
        if (audioRef.current && !audioRef.current.paused && ambientEnabled) {
          // Sync ambient time to voice time (they should start together)
          ambient.currentTime = audioRef.current.currentTime;
          ambient.play().catch(() => {
            console.log(`🔊 Ambient: Autoplay blocked for chapter ${chapterIndex}`);
          });
        }
      }, { once: true });
      
      // Trigger load
      ambient.load();
      
      console.log(`🔊 Ambient: Loaded for chapter ${chapterIndex}`);
    } catch (err) {
      // Non-fatal
      console.log(`🔊 Ambient: Failed to load for chapter ${chapterIndex}:`, err);
    }
  }, [currentBook, ambientEnabled, ambientVolume]);

  // Handle play/pause state changes (sync voice + ambient)
  useEffect(() => {
    if (!audioRef.current) return;
    
    const audio = audioRef.current;
    const ambient = ambientRef.current;
    
    if (playbackState === 'playing') {
      if (audio.src) {
        // Only call play() if audio is actually paused (avoid AbortError from double-play)
        if (audio.paused) {
          audio.play().catch(err => {
            // Ignore AbortError (caused by rapid play/pause or src changes)
            if (err.name === 'AbortError') return;
            console.error('Failed to play audio:', err);
            setPlaybackState('paused');
          });
        }
        // Sync ambient
        if (ambient?.src && ambientEnabled && ambient.paused) {
          ambient.play().catch(() => { /* non-fatal */ });
        }
      } else if (playbackMode === 'chapters' && currentChapter) {
        // Chapter mode: load chapter audio directly
        loadChapterAudio(currentChapter.index);
      }
      // Progressive mode with no src: handled by auto-start useEffect (polling)
    } else if (playbackState === 'paused') {
      audio.pause();
      if (ambient) ambient.pause();
    } else if (playbackState === 'stopped') {
      audio.pause();
      audio.currentTime = 0;
      if (ambient) {
        ambient.pause();
        ambient.currentTime = 0;
      }
    }
  }, [playbackState, playbackMode, currentSubChunk, currentChapter, ambientEnabled, setPlaybackState, loadSubChunkAudio, loadChapterAudio]);

  // Start progressive playback for a new audiobook
  const startProgressivePlayback = useCallback(async (book: any, startSubChunk = { chapterIndex: 0, subChunkIndex: 0 }) => {
    console.log('🚀 Starting progressive playback:', book.title);
    
    // Wait for first subchunk to be available
    let retries = 0;
    const maxRetries = 60; // 30 seconds
    
    while (retries < maxRetries) {
      try {
        const subChunkUrl = getSubChunkAudioUrl(book.title, startSubChunk.chapterIndex, startSubChunk.subChunkIndex);
        const response = await fetch(subChunkUrl, { method: 'HEAD' });
        
        if (response.ok) {
          console.log('✅ First subchunk is ready, starting playback');
          setCurrentSubChunk(startSubChunk);
          await loadSubChunkAudio(startSubChunk.chapterIndex, startSubChunk.subChunkIndex, { autoPlay: true });
          break;
        }
      } catch (error) {
        // Continue waiting
      }
      
      retries++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (retries >= maxRetries) {
      console.error('❌ Timeout waiting for first subchunk');
      setPlaybackState('error');
    }
  }, [setCurrentSubChunk, loadSubChunkAudio, setPlaybackState]);

  // Auto-start progressive playback when store signals progressive mode
  const progressiveStartedRef = useRef(false);
  useEffect(() => {
    if (playbackMode === 'progressive' && currentBook && currentSubChunk && !progressiveStartedRef.current) {
      // Check that audio hasn't been loaded yet (avoid re-triggering on re-renders)
      if (!audioRef.current?.src) {
        progressiveStartedRef.current = true;
        console.log('🔄 Auto-starting progressive playback...');
        startProgressivePlayback(currentBook, currentSubChunk);
      }
    } else if (playbackMode !== 'progressive') {
      progressiveStartedRef.current = false;
    }
  }, [playbackMode, currentBook, currentSubChunk]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup cached blob URLs
  useEffect(() => {
    return () => {
      Object.values(audioCacheRef.current).forEach(blobUrl => {
        URL.revokeObjectURL(blobUrl);
      });
      audioCacheRef.current = {};
    };
  }, []);

  return {
    startProgressivePlayback,
    loadSubChunkAudio,
    loadChapterAudio,
    soundscapeToast,
  };
}
```

---

### PWA: Type Definitions (shared interfaces)
**File:** `apps/pwa-v2/src/types/index.ts` | **Size:** 4 KB | **Lines:** 157

```typescript
// VoiceLibri - Core Types
// Adapted from BookPlayer patterns for TypeScript/React

// ============================================
// BOOK & LIBRARY TYPES
// ============================================

export interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  totalDuration: number; // seconds
  progress?: PlaybackProgress;
  chapters: Chapter[];
  createdAt: Date;
  lastPlayedAt?: Date;
  isFinished: boolean;
  /** Local file path or remote URL */
  audioUrl: string;
}

export interface Chapter {
  id: string;
  title: string;
  index: number;
  start: number; // seconds
  end: number; // seconds
  duration: number; // seconds
}

export interface PlaybackProgress {
  position: number; // seconds
  chapterIndex: number;
  updatedAt: Date;
}

// ============================================
// PLAYER TYPES (BookPlayer-inspired)
// ============================================

export type PlaybackState = 'playing' | 'paused' | 'stopped' | 'loading' | 'error';

export interface PlayerState {
  currentBook: Book | null;
  currentChapter: Chapter | null;
  playbackState: PlaybackState;
  currentTime: number;
  duration: number;
  speed: number;
  volume: number;
  isBuffering: boolean;
}

// Sleep timer states (from BookPlayer)
export type SleepTimerState = 
  | { type: 'off' }
  | { type: 'countdown'; remaining: number } // seconds
  | { type: 'endOfChapter' };

export const SLEEP_TIMER_PRESETS = [
  { label: '5 minutes', minutes: 5 },
  { label: '10 minutes', minutes: 10 },
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '45 minutes', minutes: 45 },
  { label: '1 hour', minutes: 60 },
  { label: 'End of chapter', type: 'chapter-end' as const },
] as const;

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0] as const;

// ============================================
// GENERATION TYPES
// ============================================

export type GenerationStatus = 
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'generating'
  | 'complete'
  | 'error';

export interface GenerationJob {
  id: string;
  bookTitle: string;
  status: GenerationStatus;
  progress: number; // 0-100
  estimatedTimeRemaining?: number; // seconds
  error?: string;
  createdAt: Date;
}

// ============================================
// USER & SETTINGS TYPES
// ============================================

export interface UserSettings {
  playbackSpeed: number;
  skipForwardDuration: number; // seconds
  skipBackwardDuration: number; // seconds
  sleepTimerDefault?: number; // minutes
  autoPlay: boolean;
  preferChapterContext: boolean;
  preferRemainingTime: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  playbackSpeed: 1.0,
  skipForwardDuration: 30,
  skipBackwardDuration: 15,
  autoPlay: true,
  preferChapterContext: true,
  preferRemainingTime: true,
};

// ============================================
// NAVIGATION TYPES
// ============================================

export type TabRoute = 'library' | 'create' | 'explore' | 'settings';

export interface NavigationState {
  activeTab: TabRoute;
  isPlayerExpanded: boolean;
}

// ============================================
// GUTENBERG / EXPLORE TYPES
// ============================================

export interface ClassicBook {
  id: number;
  title: string;
  authors: { name: string; birth_year?: number; death_year?: number }[];
  languages: string[];
  downloadCount: number;
  formats: Record<string, string>;
  subjects: string[];
  bookshelves: string[];
}

// ============================================
// UTILITY TYPES
// ============================================

export interface ProgressObject {
  currentTime: number;
  formattedCurrentTime: string;
  maxTime: number;
  formattedMaxTime: string;
  progress: string; // "45%" or "Chapter 3 of 12"
  sliderValue: number; // 0-1
  chapterTitle?: string;
}
```

---

### Soundscape: Audio Mixer (mixing narration with ambient audio)
**File:** `soundscape/src/audioMixer.ts` | **Size:** 1.5 KB | **Lines:** 58

```typescript
/**
 * Soundscape Module — Audio Mixer
 *
 * Handles audio concatenation for the chapter pipeline:
 *   - prependIntro(): Concat intro + chapter
 */

import path from 'path';
import {
  AUDIO_SAMPLE_RATE,
  AUDIO_CHANNELS,
  AUDIO_CODEC,
} from './config.js';
import { runFfmpeg } from './ffmpegRunner.js';
import type { FfmpegResult } from './types.js';

// ========================================
// Prepend intro
// ========================================

/**
 * Concatenate intro WAV + chapter WAV into final output.
 *
 * @param introPath - Path to the intro WAV (from introGenerator)
 * @param chapterPath - Path to the chapter WAV (voice or voice+ambient)
 * @param outputPath - Path for the final concatenated output
 */
export async function prependIntro(
  introPath: string,
  chapterPath: string,
  outputPath: string
): Promise<FfmpegResult> {
  const args = [
    '-i', introPath,
    '-i', chapterPath,
    '-filter_complex',
    '[0:a][1:a]concat=n=2:v=0:a=1',
    '-ar', AUDIO_SAMPLE_RATE.toString(),
    '-ac', AUDIO_CHANNELS.toString(),
    '-c:a', AUDIO_CODEC,
    outputPath,
  ];

  console.log(`🎬 Prepending intro → ${path.basename(outputPath)}`);
  const result = await runFfmpeg(args);

  if (result.code !== 0) {
    console.error(`✗ Intro concat failed: ${result.stderr.substring(0, 300)}`);
  }

  return result;
}

// ========================================
// Full chapter processing
```

---

### Soundscape: Catalog Loader (asset discovery)
**File:** `soundscape/src/catalogLoader.ts` | **Size:** 7 KB | **Lines:** 234

```typescript
/**
 * Soundscape Module — Catalog Loader
 *
 * Parses the voicelibri_assets_catalog.csv and builds SoundAsset[]
 * for ambient/SFX and music asset search. CSV columns:
 *   FileID, Filename, Description, Keywords, Duration,
 *   Type, Category, SubCategory, Location,
 *   Microphone, TrackYear, RecMedium, FilePath
 *
 * The Type column determines SoundAsset.type ('ambient' or 'music').
 * Filenames may contain commas — proper RFC 4180 CSV parsing required.
 */

import fs from 'fs';
import path from 'path';
import { CATALOG_CSV_PATH, ASSETS_ROOT } from './config.js';
import type { SoundAsset } from './types.js';

// ========================================
// CSV catalog cache
// ========================================

let cachedCatalog: SoundAsset[] | null = null;

// ========================================
// CSV parsing (RFC 4180)
// ========================================

/**
 * Parse a CSV line respecting quoted fields with commas/newlines.
 * Simple but correct for our catalog format.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("") vs end of field
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current); // last field
  return fields;
}

/**
 * Parse duration string "MM:SS.mmm" to seconds.
 */
function parseDuration(durationStr: string): number | undefined {
  if (!durationStr) return undefined;
  const match = durationStr.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return undefined;
  return parseInt(match[1]) * 60 + parseFloat(match[2]);
}

// ========================================
// Public API
// ========================================

/**
 * Load the ambient asset catalog from CSV.
 * Returns cached result if already loaded.
 *
 * @param csvPath - Override CSV path (defaults to config CATALOG_CSV_PATH)
 */
export function loadCatalog(csvPath?: string): SoundAsset[] {
  if (cachedCatalog) return cachedCatalog;

  const filePath = csvPath || CATALOG_CSV_PATH;
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Catalog CSV not found: ${filePath}`);
    return [];
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    console.warn('⚠️ Catalog CSV is empty or has no data rows');
    return [];
  }

  // Parse header
  const header = parseCsvLine(lines[0]);
  const colIndex = (name: string) => header.findIndex(
    (h) => h.trim().toLowerCase() === name.toLowerCase()
  );

  const idxFileID = colIndex('FileID');
  const idxFilename = colIndex('Filename');
  const idxDescription = colIndex('Description');
  const idxKeywords = colIndex('Keywords');
  const idxDuration = colIndex('Duration');
  const idxType = colIndex('Type');
  const idxCategory = colIndex('Category');
  const idxSubCategory = colIndex('SubCategory');
  const idxFilePath = colIndex('FilePath');

  if (idxFileID === -1 || idxDescription === -1 || idxFilePath === -1) {
    console.error('⚠️ Catalog CSV missing required columns (FileID, Description, FilePath)');
    return [];
  }

  // Parse rows
  const assets: SoundAsset[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < header.length) continue;

    const fileId = fields[idxFileID]?.trim();
    const description = fields[idxDescription]?.trim() || '';
    const relPath = fields[idxFilePath]?.trim() || '';
    const category = fields[idxCategory]?.trim() || '';
    const subcategory = fields[idxSubCategory]?.trim() || '';

    if (!fileId || !relPath) continue;

    // Build absolute path
    const absPath = path.join(ASSETS_ROOT, relPath);

    // Parse keywords into array
    const keywordsRaw = fields[idxKeywords]?.trim() || '';
    const keywords = keywordsRaw
      .split(/\s+/)
      .filter((k) => k.length > 0)
      .map((k) => k.toLowerCase());

    // Parse duration
    const durationSec = parseDuration(fields[idxDuration]?.trim() || '');

    // Determine asset type from CSV Type column
    const rawType = (idxType !== -1 ? fields[idxType]?.trim() : '').toLowerCase();
    let assetType: 'ambient' | 'music' | 'sfx';
    if (rawType === 'music') {
      assetType = 'music';
    } else if (rawType === 'sfx') {
      assetType = 'sfx';
    } else {
      assetType = 'ambient'; // realistic, cinematic → ambient
    }

    // Derive genre/mood from category + subcategory + keywords
    const genre = [
      category.toLowerCase(),
      subcategory.toLowerCase(),
    ].filter(Boolean);

    assets.push({
      id: `${assetType}/${fileId}`,
      type: assetType,
      filePath: absPath,
      description,
      keywords,
      genre,
      mood: [], // Could be enriched by LLM Director later
      durationSec,
      category,
      subcategory,
    });
  }

  cachedCatalog = assets;
  const ambientCount = assets.filter((a) => a.type === 'ambient').length;
  const sfxCount = assets.filter((a) => a.type === 'sfx').length;
  const musicCount = assets.filter((a) => a.type === 'music').length;
  console.log(`📋 Loaded ${assets.length} assets from catalog (${ambientCount} ambient, ${sfxCount} SFX, ${musicCount} music)`);
  return assets;
}

/**
 * Clear the cached catalog (e.g. after catalog update).
 */
export function clearCatalogCache(): void {
  cachedCatalog = null;
}

/**
 * Get assets filtered by category.
 */
export function getAssetsByCategory(category: string): SoundAsset[] {
  const catalog = loadCatalog();
  return catalog.filter(
    (a) => a.category?.toLowerCase() === category.toLowerCase()
  );
}

/**
 * Get a specific asset by its FileID.
 * Accepts raw FileID, or prefixed id like 'ambient/xxx' or 'music/xxx'.
 */
export function getAssetById(fileId: string): SoundAsset | undefined {
  const catalog = loadCatalog();
  return catalog.find(
    (a) => a.id === fileId || a.id === `ambient/${fileId}` || a.id === `music/${fileId}` || a.id === `sfx/${fileId}`
  );
}

/**
 * Load only music assets from the catalog.
 * Convenience wrapper filtering by type === 'music'.
 */
export function loadMusicCatalog(): SoundAsset[] {
  return loadCatalog().filter((a) => a.type === 'music');
}

/**
 * Load only SFX assets from the catalog.
 * Convenience wrapper filtering by type === 'sfx'.
 */
export function loadSfxCatalog(): SoundAsset[] {
  return loadCatalog().filter((a) => a.type === 'sfx');
}
```

---

### Soundscape: Configuration
**File:** `soundscape/src/config.ts` | **Size:** 4.5 KB | **Lines:** 146

```typescript
/**
 * Soundscape Module — Configuration
 *
 * All tuneable constants centralized here.
 * All values are tuneable via this single module.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========================================
// Paths
// ========================================

/** Project root (3 levels up from soundscape/src/) */
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/** Root of the soundscape asset library */
export const ASSETS_ROOT = path.resolve(__dirname, '..', 'assets');

/** Music subfolder */
export const MUSIC_ASSETS_DIR = path.join(ASSETS_ROOT, 'music');

/** Ambient catalog CSV */
export const CATALOG_CSV_PATH = path.join(ASSETS_ROOT, 'voicelibri_assets_catalog.csv');

/** Persisted embedding index for ambient assets */
export const AMBIENT_EMBEDDINGS_PATH = path.join(ASSETS_ROOT, 'ambient_embeddings.json');

/** Persisted embedding index for music filenames */
export const MUSIC_EMBEDDINGS_PATH = path.join(ASSETS_ROOT, 'music_embeddings.json');

/** Persisted embedding index for SFX assets */
export const SFX_EMBEDDINGS_PATH = path.join(ASSETS_ROOT, 'sfx_embeddings.json');

// ========================================
// Feature toggles (env-driven)
// ========================================

export function isSoundscapeEnabled(): boolean {
  const raw = process.env.SOUNDSCAPE_ENABLED ?? process.env.SOUNDSCAPE_AMBIENT_ENABLED;
  return raw === '1' || raw === 'true';
}

// ========================================
// Audio output format
// ========================================

export const AUDIO_SAMPLE_RATE = 48000;
export const AUDIO_CHANNELS = 2;
export const AUDIO_CODEC = 'libopus';

// ========================================
// Ambient layer
// ========================================

/** dB level for ambient loop under narration */
export const AMBIENT_DEFAULT_DB = -6;

/** Fade durations for ambient entry/exit (ms) */
export const AMBIENT_FADE_MS = 2000;

/** Ambient starts this many ms BEFORE narration */
export const AMBIENT_PRE_ROLL_MS = 4000;

/** Ambient lingers this many ms AFTER narration */
export const AMBIENT_POST_ROLL_MS = 4000;

// ========================================
// Intro music — timing (ms)
// ========================================

/** Fade in / out on the music bed */
export const INTRO_FADE_MS = 3500;

/** Silence appended after intro ends */
export const INTRO_END_SILENCE_MS = 3000;

/** Silence before chapter-level intro starts */
export const INTRO_CHAPTER_START_SILENCE_MS = 3000;

/** Gap between chapter number and chapter title */
export const INTRO_CHAPTER_GAP_MS = 2000;

/** Gap between title and author */
export const INTRO_TITLE_AUTHOR_GAP_MS = 2000;

/** Gap between author and VoiceLibri tagline */
export const INTRO_AUTHOR_VOICELIBRI_GAP_MS = 4000;

/** Gap between tagline and chapter title */
export const INTRO_VOICELIBRI_CHAPTER_GAP_MS = 4000;

/** Extra music after last voice overlay */
export const INTRO_END_MUSIC_EXTENSION_MS = 3750;

// ========================================
// Intro music — volume (dB)
// ========================================

/** Ducking ramp duration (ms) */
export const RAMP_MS = 2000;

/** Full-volume boost applied to music bed */
export const MUSIC_FULL_BOOST_DB = 10.5;

/** Boost applied to music when ducked behind voice */
export const MUSIC_BACKGROUND_BOOST_DB = 4.5;

/** Base music level when ducked */
export const MUSIC_BACKGROUND_DB = -21.5;

/** Voice boost over music */
export const INTRO_VOICE_BOOST_DB = 2;

/** Default narrator voice for intros */
export const INTRO_NARRATOR_VOICE = 'Algieba';

// ========================================
// Embeddings
// ========================================

/** Gemini embedding model */
export const EMBEDDING_MODEL = 'gemini-embedding-001';

/** Embedding vector dimensions (gemini-embedding-001 supports up to 3072; 768 balances quality vs memory for ~22K entries) */
export const EMBEDDING_DIMENSIONS = 768;

/** Max texts per embedding API call (gemini-embedding-001 only supports 1 text per request) */
export const EMBEDDING_BATCH_SIZE = 1;

/** Max concurrent embedding API requests */
export const EMBEDDING_CONCURRENCY = 5;

// ========================================
// LLM Director
// ========================================

/** Model for scene analysis */
export const SCENE_ANALYSIS_MODEL = 'gemini-2.5-flash';
```

---

### Soundscape: Entry Point & Exports
**File:** `soundscape/src/index.ts` | **Size:** 3.3 KB | **Lines:** 145

```typescript
/**
 * Soundscape Module — Public API
 *
 * Re-exports all modules for clean consumption by the backend pipeline.
 *
 * Architecture:
 *   config.ts          → Constants, paths, genre mapping
 *   types.ts           → All TypeScript interfaces
 *   ffmpegRunner.ts    → Thin ffmpeg wrapper
 *   embeddings.ts      → Gemini embedding-001 vector search
 *   catalogLoader.ts   → CSV catalog → SoundAsset[]
 *   musicSelector.ts   → Hybrid genre-map + embedding music selection
 *   llmDirector.ts     → LLM-based scene analysis per chapter
 *   assetResolver.ts   → Embedding search for ambient asset matching
 *   introGenerator.ts  → Music bed + voice overlay intros
 *   ambientLayer.ts    → Per-chapter ambient WAV generation
 *   audioMixer.ts      → Final merge: voice + ambient + intro
 */

// Types
export type {
  SoundAsset,
  SoundAssetType,
  BookInfo,
  CharacterEntry,
  CharacterRegistry,
  SceneSegment,
  SceneAnalysis,
  BookSoundscapePlan,
  ChapterSoundscapePlan,
  VoiceOverlay,
  IntroSpec,
  IntroResult,
  EmbeddingEntry,
  EmbeddingIndex,
  EmbeddingSearchResult,
  MusicSelectionResult,
  SoundscapePipelineOptions,
  SoundscapePreferences,
  FfmpegResult,
  SfxEvent,
  SilenceGap,
} from './types.js';

// Config
export {
  isSoundscapeEnabled,
  ASSETS_ROOT,
  MUSIC_ASSETS_DIR,
  CATALOG_CSV_PATH,
  AMBIENT_EMBEDDINGS_PATH,
  MUSIC_EMBEDDINGS_PATH,
  AMBIENT_DEFAULT_DB,
  EMBEDDING_MODEL,
  EMBEDDING_CONCURRENCY,
  SCENE_ANALYSIS_MODEL,
  INTRO_NARRATOR_VOICE,
} from './config.js';

// FFmpeg
export { runFfmpeg, getAudioDuration, detectSilenceGaps } from './ffmpegRunner.js';

// Embeddings
export {
  buildEmbeddingIndex,
  saveEmbeddingIndex,
  loadEmbeddingIndex,
  searchEmbeddings,
  searchEmbeddingsBatch,
  searchEmbeddingsWithVector,
  getAmbientIndex,
  setAmbientIndex,
  getMusicIndex,
  setMusicIndex,
} from './embeddings.js';

// Catalog
export {
  loadCatalog,
  loadMusicCatalog,
  loadSfxCatalog,
  clearCatalogCache,
  getAssetsByCategory,
  getAssetById,
} from './catalogLoader.js';

// Music selection
export {
  scanMusicAssets,
  selectMusicTrack,
  ensureMusicEmbeddingIndex,
} from './musicSelector.js';

// LLM Director
export {
  analyzeChapterScene,
  analyzeAllChapters,
  buildFallbackScene,
} from './llmDirector.js';

// Asset resolver
export {
  ensureAmbientEmbeddingIndex,
  ensureSfxEmbeddingIndex,
  resolveAmbientAsset,
  resolveSfxEvents,
  resolveSceneSegmentAssets,
  resolveAllChapterAssets,
  resolveByKeyword,
} from './assetResolver.js';

// Intro generator
export {
  initIntroGenerator,
  buildBookIntroSpec,
  buildChapterIntroSpec,
  generateIntro,
  generateAllIntros,
} from './introGenerator.js';

// Ambient layer
export {
  generateSubchunkAmbientTrack,
  concatenateSubchunkAmbientTracks,
} from './ambientLayer.js';

// Subchunk soundscape mapper
export {
  buildSubchunkSegmentInfos,
  mapSfxEventsToSubchunks,
  groupMappedEventsBySubchunk,
  buildPlacedSfxEvents,
  calculateSfxOffsetFromGaps,
} from './subchunkSoundscape.js';
export type {
  SubchunkSegmentInfo,
  MappedSfxEvent,
  PlacedSfxEvent,
} from './subchunkSoundscape.js';

// Audio mixer
export {
  prependIntro,
} from './audioMixer.js';
```

---

### Soundscape: FFmpeg Runner (audio processing CLI wrapper)
**File:** `soundscape/src/ffmpegRunner.ts` | **Size:** 3.9 KB | **Lines:** 126

```typescript
/**
 * Soundscape Module — FFmpeg Runner
 *
 * Thin wrapper around ffmpeg / ffprobe child processes.
 * Always passes -y (overwrite output) matching production behaviour.
 */

import { spawn } from 'child_process';
import type { FfmpegResult, SilenceGap } from './types.js';

export function runFfmpeg(args: string[]): Promise<FfmpegResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => {
      stderr += err instanceof Error ? err.message : String(err);
      resolve({ code: 1, stdout, stderr });
    });
    proc.on('close', (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

/**
 * Detect silence gaps in an audio file using ffmpeg silencedetect filter.
 *
 * Runs: ffmpeg -i {filePath} -af silencedetect=noise=-30dB:d=0.15 -f null -
 * Parses stderr for silence_start / silence_end lines.
 *
 * @param filePath - Path to the audio file (WAV, OGG, etc.)
 * @returns Ordered array of silence gaps with start/end in seconds and midpoint in ms
 */
export function detectSilenceGaps(
  filePath: string,
): Promise<SilenceGap[]> {
  return new Promise((resolve) => {
    const proc = spawn(
      'ffmpeg',
      ['-i', filePath, '-af', 'silencedetect=noise=-30dB:d=0.15', '-f', 'null', '-'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stderr = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', () => {
      resolve([]);
    });
    proc.on('close', () => {
      const gaps: Array<{ startSec: number; endSec: number; midpointMs: number }> = [];
      const starts: number[] = [];

      for (const line of stderr.split('\n')) {
        const startMatch = line.match(/silence_start:\s*([\d.]+)/);
        if (startMatch) {
          starts.push(parseFloat(startMatch[1]));
          continue;
        }
        const endMatch = line.match(/silence_end:\s*([\d.]+)/);
        if (endMatch && starts.length > 0) {
          const startSec = starts.shift()!;
          const endSec = parseFloat(endMatch[1]);
          if (!isNaN(startSec) && !isNaN(endSec) && endSec > startSec) {
            const midpointMs = Math.round(((startSec + endSec) / 2) * 1000);
            gaps.push({ startSec, endSec, midpointMs });
          }
        }
      }

      // Return in chronological order (ffmpeg already emits them in order, but sort to be safe)
      gaps.sort((a, b) => a.startSec - b.startSec);
      resolve(gaps);
    });
  });
}

/**
 * Get exact audio duration in seconds using ffprobe.
 * Works reliably for all formats (OGG, WAV, MP3, etc.)
 *
 * @param filePath - Path to the audio file
 * @returns Duration in seconds, or 0 if probe fails
 */
export function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', () => {
      resolve(0);
    });
    proc.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(stdout.trim());
        resolve(isNaN(duration) ? 0 : duration);
      } else {
        resolve(0);
      }
    });
  });
}
```

---

### Soundscape: Type Definitions
**File:** `soundscape/src/types.ts` | **Size:** 8.5 KB | **Lines:** 283

```typescript
/**
 * Soundscape Module — Type Definitions
 *
 * Core interfaces for the parallel soundscape pipeline:
 *   Intro (music + TTS overlay) | Voice TTS | Ambient Layer
 *
 * All three run in parallel after character extraction.
 */

// ========================================
// Sound Asset Types
// ========================================

export type SoundAssetType = 'music' | 'ambient' | 'sfx';

/** A single sound file from the library (ambient, SFX, or music track) */
export interface SoundAsset {
  id: string;
  type: SoundAssetType;
  /** Absolute path to the .ogg file */
  filePath: string;
  /** Catalog description or filename-derived label */
  description: string;
  /** Search keywords (from catalog or filename parsing) */
  keywords: string[];
  /** Genre tags (e.g. 'forest', 'rain', 'medieval', 'orchestral') */
  genre: string[];
  /** Mood tags (e.g. 'dark', 'calm', 'epic', 'spooky') */
  mood: string[];
  /** Duration in seconds (if known from catalog) */
  durationSec?: number;
  /** Recommended playback volume in dB (negative = quieter) */
  recommendedVolumeDb?: number;
  /** Whether the asset is suitable for looping */
  loopable?: boolean;
  /** Measured loudness in LUFS (for normalization) */
  loudnessLUFS?: number;
  /** Catalog category (e.g. 'RAIN_01', 'AMBIENCE_NATURE') */
  category?: string;
  /** Catalog subcategory (e.g. 'CONCRETE', 'Forrest') */
  subcategory?: string;
}

// ========================================
// Book & Character Registry (read-only)
// ========================================

/** Book-level metadata from character_registry.json */
export interface BookInfo {
  genre: string;
  tone: string;
  voiceTone: string;
  period: string;
  locked: boolean;
  /** Book title (optional, used by LLM music selector) */
  title?: string;
  /** Book author (optional, used by LLM music selector) */
  author?: string;
}

/** Character from character_registry.json */
export interface CharacterEntry {
  id: string;
  primaryName: string;
  aliases: string[];
  voice: string;
  gender: string;
  role: string;
  firstSeenChapter: number;
  lastSeenChapter: number;
}

/** Full character registry as written by the dramatization pipeline */
export interface CharacterRegistry {
  exportedAt: string;
  bookInfo: BookInfo;
  narratorVoice: string;
  narratorInstruction: string;
  characterCount: number;
  characters: CharacterEntry[];
  voiceMap: Record<string, string>;
}

// ========================================
// Scene Analysis (LLM Director output)
// ========================================

/**
 * A single scene segment within a chapter's soundscape timeline.
 * The LLM Director produces 1–6 segments per chapter; each marks where a
 * new environment begins (first segment always has charIndex = 0).
 */
export interface SceneSegment {
  /** Character offset where this scene begins (0 for first segment) */
  charIndex: number;
  /** Primary environment description (e.g. 'forest', 'castle interior') */
  environment: string;
  /** English search queries for ambient asset matching */
  searchSnippets: string[];
  /** Mood descriptors for this segment */
  moods: string[];
}

/**
 * A single SFX event with precise placement information.
 *
 * `charIndex` is the character offset within the chapter text where the
 * sound event occurs. Mapped to a silence gap at render time via
 * `calculateSfxOffsetFromGaps()` in subchunkSoundscape.ts.
 */
export interface SfxEvent {
  /** English search query for SFX catalog matching (e.g. 'door slamming wood') */
  query: string;
  /** Character offset in the chapter text where this sound occurs */
  charIndex: number;
  /** Human-readable description of what the sound is (for logging/debugging) */
  description: string;
}

/** LLM-generated scene analysis for a single chapter */
export interface SceneAnalysis {
  chapterIndex: number;
  /** Time of day (e.g. 'night', 'dawn', 'midday') */
  timeOfDay: string;
  /** Weather if applicable (e.g. 'rain', 'storm', 'clear') */
  weather: string;
  /** Mood descriptors for the dominant chapter scene */
  moods: string[];
  /** Specific sound elements mentioned (e.g. 'crackling fire', 'horses') */
  soundElements: string[];
  /** Overall intensity 0-1 (quiet/calm → loud/intense) */
  intensity: number;
  /**
   * Fine-grained ambient timeline: 1–6 ordered scene segments, each with
   * its own environment and search queries. First segment always has charIndex = 0.
   * Used for multi-scene ambient generation within a single subchunk.
   */
  sceneSegments: SceneSegment[];
  /**
   * SFX events with character-index placement in the chapter text.
   * Each event's charIndex is mapped to a silence gap midpoint at render time
   * via `calculateSfxOffsetFromGaps()` in subchunkSoundscape.ts.
   */
  sfxEvents: SfxEvent[];
}

/** Complete soundscape plan for an entire book */
export interface BookSoundscapePlan {
  bookTitle: string;
  bookInfo: BookInfo;
  musicTrackPath: string | null;
  chapters: ChapterSoundscapePlan[];
}

/** Per-chapter soundscape plan */
export interface ChapterSoundscapePlan {
  chapterIndex: number;
  scene: SceneAnalysis;
  ambientAsset: SoundAsset | null;
  /** Volume for ambient layer (dB) */
  ambientVolumeDb: number;
}

// ========================================
// Intro Generation
// ========================================

/** Voice overlay segment within an intro */
export interface VoiceOverlay {
  /** Text to synthesize (may be translated) */
  text: string;
  /** Absolute start time in ms (if fixed) */
  startMs?: number;
  /** Gap after previous segment ends (ms) */
  gapAfterMs?: number;
}

/** Intro specification (book-level or chapter-level) */
export interface IntroSpec {
  /** Total intro duration in ms (music bed length) */
  totalDurationMs?: number;
  /** Voice overlay segments to duck under music */
  voiceOverlays: VoiceOverlay[];
  /** Silence appended after intro (ms) */
  endSilenceMs: number;
}

/** Result of intro generation */
export interface IntroResult {
  /** Path to the generated intro WAV file */
  introPath: string;
  /** Duration of the intro in ms */
  durationMs: number;
}

// ========================================
// Embeddings
// ========================================

/** A single embedding vector with its associated asset ID */
export interface EmbeddingEntry {
  id: string;
  /** The text that was embedded (description or filename) */
  text: string;
  /** Embedding vector (768 dimensions, truncated from gemini-embedding-001's 3072 default) */
  vector: number[];
}

/** Persisted embedding index (JSON file) */
export interface EmbeddingIndex {
  model: string;
  dimensions: number;
  createdAt: string;
  entries: EmbeddingEntry[];
}

/** Search result from embedding similarity */
export interface EmbeddingSearchResult {
  id: string;
  text: string;
  score: number;
}

// ========================================
// Music Selection
// ========================================

/** Result of music selection */
export interface MusicSelectionResult {
  asset: SoundAsset;
  /** Why this track was chosen */
  matchReason: string;
  /** Similarity score if embedding-based */
  score?: number;
}

// ========================================
// Pipeline Orchestration
// ========================================

/** Options for the soundscape pipeline */
export interface SoundscapePipelineOptions {
  bookTitle: string;
  bookDir: string;
  characterRegistry: CharacterRegistry;
  /** Chapter metadata for intro text */
  chapters: Array<{
    index: number;
    title: string;
    text: string;
  }>;
  /** Language code for intro TTS (e.g. 'sk-SK') */
  targetLanguage: string | null;
  /** Narrator voice for intro TTS */
  narratorVoice: string;
  /** User preferences (toggles) */
  preferences?: SoundscapePreferences;
}

/** User preferences for soundscape (from AudiobookMetadata.userPreferences) */
export interface SoundscapePreferences {
  soundscapeMusicEnabled?: boolean;
  soundscapeAmbientEnabled?: boolean;
  soundscapeThemeId?: string;
}

// ========================================
// FFmpeg
// ========================================

export interface FfmpegResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** A detected silence gap from ffmpeg silencedetect */
export interface SilenceGap {
  startSec: number;
  endSec: number;
  midpointMs: number;
}
```

---


## CONTEXT SNAPSHOT SUMMARY

- **Total source files included:** 65
- **Total source size:** 846.9 KB
- **Branch:** feature/soundscape-refactor
- **Commit:** 21b8a68a
- **Generated:** 2026-03-12
- **Session Key:** VL-MIRROR-20260312-0740

> This snapshot was automatically generated by `mirror/Generate-Context.ps1`.
> For the latest version, re-run the generator or use `mirror/Sync-Mirror.ps1`.
