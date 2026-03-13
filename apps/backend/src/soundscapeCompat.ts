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
 *   - getIntroAudioPath() — returns path to standalone intro audio
 *   - startEarlyIntroGeneration() — early intro generation (fire-and-forget)
 *   - generateAmbientBed() — ambient-bed-only OGG for progressive playback
 *   - prepareEarlyAmbient() — orchestrates early ambient bed during TTS
 */

import fs from 'fs';
import path from 'path';
import {
  isSoundscapeEnabled,
  INTRO_NARRATOR_VOICE,
  loadCatalog,
  initIntroGenerator,
  generateIntro,
  buildBookIntroSpec,
  buildChapterIntroSpec,
  generateSubchunkAmbientTrack,
  concatenateSubchunkAmbientTracks,
  selectMusicTrack,
  resolveByKeyword,
  resolveAmbientAsset,
  resolveSfxEvents,
  resolveSceneSegmentAssets,
  analyzeChapterScene,
  buildFallbackScene,
  getAudioDuration,
  detectSilenceGaps,
  runFfmpeg,
  buildSubchunkSegmentInfos,
  mapSfxEventsToSubchunks,
  groupMappedEventsBySubchunk,
  buildPlacedSfxEvents,
  calculateSfxOffsetFromGaps,
} from '../../../soundscape/src/index.js';
import type { SoundscapePreferences, BookInfo, SceneAnalysis, SceneSegment, SoundAsset } from '../../../soundscape/src/index.js';

import { synthesizeText } from './ttsClient.js';
import { loadAudiobookMetadata, getSubChunkPath } from './audiobookManager.js';
import { estimateAudioDuration } from './tempChunkManager.js';
import type { TwoSpeakerChunk } from './twoSpeakerChunker.js';
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
// Alt 4: Early ambient bed cache
// ========================================

/**
 * Module-level cache for early ambient analysis results.
 * Keyed by `${bookTitle}:${chapterIndex}`.
 * Populated by prepareEarlyAmbient(), consumed by applySoundscapeToChapter().
 */
const earlyAmbientCache = new Map<string, {
  scene: SceneAnalysis;
  segmentAssets: Array<{ asset: SoundAsset | null; score: number }>;
}>();

// ========================================
// Alt 4: generateAmbientBed
// ========================================

/**
 * Generate an ambient-bed-only OGG track for a chapter using estimated duration.
 * No silence gaps or SFX — just the ambient environment with scene crossfades.
 *
 * Used for chapter 1 during progressive TTS: the ambient bed plays alongside
 * voice subchunks. After chapter consolidation, applySoundscapeToChapter()
 * regenerates the full ambient with gap-based SFX placement.
 *
 * Duration estimation: ~150ms per character (average TTS speech rate).
 *
 * @param options.bookTitle     - Book title
 * @param options.chapterIndex  - Chapter index
 * @param options.chapterPath   - Expected chapter OGG path (used to derive ambient path)
 * @param options.chapterText   - Full chapter text (for duration estimation + segment mapping)
 * @param options.scene         - Pre-computed SceneAnalysis
 * @param options.segmentAssets - Pre-resolved per-segment ambient assets
 * @returns Path to generated ambient OGG, or null if generation failed
 */
export async function generateAmbientBed(options: {
  bookTitle: string;
  chapterIndex: number;
  chapterPath: string;
  chapterText: string;
  scene: SceneAnalysis;
  segmentAssets: Array<{ asset: SoundAsset | null; score: number }>;
}): Promise<string | null> {
  if (!isSoundscapeEnabled()) return null;

  const ambientPath = getAmbientTrackPath(options.chapterPath);

  // Already exists — skip (either bed or full version)
  if (fs.existsSync(ambientPath)) return ambientPath;

  const estimatedDurationMs = options.chapterText.length * 150;

  // Q3: intensity-adjusted volume (base 0 dB for audible ambient, adjusted by scene intensity)
  const volumeDb = 0 - (1 - options.scene.intensity) * 3;

  // Build ambient segments from scene segments + resolved assets
  // Q1: skip pushing a segment if its asset.filePath equals the previous segment's
  const ambientSegments: Array<{ asset: SoundAsset; startMs: number }> = [];
  let prevAssetPath: string | null = null;

  for (let i = 0; i < options.scene.sceneSegments.length; i++) {
    const seg = options.scene.sceneSegments[i];
    const asset = options.segmentAssets[i]?.asset;
    if (!asset || !fs.existsSync(asset.filePath)) continue;

    // Q1: skip consecutive duplicate assets
    if (asset.filePath === prevAssetPath) continue;
    prevAssetPath = asset.filePath;

    const startMs = i === 0
      ? 0
      : Math.round((seg.charIndex / options.chapterText.length) * estimatedDurationMs);

    ambientSegments.push({ asset, startMs });
  }

  if (ambientSegments.length === 0) {
    console.log(`  🔊 Ambient bed: No ambient segments resolved for chapter ${options.chapterIndex}`);
    return null;
  }

  try {
    const result = await generateSubchunkAmbientTrack(
      ambientSegments,
      estimatedDurationMs,
      volumeDb,
      ambientPath,
      null // No SFX for ambient bed
    );

    if (result.code === 0) {
      // Validate file has meaningful audio content via volumedetect (not just file size)
      try {
        const volResult = await runFfmpeg(['-i', ambientPath, '-af', 'volumedetect', '-f', 'null', '-']);
        const meanMatch = volResult.stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
        const meanVolume = meanMatch ? parseFloat(meanMatch[1]) : 0;
        if (meanVolume < -55) {
          console.log(`  🔊 Ambient bed: Effectively silent (mean ${meanVolume.toFixed(1)} dB) — removing`);
          try { fs.unlinkSync(ambientPath); } catch { /* ignore */ }
          return null;
        }
      } catch { /* volumedetect failed — keep the file */ }
      console.log(`  ✅ Ambient bed: Generated for chapter ${options.chapterIndex} (${(estimatedDurationMs / 1000).toFixed(1)}s estimated)`);
      return ambientPath;
    } else {
      console.warn(`  ⚠️ Ambient bed: ffmpeg failed for chapter ${options.chapterIndex}: ${result.stderr.substring(0, 200)}`);
      return null;
    }
  } catch (err) {
    console.warn(`  ⚠️ Ambient bed: Generation failed for chapter ${options.chapterIndex}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ========================================
// Alt 4: prepareEarlyAmbient
// ========================================

/**
 * Prepare ambient bed for a chapter during progressive TTS.
 * Runs scene analysis + asset resolution + ambient bed generation.
 * Designed to be called fire-and-forget as soon as chapter text is known.
 *
 * Caches scene analysis and resolved assets for later use by
 * applySoundscapeToChapter() (which will regenerate with full SFX).
 */
export async function prepareEarlyAmbient(options: {
  bookTitle: string;
  chapterIndex: number;
  chapterPath: string;
  chapterText: string;
}): Promise<void> {
  if (!isSoundscapeEnabled()) return;

  ensureInitialized();

  const cacheKey = `${options.bookTitle}:${options.chapterIndex}`;

  // Already cached — skip
  if (earlyAmbientCache.has(cacheKey)) return;

  // Build bookInfo from character registry (same pattern as applySoundscapeToChapter)
  const bookInfo: BookInfo = {
    genre: 'unknown', tone: 'neutral', voiceTone: 'neutral', period: 'modern', locked: false,
  };
  const bookDir = path.dirname(options.chapterPath);
  const registryPath = path.join(bookDir, 'character_registry.json');
  if (fs.existsSync(registryPath)) {
    try {
      const reg = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      if (reg.bookInfo) Object.assign(bookInfo, reg.bookInfo);
    } catch { /* ignore */ }
  }

  // Scene analysis
  let scene: SceneAnalysis;
  try {
    console.log(`  🔊 Early ambient: Running scene analysis for chapter ${options.chapterIndex}...`);
    scene = await analyzeChapterScene(options.chapterIndex, options.chapterText, bookInfo);
    console.log(`  🔊 Early ambient: env="${scene.sceneSegments[0]?.environment ?? 'unknown'}" sfxEvents=${scene.sfxEvents.length}`);
  } catch (llmErr) {
    console.warn(`  🔊 Early ambient: LLM analysis failed, using fallback:`, llmErr instanceof Error ? llmErr.message : llmErr);
    scene = buildFallbackScene(options.chapterIndex, options.chapterText, bookInfo);
  }

  // Resolve ambient assets for all scene segments
  let segmentAssets: Array<{ asset: SoundAsset | null; score: number }> = [];
  try {
    const resolved = await resolveSceneSegmentAssets(scene.sceneSegments);
    segmentAssets = resolved.map(r => ({ asset: r.asset, score: r.score }));
    console.log(`  🔍 Early ambient: ${segmentAssets.filter(r => r.asset).length}/${segmentAssets.length} segments matched`);
  } catch (err) {
    console.warn(`  ⚠️ Early ambient: Asset resolution failed:`, err instanceof Error ? err.message : err);
    // Fallback: keyword-resolve the dominant segment only
    const catalog = loadCatalog();
    const dominantSnippets = scene.sceneSegments[0]?.searchSnippets ?? [];
    const fallbackAsset = resolveByKeyword(dominantSnippets, catalog);
    segmentAssets = scene.sceneSegments.map((_, i) => ({
      asset: i === 0 ? fallbackAsset : null,
      score: 0,
    }));
  }

  // Store in cache for later use by applySoundscapeToChapter
  earlyAmbientCache.set(cacheKey, { scene, segmentAssets });

  // Generate ambient bed
  const result = await generateAmbientBed({
    bookTitle: options.bookTitle,
    chapterIndex: options.chapterIndex,
    chapterPath: options.chapterPath,
    chapterText: options.chapterText,
    scene,
    segmentAssets,
  });

  if (result) {
    console.log(`  ✅ Early ambient: Bed ready for chapter ${options.chapterIndex}`);
  } else {
    console.log(`  ⚠️ Early ambient: No bed generated for chapter ${options.chapterIndex}`);
  }
}

// ========================================
// Compat: applySoundscapeToChapter
// ========================================

/**
 * Apply soundscape to a single chapter.
 *
 * When `subChunks` is provided (Step 2 pipeline):
 *   ─ Runs the per-subchunk ambient+SFX path (Steps 2.2–2.6):
 *     1. Scene analysis (LLM or cached)
 *     2. Ambient asset resolution
 *     3. SFX events resolution (per-event, charIndex preserved)
 *     4. Map SFX events → subchunks (proportional charIndex mapping)
 *     5. For each subchunk: get actual TTS duration, calc SFX offsetMs,
 *        generate subchunk_N_M_ambient.ogg
 *     6. Concat all subchunk ambient OGGs → chapter_N_ambient.ogg
 *
 * When `subChunks` is absent (legacy path):
 *   ─ Falls back to the chapter-level ambient (ambient bed only, no SFX).
 *
 * Architecture: voice and ambient are SEPARATE independent OGG files.
 *   - Voice chapter: {chapter}.ogg (unchanged)
 *   - Ambient track: {chapter}_ambient.ogg (independent)
 *   - Intro: {chapter}_intro.ogg (standalone, served as chapter 0)
 */
export async function applySoundscapeToChapter(options: {
  bookTitle: string;
  chapterIndex: number;
  chapterPath: string;
  chapterText: string;
  /** TTS subchunks for this chapter — enables per-subchunk SFX timing (Step 2) */
  subChunks?: TwoSpeakerChunk[];
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

  // ── Ambient track ──
  // Alt 4: Delete existing ambient bed before regenerating with full SFX
  if (ambientEnabled && fs.existsSync(ambientPath)) {
    console.log(`  🔊 Ambient: Deleting existing ambient bed to regenerate with full SFX`);
    fs.unlinkSync(ambientPath);
  }
  const cacheKey = `${options.bookTitle}:${options.chapterIndex}`;
  if (ambientEnabled && !fs.existsSync(ambientPath)) {
    try {
      // Check early ambient cache first (populated by prepareEarlyAmbient)
      const cached = earlyAmbientCache.get(cacheKey);

      const bookInfo: BookInfo = {
        genre: 'unknown', tone: 'neutral', voiceTone: 'neutral', period: 'modern', locked: false,
      };
      const bookDir = path.dirname(options.chapterPath);
      const registryPath = path.join(bookDir, 'character_registry.json');
      if (fs.existsSync(registryPath)) {
        try {
          const reg = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
          if (reg.bookInfo) Object.assign(bookInfo, reg.bookInfo);
        } catch { /* ignore */ }
      }

      let scene: SceneAnalysis;
      if (cached) {
        console.log(`  🔊 Ambient: Using cached scene analysis for chapter ${options.chapterIndex}`);
        scene = cached.scene;
      } else {
        try {
          console.log(`  🔊 Ambient: Running LLM scene analysis for chapter ${options.chapterIndex}...`);
          scene = await analyzeChapterScene(options.chapterIndex, options.chapterText, bookInfo);
          console.log(`  🔊 Ambient: env="${scene.sceneSegments[0]?.environment ?? 'unknown'}" sfxEvents=${scene.sfxEvents.length}`);
        } catch (llmErr) {
          console.warn(`  🔊 Ambient: LLM analysis failed, using fallback:`, llmErr instanceof Error ? llmErr.message : llmErr);
          scene = buildFallbackScene(options.chapterIndex, options.chapterText, bookInfo);
        }
      }

      // Save scene analysis JSON to audiobook folder for debugging/evaluation
      try {
        const sceneJsonPath = path.join(bookDir, `scene_analysis_chapter_${options.chapterIndex}.json`);
        fs.writeFileSync(sceneJsonPath, JSON.stringify(scene, null, 2), 'utf-8');
        console.log(`  📋 Scene analysis saved: ${path.basename(sceneJsonPath)}`);
      } catch (sceneErr) {
        console.warn(`  ⚠️ Failed to save scene analysis JSON:`, sceneErr instanceof Error ? sceneErr.message : sceneErr);
      }

      // Resolve ambient asset (using dominant scene segment for chapter-level check)
      let ambientAsset = null;
      let resolveMethod = 'none';
      const dominantSnippets = scene.sceneSegments[0]?.searchSnippets ?? [];
      try {
        const result = await resolveAmbientAsset(dominantSnippets, `chapter ${options.chapterIndex}`);
        ambientAsset = result?.asset ?? null;
        if (ambientAsset) resolveMethod = `embedding (score=${result!.score.toFixed(3)})`;
      } catch (embErr) {
        const catalog = loadCatalog();
        ambientAsset = resolveByKeyword(dominantSnippets, catalog);
        if (ambientAsset) resolveMethod = 'keyword-fallback';
      }

      if (!ambientAsset || !fs.existsSync(ambientAsset.filePath)) {
        console.log(`  🔊 Ambient: No usable asset — skipping ambient layer`);
      } else {
        console.log(`  🔊 Ambient: Resolved via ${resolveMethod}: "${ambientAsset.description?.substring(0, 80)}"`);

        if (options.subChunks && options.subChunks.length > 0) {
          // Per-subchunk ambient + SFX pipeline
          await generateChapterSoundscapeFromSubchunks({
            scene,
            ambientVolumeDb: 0,
            chapterPath: options.chapterPath,
            ambientPath,
            bookTitle: options.bookTitle,
            bookDir,
            chapterIndex: options.chapterIndex,
            subChunks: options.subChunks,
            chapterText: options.chapterText,
          });
        } else {
          console.log(`  🔊 Ambient: No subchunks available — skipping ambient (subchunks required)`);
        }
      }
    } catch (error) {
      console.error('⚠️ Ambient generation failed, continuing without:', error);
    }

    // Clean up cache entry after use
    earlyAmbientCache.delete(cacheKey);
  }

  // ── Intro ──
  if (musicEnabled && !fs.existsSync(introPath)) {
    if (options.chapterIndex === 1) {
      console.warn('  🎵 Chapter 1 intro not found — was expected from early generation');
    } else {
      try {
        const metadata = loadAudiobookMetadata(options.bookTitle);
        const chapterTitle = metadata?.chapters?.[options.chapterIndex - 1]?.title
          || `Chapter ${options.chapterIndex}`;
        const introLanguage = normalizeTargetLanguage(
          (global as any).TARGET_LANGUAGE || metadata?.language || null
        );
        const bookInfo: BookInfo = {
          genre: 'unknown', tone: 'neutral', voiceTone: 'neutral', period: 'modern', locked: false,
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
        await generateIntro(introSpec, musicResult.asset, INTRO_NARRATOR_VOICE, introPath, introLanguage);
      } catch (error) {
        console.warn('⚠️ Intro generation failed:', error);
      }
    }
  }

  // ── Temporary: mix voice + ambient into single file for timing verification ──
  const finalAmbientPath = getAmbientTrackPath(options.chapterPath);
  if (fs.existsSync(finalAmbientPath) && fs.existsSync(options.chapterPath)) {
    const mixedPath = options.chapterPath.replace(/\.ogg$/i, '_mixed.ogg');
    try {
      console.log(`  🔀 Mixing voice + ambient → ${path.basename(mixedPath)} (TEMP for timing check)`);
      const mixResult = await runFfmpeg([
        '-i', options.chapterPath,
        '-i', finalAmbientPath,
        '-filter_complex',
        '[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=2',
        '-ar', '48000',
        '-ac', '2',
        '-c:a', 'libopus',
        mixedPath,
      ]);
      if (mixResult.code === 0) {
        console.log(`  ✅ Mixed file: ${path.basename(mixedPath)}`);
      } else {
        console.warn(`  ⚠️ Mix failed: ${mixResult.stderr.substring(0, 200)}`);
      }
    } catch (mixErr) {
      console.warn(`  ⚠️ Mix error:`, mixErr instanceof Error ? mixErr.message : mixErr);
    }
  }

  return options.chapterPath;
}

// ========================================
// Step 2: Per-subchunk soundscape orchestration
// ========================================

/**
 * Generate the chapter ambient track using the per-subchunk SFX pipeline.
 *
 * For each TTS subchunk:
 *   1. Resolve per-segment ambient assets via resolveSceneSegmentAssets()
 *   2. Detect silence gaps in the subchunk WAV via detectSilenceGaps()
 *   3. Map scene segments (charIndex) → silence gap offsets for ambient changes
 *   4. Map SFX events → silence gap offsets; apply no-layering, no-boundary-crossing,
 *      no-ambient-crossfade-overlap constraints
 *   5. Generate subchunk_N_M_ambient.ogg (multi-ambient + timed SFX)
 * After all subchunks: concat → chapter_N_ambient.ogg (with 2s fade-in/out)
 *
 * @internal — called from applySoundscapeToChapter when subChunks are provided
 */
async function generateChapterSoundscapeFromSubchunks(options: {
  scene: SceneAnalysis;
  ambientVolumeDb: number;
  chapterPath: string;
  ambientPath: string;
  bookTitle: string;
  bookDir: string;
  chapterIndex: number;
  subChunks: TwoSpeakerChunk[];
  chapterText: string;
}): Promise<void> {
  const {
    scene, ambientVolumeDb,
    chapterPath, ambientPath, bookTitle, bookDir, chapterIndex, subChunks, chapterText,
  } = options;

  console.log(`  🎯 Per-subchunk soundscape: ${subChunks.length} subchunks, ${scene.sceneSegments.length} scene segment(s), ${scene.sfxEvents.length} SFX events`);

  // Resolve per-segment ambient assets (once for whole chapter)
  let segmentAssets: Array<{ segment: SceneSegment; asset: SoundAsset | null; score: number }> = [];
  try {
    segmentAssets = await resolveSceneSegmentAssets(scene.sceneSegments);
    console.log(`  🔍 Scene segments resolved: ${segmentAssets.filter((r) => r.asset).length}/${segmentAssets.length} matched`);
  } catch (err) {
    console.warn(`  ⚠️ Scene segment resolution failed, using fallback keyword:`, err instanceof Error ? err.message : err);
    // Fallback: keyword-resolve the dominant segment only
    const catalog = loadCatalog();
    const dominantSnippets = scene.sceneSegments[0]?.searchSnippets ?? [];
    const fallbackAsset = resolveByKeyword(dominantSnippets, catalog);
    segmentAssets = scene.sceneSegments.map((seg, i) => ({
      segment: seg,
      asset: i === 0 ? fallbackAsset : null,
      score: 0,
    }));
  }

  // Build subchunk segment infos (character boundaries)
  const segmentInfos = buildSubchunkSegmentInfos(subChunks);

  // Map SFX events to subchunks using proportional charIndex
  const mappedSfxEvents = mapSfxEventsToSubchunks(scene.sfxEvents, chapterText.length, segmentInfos);
  const sfxEventsBySubchunk = groupMappedEventsBySubchunk(mappedSfxEvents);

  // Resolve SFX assets for all events (batch embedding search)
  let sfxAssetMap = new Map<string, { asset: SoundAsset; score: number }>();
  if (scene.sfxEvents.length > 0) {
    try {
      const resolved = await resolveSfxEvents(scene.sfxEvents);
      for (const r of resolved) {
        if (r.asset) {
          sfxAssetMap.set(r.sfxEvent.query, { asset: r.asset, score: r.score });
          console.log(`  🎯 SFX: "${r.sfxEvent.description.substring(0, 50)}" → "${r.asset.description?.substring(0, 40)}" (score=${r.score.toFixed(3)})`);
        } else {
          console.log(`  🎯 SFX: "${r.sfxEvent.description.substring(0, 50)}" → no match`);
        }
      }
    } catch (sfxErr) {
      console.log(`  🎯 SFX: Resolution failed (non-critical): ${sfxErr instanceof Error ? sfxErr.message : sfxErr}`);
    }
  }

  // Save resolution results for evaluation tool
  try {
    const resolutionData = {
      chapterIndex,
      timestamp: new Date().toISOString(),
      ambientResolutions: segmentAssets.map((r) => ({
        environment: r.segment.environment,
        searchSnippets: r.segment.searchSnippets,
        resolvedAsset: r.asset ? {
          id: r.asset.id,
          description: r.asset.description,
          filePath: r.asset.filePath,
        } : null,
        cosineSimilarity: r.score,
      })),
      sfxResolutions: scene.sfxEvents.map((evt) => {
        const resolved = sfxAssetMap.get(evt.query);
        return {
          query: evt.query,
          description: evt.description,
          charIndex: evt.charIndex,
          resolvedAsset: resolved ? {
            id: resolved.asset.id,
            description: resolved.asset.description,
            filePath: resolved.asset.filePath,
          } : null,
          cosineSimilarity: resolved?.score ?? 0,
        };
      }),
    };
    const resJsonPath = path.join(bookDir, `soundscape_resolution_chapter_${chapterIndex}.json`);
    fs.writeFileSync(resJsonPath, JSON.stringify(resolutionData, null, 2), 'utf-8');
    console.log(`  📋 Resolution results saved: ${path.basename(resJsonPath)}`);
  } catch (resErr) {
    console.warn(`  ⚠️ Failed to save resolution JSON:`, resErr instanceof Error ? resErr.message : resErr);
  }

  // Pre-fetch SFX asset durations (for no-boundary-crossing constraint)
  const sfxDurations = new Map<string, number>();
  for (const { asset } of sfxAssetMap.values()) {
    if (!sfxDurations.has(asset.filePath)) {
      try {
        const durSec = await getAudioDuration(asset.filePath);
        sfxDurations.set(asset.filePath, Math.round(durSec * 1000));
      } catch { /* ignore — 0 means no duration check */ }
    }
  }

  // Generate per-subchunk ambient OGGs
  const subchunkAmbientPaths: string[] = [];
  const chapterDir = path.dirname(chapterPath);

  for (const info of segmentInfos) {
    const subchunkAmbientPath = path.join(
      chapterDir,
      `chapter_${chapterIndex}_sub${info.subchunkIndex}_ambient.ogg`
    );

    // Skip if already generated (resume support)
    if (fs.existsSync(subchunkAmbientPath)) {
      subchunkAmbientPaths.push(subchunkAmbientPath);
      continue;
    }

    // Get actual TTS duration and silence gaps for this subchunk
    const subchunkWavPath = getSubChunkPath(bookTitle, chapterIndex, info.subchunkIndex);
    let subchunkDurationMs = 0;
    let silenceGaps: Array<{ startSec: number; endSec: number; midpointMs: number }> = [];

    if (fs.existsSync(subchunkWavPath)) {
      try {
        const durSec = await getAudioDuration(subchunkWavPath);
        subchunkDurationMs = durSec * 1000;
        silenceGaps = await detectSilenceGaps(subchunkWavPath);
        // Q4: Filter out gaps shorter than 200ms
        silenceGaps = silenceGaps.filter(g => (g.endSec - g.startSec) >= 0.2);
        console.log(`    Subchunk ${info.subchunkIndex}: ${durSec.toFixed(1)}s, ${silenceGaps.length} silence gaps`);
      } catch {
        subchunkDurationMs = info.charCount * 150; // fallback estimate
      }
    }

    if (subchunkDurationMs <= 0) {
      console.warn(`  ⚠️ Subchunk ${chapterIndex}:${info.subchunkIndex} has no duration — skipping ambient`);
      continue;
    }

    // Determine which scene segments are active for this subchunk
    const subchunkStartChar = info.cumulativeCharStart;
    const subchunkEndChar = info.cumulativeCharStart + info.charCount;
    const totalSubchunkChars = segmentInfos.reduce((s, si) => s + si.charCount, 0);

    // Compute ambient segments for this subchunk:
    // Find the scene segment active at the start of this subchunk (highest charIndex ≤ subchunkStartChar,
    // remapped from chapterText space to subchunk char space).
    // Any scene segments that start *within* this subchunk are ambient change points.
    const ambientSegmentsForSubchunk: Array<{ asset: SoundAsset; startMs: number }> = [];

    // Determine which chapter-level scene is active at the start of this subchunk
    // by mapping subchunkStartChar through the chapterText proportion
    const subchunkStartProportion = totalSubchunkChars > 0 ? subchunkStartChar / totalSubchunkChars : 0;
    const subchunkStartChapterChar = Math.round(subchunkStartProportion * chapterText.length);

    // Active segment at subchunk start: highest charIndex in sceneSegments that is ≤ subchunkStartChapterChar
    let activeSegmentIndex = 0;
    for (let si = 0; si < scene.sceneSegments.length; si++) {
      if (scene.sceneSegments[si].charIndex <= subchunkStartChapterChar) {
        activeSegmentIndex = si;
      }
    }

    // Start with the active segment at startMs=0
    const firstSegAsset = segmentAssets[activeSegmentIndex]?.asset;
    if (firstSegAsset) {
      ambientSegmentsForSubchunk.push({ asset: firstSegAsset, startMs: 0 });
    }

    // Find any scene segments that begin within this subchunk
    for (let si = activeSegmentIndex + 1; si < scene.sceneSegments.length; si++) {
      const seg = scene.sceneSegments[si];
      // Map seg.charIndex from chapter space to subchunk char space proportion
      const segProportion = chapterText.length > 0 ? seg.charIndex / chapterText.length : 0;
      const segSubchunkChar = Math.round(segProportion * totalSubchunkChars);

      if (segSubchunkChar < subchunkStartChar || segSubchunkChar >= subchunkEndChar) continue;

      // This segment starts within this subchunk — map to a silence gap
      const localCharIndex = segSubchunkChar - subchunkStartChar;
      const segOffsetMs = calculateSfxOffsetFromGaps(localCharIndex, info.charCount, silenceGaps);
      if (segOffsetMs === null) continue; // no suitable gap — skip this ambient change

      const segAsset = segmentAssets[si]?.asset;
      if (!segAsset) continue; // no match for this segment — skip change

      // Q1: skip if same asset as previous segment (avoids dip-and-return crossfade artifact)
      const prevAsset = ambientSegmentsForSubchunk[ambientSegmentsForSubchunk.length - 1];
      if (prevAsset && segAsset.filePath === prevAsset.asset.filePath) continue;

      ambientSegmentsForSubchunk.push({ asset: segAsset, startMs: segOffsetMs });
    }

    // Fall back to at least one ambient segment (if none could be placed)
    if (ambientSegmentsForSubchunk.length === 0) {
      console.warn(`  ⚠️ Subchunk ${chapterIndex}:${info.subchunkIndex}: no ambient segments resolved — skipping ambient`);
      continue;
    }

    // Ambient change offsets for SFX exclusion check
    const ambientChangeOffsets = ambientSegmentsForSubchunk
      .filter((_, i) => i > 0)
      .map((seg) => seg.startMs);

    // Build placed SFX events for this subchunk
    const eventsForThis = sfxEventsBySubchunk.get(info.subchunkIndex) ?? [];
    const placedSfx = buildPlacedSfxEvents(
      eventsForThis,
      sfxAssetMap,
      info.charCount,
      subchunkDurationMs,
      silenceGaps,
      ambientChangeOffsets,
      sfxDurations
    );

    const result = await generateSubchunkAmbientTrack(
      ambientSegmentsForSubchunk,
      subchunkDurationMs,
      ambientVolumeDb,
      subchunkAmbientPath,
      placedSfx.length > 0 ? placedSfx : null
    );

    if (result.code === 0) {
      subchunkAmbientPaths.push(subchunkAmbientPath);
    } else {
      console.warn(`  ⚠️ Subchunk ${chapterIndex}:${info.subchunkIndex} ambient failed — skipping`);
    }
  }

  if (subchunkAmbientPaths.length === 0) {
    console.warn(`  ⚠️ No subchunk ambient tracks generated — ambient track skipped`);
    return;
  }

  // Concatenate subchunk ambient OGGs → chapter ambient (with 2s fade-in/out)
  const concatResult = await concatenateSubchunkAmbientTracks(subchunkAmbientPaths, ambientPath);
  if (concatResult.code === 0) {
    const dur = await getAudioDuration(ambientPath);
    console.log(`  ✅ Chapter ambient: ${path.basename(ambientPath)} (${dur.toFixed(1)}s, ${subchunkAmbientPaths.length} subchunks)`);

    // Clean up per-subchunk ambient files
    for (const p of subchunkAmbientPaths) {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
  } else {
    console.error(`  ❌ Chapter ambient concat failed`);
  }
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

// ========================================
// Compat: getIntroAudioPath
// ========================================

/**
 * Get the path to the standalone intro audio for a chapter.
 * Returns null if intro doesn't exist.
 */
export function getIntroAudioPath(chapterPath: string): string | null {
  if (!isSoundscapeEnabled()) return null;
  const introPath = getIntroPath(chapterPath);
  return fs.existsSync(introPath) ? introPath : null;
}

export type { SoundscapePreferences };
