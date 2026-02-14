/**
 * Soundscape Module — Audio Mixer
 *
 * Final stage: combines the three parallel outputs into the chapter WAV:
 *   1. Voice WAV (from TTS pipeline)
 *   2. Ambient WAV (from ambientLayer) — mixed under voice
 *   3. Intro WAV (from introGenerator) — prepended before the mixed chapter
 *
 * Operations:
 *   - mixAmbientWithVoice(): Overlay ambient + voice using amix (voice-delayed by pre-roll)
 *   - prependIntro(): Concat intro + chapter
 *   - processChapter(): Full pipeline for one chapter
 */

import fs from 'fs';
import path from 'path';
import {
  AMBIENT_PRE_ROLL_MS,
  AUDIO_SAMPLE_RATE,
  AUDIO_CHANNELS,
  AUDIO_CODEC,
} from './config.js';
import { runFfmpeg } from './ffmpegRunner.js';
import type { ChapterSoundscapeResult, FfmpegResult } from './types.js';

// ========================================
// Mix ambient with voice
// ========================================

/**
 * Mix the ambient WAV under the voice WAV.
 *
 * The voice is delayed by AMBIENT_PRE_ROLL_MS so ambient
 * starts first (creates atmosphere before narration begins).
 * Ambient duration is already correct (generated with pre+post roll).
 *
 * @param voicePath - Path to the voice chapter WAV
 * @param ambientPath - Path to the ambient track WAV (from ambientLayer)
 * @param outputPath - Path for the mixed output WAV
 */
export async function mixAmbientWithVoice(
  voicePath: string,
  ambientPath: string,
  outputPath: string
): Promise<FfmpegResult> {
  const voiceDelayMs = AMBIENT_PRE_ROLL_MS;

  const args = [
    '-i', ambientPath,    // [0] = ambient (already normalized/faded)
    '-i', voicePath,       // [1] = voice
    '-filter_complex',
    `[1:a]adelay=${voiceDelayMs}|${voiceDelayMs}[speech];` +
    `[0:a][speech]amix=inputs=2:duration=first:dropout_transition=2:normalize=0`,
    '-ar', AUDIO_SAMPLE_RATE.toString(),
    '-ac', AUDIO_CHANNELS.toString(),
    '-c:a', AUDIO_CODEC,
    outputPath,
  ];

  console.log(`🔊 Mixing ambient + voice → ${path.basename(outputPath)}`);
  const result = await runFfmpeg(args);

  if (result.code !== 0) {
    console.error(`✗ Ambient+voice mix failed: ${result.stderr.substring(0, 300)}`);
  }

  return result;
}

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
// ========================================

/**
 * Process a single chapter through the full audio mixing pipeline.
 *
 * @param chapterIndex - Chapter number
 * @param voicePath - Path to voice WAV (from TTS consolidation)
 * @param ambientPath - Path to ambient WAV (from ambientLayer) or null
 * @param introPath - Path to intro WAV (from introGenerator) or null
 * @param outputDir - Directory for output files
 * @returns ChapterSoundscapeResult with paths to all generated files
 */
export async function processChapter(
  chapterIndex: number,
  voicePath: string,
  ambientPath: string | null,
  introPath: string | null,
  outputDir: string
): Promise<ChapterSoundscapeResult> {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let currentPath = voicePath;
  let ambientMixPath: string | null = null;

  // ── Step 1: Mix ambient (if available) ──
  if (ambientPath && fs.existsSync(ambientPath)) {
    const mixedPath = path.join(outputDir, `chapter_${chapterIndex}_ambient_mix.wav`);

    const mixResult = await mixAmbientWithVoice(currentPath, ambientPath, mixedPath);
    if (mixResult.code === 0) {
      currentPath = mixedPath;
      ambientMixPath = mixedPath;
    } else {
      console.warn(`⚠️ Ambient mix failed for chapter ${chapterIndex}, using voice only`);
    }
  }

  // ── Step 2: Prepend intro (if available) ──
  let finalIntroPath: string | null = null;
  if (introPath && fs.existsSync(introPath)) {
    const withIntroPath = path.join(outputDir, `chapter_${chapterIndex}_soundscape.wav`);

    const concatResult = await prependIntro(introPath, currentPath, withIntroPath);
    if (concatResult.code === 0) {
      currentPath = withIntroPath;
      finalIntroPath = introPath;
    } else {
      console.warn(`⚠️ Intro prepend failed for chapter ${chapterIndex}, using chapter without intro`);
    }
  }

  return {
    chapterIndex,
    ambientMixPath,
    introPath: finalIntroPath,
    finalPath: currentPath,
  };
}

/**
 * Process all chapters through the mixing pipeline.
 *
 * @param chapters - Chapter definitions
 * @param voicePaths - Map of chapterIndex → voice WAV path
 * @param ambientPaths - Map of chapterIndex → ambient WAV path
 * @param introPaths - Map of chapterIndex → intro WAV path
 * @param outputDir - Directory for mixed output files
 */
export async function processAllChapters(
  chapters: Array<{ index: number }>,
  voicePaths: Map<number, string>,
  ambientPaths: Map<number, string>,
  introPaths: Map<number, string>,
  outputDir: string
): Promise<Map<number, ChapterSoundscapeResult>> {
  const results = new Map<number, ChapterSoundscapeResult>();

  for (const ch of chapters) {
    const voicePath = voicePaths.get(ch.index);
    if (!voicePath || !fs.existsSync(voicePath)) {
      console.warn(`⚠️ No voice WAV for chapter ${ch.index}, skipping mix`);
      continue;
    }

    const result = await processChapter(
      ch.index,
      voicePath,
      ambientPaths.get(ch.index) ?? null,
      introPaths.get(ch.index) ?? null,
      outputDir
    );

    results.set(ch.index, result);
    console.log(`✅ Chapter ${ch.index} mixed → ${result.finalPath}`);
  }

  return results;
}

