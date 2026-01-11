/**
 * VoiceLibri API Service
 * Connects PWA frontend to backend audiobook generation API
 */

import type { Book, Chapter } from '../types';

const API_BASE_URL = 'http://localhost:3001/api';

// ============================================
// AUDIOBOOK LIBRARY API
// ============================================

export interface AudiobookMetadata {
  title: string;
  author: string;
  language: string;
  totalChapters: number;
  chapters: ChapterMetadata[];
  generationStatus: 'not-started' | 'in-progress' | 'completed';
  lastUpdated: string;
  playback?: {
    currentChapter: number;
    currentTime: number;
    lastPlayedAt: string;
  };
}

export interface ChapterMetadata {
  index: number;
  title: string;
  filename: string;
  duration: number;
  isGenerated: boolean;
  isConsolidated?: boolean;
}

export interface BookSelectResult {
  title: string;
  author: string;
  audiobookTitle?: string;
  chapters?: Array<{
    index: number;
    title: string;
    subChunkStart: number;
    subChunkCount: number;
  }>;
  _internal?: {
    totalChunks: number;
    durationSeconds: number;
  };
}

/**
 * Get list of all audiobooks in library
 */
export async function getAudiobooks(): Promise<AudiobookMetadata[]> {
  const response = await fetch(`${API_BASE_URL}/audiobooks`);
  if (!response.ok) throw new Error('Failed to fetch audiobooks');
  const data = await response.json();
  return data.audiobooks;
}

/**
 * Get metadata for specific audiobook
 */
export async function getAudiobook(bookTitle: string): Promise<AudiobookMetadata> {
  const response = await fetch(`${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}`);
  if (!response.ok) throw new Error('Failed to fetch audiobook');
  return response.json();
}

/**
 * Select a book and start the correct pipeline
 * This is the working API that triggers: translation → character extraction → dramatization → audio
 */
export async function selectBook(options: {
  filename: string;
  narratorVoice?: string;
  targetLanguage?: string;
  dramatize?: boolean;
}): Promise<BookSelectResult> {
  const response = await fetch(`${API_BASE_URL}/book/select?dramatize=${options.dramatize ?? true}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: options.filename,
      narratorVoice: options.narratorVoice,
      targetLanguage: options.targetLanguage,
    }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to select book' }));
    throw new Error(errorData.message || 'Failed to select book');
  }
  return response.json();
}

/**
 * Get dramatization/generation status
 */
export async function getGenerationStatus(): Promise<{
  phase: string;
  currentChapter: number;
  totalChapters: number;
  currentOperation: string;
  error: string | null;
}> {
  const response = await fetch(`${API_BASE_URL}/dramatization/status`);
  if (!response.ok) throw new Error('Failed to fetch status');
  return response.json();
}

/**
 * Legacy: Generate audiobook from file (uses worker queue - not recommended)
 */
export async function generateAudiobook(options: {
  bookFile: string;
  targetLanguage?: string;
  voiceMap?: Record<string, string>;
  defaultVoice?: string;
}): Promise<{
  success: boolean;
  bookTitle: string;
  metadata: AudiobookMetadata;
  totalChunks: number;
  message: string;
}> {
  const response = await fetch(`${API_BASE_URL}/audiobooks/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to generate audiobook' }));
    throw new Error(errorData.message || 'Failed to generate audiobook');
  }
  return response.json();
}

/**
 * Get generation progress for audiobook
 */
export async function getGenerationProgress(bookTitle: string): Promise<{
  bookTitle: string;
  totalChapters: number;
  chaptersGenerated: number;
  status: string;
  progress: number;
}> {
  const response = await fetch(`${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/progress`);
  if (!response.ok) throw new Error('Failed to fetch progress');
  return response.json();
}

/**
 * Get chapter audio URL
 */
export function getChapterAudioUrl(bookTitle: string, chapterIndex: number): string {
  return `${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/chapters/${chapterIndex}`;
}

/**
 * Update playback position
 */
export async function updatePlaybackPosition(
  bookTitle: string,
  chapterIndex: number,
  currentTime: number
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/position`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentChapter: chapterIndex, currentTime }),
  });
  if (!response.ok) throw new Error('Failed to update position');
}

/**
 * Get playback position
 */
export async function getPlaybackPosition(bookTitle: string): Promise<{
  currentChapter: number;
  currentTime: number;
  lastPlayedAt: string;
}> {
  const response = await fetch(`${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/position`);
  if (!response.ok) throw new Error('Failed to fetch position');
  const data = await response.json();
  return data.playback;
}

// ============================================
// CONVERSION UTILITIES
// ============================================

/**
 * Convert backend AudiobookMetadata to frontend Book type
 */
export function convertToBook(metadata: AudiobookMetadata): Book {
  const chapters: Chapter[] = metadata.chapters.map((ch) => ({
    id: `ch-${ch.index}`,
    title: ch.title,
    index: ch.index,
    start: 0, // Will be calculated from cumulative duration
    end: ch.duration,
    duration: ch.duration,
  }));

  // Calculate cumulative start/end times
  let cumulative = 0;
  chapters.forEach((ch) => {
    ch.start = cumulative;
    ch.end = cumulative + ch.duration;
    cumulative = ch.end;
  });

  const totalDuration = cumulative;
  
  const book: Book = {
    id: metadata.title,
    title: metadata.title,
    author: metadata.author,
    totalDuration,
    chapters,
    audioUrl: '', // Not needed for streaming
    isFinished: metadata.generationStatus === 'completed',
    createdAt: new Date(metadata.lastUpdated),
    lastPlayedAt: metadata.playback ? new Date(metadata.playback.lastPlayedAt) : undefined,
    progress: metadata.playback ? {
      position: metadata.playback.currentTime,
      chapterIndex: metadata.playback.currentChapter,
      updatedAt: new Date(metadata.playback.lastPlayedAt),
    } : undefined,
  };

  return book;
}
