/**
 * Soundscape Module — Type Definitions
 *
 * Core interfaces for the parallel soundscape pipeline:
 *   Intro (music + TTS overlay) | Voice TTS | Ambient Layer
 *
 * All three run in parallel after character extraction.
 */

// ========================================
// Sound Asset Types
// ========================================

export type SoundAssetType = 'music' | 'ambient' | 'sfx';

/** A single sound file from the library (ambient, SFX, or music track) */
export interface SoundAsset {
  id: string;
  type: SoundAssetType;
  /** Absolute path to the .ogg file */
  filePath: string;
  /** Catalog description or filename-derived label */
  description: string;
  /** Search keywords (from catalog or filename parsing) */
  keywords: string[];
  /** Genre tags (e.g. 'forest', 'rain', 'medieval', 'orchestral') */
  genre: string[];
  /** Mood tags (e.g. 'dark', 'calm', 'epic', 'spooky') */
  mood: string[];
  /** Duration in seconds (if known from catalog) */
  durationSec?: number;
  /** Recommended playback volume in dB (negative = quieter) */
  recommendedVolumeDb?: number;
  /** Whether the asset is suitable for looping */
  loopable?: boolean;
  /** Measured loudness in LUFS (for normalization) */
  loudnessLUFS?: number;
  /** Catalog category (e.g. 'RAIN_01', 'AMBIENCE_NATURE') */
  category?: string;
  /** Catalog subcategory (e.g. 'CONCRETE', 'Forrest') */
  subcategory?: string;
}

// ========================================
// Book & Character Registry (read-only)
// ========================================

/** Book-level metadata from character_registry.json */
export interface BookInfo {
  genre: string;
  tone: string;
  voiceTone: string;
  period: string;
  locked: boolean;
  /** Book title (optional, used by LLM music selector) */
  title?: string;
  /** Book author (optional, used by LLM music selector) */
  author?: string;
}

/** Character from character_registry.json */
export interface CharacterEntry {
  id: string;
  primaryName: string;
  aliases: string[];
  voice: string;
  gender: string;
  role: string;
  firstSeenChapter: number;
  lastSeenChapter: number;
}

/** Full character registry as written by the dramatization pipeline */
export interface CharacterRegistry {
  exportedAt: string;
  bookInfo: BookInfo;
  narratorVoice: string;
  narratorInstruction: string;
  characterCount: number;
  characters: CharacterEntry[];
  voiceMap: Record<string, string>;
}

// ========================================
// Scene Analysis (LLM Director output)
// ========================================

/**
 * A single scene segment within a chapter's soundscape timeline.
 * The LLM Director produces 1–6 segments per chapter; each marks where a
 * new environment begins (first segment always has charIndex = 0).
 */
export interface SceneSegment {
  /** Character offset where this scene begins (0 for first segment) */
  charIndex: number;
  /** Primary environment description (e.g. 'forest', 'castle interior') */
  environment: string;
  /** English search queries for ambient asset matching */
  searchSnippets: string[];
  /** Mood descriptors for this segment */
  moods: string[];
}

/**
 * A single SFX event with precise placement information.
 *
 * `charIndex` is the character offset within the chapter text where the
 * sound event occurs. Mapped to a silence gap at render time via
 * `calculateSfxOffsetFromGaps()` in subchunkSoundscape.ts.
 */
export interface SfxEvent {
  /** English search query for SFX catalog matching (e.g. 'door slamming wood') */
  query: string;
  /** Character offset in the chapter text where this sound occurs */
  charIndex: number;
  /** Human-readable description of what the sound is (for logging/debugging) */
  description: string;
}

/** LLM-generated scene analysis for a single chapter */
export interface SceneAnalysis {
  chapterIndex: number;
  /** Time of day (e.g. 'night', 'dawn', 'midday') */
  timeOfDay: string;
  /** Weather if applicable (e.g. 'rain', 'storm', 'clear') */
  weather: string;
  /** Mood descriptors for the dominant chapter scene */
  moods: string[];
  /** Specific sound elements mentioned (e.g. 'crackling fire', 'horses') */
  soundElements: string[];
  /** Overall intensity 0-1 (quiet/calm → loud/intense) */
  intensity: number;
  /**
   * Fine-grained ambient timeline: 1–6 ordered scene segments, each with
   * its own environment and search queries. First segment always has charIndex = 0.
   * Used for multi-scene ambient generation within a single subchunk.
   */
  sceneSegments: SceneSegment[];
  /**
   * SFX events with character-index placement in the chapter text.
   * Each event's charIndex is mapped to a silence gap midpoint at render time
   * via `calculateSfxOffsetFromGaps()` in subchunkSoundscape.ts.
   */
  sfxEvents: SfxEvent[];
}

/** Complete soundscape plan for an entire book */
export interface BookSoundscapePlan {
  bookTitle: string;
  bookInfo: BookInfo;
  musicTrackPath: string | null;
  chapters: ChapterSoundscapePlan[];
}

/** Per-chapter soundscape plan */
export interface ChapterSoundscapePlan {
  chapterIndex: number;
  scene: SceneAnalysis;
  ambientAsset: SoundAsset | null;
  /** Volume for ambient layer (dB) */
  ambientVolumeDb: number;
}

// ========================================
// Intro Generation
// ========================================

/** Voice overlay segment within an intro */
export interface VoiceOverlay {
  /** Text to synthesize (may be translated) */
  text: string;
  /** Absolute start time in ms (if fixed) */
  startMs?: number;
  /** Gap after previous segment ends (ms) */
  gapAfterMs?: number;
}

/** Intro specification (book-level or chapter-level) */
export interface IntroSpec {
  /** Total intro duration in ms (music bed length) */
  totalDurationMs?: number;
  /** Voice overlay segments to duck under music */
  voiceOverlays: VoiceOverlay[];
  /** Silence appended after intro (ms) */
  endSilenceMs: number;
}

/** Result of intro generation */
export interface IntroResult {
  /** Path to the generated intro WAV file */
  introPath: string;
  /** Duration of the intro in ms */
  durationMs: number;
}

// ========================================
// Embeddings
// ========================================

/** A single embedding vector with its associated asset ID */
export interface EmbeddingEntry {
  id: string;
  /** The text that was embedded (description or filename) */
  text: string;
  /** Embedding vector (768 dimensions, truncated from gemini-embedding-001's 3072 default) */
  vector: number[];
}

/** Persisted embedding index (JSON file) */
export interface EmbeddingIndex {
  model: string;
  dimensions: number;
  createdAt: string;
  entries: EmbeddingEntry[];
}

/** Search result from embedding similarity */
export interface EmbeddingSearchResult {
  id: string;
  text: string;
  score: number;
}

// ========================================
// Music Selection
// ========================================

/** Result of music selection */
export interface MusicSelectionResult {
  asset: SoundAsset;
  /** Why this track was chosen */
  matchReason: string;
  /** Similarity score if embedding-based */
  score?: number;
}

// ========================================
// Pipeline Orchestration
// ========================================

/** Options for the soundscape pipeline */
export interface SoundscapePipelineOptions {
  bookTitle: string;
  bookDir: string;
  characterRegistry: CharacterRegistry;
  /** Chapter metadata for intro text */
  chapters: Array<{
    index: number;
    title: string;
    text: string;
  }>;
  /** Language code for intro TTS (e.g. 'sk-SK') */
  targetLanguage: string | null;
  /** Narrator voice for intro TTS */
  narratorVoice: string;
  /** User preferences (toggles) */
  preferences?: SoundscapePreferences;
}

/** User preferences for soundscape (from AudiobookMetadata.userPreferences) */
export interface SoundscapePreferences {
  soundscapeMusicEnabled?: boolean;
  soundscapeAmbientEnabled?: boolean;
  soundscapeThemeId?: string;
}

// ========================================
// FFmpeg
// ========================================

export interface FfmpegResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** A detected silence gap from ffmpeg silencedetect */
export interface SilenceGap {
  startSec: number;
  endSec: number;
  midpointMs: number;
}
