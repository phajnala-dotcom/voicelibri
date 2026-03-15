/**
 * Soundscape Module — Configuration
 *
 * All tuneable constants centralized here.
 * All values are tuneable via this single module.
 */

import path from 'path';
import { fileURLToPath } from 'url';

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

/** Persisted embedding index for SFX assets */
export const SFX_EMBEDDINGS_PATH = path.join(ASSETS_ROOT, 'sfx_embeddings.json');

/** Cache directory for ambient assets cropped to SFX-length clips */
export const CROPPED_SFX_CACHE_DIR = path.join(ASSETS_ROOT, 'cropped_sfx_cache');

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

export const AUDIO_SAMPLE_RATE = 48000;
export const AUDIO_CHANNELS = 2;
export const AUDIO_CODEC = 'libopus';

// ========================================
// Ambient layer
// ========================================

/** dB level for ambient loop under narration */
export const AMBIENT_DEFAULT_DB = -3;

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

/** Embedding vector dimensions (gemini-embedding-001 supports up to 3072; 768 balances quality vs memory for ~22K entries) */
export const EMBEDDING_DIMENSIONS = 768;

/** Max texts per embedding API call (gemini-embedding-001 only supports 1 text per request) */
export const EMBEDDING_BATCH_SIZE = 1;

/** Max concurrent embedding API requests */
export const EMBEDDING_CONCURRENCY = 5;

// ========================================
// LLM Director
// ========================================

/** Model for scene analysis */
export const SCENE_ANALYSIS_MODEL = 'gemini-2.5-flash';


