/**
 * VoiceLibri Backend API Service
 * Connects to the Express backend for audiobook generation
 */

import axios from 'axios';
import { Platform } from 'react-native';

// Platform-aware base URL
const getBaseUrl = () => {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001'; // Android emulator localhost
  } else if (Platform.OS === 'ios') {
    return 'http://localhost:3001'; // iOS simulator
  }
  return 'http://localhost:3001'; // Web/default
};

const BASE_URL = getBaseUrl();

export interface AudiobookMetadata {
  title: string;
  author?: string;
  language?: string;
  chapterCount: number;
  totalDuration?: number;
  coverUrl?: string;
  createdAt?: string;
  generationStatus?: 'pending' | 'generating' | 'completed' | 'failed';
  progress?: number;
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

const voiceLibriApi = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Get list of available source books (EPUB, TXT files)
 */
export async function getAvailableBooks(): Promise<AvailableBook[]> {
  const response = await voiceLibriApi.get<{ books: AvailableBook[] }>('/api/books');
  return response.data.books;
}

/**
 * Select a book to process
 */
export async function selectBook(filename: string, targetLanguage: string = 'en'): Promise<BookInfo> {
  const response = await voiceLibriApi.post<BookInfo>('/api/book/select', {
    filename,
    targetLanguage,
  });
  return response.data;
}

/**
 * Get current book info
 */
export async function getBookInfo(): Promise<BookInfo | null> {
  try {
    const response = await voiceLibriApi.get<BookInfo>('/api/book/info');
    return response.data;
  } catch {
    return null;
  }
}

/**
 * Get list of generated audiobooks
 */
export async function getAudiobooks(): Promise<AudiobookMetadata[]> {
  const response = await voiceLibriApi.get<{ audiobooks: AudiobookMetadata[] }>('/api/audiobooks');
  return response.data.audiobooks || [];
}

/**
 * Get audiobook details
 */
export async function getAudiobook(title: string): Promise<AudiobookMetadata & { chapters: ChapterMetadata[] }> {
  const encodedTitle = encodeURIComponent(title);
  const response = await voiceLibriApi.get(`/api/audiobooks/${encodedTitle}`);
  return response.data;
}

/**
 * Start audiobook generation
 */
export async function generateAudiobook(options: {
  title?: string;
  narrator?: string;
  speed?: number;
}): Promise<{ message: string; jobId?: string }> {
  const response = await voiceLibriApi.post('/api/audiobooks/generate', options);
  return response.data;
}

/**
 * Get generation status
 */
export async function getGenerationStatus(): Promise<GenerationStatus> {
  const response = await voiceLibriApi.get<GenerationStatus>('/api/audiobooks/worker/status');
  return response.data;
}

/**
 * Get chapter audio URL
 */
export function getChapterAudioUrl(title: string, chapterIndex: number): string {
  const encodedTitle = encodeURIComponent(title);
  return `${BASE_URL}/api/audiobooks/${encodedTitle}/chapters/${chapterIndex}`;
}

/**
 * Get subchunk audio URL (for streaming during generation)
 */
export function getSubChunkAudioUrl(title: string, chapterIndex: number, subChunkIndex: number): string {
  const encodedTitle = encodeURIComponent(title);
  return `${BASE_URL}/api/audiobooks/${encodedTitle}/subchunks/${chapterIndex}/${subChunkIndex}`;
}

/**
 * Delete an audiobook
 */
export async function deleteAudiobook(title: string): Promise<void> {
  const encodedTitle = encodeURIComponent(title);
  await voiceLibriApi.delete(`/api/audiobooks/${encodedTitle}`);
}

/**
 * Upload a book file (for future use)
 */
export async function uploadBook(formData: FormData): Promise<{ filename: string }> {
  const response = await voiceLibriApi.post('/api/books/upload', formData, {
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
    await voiceLibriApi.get('/api/health');
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
  getChapterAudioUrl,
  getSubChunkAudioUrl,
  deleteAudiobook,
  uploadBook,
  healthCheck,
  BASE_URL,
};
