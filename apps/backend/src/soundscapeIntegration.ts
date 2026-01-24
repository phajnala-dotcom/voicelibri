import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { synthesizeText } from './ttsClient.js';
import { loadAudiobookMetadata, getAudiobooksDir } from './audiobookManager.js';
import { estimateAudioDuration } from './tempChunkManager.js';
import { ChapterTranslator } from './chapterTranslator.js';
import { GoogleAuth } from 'google-auth-library';
import { LLM_MODELS, LLM_TEMPERATURES, LLM_GENERATION_CONFIG, getChapterAmbienceMapPrompt } from './promptConfig.js';

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

type BookPeriod = 'prehistory' | 'antiquity' | 'middle ages' | 'modern age' | 'contemporary' | 'future' | 'undefined';

interface BookInfoSnapshot {
  genre?: string;
  tone?: string;
  voiceTone?: string;
  period?: BookPeriod;
}

interface AmbienceMapItem {
  assetId: string;
  start: number;
  end: number;
}

interface AmbienceMapResult {
  ambience: AmbienceMapItem[];
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
const ambienceMapCache = new Map<string, Promise<AmbienceMapResult | null>>();

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

function normalizeBookPeriod(raw?: string | null): BookPeriod {
  if (!raw) return 'undefined';
  const normalized = raw.toLowerCase().trim();
  const directMap: Record<string, BookPeriod> = {
    prehistory: 'prehistory',
    prehistoric: 'prehistory',
    antiquity: 'antiquity',
    ancient: 'antiquity',
    classical: 'antiquity',
    'middle ages': 'middle ages',
    medieval: 'middle ages',
    'modern age': 'modern age',
    modern: 'modern age',
    contemporary: 'contemporary',
    present: 'contemporary',
    current: 'contemporary',
    future: 'future',
    futuristic: 'future',
    'science fiction': 'future',
    scifi: 'future',
    'sci-fi': 'future',
    undefined: 'undefined',
    unknown: 'undefined',
  };
  return directMap[normalized] ?? 'undefined';
}

function tokenizeBookInfo(text?: string | null): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);
}

function getBookInfoSnapshot(bookTitle: string): BookInfoSnapshot | null {
  try {
    const registryPath = path.join(getAudiobooksDir(), bookTitle, 'character_registry.json');
    if (!fs.existsSync(registryPath)) return null;
    const raw = fs.readFileSync(registryPath, 'utf8');
    const parsed = JSON.parse(raw) as { bookInfo?: BookInfoSnapshot };
    if (!parsed.bookInfo) return null;
    return {
      genre: parsed.bookInfo.genre,
      tone: parsed.bookInfo.tone,
      voiceTone: parsed.bookInfo.voiceTone,
      period: normalizeBookPeriod(parsed.bookInfo.period),
    };
  } catch (error) {
    console.warn('⚠️ Failed to load character registry bookInfo:', error);
    return null;
  }
}

function getAmbienceCacheKey(bookTitle: string, chapterIndex: number): string {
  return `${bookTitle}::${chapterIndex}`;
}

function buildAmbientCatalogList(catalog: SoundLibraryCatalog): string {
  return catalog.assets
    .filter(asset => asset.type === 'ambient')
    .map(asset => {
      const fileName = path.basename(asset.filePath);
      const genres = asset.genre?.join(', ') ?? 'none';
      const moods = asset.mood?.join(', ') ?? 'none';
      return `- ${asset.id} | genre: ${genres} | mood: ${moods} | file: ${fileName}`;
    })
    .join('\n');
}

async function callGeminiForAmbience(prompt: string): Promise<string> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || '';
  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT environment variable not set');
  }

  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const model = LLM_MODELS.CHARACTER || 'gemini-2.5-flash';
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const requestBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: LLM_TEMPERATURES.CHARACTER_ANALYSIS,
      maxOutputTokens: Math.min(4096, LLM_GENERATION_CONFIG.MAX_TOKENS_SPEECH_STYLE),
      topP: LLM_GENERATION_CONFIG.TOP_P,
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('No text in Gemini response');
  }

  return text.trim();
}

function parseAmbienceMap(rawText: string, catalog: SoundLibraryCatalog): AmbienceMapResult | null {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as AmbienceMapResult;
    if (!parsed || !Array.isArray(parsed.ambience)) {
      return { ambience: [] };
    }

    const ambientIds = new Set(
      catalog.assets.filter(a => a.type === 'ambient').map(a => a.id)
    );

    const sanitized = parsed.ambience
      .filter(item => item && typeof item.assetId === 'string')
      .filter(item => ambientIds.has(item.assetId))
      .map(item => ({
        assetId: item.assetId,
        start: Number.isFinite(item.start) ? item.start : 0,
        end: Number.isFinite(item.end) ? item.end : 0,
      }))
      .map(item => ({
        ...item,
        start: Math.min(Math.max(item.start, 0), 1),
        end: Math.min(Math.max(item.end, 0), 1),
      }))
      .filter(item => item.end > item.start);

    if (sanitized.length === 0) {
      return { ambience: [] };
    }

    const sorted = sanitized.sort((a, b) => a.start - b.start || b.end - a.end);
    const nonOverlapping: AmbienceMapItem[] = [];
    for (const item of sorted) {
      const last = nonOverlapping[nonOverlapping.length - 1];
      if (!last) {
        nonOverlapping.push(item);
        continue;
      }
      if (item.start >= last.end) {
        nonOverlapping.push(item);
        continue;
      }
      const lastDuration = last.end - last.start;
      const currentDuration = item.end - item.start;
      if (currentDuration > lastDuration) {
        nonOverlapping[nonOverlapping.length - 1] = item;
      }
    }

    return { ambience: nonOverlapping };
  } catch (error) {
    console.warn('⚠️ Failed to parse ambience map JSON:', error);
    return null;
  }
}

export function queueChapterAmbienceMap(options: {
  bookTitle: string;
  chapterIndex: number;
  chapterText: string;
}): void {
  if (!isSoundscapeEnabled()) return;
  const cacheKey = getAmbienceCacheKey(options.bookTitle, options.chapterIndex);
  if (ambienceMapCache.has(cacheKey)) return;

  const catalog = loadCatalog();
  if (!catalog) return;

  const ambientList = buildAmbientCatalogList(catalog);
  const prompt = getChapterAmbienceMapPrompt(options.chapterText, ambientList);

  const promise = callGeminiForAmbience(prompt)
    .then(text => parseAmbienceMap(text, catalog))
    .catch(error => {
      console.warn('⚠️ Ambience map LLM call failed:', error);
      return null;
    });

  ambienceMapCache.set(cacheKey, promise);
}

async function resolveChapterAmbienceMap(bookTitle: string, chapterIndex: number): Promise<AmbienceMapResult | null> {
  const cacheKey = getAmbienceCacheKey(bookTitle, chapterIndex);
  const promise = ambienceMapCache.get(cacheKey);
  if (!promise) return null;
  return promise;
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

function selectThemeAsset(
  catalog: SoundLibraryCatalog,
  options: SoundscapePreferences | undefined,
  bookInfo: BookInfoSnapshot | null
): SoundAsset | undefined {
  const resolvePath = (filePath: string) => path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
  const musicAssets = catalog.assets.filter(asset => asset.type === 'music');
  if (musicAssets.length === 0) return undefined;

  if (options?.soundscapeThemeId) {
    const match = musicAssets.find(asset => asset.id === options.soundscapeThemeId);
    if (match && fs.existsSync(resolvePath(match.filePath))) {
      return match;
    }
  }

  const fallbackTheme = musicAssets.find(asset => asset.id === 'fallback_theme_1');

  if (!bookInfo) {
    if (fallbackTheme && fs.existsSync(resolvePath(fallbackTheme.filePath))) {
      return fallbackTheme;
    }
    return musicAssets
      .filter(asset => fs.existsSync(resolvePath(asset.filePath)))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
  }

  const genreTokens = tokenizeBookInfo(bookInfo.genre);
  const toneTokens = tokenizeBookInfo(bookInfo.tone);
  const voiceTokens = tokenizeBookInfo(bookInfo.voiceTone);
  const periodToken = bookInfo.period && bookInfo.period !== 'undefined'
    ? bookInfo.period.toLowerCase()
    : null;

  const scored = musicAssets.map(asset => {
    const assetTokens = new Set<string>([
      ...(asset.genre ?? []),
      ...(asset.mood ?? []),
      asset.id.replace(/[_-]+/g, ' '),
    ].flatMap(tokenizeBookInfo));

    const genreScore = genreTokens.filter(t => assetTokens.has(t)).length;
    const toneScore = toneTokens.filter(t => assetTokens.has(t)).length;
    const voiceScore = voiceTokens.filter(t => assetTokens.has(t)).length;
    const periodScore = periodToken && assetTokens.has(periodToken.replace(/\s+/g, ' '))
      ? 1
      : (periodToken && assetTokens.has(periodToken.replace(/\s+/g, '')) ? 1 : 0);

    return { asset, genreScore, toneScore, voiceScore, periodScore };
  });

  scored.sort((a, b) => {
    if (a.genreScore !== b.genreScore) return b.genreScore - a.genreScore;
    if (a.toneScore !== b.toneScore) return b.toneScore - a.toneScore;
    if (a.voiceScore !== b.voiceScore) return b.voiceScore - a.voiceScore;
    if (a.periodScore !== b.periodScore) return b.periodScore - a.periodScore;
    return a.asset.id.localeCompare(b.asset.id);
  });

  const best = scored[0];
  const hasMatch = !!best && (best.genreScore + best.toneScore + best.voiceScore + best.periodScore) > 0;

  if (!hasMatch) {
    if (fallbackTheme && fs.existsSync(resolvePath(fallbackTheme.filePath))) {
      return fallbackTheme;
    }
    return musicAssets
      .filter(asset => fs.existsSync(resolvePath(asset.filePath)))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
  }

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

function buildAmbientLayerCommand(
  segments: Array<{ assetPath: string; startMs: number; durationMs: number; loop: boolean }>,
  outputPath: string,
  totalDurationMs: number
): string[] {
  const args: string[] = [];
  for (const segment of segments) {
    if (segment.loop) {
      args.push('-stream_loop', '-1');
    }
    args.push('-i', segment.assetPath);
  }

  const filters: string[] = [];
  segments.forEach((segment, index) => {
    const durationSec = Math.max(segment.durationMs / 1000, 0.5);
    filters.push(
      `[${index}:a]atrim=0:${durationSec},asetpts=PTS-STARTPTS,adelay=${segment.startMs}|${segment.startMs}[amb${index}]`
    );
  });

  const totalDurationSec = Math.max(totalDurationMs / 1000, 0.5);
  filters.push(`anullsrc=r=24000:cl=mono,atrim=0:${totalDurationSec}[base]`);
  const mixInputs = ['[base]', ...segments.map((_, idx) => `[amb${idx}]`)].join('');
  filters.push(`${mixInputs}amix=inputs=${segments.length + 1}:duration=first:dropout_transition=2:normalize=0[amb]`);

  return [
    ...args,
    '-filter_complex', filters.join(';'),
    '-map', '[amb]',
    '-ar', '24000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    outputPath,
  ];
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

async function getAudioDurationMs(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('error', () => resolve(null));
    child.on('close', () => {
      const value = Number(stdout.trim());
      if (!Number.isFinite(value) || value <= 0) {
        resolve(null);
        return;
      }
      resolve(Math.round(value * 1000));
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
    const ambienceMap = await resolveChapterAmbienceMap(options.bookTitle, options.chapterIndex);
    const ambienceMapToSave = ambienceMap ?? { ambience: [] };
    try {
      const bookDir = path.join(getAudiobooksDir(), options.bookTitle);
      if (!fs.existsSync(bookDir)) {
        fs.mkdirSync(bookDir, { recursive: true });
      }
      const mapPath = path.join(bookDir, `ambience_map_ch${options.chapterIndex.toString().padStart(2, '0')}.json`);
      fs.writeFileSync(mapPath, JSON.stringify(ambienceMapToSave, null, 2), 'utf8');
    } catch (error) {
      console.warn('⚠️ Failed to save ambience map JSON:', error);
    }

    if (!ambienceMap || ambienceMap.ambience.length === 0) {
      console.warn('⚠️ No ambience map available for soundscape mix');
    } else {
      const speechBuffer = fs.readFileSync(options.chapterPath);
      const speechDurationMs = estimateAudioDuration(speechBuffer) * 1000;
      const totalDurationMs = speechDurationMs + AMBIENT_PRE_ROLL_MS + AMBIENT_POST_ROLL_MS;

      const segments = (await Promise.all(ambienceMap.ambience.map(async (item) => {
          const asset = catalog.assets.find(a => a.id === item.assetId && a.type === 'ambient');
          if (!asset) return null;
          const assetPath = resolveAssetPath(asset.filePath);
          if (!fs.existsSync(assetPath)) {
            console.warn(`⚠️ Ambient file missing: ${assetPath}`);
            return null;
          }
          const startMs = AMBIENT_PRE_ROLL_MS + Math.round(item.start * speechDurationMs);
          const endMs = AMBIENT_PRE_ROLL_MS + Math.round(item.end * speechDurationMs);
          const durationMs = Math.max(endMs - startMs, 500);
          const assetDurationMs = await getAudioDurationMs(assetPath);
          const loop = assetDurationMs !== null && assetDurationMs < durationMs;
          return { assetPath, startMs, durationMs, assetId: asset.id, loop };
        })))
        .filter((item): item is { assetPath: string; startMs: number; durationMs: number; assetId: string; loop: boolean } => Boolean(item));

      if (segments.length === 0) {
        console.warn('⚠️ No valid ambient assets resolved for ambience map');
      } else {
        console.log(`🌿 Soundscape ambience map: ${options.bookTitle} ch${options.chapterIndex} -> ${segments.map(s => s.assetId).join(', ')}`);
        const tempDir = getTempAudioDir();
        const ambientLayerPath = path.join(tempDir, `ambience_layer_${options.chapterIndex}.wav`);
        const layerArgs = buildAmbientLayerCommand(
          segments.map(s => ({ assetPath: s.assetPath, startMs: s.startMs, durationMs: s.durationMs, loop: s.loop })),
          ambientLayerPath,
          totalDurationMs
        );
        const layerResult = await runFfmpeg(layerArgs);
        if (layerResult.code !== 0) {
          console.error('✗ ffmpeg ambience layer build failed:', layerResult.stderr);
        } else {
          const args = buildMixCommand(options.chapterPath, ambientLayerPath, soundscapeBasePath, getMixOptions(), speechDurationMs);
          const result = await runFfmpeg(args);
          if (result.code !== 0) {
            console.error('✗ ffmpeg soundscape mix failed:', result.stderr);
            return options.chapterPath;
          }
          basePath = soundscapeBasePath;
        }
        if (fs.existsSync(ambientLayerPath)) {
          fs.unlinkSync(ambientLayerPath);
        }
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
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
    const bookInfo = getBookInfoSnapshot(options.bookTitle);
    const theme = selectThemeAsset(catalog, options.preferences, bookInfo);
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
