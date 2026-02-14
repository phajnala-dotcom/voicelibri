/**
 * Soundscape Module — Public API
 *
 * Re-exports all modules for clean consumption by the backend pipeline.
 *
 * Architecture:
 *   config.ts          → Constants, paths, genre mapping
 *   types.ts           → All TypeScript interfaces
 *   ffmpegRunner.ts    → Thin ffmpeg wrapper
 *   embeddings.ts      → Gemini embedding-001 vector search
 *   catalogLoader.ts   → CSV catalog → SoundAsset[]
 *   musicSelector.ts   → Hybrid genre-map + embedding music selection
 *   llmDirector.ts     → LLM-based scene analysis per chapter
 *   assetResolver.ts   → Embedding search for ambient asset matching
 *   introGenerator.ts  → Music bed + voice overlay intros
 *   ambientLayer.ts    → Per-chapter ambient WAV generation
 *   audioMixer.ts      → Final merge: voice + ambient + intro
 */

// Types
export type {
  SoundAsset,
  SoundAssetType,
  BookInfo,
  CharacterEntry,
  CharacterRegistry,
  SceneAnalysis,
  BookSoundscapePlan,
  ChapterSoundscapePlan,
  VoiceOverlay,
  IntroSpec,
  IntroResult,
  EmbeddingEntry,
  EmbeddingIndex,
  EmbeddingSearchResult,
  GenreMusicMap,
  MusicSelectionResult,
  SoundscapePipelineOptions,
  SoundscapePreferences,
  ChapterSoundscapeResult,
  FfmpegResult,
} from './types.js';

// Config
export {
  isSoundscapeEnabled,
  ASSETS_ROOT,
  MUSIC_ASSETS_DIR,
  CATALOG_CSV_PATH,
  AMBIENT_EMBEDDINGS_PATH,
  MUSIC_EMBEDDINGS_PATH,
  AMBIENT_DEFAULT_DB,
  GENRE_MUSIC_MAP,
  DEFAULT_KEYWORD_MAP,
  EMBEDDING_MODEL,
  EMBEDDING_CONCURRENCY,
  SCENE_ANALYSIS_MODEL,
  INTRO_NARRATOR_VOICE,
} from './config.js';

// FFmpeg
export { runFfmpeg } from './ffmpegRunner.js';

// Embeddings
export {
  buildEmbeddingIndex,
  saveEmbeddingIndex,
  loadEmbeddingIndex,
  searchEmbeddings,
  searchEmbeddingsWithVector,
  getAmbientIndex,
  setAmbientIndex,
  getMusicIndex,
  setMusicIndex,
} from './embeddings.js';

// Catalog
export {
  loadCatalog,
  clearCatalogCache,
  getAssetsByCategory,
  getAssetById,
} from './catalogLoader.js';

// Music selection
export {
  scanMusicAssets,
  resolveMusicFolders,
  selectMusicTrack,
  selectChapterMusic,
  ensureMusicEmbeddingIndex,
} from './musicSelector.js';

// LLM Director
export {
  analyzeChapterScene,
  analyzeAllChapters,
  buildFallbackScene,
} from './llmDirector.js';

// Asset resolver
export {
  ensureAmbientEmbeddingIndex,
  resolveAmbientAsset,
  resolveAllChapterAssets,
  resolveByKeyword,
} from './assetResolver.js';

// Intro generator
export {
  initIntroGenerator,
  buildBookIntroSpec,
  buildChapterIntroSpec,
  generateIntro,
  generateAllIntros,
} from './introGenerator.js';

// Ambient layer
export {
  generateAmbientTrack,
  generateAllAmbientTracks,
} from './ambientLayer.js';

// Audio mixer
export {
  mixAmbientWithVoice,
  prependIntro,
  processChapter,
  processAllChapters,
} from './audioMixer.js';
