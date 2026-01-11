// VoiceLibri - Core Types
// Adapted from BookPlayer patterns for TypeScript/React

// ============================================
// BOOK & LIBRARY TYPES
// ============================================

export interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  totalDuration: number; // seconds
  progress?: PlaybackProgress;
  chapters: Chapter[];
  createdAt: Date;
  lastPlayedAt?: Date;
  isFinished: boolean;
  /** Local file path or remote URL */
  audioUrl: string;
}

export interface Chapter {
  id: string;
  title: string;
  index: number;
  start: number; // seconds
  end: number; // seconds
  duration: number; // seconds
}

export interface PlaybackProgress {
  position: number; // seconds
  chapterIndex: number;
  updatedAt: Date;
}

// ============================================
// PLAYER TYPES (BookPlayer-inspired)
// ============================================

export type PlaybackState = 'playing' | 'paused' | 'stopped' | 'loading';

export interface PlayerState {
  currentBook: Book | null;
  currentChapter: Chapter | null;
  playbackState: PlaybackState;
  currentTime: number;
  duration: number;
  speed: number;
  volume: number;
  isBuffering: boolean;
}

// Sleep timer states (from BookPlayer)
export type SleepTimerState = 
  | { type: 'off' }
  | { type: 'countdown'; remaining: number } // seconds
  | { type: 'endOfChapter' };

export const SLEEP_TIMER_PRESETS = [
  { label: '5 minutes', minutes: 5 },
  { label: '10 minutes', minutes: 10 },
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '45 minutes', minutes: 45 },
  { label: '1 hour', minutes: 60 },
  { label: 'End of chapter', type: 'chapter-end' as const },
] as const;

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0] as const;

// ============================================
// GENERATION TYPES
// ============================================

export type GenerationStatus = 
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'generating'
  | 'complete'
  | 'error';

export interface GenerationJob {
  id: string;
  bookTitle: string;
  status: GenerationStatus;
  progress: number; // 0-100
  estimatedTimeRemaining?: number; // seconds
  error?: string;
  createdAt: Date;
}

// ============================================
// USER & SETTINGS TYPES
// ============================================

export interface UserSettings {
  playbackSpeed: number;
  skipForwardDuration: number; // seconds
  skipBackwardDuration: number; // seconds
  sleepTimerDefault?: number; // minutes
  autoPlay: boolean;
  preferChapterContext: boolean;
  preferRemainingTime: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  playbackSpeed: 1.0,
  skipForwardDuration: 30,
  skipBackwardDuration: 15,
  autoPlay: true,
  preferChapterContext: true,
  preferRemainingTime: true,
};

// ============================================
// NAVIGATION TYPES
// ============================================

export type TabRoute = 'library' | 'create' | 'explore' | 'settings';

export interface NavigationState {
  activeTab: TabRoute;
  isPlayerExpanded: boolean;
}

// ============================================
// GUTENBERG / EXPLORE TYPES
// ============================================

export interface ClassicBook {
  id: number;
  title: string;
  authors: { name: string; birth_year?: number; death_year?: number }[];
  languages: string[];
  downloadCount: number;
  formats: Record<string, string>;
  subjects: string[];
  bookshelves: string[];
}

// ============================================
// UTILITY TYPES
// ============================================

export interface ProgressObject {
  currentTime: number;
  formattedCurrentTime: string;
  maxTime: number;
  formattedMaxTime: string;
  progress: string; // "45%" or "Chapter 3 of 12"
  sliderValue: number; // 0-1
  chapterTitle?: string;
}
