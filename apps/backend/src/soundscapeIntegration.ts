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

interface BookInfoMatch {
  genre?: string;
  tone?: string;
  voiceTone?: string;
  period?: string;
}

const DEFAULT_KEYWORD_MAP: Record<string, string[]> = {
  forest: [
    'forest', 'forrest', 'woods', 'woodland', 'trees', 'pine', 'jungle',
    'field', 'meadow', 'grassland', 'grove'
  ],
  rain: ['rain', 'storm', 'thunder', 'lightning', 'downpour', 'drizzle'],
  sea: [
    'sea', 'ocean', 'wave', 'waves', 'shore', 'coast', 'harbor', 'port',
    'river', 'stream', 'brook', 'lake', 'dock', 'pier'
  ],
  city: [
    'city', 'street', 'traffic', 'crowd', 'market', 'urban',
    'car', 'cars', 'bus', 'train', 'horn', 'sirens'
  ],
  interior: [
    'room', 'hall', 'castle', 'cathedral', 'church', 'chapel',
    'interior', 'indoors', 'bedroom', 'cafe', 'restaurant',
    'tavern', 'pub', 'bar'
  ],
  crowd: ['crowd', 'market', 'festival', 'cafe', 'restaurant', 'tavern', 'pub', 'bar'],
  sciFi: ['spaceship', 'engine', 'hull', 'airlock', 'android', 'robot', 'sci-fi', 'science fiction', 'space'],
  fire: ['fire', 'flame', 'smoke', 'campfire', 'bonfire', 'hearth'],
  wind: ['wind', 'breeze', 'gust', 'gale'],
  cave: ['cave', 'tunnel', 'underground', 'cavern', 'crypt'],
};

const PERIOD_GENRE_MAP: Record<string, string[]> = {
  prehistory: ['fantasy'],
  antiquity: ['fantasy'],
  'middle ages': ['fantasy'],
  'modern age': ['drama'],
  contemporary: ['drama'],
  future: ['sciFi'],
  undefined: [],
};

const MOOD_KEYWORDS: Record<string, string[]> = {
  calm: ['calm', 'serene', 'peaceful', 'quiet', 'gentle'],
  warm: ['warm', 'cozy', 'tender'],
  epic: ['epic', 'grand', 'heroic'],
  whimsical: ['whimsical', 'playful', 'magical'],
  comedic: ['comedic', 'funny', 'humorous'],
  technical: ['technical', 'mechanical', 'industrial'],
  busy: ['busy', 'crowded', 'bustling'],
  neutral: ['neutral', 'plain', 'timeless'],
  eerie: ['eerie', 'ominous', 'spooky', 'creepy'],
  tense: ['tense', 'dark', 'stormy', 'foreboding'],
};

const GENRE_KEYWORDS: Record<string, string[]> = {
  fantasy: ['fantasy', 'myth', 'mythic', 'legend', 'magical'],
  drama: ['drama', 'dramatic'],
  sciFi: ['sci fi', 'sci-fi', 'science fiction', 'scifi', 'space'],
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

const WAV_SAMPLE_RATE = 24000;
const WAV_CHANNELS = 1;
const WAV_BYTES_PER_SAMPLE = 2;

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

function getAmbientTimingPath(chapterPath: string): string {
  return chapterPath.replace(/\.wav$/i, '_ambience.json');
}

function stripSpeakerPrefixes(text: string): string {
  return text.replace(/^[A-Z][A-Z0-9]*:\s*/gm, '');
}

function keywordToRegex(keyword: string): RegExp {
  const normalized = normalizeText(keyword);
  if (!normalized) return /$^/;
  const parts = normalized.split(' ').filter(Boolean);
  const pattern = parts.map(part => `\\b${part}\\b`).join('\\s+');
  return new RegExp(pattern, 'i');
}

function extractSceneTags(text: string): string[] {
  const normalizedText = normalizeText(text);
  const tags: string[] = [];

  for (const [tag, keywords] of Object.entries(DEFAULT_KEYWORD_MAP)) {
    if (keywords.some(k => keywordToRegex(k).test(normalizedText))) {
      tags.push(tag);
    }
  }

  return tags;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addTagsFromText(source: string | undefined, map: Record<string, string[]>, target: Set<string>): void {
  if (!source) return;
  const normalized = normalizeText(source);
  if (!normalized) return;
  for (const [tag, keywords] of Object.entries(map)) {
    if (keywords.some(keyword => normalized.includes(normalizeText(keyword)))) {
      target.add(tag);
    }
  }
}

function normalizePeriod(value?: string): string {
  if (!value) return 'undefined';
  const normalized = normalizeText(value);
  if (['prehistory', 'prehistoric', 'primeval'].some(v => normalized.includes(v))) return 'prehistory';
  if (['antiquity', 'ancient', 'classical'].some(v => normalized.includes(v))) return 'antiquity';
  if (['middle ages', 'middle age', 'medieval', 'feudal'].some(v => normalized.includes(v))) return 'middle ages';
  if (['modern age', 'modern', 'industrial', 'victorian'].some(v => normalized.includes(v))) return 'modern age';
  if (['contemporary', 'present', 'current', 'today'].some(v => normalized.includes(v))) return 'contemporary';
  if (['future', 'futuristic', 'sci fi', 'science fiction'].some(v => normalized.includes(v))) return 'future';
  return 'undefined';
}

function buildBookInfoTags(bookInfo?: BookInfoMatch): { genreTags: Set<string>; moodTags: Set<string> } {
  const genreTags = new Set<string>();
  const moodTags = new Set<string>();

  addTagsFromText(bookInfo?.genre, GENRE_KEYWORDS, genreTags);
  addTagsFromText(bookInfo?.tone, MOOD_KEYWORDS, moodTags);
  addTagsFromText(bookInfo?.voiceTone, MOOD_KEYWORDS, moodTags);

  const period = normalizePeriod(bookInfo?.period);
  for (const tag of PERIOD_GENRE_MAP[period] ?? []) {
    genreTags.add(tag);
  }

  return { genreTags, moodTags };
}

function scoreAssetByTags(asset: SoundAsset, genreTags: Set<string>, moodTags: Set<string>): number {
  const genreMatches = asset.genre?.filter(g => genreTags.has(g)).length ?? 0;
  const moodMatches = asset.mood?.filter(m => moodTags.has(m)).length ?? 0;
  return genreMatches * 3 + moodMatches * 2;
}

function scoreAsset(asset: SoundAsset, tags: string[]): number {
  if (tags.length === 0) return 0;
  const tagSet = new Set(tags);
  const genreMatches = asset.genre?.filter(g => tagSet.has(g)).length ?? 0;
  const moodMatches = asset.mood?.filter(m => tagSet.has(m)).length ?? 0;
  return genreMatches * 2 + moodMatches;
}

function buildThemeLabel(asset: SoundAsset): string {
  return asset.id
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function getSoundscapeThemeOptions(
  text: string,
  maxOptions: number = 5,
  bookInfo?: BookInfoMatch
): Array<{ id: string; label: string; score: number }>{
  const catalog = loadCatalog();
  if (!catalog) return [];

  const themes = catalog.assets.filter(asset => asset.type === 'music');
  const limit = Math.min(Math.max(1, maxOptions), 5);

  if (themes.length === 0) return [];

  const { genreTags, moodTags } = buildBookInfoTags(bookInfo);

  const hasBookInfoTags = genreTags.size > 0 || moodTags.size > 0;
  const fallbackTags = hasBookInfoTags ? [] : extractSceneTags(text);
  const scored = themes.map(asset => ({
    id: asset.id,
    label: buildThemeLabel(asset),
    score: hasBookInfoTags ? scoreAssetByTags(asset, genreTags, moodTags) : scoreAsset(asset, fallbackTags),
  }));

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });

  const filtered = scored.filter(item => item.score > 0);
  if (filtered.length > 0) {
    return filtered.slice(0, limit);
  }

  const neutralTheme = themes
    .filter(asset => asset.mood?.some(m => m === 'calm' || m === 'neutral') || asset.genre?.includes('drama'))
    .sort((a, b) => a.id.localeCompare(b.id))[0];

  if (neutralTheme) {
    const fallback = scored.find(item => item.id === neutralTheme.id);
    return fallback ? [fallback, ...scored.filter(item => item.id !== fallback.id)].slice(0, limit) : scored.slice(0, limit);
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

function selectAmbientAssets(catalog: SoundLibraryCatalog, tags: string[]): SoundAsset[] {
  const ambients = catalog.assets.filter(a => a.type === 'ambient');
  if (ambients.length === 0) return [];
  if (tags.length === 0) return [];

  const sorted = [...ambients].sort((a, b) => {
    const scoreA = scoreAsset(a, tags);
    const scoreB = scoreAsset(b, tags);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.id.localeCompare(b.id);
  });

  return sorted.filter(asset => scoreAsset(asset, tags) > 0);
}

function resolveAssetPath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
}

function estimateWavDurationFromFile(filePath: string): number {
  const stats = fs.statSync(filePath);
  const pcmSize = Math.max(0, stats.size - 44);
  return pcmSize / (WAV_SAMPLE_RATE * WAV_CHANNELS * WAV_BYTES_PER_SAMPLE);
}

function writeAmbientTimingFile(
  chapterPath: string,
  ambient: SoundAsset,
  tags: string[]
): void {
  try {
    const durationSec = estimateWavDurationFromFile(chapterPath);
    const timingPath = getAmbientTimingPath(chapterPath);
    const payload = {
      ambientTracks: [
        {
          id: ambient.id,
          tags,
          startSec: 0,
          endSec: Number(durationSec.toFixed(3)),
          loop: true,
        },
      ],
    };
    fs.writeFileSync(timingPath, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.warn('⚠️ Failed to write ambient timing file:', error);
  }
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
  const ambientCandidates = selectAmbientAssets(catalog, tags);

  if (ambientCandidates.length === 0) {
    console.warn('⚠️ No ambient assets matched for soundscape mix');
    return options.chapterPath;
  }

  let ambient: SoundAsset | undefined;
  let ambientPath = '';

  for (const candidate of ambientCandidates) {
    const candidatePath = resolveAssetPath(candidate.filePath);
    if (fs.existsSync(candidatePath)) {
      ambient = candidate;
      ambientPath = candidatePath;
      break;
    }
  }

  if (!ambient) {
    console.warn('⚠️ No ambient assets found on disk for soundscape mix');
    return options.chapterPath;
  }

  console.log(`🌿 Soundscape mix: ${options.bookTitle} ch${options.chapterIndex} -> ${ambient.id}`);
  writeAmbientTimingFile(options.chapterPath, ambient, tags);

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
