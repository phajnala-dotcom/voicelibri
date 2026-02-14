/**
 * Soundscape Module — Ambient Layer
 *
 * Creates per-chapter ambient WAV overlays:
 *   1. Takes the resolved ambient asset (OGG)
 *   2. Loops it to cover chapter duration + pre/post-roll
 *   3. Applies loudnorm, volume, fade-in/out
 *   4. Outputs a standalone ambient WAV (not yet mixed with voice)
 *
 * The ambient WAV is later mixed with the voice WAV in audioMixer.
 * This separation allows parallel processing:
 *   - Voice TTS generates chapter WAV
 *   - Ambient layer generates ambient WAV
 *   - audioMixer combines them when both are ready
 */

import fs from 'fs';
import path from 'path';
import {
  AMBIENT_DEFAULT_DB,
  AMBIENT_FADE_MS,
  AMBIENT_PRE_ROLL_MS,
  AMBIENT_POST_ROLL_MS,
  AUDIO_SAMPLE_RATE,
  AUDIO_CHANNELS,
  AUDIO_CODEC,
} from './config.js';
import { runFfmpeg } from './ffmpegRunner.js';
import type {
  SoundAsset,
  ChapterSoundscapePlan,
  FfmpegResult,
} from './types.js';

// ========================================
// Ambient WAV generation
// ========================================

/**
 * Generate a standalone ambient WAV for a chapter.
 *
 * The ambient track is:
 *   - Looped infinitely (`-stream_loop -1`)
 *   - Trimmed to speechDuration + pre-roll + post-roll
 *   - Normalized with loudnorm (target I=-35, TP=-2, LRA=11)
 *   - Volume-adjusted per plan.ambientVolumeDb
 *   - Faded in/out at edges
 *
 * @param ambientAsset - Resolved ambient OGG file
 * @param speechDurationMs - Duration of the voice chapter WAV
 * @param volumeDb - Target volume adjustment in dB
 * @param outputPath - Where to write the ambient WAV
 * @returns FfmpegResult
 */
export async function generateAmbientTrack(
  ambientAsset: SoundAsset,
  speechDurationMs: number,
  volumeDb: number,
  outputPath: string
): Promise<FfmpegResult> {
  const preRollSec = AMBIENT_PRE_ROLL_MS / 1000;
  const postRollSec = AMBIENT_POST_ROLL_MS / 1000;
  const fadeInSec = AMBIENT_FADE_MS / 1000;
  const fadeOutSec = AMBIENT_FADE_MS / 1000;

  const totalDurationSec = Math.max(
    (speechDurationMs + AMBIENT_PRE_ROLL_MS + AMBIENT_POST_ROLL_MS) / 1000,
    0.5
  );

  // Fade-out starts before the total end, leaving room for fade
  const fadeOutStart = Math.max(
    (speechDurationMs + AMBIENT_PRE_ROLL_MS + (AMBIENT_POST_ROLL_MS - AMBIENT_FADE_MS)) / 1000,
    0
  );

  const args = [
    '-stream_loop', '-1',
    '-i', ambientAsset.filePath,
    '-af',
    `loudnorm=I=-35:TP=-2:LRA=11,` +
    `volume=${volumeDb}dB,` +
    `afade=t=in:st=0:d=${fadeInSec},` +
    `afade=t=out:st=${fadeOutStart}:d=${fadeOutSec}`,
    '-t', totalDurationSec.toString(),
    '-ar', AUDIO_SAMPLE_RATE.toString(),
    '-ac', AUDIO_CHANNELS.toString(),
    '-c:a', AUDIO_CODEC,
    outputPath,
  ];

  console.log(`🌿 Generating ambient track: ${(totalDurationSec).toFixed(1)}s, ${volumeDb}dB`);
  const result = await runFfmpeg(args);

  if (result.code !== 0) {
    console.error(`✗ Ambient track generation failed: ${result.stderr.substring(0, 300)}`);
  } else {
    console.log(`✓ Ambient track ready: ${outputPath}`);
  }

  return result;
}

/**
 * Generate ambient tracks for all chapters that have resolved ambient assets.
 *
 * @param plans - Chapter soundscape plans (from assetResolver)
 * @param getChapterDurationMs - Function to get chapter voice duration in ms
 * @param outputDir - Directory for ambient WAV files
 * @returns Map of chapterIndex → ambient WAV path (only for successful chapters)
 */
export async function generateAllAmbientTracks(
  plans: ChapterSoundscapePlan[],
  getChapterDurationMs: (chapterIndex: number) => number,
  outputDir: string
): Promise<Map<number, string>> {
  const results = new Map<number, string>();

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const plan of plans) {
    if (!plan.ambientAsset) {
      console.log(`⏭️ No ambient asset for chapter ${plan.chapterIndex}`);
      continue;
    }

    // Verify asset file exists
    if (!fs.existsSync(plan.ambientAsset.filePath)) {
      console.warn(`⚠️ Ambient file missing: ${plan.ambientAsset.filePath}`);
      continue;
    }

    const outputPath = path.join(
      outputDir,
      `chapter_${plan.chapterIndex}_ambient.wav`
    );

    // Skip if already generated
    if (fs.existsSync(outputPath)) {
      console.log(`⏭️ Ambient track already exists: chapter ${plan.chapterIndex}`);
      results.set(plan.chapterIndex, outputPath);
      continue;
    }

    const speechDurationMs = getChapterDurationMs(plan.chapterIndex);
    if (speechDurationMs <= 0) {
      console.warn(`⚠️ No speech duration for chapter ${plan.chapterIndex}, skipping ambient`);
      continue;
    }

    const result = await generateAmbientTrack(
      plan.ambientAsset,
      speechDurationMs,
      plan.ambientVolumeDb,
      outputPath
    );

    if (result.code === 0) {
      results.set(plan.chapterIndex, outputPath);
    }
  }

  return results;
}
