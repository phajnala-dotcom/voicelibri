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
