/**
 * Soundscape Module — FFmpeg Runner
 *
 * Thin wrapper around ffmpeg / ffprobe child processes.
 * Always passes -y (overwrite output) matching production behaviour.
 */

import { spawn } from 'child_process';
import type { FfmpegResult } from './types.js';

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
