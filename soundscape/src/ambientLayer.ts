/**
 * Soundscape Module — Ambient Layer
 *
 * Creates per-subchunk ambient OGG with optional multi-scene ambient crossfades
 * and precisely-timed SFX overlays.
 *
 * Per-subchunk ambient generation with gap-based SFX timing:
 *   generateSubchunkAmbientTrack() — handles 1–N ambient segments with crossfades
 *
 * After all subchunk OGGs are written:
 *   concatenateSubchunkAmbientTracks() — concat + chapter-level fade-in/out
 */

import fs from 'fs';
import path from 'path';
import {
  AMBIENT_DEFAULT_DB,
  AUDIO_SAMPLE_RATE,
  AUDIO_CHANNELS,
  AUDIO_CODEC,
} from './config.js';
import { runFfmpeg, getAudioDuration } from './ffmpegRunner.js';
import type {
  SoundAsset,
  FfmpegResult,
} from './types.js';

// ========================================
// Step 2.5 — Per-subchunk Ambient + SFX Generation
// ========================================

/** Volume boost for SFX relative to the ambient bed */
const SFX_VOLUME_BOOST_DB = 6;

/** Crossfade duration between adjacent ambient segments (seconds) */
const AMBIENT_CROSSFADE_SEC = 0.5;

/** Short boundary fade at the subchunk edges to hide concat seams (seconds) */
const BOUNDARY_FADE_SEC = 0.05;

/**
 * Generate an ambient OGG track for a single TTS subchunk.
 *
 * Supports multiple ambient segments with 500 ms crossfades between them,
 * and optional precisely-timed SFX overlays.
 *
 * `ambientSegments` is an ordered array where each entry’s `startMs` marks
 * when that ambient environment begins within the subchunk. The first segment
 * always has startMs = 0. Subsequent segment startMs values correspond to
 * silence-gap midpoints returned by `calculateSfxOffsetFromGaps()`.
 *
 * Crossfade logic (500 ms):
 *   - Segment A: fade out over last 500 ms before the switch point
 *   - Segment B: fade in over first 500 ms after the switch point
 *   - Both overlap for 500 ms; amix combines them
 *   - Only 1 ambient plays at any moment (except the 500 ms crossfade window)
 *
 * @param ambientSegments    - Ordered ambient assets with their subchunk-relative startMs
 * @param subchunkDurationMs - Actual TTS duration of the subchunk in milliseconds
 * @param volumeDb           - Target ambient volume in dB
 * @param outputPath         - Where to write the output OGG
 * @param sfxEvents          - Optional precisely-timed SFX to overlay
 * @returns FfmpegResult
 */
export async function generateSubchunkAmbientTrack(
  ambientSegments: Array<{ asset: SoundAsset; startMs: number }>,
  subchunkDurationMs: number,
  volumeDb: number,
  outputPath: string,
  sfxEvents?: Array<{ offsetMs: number; asset: SoundAsset; description: string }> | null
): Promise<FfmpegResult> {
  if (ambientSegments.length === 0) {
    return { code: 1, stdout: '', stderr: 'No ambient segments provided' };
  }

  const totalDurationSec = Math.max(subchunkDurationMs / 1000, 0.1);
  const validSfx = sfxEvents?.filter((e) => e != null && e.asset != null) ?? [];
  const sfxVolumeDb = volumeDb + SFX_VOLUME_BOOST_DB;

  // Sort segments by startMs (caller should already provide them sorted)
  const segments = [...ambientSegments].sort((a, b) => a.startMs - b.startMs);

  // Build ffmpeg input args:
  //   - One looping input per unique ambient asset (segments may share an asset)
  //   - One input per SFX
  const inputArgs: string[] = [];
  // Track input indices per asset path to avoid duplicate stream_loop inputs
  const assetInputIndex = new Map<string, number>();
  for (const seg of segments) {
    if (!assetInputIndex.has(seg.asset.filePath)) {
      assetInputIndex.set(seg.asset.filePath, inputArgs.length / 4); // groups of 4 tokens
      inputArgs.push('-stream_loop', '-1', '-i', seg.asset.filePath);
    }
  }
  const sfxInputStartIndex = inputArgs.length / 4;
  for (const sfx of validSfx) {
    inputArgs.push('-i', sfx.asset.filePath);
  }

  // Build filter_complex
  let filterComplex = '';
  const ambMixLabels: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const inputIdx = assetInputIndex.get(seg.asset.filePath)!;
    const isFirst = i === 0;
    const isLast = i === segments.length - 1;

    // Segment time range within the subchunk
    // Start slightly before the nominal switchpoint to allow crossfade overlap
    const contentStartMs = isFirst ? 0 : seg.startMs - AMBIENT_CROSSFADE_SEC * 1000;
    const contentEndMs = isLast
      ? subchunkDurationMs
      : segments[i + 1].startMs + AMBIENT_CROSSFADE_SEC * 1000;
    const contentDurationSec = Math.max((contentEndMs - contentStartMs) / 1000, 0.01);

    const fadeInSec = isFirst ? BOUNDARY_FADE_SEC : AMBIENT_CROSSFADE_SEC;
    const fadeOutStart = Math.max(contentDurationSec - (isLast ? BOUNDARY_FADE_SEC : AMBIENT_CROSSFADE_SEC), 0);
    const fadeOutSec = isLast ? BOUNDARY_FADE_SEC : AMBIENT_CROSSFADE_SEC;

    const label = `amb${i}`;
    // L1: Use simple volume correction based on catalog LUFS — target -16 LUFS (near voice level)
    // volumeDb then provides the offset below voice (e.g., -3 dB → effective -19 LUFS)
    const lufsCorrection = seg.asset.loudnessLUFS != null ? `volume=${(-16 - seg.asset.loudnessLUFS).toFixed(1)}dB,` : '';
    filterComplex +=
      `[${inputIdx}:a]` +
      `${lufsCorrection}` +
      `volume=${volumeDb}dB,` +
      `atrim=0:end=${contentDurationSec.toFixed(6)},` +
      `afade=t=in:st=0:d=${fadeInSec},` +
      `afade=t=out:st=${fadeOutStart.toFixed(6)}:d=${fadeOutSec},` +
      `adelay=${contentStartMs.toFixed(0)}|${contentStartMs.toFixed(0)}` +
      `[${label}];`;
    ambMixLabels.push(`[${label}]`);
  }

  // SFX overlays
  const sfxMixLabels: string[] = [];
  for (let i = 0; i < validSfx.length; i++) {
    const sfx = validSfx[i];
    const inputIdx = sfxInputStartIndex + i;
    const offsetMs = Math.max(0, sfx.offsetMs);
    const sfxLabel = `sfx${i}`;
    // L1: Use simple volume correction based on catalog LUFS — target -16 LUFS
    const sfxLufsCorrection = sfx.asset?.loudnessLUFS != null ? `volume=${(-16 - sfx.asset.loudnessLUFS).toFixed(1)}dB,` : '';
    filterComplex +=
      `[${inputIdx}:a]` +
      `${sfxLufsCorrection}` +
      `volume=${sfxVolumeDb}dB,` +
      `adelay=${offsetMs}|${offsetMs}` +
      `[${sfxLabel}];`;
    sfxMixLabels.push(`[${sfxLabel}]`);
  }

  const allMixLabels = [...ambMixLabels, ...sfxMixLabels];
  if (allMixLabels.length === 1) {
    // Single stream — rename directly to output, no amix needed
    const singleLabel = allMixLabels[0]; // e.g. '[amb0]' or '[sfx0]'
    const labelContent = singleLabel.slice(1, -1); // e.g. 'amb0'
    filterComplex = filterComplex.replace(`[${labelContent}];`, '[out];');
    // Remove trailing semicolon
    filterComplex = filterComplex.replace(/;\s*$/, '');
  } else {
    filterComplex +=
      `${allMixLabels.join('')}amix=inputs=${allMixLabels.length}:duration=first:dropout_transition=2[out]`;
  }

  const args = [
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-t', totalDurationSec.toString(),
    '-ar', AUDIO_SAMPLE_RATE.toString(),
    '-ac', AUDIO_CHANNELS.toString(),
    '-c:a', AUDIO_CODEC,
    outputPath,
  ];

  if (segments.length > 1) {
    console.log(
      `🎵 Subchunk ambient: ${totalDurationSec.toFixed(2)}s, ${segments.length} scenes, ` +
      `${validSfx.length}×SFX, ${volumeDb}dB`
    );
  } else {
    const sfxDesc = validSfx
      .map((e) => `"${e.description.substring(0, 30)}" @${(e.offsetMs / 1000).toFixed(2)}s`)
      .join(', ');
    if (validSfx.length > 0) {
      console.log(
        `🎯 Subchunk ambient+${validSfx.length}×SFX: ${totalDurationSec.toFixed(2)}s | ${volumeDb}dB | SFX: [${sfxDesc}]`
      );
    } else {
      console.log(`🌿 Subchunk ambient: ${totalDurationSec.toFixed(2)}s, ${volumeDb}dB`);
    }
  }

  const result = await runFfmpeg(args);

  if (result.code !== 0) {
    console.error(`✗ Subchunk ambient generation failed: ${result.stderr.substring(0, 300)}`);
  } else {
    console.log(`✓ Subchunk ambient ready: ${outputPath}`);
  }

  return result;
}

// ========================================
// Step 2.6 — Chapter Ambient Concatenation
// ========================================

/** Duration of chapter-level fade-in and fade-out (seconds) */
const CHAPTER_FADE_SEC = 2;

/**
 * Apply 2-second fade-in and 2-second fade-out to a chapter ambient OGG.
 * @internal
 */
async function applyChapterFades(inputPath: string, outputPath: string): Promise<FfmpegResult> {
  const totalDurSec = await getAudioDuration(inputPath);
  if (totalDurSec <= 0) {
    // Can't determine duration — copy without fades
    return runFfmpeg(['-i', inputPath, '-c', 'copy', outputPath]);
  }
  const fadeOutStart = Math.max(totalDurSec - CHAPTER_FADE_SEC, 0);
  return runFfmpeg([
    '-i', inputPath,
    '-af',
    `afade=t=in:st=0:d=${CHAPTER_FADE_SEC},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${CHAPTER_FADE_SEC}`,
    '-ar', AUDIO_SAMPLE_RATE.toString(),
    '-ac', AUDIO_CHANNELS.toString(),
    '-c:a', AUDIO_CODEC,
    outputPath,
  ]);
}

/**
 * Concatenate per-subchunk ambient OGG tracks into a single chapter ambient
 * track, then apply a 2-second fade-in and 2-second fade-out.
 *
 * Uses ffmpeg concat demuxer (no re-encoding for concat step), then a second
 * pass for the chapter-level fades.
 *
 * @param subchunkPaths - Ordered list of per-subchunk ambient OGG paths
 * @param outputPath    - Final chapter ambient OGG path
 * @returns FfmpegResult
 */
export async function concatenateSubchunkAmbientTracks(
  subchunkPaths: string[],
  outputPath: string
): Promise<FfmpegResult> {
  if (subchunkPaths.length === 0) {
    return { code: 1, stdout: '', stderr: 'No subchunk paths provided' };
  }

  if (subchunkPaths.length === 1) {
    // Single subchunk — re-encode with chapter fade-in/out
    const result = await applyChapterFades(subchunkPaths[0], outputPath);
    if (result.code === 0) {
      console.log(`✓ Chapter ambient (1 subchunk) ready: ${outputPath}`);
    }
    return result;
  }

  const { default: fsDyn } = await import('fs');
  const { default: pathDyn } = await import('path');
  const osDyn = await import('os');

  // Write concat list to a temp file (safe=0 allows absolute paths)
  const concatListPath = pathDyn.join(osDyn.tmpdir(), `concat_ambient_${Date.now()}.txt`);
  const concatContent = subchunkPaths
    .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
    .join('\n');
  fsDyn.writeFileSync(concatListPath, concatContent, 'utf8');

  try {
    // Step 1: concat all subchunks into a temp file
    const concatTmpPath = pathDyn.join(osDyn.tmpdir(), `concat_ambient_tmp_${Date.now()}.ogg`);

    const concatResult = await runFfmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      concatTmpPath,
    ]);

    if (concatResult.code !== 0) {
      console.error(`✗ Chapter ambient concat failed: ${concatResult.stderr.substring(0, 300)}`);
      return concatResult;
    }

    // Step 2: apply chapter-level fade-in/out
    const fadeResult = await applyChapterFades(concatTmpPath, outputPath);

    try { fsDyn.unlinkSync(concatTmpPath); } catch { /* ignore */ }

    if (fadeResult.code === 0) {
      console.log(`✓ Chapter ambient (${subchunkPaths.length} subchunks) ready: ${outputPath}`);
    } else {
      console.error(`✗ Chapter ambient fade pass failed: ${fadeResult.stderr.substring(0, 300)}`);
    }

    return fadeResult;
  } finally {
    try { fsDyn.unlinkSync(concatListPath); } catch { /* ignore */ }
  }
}
