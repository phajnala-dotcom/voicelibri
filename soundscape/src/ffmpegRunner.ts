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
