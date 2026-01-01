/**
 * Parallel Pipeline Manager - Orchestrates parallel TTS generation
 * 
 * ARCHITECTURE (chunk layer ELIMINATED):
 * Chapter → Sub-chunks → subchunk_CCC_SSS.wav → chapter.wav
 * 
 * NO MORE:
 * - BOOK_CHUNKS array
 * - CHUNK_INFOS array  
 * - chunk_XXX.wav temp files
 * - Intermediate chunk concatenation
 * 
 * PIPELINE FLOW:
 * [Phase 1: BLOCKING]
 * ├── analyzeInitialChapters(ch 0-2) → Full character DB
 * ├── assignVoices() → LOCK voice assignments
 * └── Split ch 0 → sub-chunks → Ready for TTS
 * 
 * [Phase 2: PARALLEL]
 * ├── enrichFromChapter(ch 3+) ← Background character enrichment
 * ├── dramatizeChapter(ch 1, 2, ...) ← Sequential per chapter
 * ├── generateSubChunks(ch 0, parallel=2) ← TTS for ready chapters
 * └── playSubChunk(first ready if >1500 chars) ← Playback starts ASAP
 */

import { Chapter } from './bookChunker.js';
import { 
  CharacterProfile, 
  GeminiCharacterAnalyzer, 
  GeminiConfig,
  InitialAnalysisResult,
  EnrichmentResult
} from './llmCharacterAnalyzer.js';
import { assignVoices, Character, VoiceMap } from './voiceAssigner.js';
import { chunkForTwoSpeakers, TwoSpeakerChunk } from './twoSpeakerChunker.js';
import { extractVoiceSegments } from './dramatizedChunkerSimple.js';

// ========================================
// Types
// ========================================

export interface PipelineConfig {
  /** Gemini API configuration */
  geminiConfig: GeminiConfig;
  /** Number of chapters for initial analysis (default: 3) */
  initialChapters: number;
  /** Number of parallel TTS calls (default: 2) */
  ttsParallelism: number;
  /** Narrator voice name */
  narratorVoice: string;
  /** Minimum sub-chunk size to start playback (chars) */
  minPlaybackChars: number;
}

export interface ChapterState {
  index: number;
  title: string;
  dramatizationStatus: 'pending' | 'in-progress' | 'completed' | 'error';
  dramatizedText?: string;
  subChunks: TwoSpeakerChunk[];
  generatedSubChunks: Set<number>;
  ttsStatus: 'pending' | 'in-progress' | 'completed';
}

export interface PipelineState {
  /** Character database (grows as chapters are processed) */
  characterDB: CharacterProfile[];
  /** Voice assignments - LOCKED after Phase 1 */
  voiceAssignments: VoiceMap;
  /** Whether voices are locked (no more reassignments) */
  voicesLocked: boolean;
  /** Per-chapter state */
  chapterStates: Map<number, ChapterState>;
  /** Current playback position */
  currentChapter: number;
  currentSubChunk: number;
  /** Pipeline status */
  status: 'idle' | 'initializing' | 'running' | 'paused' | 'completed' | 'error';
  /** Error message if status is 'error' */
  errorMessage?: string;
}

export interface SubChunkAudioResult {
  chapterIndex: number;
  subChunkIndex: number;
  audioBuffer: Buffer;
  filePath: string;
  duration: number;
  fromCache: boolean;
}

// ========================================
// Default Configuration
// ========================================

const DEFAULT_CONFIG: PipelineConfig = {
  geminiConfig: {
    projectId: '',
    location: 'us-central1',
  },
  initialChapters: 3,
  ttsParallelism: 2,
  narratorVoice: 'Achird',
  minPlaybackChars: 1500, // ~300 words, ~2 min audio
};

// ========================================
// Pipeline State Management
// ========================================

let pipelineState: PipelineState = createEmptyState();

function createEmptyState(): PipelineState {
  return {
    characterDB: [],
    voiceAssignments: {},
    voicesLocked: false,
    chapterStates: new Map(),
    currentChapter: 0,
    currentSubChunk: 0,
    status: 'idle',
  };
}

/**
 * Reset pipeline state (call when loading new book)
 */
export function resetPipeline(): void {
  pipelineState = createEmptyState();
  console.log('🔄 Pipeline state reset');
}

/**
 * Get current pipeline state (for debugging/UI)
 */
export function getPipelineState(): Readonly<PipelineState> {
  return pipelineState;
}

// ========================================
// Phase 1: Initial Character Analysis (BLOCKING)
// ========================================

/**
 * Initialize pipeline with Phase 1 character analysis
 * 
 * This is BLOCKING because voice assignment requires character info.
 * 
 * @param chapters - All book chapters
 * @param config - Pipeline configuration
 * @returns Initial analysis result
 */
export async function initializePipeline(
  chapters: Chapter[],
  config: Partial<PipelineConfig> = {}
): Promise<InitialAnalysisResult> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  if (!fullConfig.geminiConfig.projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT not configured');
  }
  
  console.log('\n🚀 PARALLEL PIPELINE - Phase 1 (BLOCKING)');
  console.log('==========================================');
  
  pipelineState.status = 'initializing';
  
  // Initialize chapter states
  for (let i = 0; i < chapters.length; i++) {
    pipelineState.chapterStates.set(i, {
      index: i,
      title: chapters[i].title,
      dramatizationStatus: 'pending',
      subChunks: [],
      generatedSubChunks: new Set(),
      ttsStatus: 'pending',
    });
  }
  
  // Create analyzer
  const analyzer = new GeminiCharacterAnalyzer(fullConfig.geminiConfig);
  
  // Phase 1: Analyze initial chapters
  const result = await analyzer.analyzeInitialChapters(
    chapters,
    fullConfig.initialChapters
  );
  
  pipelineState.characterDB = result.characters;
  
  // Assign voices based on character profiles
  const charactersForVoiceMap: Character[] = result.characters
    .filter(cp => cp.name !== 'NARRATOR')
    .map(cp => ({
      name: cp.name,
      gender: cp.gender === 'unknown' ? 'neutral' : cp.gender,
      traits: cp.traits || [],
      ageRange: cp.ageRange,
    }));
  
  pipelineState.voiceAssignments = assignVoices(charactersForVoiceMap, fullConfig.narratorVoice);
  pipelineState.voicesLocked = true; // LOCK voices - no more changes!
  
  console.log(`🔒 Voices LOCKED (${Object.keys(pipelineState.voiceAssignments).length} characters)`);
  for (const [character, voice] of Object.entries(pipelineState.voiceAssignments)) {
    console.log(`   ${character} → ${voice}`);
  }
  
  pipelineState.status = 'running';
  
  return result;
}

// ========================================
// Phase 2: Background Character Enrichment (PARALLEL)
// ========================================

/**
 * Enrich character DB from a chapter (runs in background)
 * 
 * - NEW characters get added with voice assignment
 * - EXISTING characters get enriched but voice stays LOCKED
 * 
 * @param chapter - Chapter to analyze
 * @param config - Pipeline configuration
 */
export async function enrichFromChapter(
  chapter: Chapter,
  config: Partial<PipelineConfig> = {}
): Promise<EnrichmentResult> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  if (!fullConfig.geminiConfig.projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT not configured');
  }
  
  const analyzer = new GeminiCharacterAnalyzer(fullConfig.geminiConfig);
  
  const result = await analyzer.enrichFromChapter(
    chapter.text,
    chapter.index,
    pipelineState.characterDB
  );
  
  // Add new characters to DB
  for (const newChar of result.newCharacters) {
    if (!pipelineState.characterDB.find(c => c.name.toUpperCase() === newChar.name.toUpperCase())) {
      pipelineState.characterDB.push(newChar);
      
      // Assign voice to new character (voices are locked but we add new ones)
      if (!pipelineState.voiceAssignments[newChar.name]) {
        const usedVoices = Object.values(pipelineState.voiceAssignments);
        const { selectVoiceForCharacter } = await import('./geminiVoices.js');
        const voice = selectVoiceForCharacter(
          newChar.name,
          newChar.gender === 'unknown' ? 'neutral' : newChar.gender,
          newChar.traits || [],
          usedVoices,
          newChar.ageRange
        );
        pipelineState.voiceAssignments[newChar.name] = voice.name;
        console.log(`   🆕 New character: ${newChar.name} → ${voice.name}`);
      }
    }
  }
  
  // Update enriched characters in DB (but NOT their voices)
  for (const enriched of result.enrichedCharacters) {
    const existing = pipelineState.characterDB.find(
      c => c.name.toUpperCase() === enriched.name.toUpperCase()
    );
    if (existing) {
      existing.traits = enriched.traits;
      existing.ageRange = enriched.ageRange || existing.ageRange;
      existing.role = enriched.role || existing.role;
      // Voice stays LOCKED - no change
    }
  }
  
  return result;
}

// ========================================
// Sub-chunk Generation (Direct from Chapter)
// ========================================

/**
 * Split a dramatized chapter into sub-chunks
 * 
 * This REPLACES the old chunk layer. Goes directly:
 * Chapter (dramatized) → Sub-chunks (ready for TTS)
 * 
 * @param chapterIndex - Chapter index
 * @param dramatizedText - Chapter text with [VOICE=] tags
 * @returns Array of two-speaker sub-chunks
 */
export function splitChapterToSubChunks(
  chapterIndex: number,
  dramatizedText: string
): TwoSpeakerChunk[] {
  const subChunks = chunkForTwoSpeakers(dramatizedText, undefined, chapterIndex);
  
  // Update chapter state
  const chapterState = pipelineState.chapterStates.get(chapterIndex);
  if (chapterState) {
    chapterState.subChunks = subChunks;
    chapterState.dramatizedText = dramatizedText;
    chapterState.dramatizationStatus = 'completed';
  }
  
  console.log(`   📦 Chapter ${chapterIndex + 1}: ${subChunks.length} sub-chunks`);
  
  return subChunks;
}

/**
 * Get sub-chunk for a specific position
 */
export function getSubChunk(chapterIndex: number, subChunkIndex: number): TwoSpeakerChunk | null {
  const chapterState = pipelineState.chapterStates.get(chapterIndex);
  if (!chapterState || subChunkIndex >= chapterState.subChunks.length) {
    return null;
  }
  return chapterState.subChunks[subChunkIndex];
}

/**
 * Get total sub-chunk count for a chapter
 */
export function getChapterSubChunkCount(chapterIndex: number): number {
  const chapterState = pipelineState.chapterStates.get(chapterIndex);
  return chapterState?.subChunks.length || 0;
}

/**
 * Check if first sub-chunk is ready for playback (>1500 chars)
 */
export function isReadyForPlayback(chapterIndex: number): boolean {
  const chapterState = pipelineState.chapterStates.get(chapterIndex);
  if (!chapterState || chapterState.subChunks.length === 0) {
    return false;
  }
  
  // Check if first sub-chunk has audio generated
  if (!chapterState.generatedSubChunks.has(0)) {
    return false;
  }
  
  // Check if sub-chunk is long enough (~2 min)
  const firstSubChunk = chapterState.subChunks[0];
  const charCount = firstSubChunk.segments.reduce((sum, s) => sum + s.text.length, 0);
  
  return charCount >= DEFAULT_CONFIG.minPlaybackChars;
}

/**
 * Mark a sub-chunk as generated
 */
export function markSubChunkGenerated(chapterIndex: number, subChunkIndex: number): void {
  const chapterState = pipelineState.chapterStates.get(chapterIndex);
  if (chapterState) {
    chapterState.generatedSubChunks.add(subChunkIndex);
    
    // Check if all sub-chunks generated
    if (chapterState.generatedSubChunks.size === chapterState.subChunks.length) {
      chapterState.ttsStatus = 'completed';
    } else {
      chapterState.ttsStatus = 'in-progress';
    }
  }
}

// ========================================
// Voice Map Access
// ========================================

/**
 * Get current voice assignments (for TTS generation)
 */
export function getVoiceAssignments(): Readonly<VoiceMap> {
  return pipelineState.voiceAssignments;
}

/**
 * Get character DB (for dramatization)
 */
export function getCharacterDB(): Readonly<CharacterProfile[]> {
  return pipelineState.characterDB;
}

// ========================================
// File Naming (New Convention)
// ========================================

/**
 * Generate sub-chunk temp file name
 * 
 * Format: subchunk_CCC_SSS.wav
 * Where CCC = chapter index (0-padded), SSS = sub-chunk index (0-padded)
 * 
 * Example: subchunk_001_023.wav (chapter 2, sub-chunk 24)
 */
export function getSubChunkFileName(chapterIndex: number, subChunkIndex: number): string {
  const chapterPad = String(chapterIndex).padStart(3, '0');
  const subChunkPad = String(subChunkIndex).padStart(3, '0');
  return `subchunk_${chapterPad}_${subChunkPad}.wav`;
}

/**
 * Parse sub-chunk file name to get indices
 */
export function parseSubChunkFileName(fileName: string): { chapterIndex: number; subChunkIndex: number } | null {
  const match = fileName.match(/^subchunk_(\d{3})_(\d{3})\.wav$/);
  if (!match) return null;
  return {
    chapterIndex: parseInt(match[1], 10),
    subChunkIndex: parseInt(match[2], 10),
  };
}

// ========================================
// Global Sub-chunk Index Mapping
// ========================================

/**
 * Convert global sub-chunk index to chapter + local sub-chunk index
 * 
 * This is needed for backward compatibility with frontend that uses global indices
 */
export function globalToLocalIndex(
  globalSubChunkIndex: number
): { chapterIndex: number; localSubChunkIndex: number } | null {
  let remaining = globalSubChunkIndex;
  
  for (const [chapterIdx, state] of pipelineState.chapterStates.entries()) {
    if (remaining < state.subChunks.length) {
      return {
        chapterIndex: chapterIdx,
        localSubChunkIndex: remaining,
      };
    }
    remaining -= state.subChunks.length;
  }
  
  return null;
}

/**
 * Convert chapter + local sub-chunk index to global index
 */
export function localToGlobalIndex(chapterIndex: number, localSubChunkIndex: number): number {
  let globalIndex = 0;
  
  for (let i = 0; i < chapterIndex; i++) {
    const state = pipelineState.chapterStates.get(i);
    globalIndex += state?.subChunks.length || 0;
  }
  
  return globalIndex + localSubChunkIndex;
}

/**
 * Get total sub-chunk count across all chapters
 */
export function getTotalSubChunkCount(): number {
  let total = 0;
  for (const state of pipelineState.chapterStates.values()) {
    total += state.subChunks.length;
  }
  return total;
}
