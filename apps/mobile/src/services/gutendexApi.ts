/**
 * Gutendex API Service
 * JSON web API for Project Gutenberg ebook metadata
 * API Docs: https://gutendex.com/
 */

import axios from 'axios';

const BASE_URL = 'https://gutendex.com';

// Types based on official API response format
export interface GutendexPerson {
  name: string;
  birth_year: number | null;
  death_year: number | null;
}

export interface GutendexBook {
  id: number;
  title: string;
  authors: GutendexPerson[];
  translators: GutendexPerson[];
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  copyright: boolean | null;
  media_type: string;
  formats: Record<string, string>;
  download_count: number;
  summaries?: string[];
}

export interface GutendexBooksResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutendexBook[];
}

export interface GutendexSearchParams {
  search?: string;
  languages?: string; // comma-separated, e.g., 'en,fr'
  topic?: string; // search in subjects/bookshelves
  author_year_start?: number;
  author_year_end?: number;
  copyright?: 'true' | 'false' | 'null';
  ids?: string; // comma-separated book IDs
  sort?: 'ascending' | 'descending' | 'popular';
  page?: number;
}

const gutendexApi = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Accept': 'application/json',
  },
});

/**
 * Search for books in the Gutenberg catalog
 */
export async function searchBooks(params: GutendexSearchParams = {}): Promise<GutendexBooksResponse> {
  const response = await gutendexApi.get<GutendexBooksResponse>('/books', { params });
  return response.data;
}

/**
 * Get a single book by ID
 */
export async function getBook(id: number): Promise<GutendexBook> {
  const response = await gutendexApi.get<GutendexBook>(`/books/${id}`);
  return response.data;
}

/**
 * Get popular books (default sort)
 */
export async function getPopularBooks(language: string = 'en', page: number = 1): Promise<GutendexBooksResponse> {
  return searchBooks({ languages: language, page, sort: 'popular' });
}

/**
 * Search books by topic/genre
 */
export async function getBooksByTopic(topic: string, language: string = 'en', page: number = 1): Promise<GutendexBooksResponse> {
  return searchBooks({ topic, languages: language, page });
}

/**
 * Get book cover URL (from formats)
 */
export function getBookCoverUrl(book: GutendexBook): string | null {
  // Try to find cover image in formats
  const coverKey = Object.keys(book.formats).find(key => key.startsWith('image/'));
  if (coverKey) {
    return book.formats[coverKey];
  }
  return null;
}

/**
 * Get EPUB download URL
 */
export function getEpubUrl(book: GutendexBook): string | null {
  return book.formats['application/epub+zip'] || null;
}

/**
 * Get plain text download URL
 */
export function getTextUrl(book: GutendexBook): string | null {
  const textKey = Object.keys(book.formats).find(key => key.startsWith('text/plain'));
  return textKey ? book.formats[textKey] : null;
}

/**
 * Get HTML read URL
 */
export function getHtmlUrl(book: GutendexBook): string | null {
  const htmlKey = Object.keys(book.formats).find(key => key.startsWith('text/html'));
  return htmlKey ? book.formats[htmlKey] : null;
}

/**
 * Curated topics for Explore screen
 */
export const CURATED_TOPICS = [
  { id: 'fiction', label: 'Fiction', icon: '📚' },
  { id: 'science-fiction', label: 'Sci-Fi', icon: '🚀' },
  { id: 'romance', label: 'Romance', icon: '💕' },
  { id: 'mystery', label: 'Mystery', icon: '🔍' },
  { id: 'adventure', label: 'Adventure', icon: '🗺️' },
  { id: 'horror', label: 'Horror', icon: '👻' },
  { id: 'fantasy', label: 'Fantasy', icon: '🧙' },
  { id: 'history', label: 'History', icon: '📜' },
  { id: 'philosophy', label: 'Philosophy', icon: '🤔' },
  { id: 'poetry', label: 'Poetry', icon: '✨' },
  { id: 'children', label: 'Children', icon: '🧸' },
  { id: 'classics', label: 'Classics', icon: '🏛️' },
];

export default {
  searchBooks,
  getBook,
  getPopularBooks,
  getBooksByTopic,
  getBookCoverUrl,
  getEpubUrl,
  getTextUrl,
  getHtmlUrl,
  CURATED_TOPICS,
};
