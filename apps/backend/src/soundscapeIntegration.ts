import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { synthesizeText } from './ttsClient.js';
import { loadAudiobookMetadata } from './audiobookManager.js';
import { estimateAudioDuration } from './tempChunkManager.js';

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
const RAMP_MS = 2000;
const MUSIC_VOLUME_BOOST_DB = 4.5;
const MUSIC_BACKGROUND_DB = -21.5;

function applyMusicBoost(volumeDb: number): number {
  return volumeDb + MUSIC_VOLUME_BOOST_DB;
}

interface VoiceOverlay {
  startMs: number;
  text: string;
}

function buildBookIntroSequence(bookTitle: string, author: string, chapterTitle: string): { totalDurationMs: number; voiceOverlays: VoiceOverlay[] } {
  return {
    totalDurationMs: 35000,
    voiceOverlays: [
      { startMs: 12000, text: `${bookTitle}. ${author}.` },
      { startMs: 18000, text: `This audiobook was brought to you by VoiceLibri.` },
      { startMs: 27000, text: `Chapter 1. ${chapterTitle}.` },
    ],
  };
}

function buildChapterIntroSequence(chapterNumber: number, chapterTitle: string): { totalDurationMs: number; voiceOverlays: VoiceOverlay[] } {
  return {
    totalDurationMs: 15000,
    voiceOverlays: [
      { startMs: 7000, text: `Chapter ${chapterNumber}. ${chapterTitle}.` },
    ],
  };
}

let catalogCache: SoundLibraryCatalog | null = null;

function isSoundscapeEnabled(): boolean {
  const raw = process.env.SOUNDSCAPE_ENABLED ?? process.env.SOUNDSCAPE_AMBIENT_ENABLED;
  return raw === '1' || raw === 'true';
}

function getMixOptions() {
  const ambientDb = Number(process.env.SOUNDSCAPE_AMBIENT_DB ?? DEFAULT_MIX_OPTIONS.ambientDb);
  const fadeInMs = Number(process.env.SOUNDSCAPE_FADE_IN_MS ?? DEFAULT_MIX_OPTIONS.fadeInMs);
  const fadeOutMs = Number(process.env.SOUNDSCAPE_FADE_OUT_MS ?? DEFAULT_MIX_OPTIONS.fadeOutMs);
  return { ambientDb, fadeInMs, fadeOutMs };
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
  if (options?.soundscapeThemeId) {
    return catalog.assets.find(asset => asset.type === 'music' && asset.id === options.soundscapeThemeId);
  }

  const themeOptions = getSoundscapeThemeOptions(chapterText, 5);
  const top = themeOptions[0];
  if (!top) return undefined;
  return catalog.assets.find(asset => asset.type === 'music' && asset.id === top.id);
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
  options: { ambientDb: number; fadeInMs: number; fadeOutMs: number }
): string[] {
  const fadeIn = options.fadeInMs / 1000;
  return [
    '-i', speechPath,
    '-stream_loop', '-1', '-i', ambientPath,
    '-filter_complex',
    `[1:a]loudnorm=I=-35:TP=-2:LRA=11,volume=${options.ambientDb}dB,afade=t=in:st=0:d=${fadeIn}[amb];` +
      `[0:a][amb]amix=inputs=2:duration=first:dropout_transition=2`,
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
    outputPath,
  ];
}

function buildVoiceWithMusicCommand(voicePath: string, musicPath: string, outputPath: string): string[] {
  return [
    '-i', voicePath,
    '-i', musicPath,
    '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2',
    '-ar', '24000',
    '-ac', '1',
    outputPath,
  ];
}

function buildConcatCommand(inputs: string[], outputPath: string): string[] {
  const args: string[] = [];
  for (const input of inputs) {
    args.push('-i', input);
  }
  const filter = inputs.map((_, idx) => `[${idx}:a]`).join('') + `concat=n=${inputs.length}:v=0:a=1`;
  return [...args, '-filter_complex', filter, outputPath];
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

  if (!ambientEnabled && !musicEnabled) {
    return options.chapterPath;
  }

  const soundscapePath = getSoundscapeChapterPath(options.chapterPath);
  const soundscapeBasePath = musicEnabled ? getSoundscapeBasePath(options.chapterPath) : soundscapePath;
  const introPath = getIntroPath(options.chapterPath);

  if (fs.existsSync(soundscapePath)) {
    return soundscapePath;
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
        const args = buildMixCommand(options.chapterPath, ambientPath, soundscapeBasePath, getMixOptions());
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
  const narratorVoice = metadata?.userPreferences?.narratorVoice ?? 'Algieba';

  if (!fs.existsSync(introPath)) {
    const theme = selectThemeAsset(catalog, options.preferences, chapterText);
    if (!theme) {
      console.warn('⚠️ No music theme available for intro');
    } else {
      const themePath = resolveAssetPath(theme.filePath);
      if (!fs.existsSync(themePath)) {
        console.warn(`⚠️ Theme file missing: ${themePath}`);
      } else {
        const introSpec = options.chapterIndex === 1
          ? buildBookIntroSequence(bookTitle, author, chapterTitle)
          : buildChapterIntroSequence(options.chapterIndex, chapterTitle);

        const baseMusicPath = introPath.replace(/\.wav$/i, '_base_music.wav');
        const baseVolume = applyMusicBoost(-14);
        const baseMusicArgs = buildMusicSegmentCommand(
          themePath,
          baseMusicPath,
          introSpec.totalDurationMs,
          baseVolume,
          INTRO_FADE_MS,
          INTRO_FADE_MS
        );
        const baseMusicResult = await runFfmpeg(baseMusicArgs);
        if (baseMusicResult.code !== 0) {
          console.error('✗ ffmpeg intro base music failed:', baseMusicResult.stderr);
        } else {
          const voiceFiles: Array<{ path: string; startMs: number }> = [];
          
          for (let i = 0; i < introSpec.voiceOverlays.length; i++) {
            const overlay = introSpec.voiceOverlays[i];
            const voiceAudio = await synthesizeText(overlay.text, narratorVoice, 'normal');
            const voicePath = introPath.replace(/\.wav$/i, `_voice_${i}.wav`);
            fs.writeFileSync(voicePath, voiceAudio);
            voiceFiles.push({ path: voicePath, startMs: overlay.startMs });
          }

          const introTempPath = introPath.replace(/\.wav$/i, '_temp.wav');
          const fadeInSec = RAMP_MS / 1000;
          const fadeOutSec = RAMP_MS / 1000;
          const backgroundVolumeDb = applyMusicBoost(MUSIC_BACKGROUND_DB);
          
          const filterComplex = [
            `[0:a]asplit=${voiceFiles.length}${voiceFiles.map((_, i) => `[music${i}]`).join('')}`,
            ...voiceFiles.map((v, i) => {
              const delaySec = v.startMs / 1000;
              return `[music${i}]volume=${backgroundVolumeDb}dB,afade=t=in:st=${delaySec}:d=${fadeInSec},afade=t=out:st=${delaySec + 0.1}:d=${fadeOutSec}[bgm${i}]`;
            }),
            ...voiceFiles.map((v, i) => `[${i + 1}:a]adelay=${v.startMs}|${v.startMs}[voice${i}]`),
            `[0:a]${voiceFiles.map((_, i) => `[bgm${i}][voice${i}]`).join('')}amix=inputs=${1 + voiceFiles.length * 2}:duration=first`
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
            fs.renameSync(introTempPath, introPath);
          }

          if (fs.existsSync(baseMusicPath)) {
            fs.unlinkSync(baseMusicPath);
          }
          for (const v of voiceFiles) {
            if (fs.existsSync(v.path)) {
              fs.unlinkSync(v.path);
            }
          }
        }
      }
    }
  }

  if (fs.existsSync(introPath)) {
    const concatArgs = buildConcatCommand([introPath, basePath], soundscapePath);
    const result = await runFfmpeg(concatArgs);
    if (result.code !== 0) {
      console.error('✗ ffmpeg soundscape concat failed:', result.stderr);
      return basePath;
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
