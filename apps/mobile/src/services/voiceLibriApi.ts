/**
 * VoiceLibri Backend API Service
 * Connects to the Express backend for audiobook generation
 */

import axios from 'axios';
import { Platform } from 'react-native';

// Platform-aware base URL per React Native official networking documentation
// https://reactnative.dev/docs/network
const getBaseUrl = () => {
  if (Platform.OS === 'android') {
    // Android emulator: 10.0.2.2 is special alias for host machine's localhost
    return 'http://10.0.2.2:3001/api';
  } else if (Platform.OS === 'ios') {
    // iOS: Use computer's local network IP for physical devices
    // For iOS Simulator on same machine, localhost would work, but using
    // local IP works for both simulator and physical device
    return 'http://192.168.1.20:3001/api';
  }
  return 'http://192.168.1.20:3001/api'; // Default for physical devices
};

// Export for use in other services (e.g., audioStorageService)
export const API_BASE_URL = getBaseUrl();

export interface AudiobookMetadata {
  title: string;
  author?: string;
  language?: string;
  chapterCount: number;
  totalDuration?: number;
  coverUrl?: string;
  createdAt?: string;
  generationStatus?: 'not-started' | 'in-progress' | 'completed';
  progress?: number;
}

// Backend returns this structure from /api/audiobooks
export interface BackendAudiobookEntry {
  title: string;
  metadata: AudiobookMetadata | null;
  progress: {
    current: number;
    total: number;
    status: string;
  } | null;
  tempChunksCount: number;
}

export interface ChapterMetadata {
  index: number;
  title: string;
  duration?: number;
  subChunkCount: number;
}

export interface GenerationStatus {
  status: 'idle' | 'generating' | 'completed' | 'failed';
  progress: number;
  currentChapter?: number;
  totalChapters?: number;
  message?: string;
}

export interface BookInfo {
  title: string;
  author?: string;
  language: string;
  chapterCount: number;
  totalChunks: number;
}

export interface AvailableBook {
  filename: string;
  extension: string;
  size: number;
}

export interface BookSelectResult {
  title: string;
  author?: string;
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

const voiceLibriApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  // Increase max content lengths for large base64-encoded files (PDFs, EPUBs up to 50MB)
  maxContentLength: 60 * 1024 * 1024, // 60MB
  maxBodyLength: 60 * 1024 * 1024,    // 60MB
});

/**
 * Get list of available source books (EPUB, TXT files)
 */
export async function getAvailableBooks(): Promise<AvailableBook[]> {
  const response = await voiceLibriApi.get<{ books: AvailableBook[] }>('/books');
  return response.data.books;
}

/**
 * Select a book to process
 * Large EPUBs can take time to parse and chunk
 */
export async function selectBook(filename: string, targetLanguage: string = 'en'): Promise<BookInfo> {
  const response = await voiceLibriApi.post<BookInfo>('/book/select', {
    filename,
    targetLanguage,
  }, {
    timeout: 120000, // 2 minutes for large EPUBs like Dracula
  });
  return response.data;
}

/**
 * Get current book info
 */
export async function getBookInfo(): Promise<BookInfo | null> {
  try {
    const response = await voiceLibriApi.get<BookInfo>('/book/info');
    return response.data;
  } catch {
    return null;
  }
}

/**
 * Get list of generated audiobooks
 */
export async function getAudiobooks(): Promise<BackendAudiobookEntry[]> {
  const response = await voiceLibriApi.get<{ audiobooks: BackendAudiobookEntry[] }>('/audiobooks');
  return response.data.audiobooks || [];
}

/**
 * Get audiobook details
 */
export async function getAudiobook(title: string): Promise<AudiobookMetadata & { chapters: ChapterMetadata[] }> {
  const encodedTitle = encodeURIComponent(title);
  const response = await voiceLibriApi.get(`/audiobooks/${encodedTitle}`);
  return response.data;
}

/**
 * Start audiobook generation
 */
export async function generateAudiobook(options: {
  bookFile: string;
  voiceMap?: Record<string, string>;
  defaultVoice?: string;
}): Promise<{ message: string; jobId?: string }> {
  const response = await voiceLibriApi.post('/audiobooks/generate', options, {
    timeout: 60000, // 1 minute - just queues the job
  });
  return response.data;
}

/**
 * Get generation status
 */
export async function getGenerationStatus(): Promise<GenerationStatus> {
  const response = await voiceLibriApi.get<GenerationStatus>('/audiobooks/worker/status');
  return response.data;
}

/**
 * Get chapter audio URL
 */
export function getChapterAudioUrl(title: string, chapterIndex: number): string {
  const encodedTitle = encodeURIComponent(title);
  return `${API_BASE_URL}/audiobooks/${encodedTitle}/chapters/${chapterIndex}`;
}

/**
 * Get subchunk audio URL (for streaming during generation)
 */
export function getSubChunkAudioUrl(title: string, chapterIndex: number, subChunkIndex: number): string {
  const encodedTitle = encodeURIComponent(title);
  return `${API_BASE_URL}/audiobooks/${encodedTitle}/subchunks/${chapterIndex}/${subChunkIndex}`;
}

/**
 * Delete an audiobook
 */
export async function deleteAudiobook(title: string): Promise<void> {
  const encodedTitle = encodeURIComponent(title);
  await voiceLibriApi.delete(`/audiobooks/${encodedTitle}`);
}

/**
 * Update playback position for resume functionality
 */
export async function updatePlaybackPosition(
  title: string,
  chapterIndex: number,
  currentTime: number
): Promise<void> {
  const encodedTitle = encodeURIComponent(title);
  await voiceLibriApi.put(`/audiobooks/${encodedTitle}/position`, {
    currentChapter: chapterIndex,
    currentTime,
  });
}

/**
 * Get playback position for resume
 */
export async function getPlaybackPosition(title: string): Promise<{
  currentChapter: number;
  currentTime: number;
  lastPlayedAt: string;
} | null> {
  try {
    const encodedTitle = encodeURIComponent(title);
    const response = await voiceLibriApi.get(`/audiobooks/${encodedTitle}/position`);
    return response.data.playback;
  } catch {
    return null;
  }
}

/**
 * Get generation progress for a specific book
 */
export async function getGenerationProgress(title: string): Promise<{
  bookTitle: string;
  totalChapters: number;
  chaptersGenerated: number;
  status: string;
  progress: number;
}> {
  const encodedTitle = encodeURIComponent(title);
  const response = await voiceLibriApi.get(`/audiobooks/${encodedTitle}/progress`);
  return response.data;
}

/**
 * Create audiobook from pasted text or base64 binary file (EPUB, DOCX, PDF, etc.)
 */
export async function createFromText(options: {
  text: string;
  title?: string;
  detectChapters?: boolean;
  narratorVoice?: string;
  targetLanguage?: string;
  isBase64Epub?: boolean;       // Legacy: text contains base64-encoded EPUB file
  isBase64File?: boolean;       // New: text contains base64-encoded binary file
  fileExtension?: string;       // File extension to determine format (epub, docx, pdf, etc.)
}): Promise<BookSelectResult> {
  // Longer timeout for processing large texts/files
  const response = await voiceLibriApi.post('/book/from-text', options, {
    timeout: 180000, // 3 minutes for large EPUBs
    maxContentLength: 60 * 1024 * 1024, // 60MB for this specific request
    maxBodyLength: 60 * 1024 * 1024,
  });
  return response.data;
}

/**
 * Create audiobook from URL (direct link to ebook file)
 * Downloads the ebook on backend and processes it
 */
export async function createFromUrl(options: {
  url: string;
  narratorVoice?: string;
  targetLanguage?: string;
}): Promise<BookSelectResult> {
  // Longer timeout for downloading and processing EPUBs
  const response = await voiceLibriApi.post('/book/from-url', options, {
    timeout: 180000, // 3 minutes for large ebooks
  });
  return response.data;
}

/**
 * Upload a book file (for future use)
 */
export async function uploadBook(formData: FormData): Promise<{ filename: string }> {
  const response = await voiceLibriApi.post('/books/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    await voiceLibriApi.get('/health');
    return true;
  } catch {
    return false;
  }
}

export default {
  getAvailableBooks,
  selectBook,
  getBookInfo,
  getAudiobooks,
  getAudiobook,
  generateAudiobook,
  getGenerationStatus,
  getGenerationProgress,
  getChapterAudioUrl,
  getSubChunkAudioUrl,
  deleteAudiobook,
  uploadBook,
  healthCheck,
  updatePlaybackPosition,
  getPlaybackPosition,
  createFromText,
  createFromUrl,
  API_BASE_URL,
};
