/**
 * Pipeline State Manager - Minimal module for book switching
 * 
 * NOTE: This file was reduced from ~470 lines to ~60 lines.
 * The original parallel pipeline orchestration was never fully implemented.
 * Only resetPipeline() is used by the current flow (in index.ts).
 * 
 * Original design preserved in:
 * - Git history
 * - handoffs/HANDOFF_PARALLEL_PIPELINE_REFACTOR.md
 */

// ========================================
// Types (minimal for state reset)
// ========================================

export interface PipelineState {
  /** Character database */
  characterDB: unknown[];
  /** Voice assignments */
  voiceAssignments: Record<string, string>;
  /** Whether voices are locked */
  voicesLocked: boolean;
  /** Per-chapter state */
  chapterStates: Map<number, unknown>;
  /** Current playback position */
  currentChapter: number;
  currentSubChunk: number;
  /** Pipeline status */
  status: 'idle' | 'initializing' | 'running' | 'paused' | 'completed' | 'error';
  /** Error message if status is 'error' */
  errorMessage?: string;
}

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
 * 
 * This is the ONLY exported function used by the current flow.
 * Called from index.ts when switching books.
 */
export function resetPipeline(): void {
  pipelineState = createEmptyState();
  console.log('🔄 Pipeline state reset');
}
