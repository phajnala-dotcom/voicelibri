/**
 * Soundscape Integration — Compatibility Layer
 *
 * Soundscape integration layer.
 * Provides the same public API surface used by index.ts and audiobookWorker.ts,
 * but delegates to the new modular soundscape/ pipeline.
 *
 * Architecture (per prompt spec):
 *   - Voice and soundscape are rendered as two INDEPENDENT OGG Opus tracks — no mixing.
 *   - Ambient track is generated as a separate _ambient.ogg file.
 *   - Intro is generated as a separate _intro.ogg file and prepended to voice only.
 *   - LLM Director is used for scene analysis (supports all languages).
 *   - ffprobe is used for exact audio durations.
 *
 * Exports:
 *   - applySoundscapeToChapter() — called by audiobookWorker after consolidation
 *   - resolveChapterAudioPath() — called by index.ts for audio streaming
 *   - getAmbientAudioPath() — returns path to separate ambient track
 *   - getSoundscapeThemeOptions() — called by index.ts for theme picker UI
 */

import fs from 'fs';
import path from 'path';
import { isSoundscapeEnabled, INTRO_NARRATOR_VOICE } from '../../../soundscape/src/config.js';
import { loadCatalog } from '../../../soundscape/src/catalogLoader.js';
import { initIntroGenerator, generateIntro, buildBookIntroSpec, buildChapterIntroSpec } from '../../../soundscape/src/introGenerator.js';
import { generateAmbientTrack } from '../../../soundscape/src/ambientLayer.js';
import { selectMusicTrack } from '../../../soundscape/src/musicSelector.js';
import { resolveByKeyword, resolveAmbientAsset, resolveSfxAssets } from '../../../soundscape/src/assetResolver.js';
import { analyzeChapterScene, buildFallbackScene } from '../../../soundscape/src/llmDirector.js';
import { getAudioDuration } from '../../../soundscape/src/ffmpegRunner.js';
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
// Early intro generation (fire-and-forget)
// ========================================

/**
 * Generate intro (before chapter TTS).
 * Called from index.ts after CharacterRegistry is first saved.
 * Runs sequentially — completes before chapter TTS starts.
 *
 * @returns Path to generated intro OGG, or null on failure
 */
export async function startEarlyIntroGeneration(options: {
  bookTitle: string;
  chapterPath: string;
}): Promise<string | null> {
  if (!isSoundscapeEnabled()) return null;

  ensureInitialized();

  const introPath = getIntroPath(options.chapterPath);

  // Already exists — skip
  if (fs.existsSync(introPath)) {
    console.log(`🎵 Intro: Already exists at ${path.basename(introPath)}`);
    return introPath;
  }

  try {
    const metadata = loadAudiobookMetadata(options.bookTitle);
    const bookTitle = metadata?.title ?? options.bookTitle;
    const author = metadata?.author ?? 'Unknown author';
    const chapterTitle = metadata?.chapters?.[0]?.title || 'Chapter 1';
    const introLanguage = normalizeTargetLanguage(
      (global as any).TARGET_LANGUAGE || metadata?.language || null
    );

    const bookInfo: BookInfo = {
      genre: 'unknown', tone: 'neutral', voiceTone: 'neutral',
      period: 'modern', locked: false,
    };

    const bookDir = path.dirname(options.chapterPath);
    const registryPath = path.join(bookDir, 'character_registry.json');
    if (fs.existsSync(registryPath)) {
      try {
        const reg = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
        if (reg.bookInfo) Object.assign(bookInfo, reg.bookInfo);
      } catch { /* ignore */ }
    }

    bookInfo.title = metadata?.title ?? options.bookTitle;
    bookInfo.author = metadata?.author ?? undefined;

    console.log(`🎵 Early intro: Starting music selection for "${bookTitle}"...`);
    const musicResult = await selectMusicTrack(bookInfo);
    console.log(`🎵 Early intro: Music selected — ${musicResult.matchReason}`);

    const introSpec = buildBookIntroSpec(bookTitle, author, chapterTitle);

    console.log(`🎵 Early intro: Generating intro audio...`);
    await generateIntro(
      introSpec,
      musicResult.asset,
      INTRO_NARRATOR_VOICE,
      introPath,
      introLanguage
    );

    console.log(`✅ Early intro: Generated at ${path.basename(introPath)}`);
    return introPath;
  } catch (error) {
    console.warn('⚠️ Early intro generation failed:', error);
    return null;
  }
}

// ========================================
// Path helpers
// ========================================

function getIntroPath(chapterPath: string): string {
  return chapterPath.replace(/\.ogg$/i, '_intro.ogg');
}

/** Path for the independent ambient track (separate from voice) */
function getAmbientTrackPath(chapterPath: string): string {
  return chapterPath.replace(/\.ogg$/i, '_ambient.ogg');
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

// ========================================
// Compat: applySoundscapeToChapter
// ========================================

/**
 * Apply soundscape to a single chapter — backward-compatible API.
 *
 * Architecture: voice and ambient are SEPARATE independent OGG files.
 *   - Voice chapter: {chapter}.ogg (unchanged)
 *   - Ambient track: {chapter}_ambient.ogg (independent, same duration as voice + pre/post roll)
 *   - Intro: prepended to voice only → {chapter}_soundscape.ogg
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

  const introPath = getIntroPath(options.chapterPath);
  const ambientPath = getAmbientTrackPath(options.chapterPath);

  // ── Ambient track (separate, independent OGG — NOT mixed with voice) ──
  if (ambientEnabled && !fs.existsSync(ambientPath)) {
    try {
      console.log(`  🔊 Ambient: Starting for chapter ${options.chapterIndex}...`);

      // Load book info from character registry
      const bookInfo: BookInfo = {
        genre: 'unknown',
        tone: 'neutral',
        voiceTone: 'neutral',
        period: 'modern',
        locked: false,
      };

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

      console.log(`  🔊 Ambient: bookInfo = ${JSON.stringify(bookInfo)}`);

      // Use LLM scene analysis for language-agnostic scene extraction
      // Falls back to keyword-based if LLM call fails
      let scene;
      try {
        console.log(`  🔊 Ambient: Running LLM scene analysis...`);
        scene = await analyzeChapterScene(
          options.chapterIndex,
          options.chapterText,
          bookInfo
        );
        console.log(`  🔊 Ambient: LLM scene: env="${scene.environment}" sounds=[${scene.soundElements.join(',')}] snippets=${scene.searchSnippets.length}`);
      } catch (llmErr) {
        console.warn(`  🔊 Ambient: LLM analysis failed, using keyword fallback:`, llmErr instanceof Error ? llmErr.message : llmErr);
        scene = buildFallbackScene(options.chapterIndex, options.chapterText, bookInfo);
        console.log(`  🔊 Ambient: Fallback scene: env="${scene.environment}" sounds=[${scene.soundElements.join(',')}]`);
      }

      // Resolve best matching ambient asset via embedding search
      let ambientAsset = null;
      let resolveMethod = 'none';
      try {
        const result = await resolveAmbientAsset(scene);
        ambientAsset = result?.asset ?? null;
        if (ambientAsset) {
          resolveMethod = `embedding (score=${result!.score.toFixed(3)})`;
        }
      } catch (embErr) {
        console.log(`  🔊 Ambient: Embedding search failed: ${embErr instanceof Error ? embErr.message : embErr}`);
        const catalog = loadCatalog();
        ambientAsset = resolveByKeyword(scene, catalog);
        if (ambientAsset) resolveMethod = 'keyword-fallback';
      }

      if (!ambientAsset) {
        console.log(`  🔊 Ambient: No matching asset found — skipping ambient layer`);
      } else if (!fs.existsSync(ambientAsset.filePath)) {
        console.log(`  🔊 Ambient: Asset found but file missing: ${ambientAsset.filePath}`);
      } else {
        console.log(`  🔊 Ambient: Resolved via ${resolveMethod}: "${ambientAsset.description?.substring(0, 80)}" (${ambientAsset.id})`);
        console.log(`  🔊 Ambient: File: ${ambientAsset.filePath} (${ambientAsset.durationSec?.toFixed(1) ?? '?'}s)`);

        // Resolve SFX assets to overlay into the ambient track (multiple per chapter)
        let sfxAssets: import('../../../soundscape/src/types.js').SoundAsset[] = [];
        try {
          const sfxResults = await resolveSfxAssets(scene);
          if (sfxResults.length > 0) {
            sfxAssets = sfxResults.map(r => r.asset);
            for (const r of sfxResults) {
              console.log(`  🎯 SFX: Resolved "${r.asset.description?.substring(0, 60)}" (score=${r.score.toFixed(3)})`);
            }
          } else {
            console.log(`  🎯 SFX: No matching SFX found for this chapter`);
          }
        } catch (sfxErr) {
          console.log(`  🎯 SFX: Resolution failed (non-critical): ${sfxErr instanceof Error ? sfxErr.message : sfxErr}`);
        }

        // Get exact voice duration via ffprobe (not heuristic)
        const speechDurationSec = await getAudioDuration(options.chapterPath);
        const speechDurationMs = speechDurationSec * 1000;
        console.log(`  🔊 Ambient: Voice duration = ${speechDurationSec.toFixed(1)}s (ffprobe)`);

        if (speechDurationMs > 0) {
          // Generate ambient (+ optional SFX overlay) as INDEPENDENT OGG file
          const ambientResult = await generateAmbientTrack(
            ambientAsset,
            speechDurationMs,
            -6,
            ambientPath,
            sfxAssets.length > 0 ? sfxAssets : null
          );

          if (ambientResult.code === 0) {
            const ambientDuration = await getAudioDuration(ambientPath);
            console.log(`  ✅ Ambient: Generated separate track → ${path.basename(ambientPath)} (${ambientDuration.toFixed(1)}s)`);
          } else {
            console.error(`  ❌ Ambient: Generation failed`);
          }
        } else {
          console.warn(`  🔊 Ambient: Could not determine voice duration — skipping`);
        }
      }
    } catch (error) {
      console.error('⚠️ Ambient generation failed, continuing without:', error);
    }
  }

  // ── Intro ──
  if (musicEnabled && !fs.existsSync(introPath)) {
    if (options.chapterIndex === 1) {
      // Chapter 1 intro is generated synchronously before chapter TTS starts
      // — if we reach here, it means the early generation was skipped or failed
      console.warn('  🎵 Chapter 1 intro not found — was expected from early generation');
    } else {
      // Chapters 2+: generate chapter intro inline
      try {
        const metadata = loadAudiobookMetadata(options.bookTitle);
        const chapterTitle = metadata?.chapters?.[options.chapterIndex - 1]?.title
          || `Chapter ${options.chapterIndex}`;
        const introLanguage = normalizeTargetLanguage(
          (global as any).TARGET_LANGUAGE || metadata?.language || null
        );

        const bookInfo: BookInfo = {
          genre: 'unknown', tone: 'neutral', voiceTone: 'neutral',
          period: 'modern', locked: false,
        };

        const bookDir = path.dirname(options.chapterPath);
        const registryPath = path.join(bookDir, 'character_registry.json');
        if (fs.existsSync(registryPath)) {
          try {
            const reg = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
            if (reg.bookInfo) Object.assign(bookInfo, reg.bookInfo);
          } catch { /* ignore */ }
        }

        bookInfo.title = metadata?.title ?? options.bookTitle;
        bookInfo.author = metadata?.author ?? undefined;

        const musicResult = await selectMusicTrack(bookInfo);
        const introSpec = buildChapterIntroSpec(options.chapterIndex, chapterTitle);

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
  }

  // Intro stays as standalone _intro.ogg — served separately as chapter 0.
  // Voice chapter stays clean (no concat). Ambient is also independent.
  return options.chapterPath;
}

// ========================================
// Compat: resolveChapterAudioPath
// ========================================

/**
 * Resolve the voice audio path for chapter playback.
 * Intro is no longer baked in — served separately as chapter 0.
 */
export function resolveChapterAudioPath(chapterPath: string): string {
  return chapterPath;
}

// ========================================
// Compat: getAmbientAudioPath
// ========================================

/**
 * Get the path to the independent ambient track for a chapter.
 * Returns null if ambient doesn't exist.
 */
export function getAmbientAudioPath(chapterPath: string): string | null {
  if (!isSoundscapeEnabled()) return null;
  const ambientPath = getAmbientTrackPath(chapterPath);
  return fs.existsSync(ambientPath) ? ambientPath : null;
}

/**
 * Get the path to the standalone intro audio for a chapter.
 * Returns null if intro doesn't exist.
 */
export function getIntroAudioPath(chapterPath: string): string | null {
  if (!isSoundscapeEnabled()) return null;
  const introPath = getIntroPath(chapterPath);
  return fs.existsSync(introPath) ? introPath : null;
}

// ========================================
// Compat: getSoundscapeThemeOptions
// ========================================

export function getSoundscapeThemeOptions(
  _text: string,
  _maxOptions: number = 5
): Array<{ id: string; label: string; score: number }> {
  console.warn('⚠️ getSoundscapeThemeOptions() is deprecated — use musicSelector.selectMusicTrack() instead');
  return [];
}

export type { SoundscapePreferences };
