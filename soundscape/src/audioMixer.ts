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


