/**
 * Soundscape Module — Configuration
 *
 * All tuneable constants centralized here.
 * Values ported from the production-proven legacy soundscapeIntegration.ts.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import type { GenreMusicMap } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========================================
// Paths
// ========================================

/** Project root (3 levels up from soundscape/src/) */
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/** Root of the soundscape asset library */
export const ASSETS_ROOT = path.resolve(__dirname, '..', 'assets');

/** Music subfolder */
export const MUSIC_ASSETS_DIR = path.join(ASSETS_ROOT, 'music');

/** Ambient catalog CSV */
export const CATALOG_CSV_PATH = path.join(ASSETS_ROOT, 'voicelibri_assets_catalog.csv');

/** Persisted embedding index for ambient assets */
export const AMBIENT_EMBEDDINGS_PATH = path.join(ASSETS_ROOT, 'ambient_embeddings.json');

/** Persisted embedding index for music filenames */
export const MUSIC_EMBEDDINGS_PATH = path.join(ASSETS_ROOT, 'music_embeddings.json');

// ========================================
// Feature toggles (env-driven)
// ========================================

export function isSoundscapeEnabled(): boolean {
  const raw = process.env.SOUNDSCAPE_ENABLED ?? process.env.SOUNDSCAPE_AMBIENT_ENABLED;
  return raw === '1' || raw === 'true';
}

// ========================================
// Audio output format
// ========================================

export const AUDIO_SAMPLE_RATE = 24000;
export const AUDIO_CHANNELS = 1;
export const AUDIO_CODEC = 'pcm_s16le';

// ========================================
// Ambient layer
// ========================================

/** dB level for ambient loop under narration */
export const AMBIENT_DEFAULT_DB = -6;

/** Fade durations for ambient entry/exit (ms) */
export const AMBIENT_FADE_MS = 2000;

/** Ambient starts this many ms BEFORE narration */
export const AMBIENT_PRE_ROLL_MS = 4000;

/** Ambient lingers this many ms AFTER narration */
export const AMBIENT_POST_ROLL_MS = 4000;

// ========================================
// Intro music — timing (ms)
// ========================================

/** Fade in / out on the music bed */
export const INTRO_FADE_MS = 3500;

/** Silence appended after intro ends */
export const INTRO_END_SILENCE_MS = 3000;

/** Silence before chapter-level intro starts */
export const INTRO_CHAPTER_START_SILENCE_MS = 3000;

/** Gap between chapter number and chapter title */
export const INTRO_CHAPTER_GAP_MS = 2000;

/** Gap between title and author */
export const INTRO_TITLE_AUTHOR_GAP_MS = 2000;

/** Gap between author and VoiceLibri tagline */
export const INTRO_AUTHOR_VOICELIBRI_GAP_MS = 4000;

/** Gap between tagline and chapter title */
export const INTRO_VOICELIBRI_CHAPTER_GAP_MS = 4000;

/** Extra music after last voice overlay */
export const INTRO_END_MUSIC_EXTENSION_MS = 3750;

// ========================================
// Intro music — volume (dB)
// ========================================

/** Ducking ramp duration (ms) */
export const RAMP_MS = 2000;

/** Full-volume boost applied to music bed */
export const MUSIC_FULL_BOOST_DB = 10.5;

/** Boost applied to music when ducked behind voice */
export const MUSIC_BACKGROUND_BOOST_DB = 4.5;

/** Base music level when ducked */
export const MUSIC_BACKGROUND_DB = -21.5;

/** Voice boost over music */
export const INTRO_VOICE_BOOST_DB = 2;

/** Default narrator voice for intros */
export const INTRO_NARRATOR_VOICE = 'Algieba';

// ========================================
// Embeddings
// ========================================

/** Gemini embedding model */
export const EMBEDDING_MODEL = 'gemini-embedding-001';

/** Embedding vector dimensions */
export const EMBEDDING_DIMENSIONS = 384;

/** Max texts per embedding API call */
export const EMBEDDING_BATCH_SIZE = 100;

// ========================================
// LLM Director
// ========================================

/** Model for scene analysis */
export const SCENE_ANALYSIS_MODEL = 'gemini-2.0-flash';

// ========================================
// Music genre mapping
// ========================================

/**
 * Maps book genres/tones to music asset folders.
 * First-pass: deterministic folder selection.
 * Second-pass: embedding search within selected folders.
 */
export const GENRE_MUSIC_MAP: GenreMusicMap = {
  // Book genres → music folders
  fantasy: ['Medieval', 'Orchestral', 'Celtic', 'New Age'],
  'science fiction': ['Electronic', 'New Age', 'Orchestral'],
  scifi: ['Electronic', 'New Age', 'Orchestral'],
  horror: ['Orchestral', 'Psychedelic', 'Electronic'],
  thriller: ['Orchestral', 'Electronic'],
  mystery: ['Orchestral', 'Classical', 'Electronic'],
  romance: ['Classical', 'Folk', 'New Age'],
  historical: ['Classical', 'Orchestral', 'Medieval', 'Antiquity'],
  'historical fiction': ['Classical', 'Orchestral', 'Medieval', 'Antiquity'],
  adventure: ['Orchestral', 'Celtic', 'Folk', 'World'],
  drama: ['Classical', 'Orchestral', 'Folk'],
  comedy: ['Folk', 'Country', 'Pop', 'Children'],
  children: ['Children', 'Folk', 'Classical'],
  war: ['Orchestral', 'Brass', 'World'],
  western: ['Country', 'Folk'],
  literary: ['Classical', 'New Age'],
  epic: ['Orchestral', 'Medieval', 'Brass', 'World'],
  mythology: ['Antiquity', 'World', 'Orchestral'],
  fairy_tale: ['Celtic', 'Folk', 'Children', 'Classical'],

  // Tone/mood fallbacks
  dark: ['Orchestral', 'Psychedelic', 'Electronic'],
  calm: ['New Age', 'Classical', 'Folk'],
  epic_tone: ['Orchestral', 'Brass', 'World'],
  suspenseful: ['Orchestral', 'Electronic', 'Psychedelic'],
  romantic: ['Classical', 'Folk', 'New Age'],
  whimsical: ['Celtic', 'Folk', 'Children'],

  // Period fallbacks
  medieval: ['Medieval', 'Celtic', 'Antiquity'],
  ancient: ['Antiquity', 'World'],
  modern: ['Electronic', 'Pop'],
  victorian: ['Classical', 'Orchestral'],
  renaissance: ['Classical', 'Antiquity'],
};

/** Default folders when no genre match */
export const DEFAULT_MUSIC_FOLDERS = ['Orchestral', 'Classical'];

// ========================================
// Keyword map (fallback for non-LLM scene tagging)
// ========================================

export const DEFAULT_KEYWORD_MAP: Record<string, string[]> = {
  forest: ['forest', 'woods', 'trees', 'pine', 'jungle', 'grove', 'thicket'],
  rain: ['rain', 'storm', 'thunder', 'lightning', 'downpour', 'drizzle'],
  sea: ['sea', 'ocean', 'wave', 'shore', 'harbor', 'beach', 'coast', 'sail'],
  city: ['city', 'street', 'traffic', 'crowd', 'market', 'tavern', 'inn', 'pub'],
  interior: ['room', 'hall', 'castle', 'cathedral', 'church', 'chamber', 'dungeon'],
  sciFi: ['spaceship', 'engine', 'hull', 'airlock', 'android', 'laser', 'reactor'],
  fire: ['fire', 'flame', 'smoke', 'campfire', 'torch', 'hearth', 'fireplace'],
  wind: ['wind', 'breeze', 'gust', 'howling wind', 'gale'],
  cave: ['cave', 'tunnel', 'underground', 'cavern', 'mine', 'grotto'],
  water: ['river', 'stream', 'waterfall', 'creek', 'pond', 'lake', 'fountain'],
  birds: ['bird', 'chirp', 'songbird', 'robin', 'crow', 'raven', 'owl', 'hawk'],
  battle: ['sword', 'battle', 'fight', 'clash', 'armor', 'shield', 'war'],
  night: ['night', 'midnight', 'dark', 'moonlight', 'starlight', 'nocturnal'],
  horses: ['horse', 'gallop', 'trot', 'hooves', 'stable', 'carriage', 'wagon'],
};
