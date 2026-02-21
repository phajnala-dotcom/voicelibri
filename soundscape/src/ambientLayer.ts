/**
 * Soundscape Module — Ambient Layer
 *
 * Creates per-chapter ambient OGG with optional SFX overlay:
 *   1. Loops resolved ambient asset to cover chapter duration + pre/post-roll
 *   2. Optionally overlays multiple SFX one-shots (no looping, no cross-subchunk)
 *      — each SFX placed at a distinct timeline position (max 1 concurrent)
 *   3. Applies loudnorm, volume, fade-in/out
 *   4. Outputs a single _ambient.ogg served independently from voice
 *
 * SFX is treated the same as ambient — mixed into the same output file,
 * not a separate layer. Only difference: SFX is not looped and is short.
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

/** Volume boost for SFX relative to ambient (SFX should be audible above ambient bed) */
const SFX_VOLUME_BOOST_DB = 6;

/**
 * Generate a standalone ambient OGG for a chapter, optionally with SFX overlays.
 *
 * The ambient track is:
 *   - Looped infinitely (`-stream_loop -1`)
 *   - Trimmed to speechDuration + pre-roll + post-roll
 *   - Normalized with loudnorm (target I=-20, TP=-2, LRA=11)
 *   - Volume-adjusted per plan.ambientVolumeDb
 *   - Faded in/out at edges
 *
 * When SFX assets are provided, they are overlaid (amixed) into the
 * ambient track — each played once (no looping), placed at evenly spaced
 * positions throughout the chapter so max 1 SFX plays at a time.
 * This produces a single _ambient.ogg containing both ambient bed + SFX.
 *
 * @param ambientAsset - Resolved ambient OGG file
 * @param speechDurationMs - Duration of the voice chapter WAV
 * @param volumeDb - Target volume adjustment in dB
 * @param outputPath - Where to write the ambient OGG
 * @param sfxAssets - Optional array of SFX assets to overlay (one-shot sounds)
 * @returns FfmpegResult
 */
export async function generateAmbientTrack(
  ambientAsset: SoundAsset,
  speechDurationMs: number,
  volumeDb: number,
  outputPath: string,
  sfxAssets?: SoundAsset[] | null
): Promise<FfmpegResult> {
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

  // Filter out empty arrays
  const validSfx = sfxAssets?.filter(a => a != null) ?? [];

  let args: string[];

  if (validSfx.length > 0) {
    // ── Ambient + multiple SFX overlay via filter_complex ──
    // Distribute SFX evenly across the chapter duration so they don't overlap
    const sfxVolumeDb = volumeDb + SFX_VOLUME_BOOST_DB;
    const preRollSec = AMBIENT_PRE_ROLL_MS / 1000;
    // Usable range for SFX placement: after pre-roll+2s to fadeOutStart-2s
    const sfxStartBound = preRollSec + 2;
    const sfxEndBound = Math.max(fadeOutStart - 2, sfxStartBound + 1);
    const sfxSpan = sfxEndBound - sfxStartBound;

    // Calculate evenly distributed offsets for each SFX
    const sfxOffsets: number[] = [];
    if (validSfx.length === 1) {
      sfxOffsets.push(Math.min(sfxStartBound, totalDurationSec * 0.2));
    } else {
      for (let i = 0; i < validSfx.length; i++) {
        const offset = sfxStartBound + (sfxSpan * i) / (validSfx.length - 1);
        sfxOffsets.push(offset);
      }
    }

    // Build ffmpeg inputs: ambient (index 0) + each SFX (index 1..N)
    const inputArgs: string[] = [
      '-stream_loop', '-1',
      '-i', ambientAsset.filePath,
    ];
    for (const sfx of validSfx) {
      inputArgs.push('-i', sfx.filePath);
    }

    // Build filter_complex
    // [0] ambient: normalize, volume, fade
    let filterComplex =
      `[0:a]loudnorm=I=-20:TP=-2:LRA=11,` +
      `volume=${volumeDb}dB,` +
      `afade=t=in:st=0:d=${fadeInSec},` +
      `afade=t=out:st=${fadeOutStart}:d=${fadeOutSec}[amb];`;

    // Each SFX input: normalize, volume boost, delay to its offset
    const mixInputLabels = ['[amb]'];
    for (let i = 0; i < validSfx.length; i++) {
      const inputIdx = i + 1;
      const offsetMs = Math.round(sfxOffsets[i] * 1000);
      const label = `sfx${i}`;
      filterComplex +=
        `[${inputIdx}:a]loudnorm=I=-20:TP=-2:LRA=11,` +
        `volume=${sfxVolumeDb}dB,` +
        `adelay=${offsetMs}|${offsetMs}[${label}];`;
      mixInputLabels.push(`[${label}]`);
    }

    // Mix all streams together (ambient + all SFX)
    filterComplex +=
      `${mixInputLabels.join('')}amix=inputs=${mixInputLabels.length}:duration=first:dropout_transition=2[out]`;

    args = [
      ...inputArgs,
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-t', totalDurationSec.toString(),
      '-ar', AUDIO_SAMPLE_RATE.toString(),
      '-ac', AUDIO_CHANNELS.toString(),
      '-c:a', AUDIO_CODEC,
      outputPath,
    ];

    const sfxDescs = validSfx.map((s, i) =>
      `"${s.description?.substring(0, 30)}" @${sfxOffsets[i].toFixed(1)}s`
    ).join(', ');
    console.log(
      `🌿 Generating ambient+${validSfx.length}×SFX track: ${totalDurationSec.toFixed(1)}s, ${volumeDb}dB ambient, SFX: [${sfxDescs}]`
    );
  } else {
    // ── Ambient only (no SFX) ──
    args = [
      '-stream_loop', '-1',
      '-i', ambientAsset.filePath,
      '-af',
      `loudnorm=I=-20:TP=-2:LRA=11,` +
      `volume=${volumeDb}dB,` +
      `afade=t=in:st=0:d=${fadeInSec},` +
      `afade=t=out:st=${fadeOutStart}:d=${fadeOutSec}`,
      '-t', totalDurationSec.toString(),
      '-ar', AUDIO_SAMPLE_RATE.toString(),
      '-ac', AUDIO_CHANNELS.toString(),
      '-c:a', AUDIO_CODEC,
      outputPath,
    ];

    console.log(`🌿 Generating ambient track: ${totalDurationSec.toFixed(1)}s, ${volumeDb}dB`);
  }

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
      `chapter_${plan.chapterIndex}_ambient.ogg`
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


