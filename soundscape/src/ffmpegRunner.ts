import { spawn } from 'child_process';

export interface FfmpegResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runFfmpeg(args: string[]): Promise<FfmpegResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    proc.on('error', err => reject(err));
    proc.on('close', code => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}
