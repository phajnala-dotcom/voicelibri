import { runFfmpeg } from './ffmpegRunner';

export interface MixOptions {
  ambientDb?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
}

export function buildMixCommand(
  speechPath: string,
  ambientPath: string,
  outputPath: string,
  options: MixOptions = {}
): string[] {
  const ambientDb = options.ambientDb ?? -24;
  const fadeIn = (options.fadeInMs ?? 1500) / 1000;
  const fadeOut = (options.fadeOutMs ?? 2000) / 1000;
  return [
    '-i', speechPath,
    '-stream_loop', '-1', '-i', ambientPath,
    '-filter_complex',
    `[1:a]volume=${ambientDb}dB,afade=t=in:st=0:d=${fadeIn}[amb];` +
      `[0:a][amb]amix=inputs=2:duration=first:dropout_transition=2,afade=t=out:st=0:d=${fadeOut}`,
    outputPath,
  ];
}

export function buildConcatCommand(introPath: string, chapterPath: string, outputPath: string): string[] {
  return [
    '-i', introPath,
    '-i', chapterPath,
    '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1',
    outputPath,
  ];
}

export async function mixAmbientWithNarration(
  speechPath: string,
  ambientPath: string,
  outputPath: string,
  options: MixOptions = {}
): Promise<void> {
  const args = buildMixCommand(speechPath, ambientPath, outputPath, options);
  const result = await runFfmpeg(args);
  if (result.code !== 0) {
    throw new Error(`ffmpeg mix failed: ${result.stderr}`);
  }
}

export async function concatIntroWithChapter(
  introPath: string,
  chapterPath: string,
  outputPath: string
): Promise<void> {
  const args = buildConcatCommand(introPath, chapterPath, outputPath);
  const result = await runFfmpeg(args);
  if (result.code !== 0) {
    throw new Error(`ffmpeg concat failed: ${result.stderr}`);
  }
}
