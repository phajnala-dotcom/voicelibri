/**
 * Soundscape Module — Intro Generator
 *
 * Builds book-level and chapter-level audio intros:
 *   1. Music bed (from musicSelector) — looped/trimmed to total duration
 *   2. Voice overlays — TTS via synthesizeText(), positioned with adelay
 *   3. Ducking — music volume ramped down during voice, back up after
 *   4. End silence — appended after music fade-out
 *
 * The intro is created as a standalone WAV that gets prepended to
 * the chapter audio during final mixing (audioMixer).
 *
 * Runs PARALLEL to voice TTS — only needs bookInfo + narratorVoice
 * + chapter titles from character_registry.json.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  INTRO_FADE_MS,
  INTRO_END_SILENCE_MS,
  INTRO_CHAPTER_START_SILENCE_MS,
  INTRO_CHAPTER_GAP_MS,
  INTRO_TITLE_AUTHOR_GAP_MS,
  INTRO_AUTHOR_VOICELIBRI_GAP_MS,
  INTRO_VOICELIBRI_CHAPTER_GAP_MS,
  INTRO_END_MUSIC_EXTENSION_MS,
  RAMP_MS,
  MUSIC_FULL_BOOST_DB,
  MUSIC_BACKGROUND_BOOST_DB,
  MUSIC_BACKGROUND_DB,
  INTRO_VOICE_BOOST_DB,
} from './config.js';
import { runFfmpeg } from './ffmpegRunner.js';
import type {
  IntroSpec,
  IntroResult,
  VoiceOverlay,
  SoundAsset,
} from './types.js';

// ========================================
// Lazy imports for backend modules
// ========================================

// These come from the backend — we import dynamically to avoid
// circular deps and to keep the soundscape module decoupled.
let _synthesizeText: typeof import('../../apps/backend/src/ttsClient.js').synthesizeText | null = null;
let _estimateAudioDuration: typeof import('../../apps/backend/src/tempChunkManager.js').estimateAudioDuration | null = null;
let _ChapterTranslator: typeof import('../../apps/backend/src/chapterTranslator.js').ChapterTranslator | null = null;

/**
 * Initialize the intro generator with backend dependencies.
 * Must be called once before generateIntro().
 */
export function initIntroGenerator(deps: {
  synthesizeText: (text: string, voice: string, speed?: string, style?: string, language?: string) => Promise<Buffer>;
  estimateAudioDuration: (buffer: Buffer) => number;
  ChapterTranslator: new (config: { projectId: string; location?: string }) => { translateChapter: (text: string, lang: string) => Promise<{ translatedText?: string }> };
}): void {
  _synthesizeText = deps.synthesizeText as any;
  _estimateAudioDuration = deps.estimateAudioDuration as any;
  _ChapterTranslator = deps.ChapterTranslator as any;
}

// ========================================
// Translation
// ========================================

let introTranslator: any = null;
const translationCache = new Map<string, string>();

async function translateIntroText(text: string, targetLanguage: string | null): Promise<string> {
  if (!targetLanguage) return text;
  if (targetLanguage.toLowerCase().startsWith('en')) return text;

  // Common hard-coded translations
  if (targetLanguage === 'sk-SK' && text === 'This audiobook was brought to you by VoiceLibri.') {
    return 'Túto audioknihu Vám prináša VoiceLibri.';
  }

  const cacheKey = `${targetLanguage}::${text}`;
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  if (!introTranslator && _ChapterTranslator) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'calmbridge-2';
    introTranslator = new _ChapterTranslator({
      projectId,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    });
  }

  if (!introTranslator) return text;

  try {
    const result = await introTranslator.translateChapter(text, targetLanguage);
    const translated = result.translatedText?.trim() || text;
    translationCache.set(cacheKey, translated);
    return translated;
  } catch (error) {
    console.warn('⚠️ Intro translation failed, using original text:', error);
    return text;
  }
}

// ========================================
// Intro spec builders
// ========================================

/**
 * Build the book-level intro spec (Chapter 1).
 * Includes: title, author, VoiceLibri tagline, chapter title.
 */
export function buildBookIntroSpec(
  bookTitle: string,
  author: string,
  chapterTitle: string
): IntroSpec {
  return {
    totalDurationMs: 35000 + INTRO_END_MUSIC_EXTENSION_MS,
    voiceOverlays: [
      { startMs: 12000, gapAfterMs: INTRO_TITLE_AUTHOR_GAP_MS, text: `${bookTitle}.` },
      { gapAfterMs: INTRO_AUTHOR_VOICELIBRI_GAP_MS, text: `${author}.` },
      { gapAfterMs: INTRO_VOICELIBRI_CHAPTER_GAP_MS, text: 'This audiobook was brought to you by VoiceLibri.' },
      { text: `Chapter 1. ${chapterTitle}.` },
    ],
    endSilenceMs: INTRO_END_SILENCE_MS,
  };
}

/**
 * Build a chapter-level intro spec (Chapter 2+).
 * Shorter: just chapter number + title over music.
 */
export function buildChapterIntroSpec(
  chapterNumber: number,
  chapterTitle: string
): IntroSpec {
  return {
    voiceOverlays: [
      { startMs: INTRO_CHAPTER_START_SILENCE_MS, gapAfterMs: INTRO_CHAPTER_GAP_MS, text: `Chapter ${chapterNumber}.` },
      { text: `${chapterTitle}.` },
    ],
    endSilenceMs: INTRO_END_SILENCE_MS,
  };
}

// ========================================
// Volume helpers
// ========================================

function applyMusicBoost(volumeDb: number, boostDb: number): number {
  return volumeDb + boostDb;
}

// ========================================
// FFmpeg command builders
// ========================================

function buildMusicBedArgs(
  musicPath: string,
  outputPath: string,
  durationMs: number,
  volumeDb: number
): string[] {
  const durationSec = Math.max(durationMs / 1000, 0.5);
  const fadeInSec = INTRO_FADE_MS / 1000;
  const fadeOutSec = INTRO_FADE_MS / 1000;
  const fadeOutStart = Math.max(durationSec - fadeOutSec, 0);

  return [
    '-stream_loop', '-1', '-i', musicPath,
    '-t', durationSec.toString(),
    '-af', `volume=${volumeDb}dB,afade=t=in:st=0:d=${fadeInSec},afade=t=out:st=${fadeOutStart}:d=${fadeOutSec}`,
    '-ar', '24000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    outputPath,
  ];
}

function buildConcatArgs(inputs: string[], outputPath: string): string[] {
  const args: string[] = [];
  for (const input of inputs) {
    args.push('-i', input);
  }
  const filter = inputs.map((_, idx) => `[${idx}:a]`).join('') +
    `concat=n=${inputs.length}:v=0:a=1`;
  return [
    ...args,
    '-filter_complex', filter,
    '-ar', '24000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    outputPath,
  ];
}

// ========================================
// Core intro generation
// ========================================

/**
 * Generate a complete intro WAV file with music bed + voice overlays.
 *
 * @param introSpec - Voice overlays, timing, silence spec
 * @param musicAsset - Selected music track (from musicSelector)
 * @param narratorVoice - TTS voice for overlays
 * @param outputPath - Where to write the final intro WAV
 * @param targetLanguage - Language for translation (null = English)
 */
export async function generateIntro(
  introSpec: IntroSpec,
  musicAsset: SoundAsset,
  narratorVoice: string,
  outputPath: string,
  targetLanguage: string | null = null
): Promise<IntroResult> {
  if (!_synthesizeText || !_estimateAudioDuration) {
    throw new Error('introGenerator not initialized — call initIntroGenerator() first');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicelibri-intro-'));

  try {
    // ── Step 1: Generate voice overlays via TTS ──
    console.log('🎤 Generating intro voice overlays...');
    const voiceFiles: Array<{ path: string; startMs: number; durationMs: number }> = [];
    let currentStartMs = 0;
    let lastEndMs = 0;

    for (let i = 0; i < introSpec.voiceOverlays.length; i++) {
      const overlay = introSpec.voiceOverlays[i];

      // Translate if needed
      const voiceText = await translateIntroText(overlay.text, targetLanguage);

      // Synthesize TTS
      const voiceAudio = await _synthesizeText(voiceText, narratorVoice, 'normal', undefined, targetLanguage ?? undefined);
      const voiceDurationMs = _estimateAudioDuration(voiceAudio) * 1000;
      const voicePath = path.join(tempDir, `intro_voice_${i}.wav`);

      // Compute start position
      if (overlay.startMs !== undefined) {
        currentStartMs = overlay.startMs;
      } else {
        currentStartMs = lastEndMs + (overlay.gapAfterMs ?? 0);
      }

      fs.writeFileSync(voicePath, voiceAudio);
      voiceFiles.push({ path: voicePath, startMs: currentStartMs, durationMs: voiceDurationMs });
      lastEndMs = currentStartMs + voiceDurationMs + (overlay.gapAfterMs ?? 0);
    }

    // ── Step 2: Build music bed ──
    const computedDurationMs = Math.max(introSpec.totalDurationMs ?? 0, lastEndMs);
    const baseMusicPath = path.join(tempDir, 'intro_base_music.wav');
    const baseVolume = applyMusicBoost(-14, MUSIC_FULL_BOOST_DB);

    console.log(`🎵 Building music bed: ${computedDurationMs}ms, volume=${baseVolume}dB`);
    const musicResult = await runFfmpeg(
      buildMusicBedArgs(musicAsset.filePath, baseMusicPath, computedDurationMs, baseVolume)
    );
    if (musicResult.code !== 0) {
      throw new Error(`Music bed generation failed: ${musicResult.stderr.substring(0, 500)}`);
    }

    // ── Step 3: Mix voice overlays with ducking ──
    const introTempPath = path.join(tempDir, 'intro_temp.wav');
    const fullVolumeDb = applyMusicBoost(-14, MUSIC_FULL_BOOST_DB);
    const backgroundVolumeDb = applyMusicBoost(MUSIC_BACKGROUND_DB, MUSIC_BACKGROUND_BOOST_DB);
    const backgroundRatio = Number(Math.pow(10, (backgroundVolumeDb - fullVolumeDb) / 20).toFixed(6));
    const rampSec = Math.max(RAMP_MS / 1000, 0.01);

    // Build ducking volume expression
    const duckExpressions = voiceFiles.map((v) => {
      const startSec = v.startMs / 1000;
      const endSec = startSec + v.durationMs / 1000;
      const fadeInStart = Math.max(startSec - rampSec, 0);
      const fadeOutEnd = endSec + rampSec;
      return `if(between(t\\,${fadeInStart}\\,${startSec}),1-(1-${backgroundRatio})*(t-${fadeInStart})/${rampSec},` +
        `if(between(t\\,${startSec}\\,${endSec}),${backgroundRatio},` +
        `if(between(t\\,${endSec}\\,${fadeOutEnd}),${backgroundRatio}+(1-${backgroundRatio})*(t-${endSec})/${rampSec},1)))`;
    });

    let volumeExpr = '1';
    for (const expr of duckExpressions) {
      volumeExpr = `min(${volumeExpr}\\,${expr})`;
    }

    const filterComplex = [
      `[0:a]volume='${volumeExpr}':eval=frame[music]`,
      ...voiceFiles.map((v, i) =>
        `[${i + 1}:a]volume=${INTRO_VOICE_BOOST_DB}dB,adelay=${v.startMs}|${v.startMs}[voice${i}]`
      ),
      `[music]${voiceFiles.map((_, i) => `[voice${i}]`).join('')}amix=inputs=${1 + voiceFiles.length}:duration=first:normalize=0`,
    ].join(';');

    console.log('🔊 Mixing voice overlays with ducking...');
    const mixArgs: string[] = [
      '-i', baseMusicPath,
      ...voiceFiles.flatMap((v) => ['-i', v.path]),
      '-filter_complex', filterComplex,
      '-ar', '24000',
      '-ac', '1',
      introTempPath,
    ];

    const mixResult = await runFfmpeg(mixArgs);
    if (mixResult.code !== 0) {
      throw new Error(`Voice overlay mix failed: ${mixResult.stderr.substring(0, 500)}`);
    }

    // ── Step 4: Append end silence ──
    let finalIntroPath = introTempPath;

    if (introSpec.endSilenceMs > 0) {
      const silencePath = path.join(tempDir, 'intro_silence.wav');
      const silenceArgs = [
        '-f', 'lavfi',
        '-t', (introSpec.endSilenceMs / 1000).toString(),
        '-i', 'anullsrc=r=24000:cl=mono',
        silencePath,
      ];

      const silenceResult = await runFfmpeg(silenceArgs);
      if (silenceResult.code !== 0) {
        console.warn('⚠️ Silence generation failed, skipping end silence');
      } else {
        const withSilencePath = path.join(tempDir, 'intro_with_silence.wav');
        const concatResult = await runFfmpeg(buildConcatArgs([introTempPath, silencePath], withSilencePath));
        if (concatResult.code !== 0) {
          console.warn('⚠️ Silence concat failed, using intro without silence');
        } else {
          finalIntroPath = withSilencePath;
        }
      }
    }

    // ── Step 5: Move to final output path ──
    fs.copyFileSync(finalIntroPath, outputPath);

    // Read file to estimate duration
    const outputBuffer = fs.readFileSync(outputPath);
    const durationMs = _estimateAudioDuration(outputBuffer) * 1000;

    console.log(`✅ Intro generated: ${outputPath} (${(durationMs / 1000).toFixed(1)}s)`);

    return {
      introPath: outputPath,
      durationMs,
    };
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Generate all intros for a book (book intro + chapter intros).
 *
 * @param bookTitle - Book title for book-level intro
 * @param author - Author name
 * @param chapters - Array of { index, title } for each chapter
 * @param musicAsset - Selected music track
 * @param narratorVoice - TTS voice
 * @param outputDir - Directory to write intro WAV files
 * @param targetLanguage - Language for translations
 */
export async function generateAllIntros(
  bookTitle: string,
  author: string,
  chapters: Array<{ index: number; title: string }>,
  musicAsset: SoundAsset,
  narratorVoice: string,
  outputDir: string,
  targetLanguage: string | null = null
): Promise<Map<number, IntroResult>> {
  const results = new Map<number, IntroResult>();

  for (const ch of chapters) {
    const introSpec = ch.index === 1
      ? buildBookIntroSpec(bookTitle, author, ch.title)
      : buildChapterIntroSpec(ch.index, ch.title);

    const outputPath = path.join(outputDir, `chapter_${ch.index}_intro.wav`);

    // Skip if already generated
    if (fs.existsSync(outputPath)) {
      console.log(`⏭️ Intro already exists: chapter ${ch.index}`);
      const buf = fs.readFileSync(outputPath);
      const durationMs = _estimateAudioDuration?.(buf)
        ? _estimateAudioDuration(buf) * 1000
        : 0;
      results.set(ch.index, { introPath: outputPath, durationMs });
      continue;
    }

    try {
      const result = await generateIntro(
        introSpec,
        musicAsset,
        narratorVoice,
        outputPath,
        targetLanguage
      );
      results.set(ch.index, result);
    } catch (err) {
      console.error(`✗ Failed to generate intro for chapter ${ch.index}:`, err);
    }
  }

  return results;
}
