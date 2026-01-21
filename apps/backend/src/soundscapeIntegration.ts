import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

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

  if (options.preferences?.soundscapeAmbientEnabled === false) {
    return options.chapterPath;
  }

  const soundscapePath = getSoundscapeChapterPath(options.chapterPath);
  if (fs.existsSync(soundscapePath)) {
    return soundscapePath;
  }

  const catalog = loadCatalog();
  if (!catalog) {
    return options.chapterPath;
  }

  const chapterText = stripSpeakerPrefixes(options.chapterText);
  const tags = extractSceneTags(chapterText);
  const ambient = selectAmbientAsset(catalog, tags);

  if (!ambient) {
    console.warn('⚠️ No ambient assets available for soundscape mix');
    return options.chapterPath;
  }

  const ambientPath = resolveAssetPath(ambient.filePath);
  if (!fs.existsSync(ambientPath)) {
    console.warn(`⚠️ Ambient file missing: ${ambientPath}`);
    return options.chapterPath;
  }

  console.log(`🌿 Soundscape mix: ${options.bookTitle} ch${options.chapterIndex} -> ${ambient.id}`);

  try {
    const args = buildMixCommand(options.chapterPath, ambientPath, soundscapePath, getMixOptions());
    const result = await runFfmpeg(args);
    if (result.code !== 0) {
      console.error('✗ ffmpeg soundscape mix failed:', result.stderr);
      return options.chapterPath;
    }
    return soundscapePath;
  } catch (error) {
    console.error('✗ Soundscape mix failed:', error);
    return options.chapterPath;
  }
}

export function resolveChapterAudioPath(chapterPath: string): string {
  if (!isSoundscapeEnabled()) {
    return chapterPath;
  }

  const soundscapePath = getSoundscapeChapterPath(chapterPath);
  return fs.existsSync(soundscapePath) ? soundscapePath : chapterPath;
}
