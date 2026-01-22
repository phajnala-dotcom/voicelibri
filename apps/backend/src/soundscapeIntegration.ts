import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { synthesizeText } from './ttsClient.js';
import { loadAudiobookMetadata } from './audiobookManager.js';
import { estimateAudioDuration } from './tempChunkManager.js';
import { ChapterTranslator } from './chapterTranslator.js';

interface SoundAsset {
  id: string;
  type: 'ambient' | 'music';
  genre?: string[];
  mood?: string[];
  recommendedVolumeDb?: number;
  filePath: string;
}

interface SoundLibraryCatalog {
  assets: SoundAsset[];
}

export interface SoundscapePreferences {
  soundscapeMusicEnabled?: boolean;
  soundscapeAmbientEnabled?: boolean;
  soundscapeThemeId?: string;
}

interface IntroSegment {
  type: 'music' | 'voice';
  durationMs: number;
  volumeDb?: number;
  text?: string;
  fadeInMs?: number;
  fadeOutMs?: number;
  musicBedVolumeDb?: number;
  musicBedFadeInMs?: number;
  musicBedFadeOutMs?: number;
}

const DEFAULT_KEYWORD_MAP: Record<string, string[]> = {
  forest: ['forest', 'woods', 'trees', 'pine', 'jungle'],
  rain: ['rain', 'storm', 'thunder', 'lightning'],
  sea: ['sea', 'ocean', 'wave', 'shore', 'harbor'],
  city: ['city', 'street', 'traffic', 'crowd', 'market'],
  interior: ['room', 'hall', 'castle', 'cathedral', 'church'],
  sciFi: ['spaceship', 'engine', 'hull', 'airlock', 'android'],
  fire: ['fire', 'flame', 'smoke', 'campfire'],
  wind: ['wind', 'breeze', 'gust'],
  cave: ['cave', 'tunnel', 'underground'],
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');
const DEFAULT_CATALOG_PATH = path.join(PROJECT_ROOT, 'soundscape', 'assets', 'catalog.json');

const DEFAULT_MIX_OPTIONS = {
  ambientDb: -6,
  fadeInMs: 1500,
  fadeOutMs: 2000,
};

const INTRO_FADE_MS = 3500;
const INTRO_END_SILENCE_MS = 3000;
const INTRO_CHAPTER_START_SILENCE_MS = 3000;
const INTRO_CHAPTER_GAP_MS = 2000;
const INTRO_TITLE_AUTHOR_GAP_MS = 2000;
const INTRO_AUTHOR_VOICELIBRI_GAP_MS = 4000;
const INTRO_VOICELIBRI_CHAPTER_GAP_MS = 4000;
const INTRO_END_MUSIC_EXTENSION_MS = 3750;
const RAMP_MS = 2000;
const MUSIC_FULL_BOOST_DB = 10.5;
const MUSIC_BACKGROUND_BOOST_DB = 4.5;
const MUSIC_BACKGROUND_DB = -21.5;
const INTRO_VOICE_BOOST_DB = 2;
const INTRO_NARRATOR_VOICE = 'Algieba';
const AMBIENT_FADE_MS = 2000;
const AMBIENT_PRE_ROLL_MS = 4000;
const AMBIENT_POST_ROLL_MS = 4000;

function applyMusicBoost(volumeDb: number, boostDb: number): number {
  return volumeDb + boostDb;
}

interface VoiceOverlay {
  startMs?: number;
  gapAfterMs?: number;
  text: string;
}

function buildBookIntroSequence(bookTitle: string, author: string, chapterTitle: string): { totalDurationMs: number; voiceOverlays: VoiceOverlay[]; endSilenceMs: number } {
  return {
    totalDurationMs: 35000 + INTRO_END_MUSIC_EXTENSION_MS,
    voiceOverlays: [
      { startMs: 12000, gapAfterMs: INTRO_TITLE_AUTHOR_GAP_MS, text: `${bookTitle}.` },
      { gapAfterMs: INTRO_AUTHOR_VOICELIBRI_GAP_MS, text: `${author}.` },
      { gapAfterMs: INTRO_VOICELIBRI_CHAPTER_GAP_MS, text: `This audiobook was brought to you by VoiceLibri.` },
      { text: `Chapter 1. ${chapterTitle}.` },
    ],
    endSilenceMs: INTRO_END_SILENCE_MS,
  };
}

function buildChapterIntroSequence(chapterNumber: number, chapterTitle: string): { totalDurationMs?: number; voiceOverlays: VoiceOverlay[]; endSilenceMs: number } {
  return {
    voiceOverlays: [
      { startMs: INTRO_CHAPTER_START_SILENCE_MS, gapAfterMs: INTRO_CHAPTER_GAP_MS, text: `Chapter ${chapterNumber}.` },
      { text: `${chapterTitle}.` },
    ],
    endSilenceMs: INTRO_END_SILENCE_MS,
  };
}

let catalogCache: SoundLibraryCatalog | null = null;
let introTranslator: ChapterTranslator | null = null;
const introTranslationCache = new Map<string, string>();

function getTempAudioDir(): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'voicelibri-intro-'));
  return base;
}

function normalizeTargetLanguage(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'unknown' || trimmed.toLowerCase() === 'auto-detect') return null;
  if (trimmed.includes('-')) return trimmed;
  const lower = trimmed.toLowerCase();
  const map: Record<string, string> = {
    en: 'en-US',
    sk: 'sk-SK',
    cs: 'cs-CZ',
    ru: 'ru-RU',
    de: 'de-DE',
    pl: 'pl-PL',
    hr: 'hr-HR',
    zh: 'zh-CN',
    nl: 'nl-NL',
    fr: 'fr-FR',
    hi: 'hi-IN',
    it: 'it-IT',
    ja: 'ja-JP',
    ko: 'ko-KR',
    pt: 'pt-BR',
    es: 'es-ES',
    uk: 'uk-UA',
  };
  return map[lower] ?? trimmed;
}

async function translateIntroText(text: string, targetLanguage: string | null): Promise<string> {
  if (!targetLanguage) return text;
  if (targetLanguage.toLowerCase().startsWith('en')) return text;
  if (targetLanguage === 'sk-SK' && text === 'This audiobook was brought to you by VoiceLibri.') {
    return 'Túto audioknihu Vám prináša VoiceLibri.';
  }
  const cacheKey = `${targetLanguage}::${text}`;
  const cached = introTranslationCache.get(cacheKey);
  if (cached) return cached;

  if (!introTranslator) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || '';
    if (!projectId) {
      return text;
    }
    introTranslator = new ChapterTranslator({
      projectId,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    });
  }

  try {
    const result = await introTranslator.translateChapter(text, targetLanguage);
    const translated = result.translatedText?.trim() || text;
    introTranslationCache.set(cacheKey, translated);
    return translated;
  } catch (error) {
    console.warn('⚠️ Intro translation failed, using original text:', error);
    return text;
  }
}

function isSoundscapeEnabled(): boolean {
  const raw = process.env.SOUNDSCAPE_ENABLED ?? process.env.SOUNDSCAPE_AMBIENT_ENABLED;
  return raw === '1' || raw === 'true';
}

function getMixOptions() {
  const ambientDb = Number(process.env.SOUNDSCAPE_AMBIENT_DB ?? DEFAULT_MIX_OPTIONS.ambientDb);
  return { ambientDb };
}

function getSoundscapeChapterPath(chapterPath: string): string {
  return chapterPath.replace(/\.wav$/i, '_soundscape.wav');
}

function getIntroPath(chapterPath: string): string {
  return chapterPath.replace(/\.wav$/i, '_intro.wav');
}

function getSoundscapeBasePath(chapterPath: string): string {
  return chapterPath.replace(/\.wav$/i, '_soundscape_base.wav');
}

function stripSpeakerPrefixes(text: string): string {
  return text.replace(/^[A-Z][A-Z0-9]*:\s*/gm, '');
}

function extractSceneTags(text: string): string[] {
  const lower = text.toLowerCase();
  const tags: string[] = [];

  for (const [tag, keywords] of Object.entries(DEFAULT_KEYWORD_MAP)) {
    if (keywords.some(k => lower.includes(k))) {
      tags.push(tag);
    }
  }

  return tags;
}

function scoreAsset(asset: SoundAsset, tags: string[]): number {
  if (tags.length === 0) return 0;
  const tagSet = new Set(tags);
  const genreMatches = asset.genre?.filter(g => tagSet.has(g)).length ?? 0;
  const moodMatches = asset.mood?.filter(m => tagSet.has(m)).length ?? 0;
  return genreMatches + moodMatches;
}

function buildThemeLabel(asset: SoundAsset): string {
  return asset.id
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function getSoundscapeThemeOptions(text: string, maxOptions: number = 5): Array<{ id: string; label: string; score: number }>{
  const catalog = loadCatalog();
  if (!catalog) return [];

  const tags = extractSceneTags(text);
  const themes = catalog.assets.filter(asset => asset.type === 'music');

  const scored = themes.map(asset => ({
    id: asset.id,
    label: buildThemeLabel(asset),
    score: scoreAsset(asset, tags),
  }));

  scored.sort((a, b) => b.score - a.score);

  const limit = Math.min(Math.max(1, maxOptions), 5);
  const filtered = scored.filter(item => item.score > 0);

  if (filtered.length > 0) {
    return filtered.slice(0, limit);
  }

  return scored.slice(0, Math.min(limit, scored.length));
}

function selectThemeAsset(catalog: SoundLibraryCatalog, options: SoundscapePreferences | undefined, chapterText: string): SoundAsset | undefined {
  const resolvePath = (filePath: string) => path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
  const musicAssets = catalog.assets.filter(asset => asset.type === 'music');
  if (musicAssets.length === 0) return undefined;

  if (options?.soundscapeThemeId) {
    const match = musicAssets.find(asset => asset.id === options.soundscapeThemeId);
    if (match && fs.existsSync(resolvePath(match.filePath))) {
      return match;
    }
  }

  const tags = extractSceneTags(chapterText);
  const scored = musicAssets.map(asset => ({
    asset,
    score: scoreAsset(asset, tags),
  }));

  scored.sort((a, b) => b.score - a.score);
  for (const item of scored) {
    if (fs.existsSync(resolvePath(item.asset.filePath))) {
      return item.asset;
    }
  }

  return undefined;
}

function loadCatalog(): SoundLibraryCatalog | null {
  if (catalogCache) return catalogCache;
  if (!fs.existsSync(DEFAULT_CATALOG_PATH)) {
    console.warn(`⚠️ Soundscape catalog not found: ${DEFAULT_CATALOG_PATH}`);
    return null;
  }

  try {
    const raw = fs.readFileSync(DEFAULT_CATALOG_PATH, 'utf8');
    catalogCache = JSON.parse(raw) as SoundLibraryCatalog;
    return catalogCache;
  } catch (error) {
    console.error('✗ Failed to load soundscape catalog:', error);
    return null;
  }
}

function selectAmbientAsset(catalog: SoundLibraryCatalog, tags: string[]): SoundAsset | undefined {
  const ambients = catalog.assets.filter(a => a.type === 'ambient');
  if (ambients.length === 0) return undefined;
  if (tags.length === 0) return ambients[0];

  const tagSet = new Set(tags);
  const match = ambients.find(a =>
    (a.genre?.some(g => tagSet.has(g)) ?? false) ||
    (a.mood?.some(m => tagSet.has(m)) ?? false)
  );

  return match ?? ambients[0];
}

function resolveAssetPath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
}

function buildMixCommand(
  speechPath: string,
  ambientPath: string,
  outputPath: string,
  options: { ambientDb: number },
  speechDurationMs: number
): string[] {
  const preRollSec = AMBIENT_PRE_ROLL_MS / 1000;
  const postRollSec = AMBIENT_POST_ROLL_MS / 1000;
  const fadeInSec = AMBIENT_FADE_MS / 1000;
  const fadeOutSec = AMBIENT_FADE_MS / 1000;
  const totalDurationSec = Math.max((speechDurationMs + AMBIENT_PRE_ROLL_MS + AMBIENT_POST_ROLL_MS) / 1000, 0.5);
  const fadeOutStart = Math.max((speechDurationMs + AMBIENT_PRE_ROLL_MS + (AMBIENT_POST_ROLL_MS - AMBIENT_FADE_MS)) / 1000, 0);
  const voiceDelayMs = AMBIENT_PRE_ROLL_MS;

  return [
    '-i', speechPath,
    '-stream_loop', '-1', '-i', ambientPath,
    '-filter_complex',
      `[1:a]loudnorm=I=-35:TP=-2:LRA=11,volume=${options.ambientDb}dB,` +
      `afade=t=in:st=0:d=${fadeInSec},` +
      `afade=t=out:st=${fadeOutStart}:d=${fadeOutSec},` +
      `atrim=0:${totalDurationSec}[amb];` +
      `[0:a]adelay=${voiceDelayMs}|${voiceDelayMs}[speech];` +
      `[amb][speech]amix=inputs=2:duration=first:dropout_transition=2:normalize=0`,
    '-ar', '24000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    outputPath,
  ];
}

function buildMusicSegmentCommand(
  musicPath: string,
  outputPath: string,
  durationMs: number,
  volumeDb: number,
  fadeInMs?: number,
  fadeOutMs?: number
): string[] {
  const durationSec = Math.max(durationMs / 1000, 0.5);
  const filters: string[] = [`volume=${volumeDb}dB`];
  if (fadeInMs && fadeInMs > 0) {
    filters.push(`afade=t=in:st=0:d=${fadeInMs / 1000}`);
  }
  if (fadeOutMs && fadeOutMs > 0) {
    const fadeOutSec = fadeOutMs / 1000;
    const start = Math.max(durationSec - fadeOutSec, 0);
    filters.push(`afade=t=out:st=${start}:d=${fadeOutSec}`);
  }
  return [
    '-stream_loop', '-1', '-i', musicPath,
    '-t', durationSec.toString(),
    '-af', filters.join(','),
    '-ar', '24000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    outputPath,
  ];
}

function buildVoiceWithMusicCommand(voicePath: string, musicPath: string, outputPath: string): string[] {
  return [
    '-i', voicePath,
    '-i', musicPath,
    '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2:normalize=0',
    '-ar', '24000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    outputPath,
  ];
}

function buildConcatCommand(inputs: string[], outputPath: string): string[] {
  const args: string[] = [];
  for (const input of inputs) {
    args.push('-i', input);
  }
  const filter = inputs.map((_, idx) => `[${idx}:a]`).join('') + `concat=n=${inputs.length}:v=0:a=1`;
  return [...args, '-filter_complex', filter, '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', outputPath];
}

async function runFfmpeg(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', ['-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      stderr += error instanceof Error ? error.message : String(error);
      resolve({ code: 1, stdout, stderr });
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

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

  const ambientEnabled = options.preferences?.soundscapeAmbientEnabled !== false;
  const musicEnabled = options.preferences?.soundscapeMusicEnabled !== false;

  console.log(`🎧 Soundscape: musicEnabled=${musicEnabled} ambientEnabled=${ambientEnabled}`);

  if (!ambientEnabled && !musicEnabled) {
    return options.chapterPath;
  }

  const soundscapePath = getSoundscapeChapterPath(options.chapterPath);
  const soundscapeBasePath = musicEnabled ? getSoundscapeBasePath(options.chapterPath) : soundscapePath;
  const introPath = getIntroPath(options.chapterPath);

  if (fs.existsSync(soundscapePath)) {
    if (!musicEnabled) {
      return soundscapePath;
    }
    fs.unlinkSync(soundscapePath);
  }

  const catalog = loadCatalog();
  if (!catalog) {
    return options.chapterPath;
  }

  const chapterText = stripSpeakerPrefixes(options.chapterText);

  let basePath = options.chapterPath;

  if (ambientEnabled) {
    const tags = extractSceneTags(chapterText);
    const ambient = selectAmbientAsset(catalog, tags);

    if (!ambient) {
      console.warn('⚠️ No ambient assets available for soundscape mix');
    } else {
      const ambientPath = resolveAssetPath(ambient.filePath);
      if (!fs.existsSync(ambientPath)) {
        console.warn(`⚠️ Ambient file missing: ${ambientPath}`);
      } else {
        console.log(`🌿 Soundscape mix: ${options.bookTitle} ch${options.chapterIndex} -> ${ambient.id}`);
        const speechBuffer = fs.readFileSync(options.chapterPath);
        const speechDurationMs = estimateAudioDuration(speechBuffer) * 1000;
        const args = buildMixCommand(options.chapterPath, ambientPath, soundscapeBasePath, getMixOptions(), speechDurationMs);
        const result = await runFfmpeg(args);
        if (result.code !== 0) {
          console.error('✗ ffmpeg soundscape mix failed:', result.stderr);
          return options.chapterPath;
        }
        basePath = soundscapeBasePath;
      }
    }
  }

  if (!musicEnabled) {
    if (basePath === soundscapeBasePath && soundscapeBasePath !== soundscapePath) {
      fs.renameSync(soundscapeBasePath, soundscapePath);
    }
    return basePath === options.chapterPath ? options.chapterPath : soundscapePath;
  }

  const metadata = loadAudiobookMetadata(options.bookTitle);
  const chapterTitle = metadata?.chapters?.[options.chapterIndex - 1]?.title
    || `Chapter ${options.chapterIndex}`;
  const bookTitle = metadata?.title ?? options.bookTitle;
  const author = metadata?.author ?? 'Unknown author';
  const narratorVoice = INTRO_NARRATOR_VOICE;
  const introLanguage = normalizeTargetLanguage((global as any).TARGET_LANGUAGE || metadata?.language || null);

  if (!fs.existsSync(introPath)) {
    const theme = selectThemeAsset(catalog, options.preferences, chapterText);
    if (!theme) {
      console.warn('⚠️ No music theme available for intro');
    } else {
      const themePath = resolveAssetPath(theme.filePath);
      console.log(`🎼 Intro theme: ${theme.id} -> ${themePath}`);
      if (!fs.existsSync(themePath)) {
        console.warn(`⚠️ Theme file missing: ${themePath}`);
      } else {
        const introSpec = options.chapterIndex === 1
          ? buildBookIntroSequence(bookTitle, author, chapterTitle)
          : buildChapterIntroSequence(options.chapterIndex, chapterTitle);
        const tempDir = getTempAudioDir();
        console.log(`🎬 Intro build start: ${introPath}`);

        const voiceFiles: Array<{ path: string; startMs: number; durationMs: number }> = [];
        let currentStartMs = 0;
        let lastEndMs = 0;

        for (let i = 0; i < introSpec.voiceOverlays.length; i++) {
          const overlay = introSpec.voiceOverlays[i];
          const voiceText = await translateIntroText(overlay.text, introLanguage);
          const voiceAudio = await synthesizeText(voiceText, narratorVoice, 'normal', undefined, introLanguage ?? undefined);
          const voiceDurationMs = estimateAudioDuration(voiceAudio) * 1000;
          const voicePath = path.join(tempDir, `intro_voice_${i}.wav`);

          if (overlay.startMs !== undefined) {
            currentStartMs = overlay.startMs;
          } else {
            currentStartMs = lastEndMs + (overlay.gapAfterMs ?? 0);
          }

          fs.writeFileSync(voicePath, voiceAudio);
          voiceFiles.push({ path: voicePath, startMs: currentStartMs, durationMs: voiceDurationMs });
          lastEndMs = currentStartMs + voiceDurationMs + (overlay.gapAfterMs ?? 0);
        }

        const computedDurationMs = Math.max(introSpec.totalDurationMs ?? 0, lastEndMs);
        const baseMusicPath = path.join(tempDir, 'intro_base_music.wav');
        const baseVolume = applyMusicBoost(-14, MUSIC_FULL_BOOST_DB);
        const baseMusicArgs = buildMusicSegmentCommand(
          themePath,
          baseMusicPath,
          computedDurationMs,
          baseVolume,
          INTRO_FADE_MS,
          INTRO_FADE_MS
        );
        const baseMusicResult = await runFfmpeg(baseMusicArgs);
        if (baseMusicResult.code !== 0) {
          console.error('✗ ffmpeg intro base music failed:', baseMusicResult.stderr);
          for (const v of voiceFiles) {
            if (fs.existsSync(v.path)) {
              fs.unlinkSync(v.path);
            }
          }
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        } else {
          const introTempPath = path.join(tempDir, 'intro_temp.wav');
          const fullVolumeDb = applyMusicBoost(-14, MUSIC_FULL_BOOST_DB);
          const backgroundVolumeDb = applyMusicBoost(MUSIC_BACKGROUND_DB, MUSIC_BACKGROUND_BOOST_DB);
          const backgroundRatio = Number(Math.pow(10, (backgroundVolumeDb - fullVolumeDb) / 20).toFixed(6));
          const rampSec = RAMP_MS / 1000;
          const rampValue = Math.max(rampSec, 0.01);

          const duckExpressions = voiceFiles.map((v) => {
            const startSec = v.startMs / 1000;
            const endSec = startSec + v.durationMs / 1000;
            const fadeInStart = Math.max(startSec - rampValue, 0);
            const fadeOutEnd = endSec + rampValue;
            return `if(between(t\,${fadeInStart}\,${startSec}),1-(1-${backgroundRatio})*(t-${fadeInStart})/${rampValue},` +
              `if(between(t\,${startSec}\,${endSec}),${backgroundRatio},` +
              `if(between(t\,${endSec}\,${fadeOutEnd}),${backgroundRatio}+(1-${backgroundRatio})*(t-${endSec})/${rampValue},1)))`;
          });

          let volumeExpr = '1';
          for (const expr of duckExpressions) {
            volumeExpr = `min(${volumeExpr}\\,${expr})`;
          }

          const filterComplex = [
            `[0:a]volume='${volumeExpr}':eval=frame[music]`,
            ...voiceFiles.map((v, i) => `[${i + 1}:a]volume=${INTRO_VOICE_BOOST_DB}dB,adelay=${v.startMs}|${v.startMs}[voice${i}]`),
            `[music]${voiceFiles.map((_, i) => `[voice${i}]`).join('')}amix=inputs=${1 + voiceFiles.length}:duration=first:normalize=0`
          ].join(';');

          const mixArgs: string[] = [
            '-i', baseMusicPath,
            ...voiceFiles.flatMap(v => ['-i', v.path]),
            '-filter_complex', filterComplex,
            '-ar', '24000',
            '-ac', '1',
            introTempPath
          ];

          const mixResult = await runFfmpeg(mixArgs);
          if (mixResult.code !== 0) {
            console.error('✗ ffmpeg intro voice overlay mix failed:', mixResult.stderr);
          } else {
            const endSilenceMs = introSpec.endSilenceMs ?? 0;
            if (endSilenceMs > 0) {
              const silencePath = path.join(tempDir, 'intro_silence.wav');
              const silenceArgs = [
                '-f', 'lavfi',
                '-t', (endSilenceMs / 1000).toString(),
                '-i', 'anullsrc=r=24000:cl=mono',
                silencePath,
              ];
              const silenceResult = await runFfmpeg(silenceArgs);
              if (silenceResult.code !== 0) {
                console.error('✗ ffmpeg intro silence failed:', silenceResult.stderr);
                fs.renameSync(introTempPath, introPath);
              } else {
                const introWithSilencePath = path.join(tempDir, 'intro_with_silence.wav');
                const concatArgs = buildConcatCommand([introTempPath, silencePath], introWithSilencePath);
                const concatResult = await runFfmpeg(concatArgs);
                if (concatResult.code !== 0) {
                  console.error('✗ ffmpeg intro silence concat failed:', concatResult.stderr);
                  fs.renameSync(introTempPath, introPath);
                } else {
                  fs.renameSync(introWithSilencePath, introPath);
                }
                if (fs.existsSync(silencePath)) {
                  fs.unlinkSync(silencePath);
                }
                if (fs.existsSync(introTempPath)) {
                  fs.unlinkSync(introTempPath);
                }
              }
            } else {
              fs.renameSync(introTempPath, introPath);
            }
            console.log(`✅ Intro built: ${introPath} exists=${fs.existsSync(introPath)}`);
          }

          if (fs.existsSync(baseMusicPath)) {
            fs.unlinkSync(baseMusicPath);
          }
          for (const v of voiceFiles) {
            if (fs.existsSync(v.path)) {
              fs.unlinkSync(v.path);
            }
          }
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        }
      }
    }
  }

  console.log(`🎬 Intro ready? ${fs.existsSync(introPath)}`);
  if (fs.existsSync(introPath)) {
    const concatArgs = buildConcatCommand([introPath, basePath], soundscapePath);
    const result = await runFfmpeg(concatArgs);
    if (result.code !== 0) {
      console.error('✗ ffmpeg soundscape concat failed:', result.stderr);
      return basePath;
    }
    if (fs.existsSync(introPath)) {
      fs.unlinkSync(introPath);
    }
    if (basePath === soundscapeBasePath && fs.existsSync(soundscapeBasePath)) {
      fs.unlinkSync(soundscapeBasePath);
    }
    return soundscapePath;
  }

  return basePath;
}

export function resolveChapterAudioPath(chapterPath: string): string {
  if (!isSoundscapeEnabled()) {
    return chapterPath;
  }

  const soundscapePath = getSoundscapeChapterPath(chapterPath);
  return fs.existsSync(soundscapePath) ? soundscapePath : chapterPath;
}
