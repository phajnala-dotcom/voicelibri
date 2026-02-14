/**
 * Soundscape Integration — Compatibility Layer
 *
 * Drop-in replacement for the legacy soundscapeIntegration.ts.
 * Provides the same public API surface used by index.ts and audiobookWorker.ts,
 * but delegates to the new modular soundscape/ pipeline.
 *
 * Exports:
 *   - applySoundscapeToChapter() — called by audiobookWorker after consolidation
 *   - resolveChapterAudioPath() — called by index.ts for audio streaming
 *   - getSoundscapeThemeOptions() — called by index.ts for theme picker UI
 */

import fs from 'fs';
import path from 'path';
import { isSoundscapeEnabled } from '../../../soundscape/src/config.js';
import { loadCatalog } from '../../../soundscape/src/catalogLoader.js';
import { initIntroGenerator, generateIntro, buildBookIntroSpec, buildChapterIntroSpec } from '../../../soundscape/src/introGenerator.js';
import { generateAmbientTrack } from '../../../soundscape/src/ambientLayer.js';
import { mixAmbientWithVoice, prependIntro } from '../../../soundscape/src/audioMixer.js';
import { selectMusicTrack } from '../../../soundscape/src/musicSelector.js';
import { resolveByKeyword, resolveAmbientAsset } from '../../../soundscape/src/assetResolver.js';
import { buildFallbackScene } from '../../../soundscape/src/llmDirector.js';
import { DEFAULT_KEYWORD_MAP, INTRO_NARRATOR_VOICE } from '../../../soundscape/src/config.js';
import type { SoundscapePreferences, BookInfo } from '../../../soundscape/src/types.js';

import { synthesizeText } from './ttsClient.js';
import { loadAudiobookMetadata } from './audiobookManager.js';
import { estimateAudioDuration } from './tempChunkManager.js';
import { ChapterTranslator } from './chapterTranslator.js';

// Initialize the intro generator with backend deps (once)
let initialized = false;
function ensureInitialized(): void {
  if (initialized) return;
  initIntroGenerator({
    synthesizeText: synthesizeText as any,
    estimateAudioDuration,
    ChapterTranslator: ChapterTranslator as any,
  });
  initialized = true;
}

// ========================================
// Compat: applySoundscapeToChapter
// ========================================

function getSoundscapeChapterPath(chapterPath: string): string {
  return chapterPath.replace(/\.wav$/i, '_soundscape.wav');
}

function getIntroPath(chapterPath: string): string {
  return chapterPath.replace(/\.wav$/i, '_intro.wav');
}

function normalizeTargetLanguage(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown' || trimmed.toLowerCase() === 'auto-detect') return null;
  if (trimmed.includes('-')) return trimmed;
  const map: Record<string, string> = {
    en: 'en-US', sk: 'sk-SK', cs: 'cs-CZ', ru: 'ru-RU', de: 'de-DE',
    pl: 'pl-PL', hr: 'hr-HR', zh: 'zh-CN', nl: 'nl-NL', fr: 'fr-FR',
    hi: 'hi-IN', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR', pt: 'pt-BR',
    es: 'es-ES', uk: 'uk-UA',
  };
  return map[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Apply soundscape to a single chapter — backward-compatible API.
 *
 * This bridges the old monolithic call to the new modular pipeline.
 * Sequentially: ambient mix → intro → concat.
 */
export async function applySoundscapeToChapter(options: {
  bookTitle: string;
  chapterIndex: number;
  chapterPath: string;
  chapterText: string;
  preferences?: SoundscapePreferences;
}): Promise<string> {
  if (!isSoundscapeEnabled()) {
    return options.chapterPath;
  }

  ensureInitialized();

  const ambientEnabled = options.preferences?.soundscapeAmbientEnabled !== false;
  const musicEnabled = options.preferences?.soundscapeMusicEnabled !== false;

  console.log(`🎧 Soundscape: musicEnabled=${musicEnabled} ambientEnabled=${ambientEnabled}`);

  if (!ambientEnabled && !musicEnabled) {
    return options.chapterPath;
  }

  const soundscapePath = getSoundscapeChapterPath(options.chapterPath);
  const introPath = getIntroPath(options.chapterPath);

  if (fs.existsSync(soundscapePath) && !musicEnabled) {
    return soundscapePath;
  }

  let currentPath = options.chapterPath;

  // ── Ambient mix ──
  if (ambientEnabled) {
    try {
      const metadata = loadAudiobookMetadata(options.bookTitle);
      const bookInfo: BookInfo = {
        genre: 'unknown',
        tone: 'neutral',
        voiceTone: 'neutral',
        period: 'modern',
        locked: false,
      };

      // Try to get book info from character registry
      const bookDir = path.dirname(options.chapterPath);
      const registryPath = path.join(bookDir, 'character_registry.json');
      if (fs.existsSync(registryPath)) {
        try {
          const reg = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
          if (reg.bookInfo) {
            Object.assign(bookInfo, reg.bookInfo);
          }
        } catch { /* ignore */ }
      }

      // Use fallback scene analysis (no LLM call in compat mode)
      const scene = buildFallbackScene(
        options.chapterIndex,
        options.chapterText,
        bookInfo
      );

      // Try embedding-based resolution, fall back to keyword
      let ambientAsset = null;
      try {
        const result = await resolveAmbientAsset(scene);
        ambientAsset = result?.asset ?? null;
      } catch {
        const catalog = loadCatalog();
        ambientAsset = resolveByKeyword(scene, catalog);
      }

      if (ambientAsset && fs.existsSync(ambientAsset.filePath)) {
        const speechBuffer = fs.readFileSync(options.chapterPath);
        const speechDurationMs = estimateAudioDuration(speechBuffer) * 1000;

        const ambientPath = options.chapterPath.replace(/\.wav$/i, '_ambient.wav');
        const ambientResult = await generateAmbientTrack(
          ambientAsset,
          speechDurationMs,
          -6,
          ambientPath
        );

        if (ambientResult.code === 0) {
          const mixedPath = options.chapterPath.replace(/\.wav$/i, '_ambient_mix.wav');
          const mixResult = await mixAmbientWithVoice(currentPath, ambientPath, mixedPath);
          if (mixResult.code === 0) {
            currentPath = mixedPath;
          }
          // Clean up ambient temp
          if (fs.existsSync(ambientPath)) fs.unlinkSync(ambientPath);
        }
      }
    } catch (error) {
      console.warn('⚠️ Ambient mix failed, continuing without:', error);
    }
  }

  // ── Intro ──
  if (musicEnabled && !fs.existsSync(introPath)) {
    try {
      const metadata = loadAudiobookMetadata(options.bookTitle);
      const bookTitle = metadata?.title ?? options.bookTitle;
      const author = metadata?.author ?? 'Unknown author';
      const chapterTitle = metadata?.chapters?.[options.chapterIndex - 1]?.title
        || `Chapter ${options.chapterIndex}`;
      const introLanguage = normalizeTargetLanguage(
        (global as any).TARGET_LANGUAGE || metadata?.language || null
      );

      const bookInfo: BookInfo = {
        genre: 'unknown', tone: 'neutral', voiceTone: 'neutral',
        period: 'modern', locked: false,
      };

      const musicResult = await selectMusicTrack(bookInfo);

      const introSpec = options.chapterIndex === 1
        ? buildBookIntroSpec(bookTitle, author, chapterTitle)
        : buildChapterIntroSpec(options.chapterIndex, chapterTitle);

      await generateIntro(
        introSpec,
        musicResult.asset,
        INTRO_NARRATOR_VOICE,
        introPath,
        introLanguage
      );
    } catch (error) {
      console.warn('⚠️ Intro generation failed:', error);
    }
  }

  // ── Concat intro + chapter ──
  if (fs.existsSync(introPath)) {
    const concatResult = await prependIntro(introPath, currentPath, soundscapePath);
    if (concatResult.code === 0) {
      // Clean up intermediate files
      if (currentPath !== options.chapterPath && fs.existsSync(currentPath)) {
        fs.unlinkSync(currentPath);
      }
      if (fs.existsSync(introPath)) fs.unlinkSync(introPath);
      return soundscapePath;
    }
  }

  // If we have a mixed file but no intro, rename to soundscape path
  if (currentPath !== options.chapterPath) {
    fs.renameSync(currentPath, soundscapePath);
    return soundscapePath;
  }

  return options.chapterPath;
}

// ========================================
// Compat: resolveChapterAudioPath
// ========================================

export function resolveChapterAudioPath(chapterPath: string): string {
  if (!isSoundscapeEnabled()) {
    return chapterPath;
  }
  const soundscapePath = getSoundscapeChapterPath(chapterPath);
  return fs.existsSync(soundscapePath) ? soundscapePath : chapterPath;
}

// ========================================
// Compat: getSoundscapeThemeOptions
// ========================================

export function getSoundscapeThemeOptions(
  _text: string,
  _maxOptions: number = 5
): Array<{ id: string; label: string; score: number }> {
  // In the new architecture, music selection is done via embeddings
  // This endpoint is kept for backward compatibility but returns empty
  // (the theme picker UI can be updated to use the new musicSelector API)
  console.warn('⚠️ getSoundscapeThemeOptions() is deprecated — use musicSelector.selectMusicTrack() instead');
  return [];
}

export type { SoundscapePreferences };
