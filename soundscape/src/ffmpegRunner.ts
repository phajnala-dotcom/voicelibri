/**
 * Soundscape Module — FFmpeg Runner
 *
 * Thin wrapper around ffmpeg child process.
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
}
