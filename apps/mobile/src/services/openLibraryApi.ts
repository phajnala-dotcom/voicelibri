/**
 * Open Library API Service
 * API Docs: https://openlibrary.org/developers/api
 * Search: https://openlibrary.org/dev/docs/api/search
 * Books: https://openlibrary.org/dev/docs/api/books
 * Covers: https://openlibrary.org/dev/docs/api/covers
 */

import axios from 'axios';

const BASE_URL = 'https://openlibrary.org';
const COVERS_URL = 'https://covers.openlibrary.org';

// User-Agent header required per API docs
const USER_AGENT = 'VoiceLibri/1.0 (contact@voicelibri.com)';

export interface OpenLibraryAuthor {
  key: string;
  name: string;
}

export interface OpenLibraryDoc {
  key: string; // e.g., "/works/OL45804W"
  title: string;
  author_name?: string[];
  author_key?: string[];
  first_publish_year?: number;
  edition_count?: number;
  cover_i?: number; // Cover ID for covers API
  cover_edition_key?: string;
  subject?: string[];
  has_fulltext?: boolean;
  ia?: string[]; // Internet Archive IDs
  language?: string[];
  public_scan_b?: boolean;
  ratings_average?: number;
  ratings_count?: number;
}

export interface OpenLibrarySearchResponse {
  numFound: number;
  start: number;
  numFoundExact: boolean;
  docs: OpenLibraryDoc[];
}

export interface OpenLibraryWork {
  title: string;
  key: string;
  authors?: { author: { key: string } }[];
  description?: string | { value: string };
  subjects?: string[];
  subject_places?: string[];
  subject_times?: string[];
  covers?: number[];
  first_publish_date?: string;
}

export interface OpenLibraryEdition {
  title: string;
  key: string;
  authors?: { key: string }[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  covers?: number[];
  isbn_10?: string[];
  isbn_13?: string[];
  languages?: { key: string }[];
}

const openLibraryApi = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Accept': 'application/json',
    'User-Agent': USER_AGENT,
  },
});

/**
 * Search for books
 */
export async function searchBooks(
  query: string,
  options: {
    limit?: number;
    offset?: number;
    language?: string;
    sort?: 'new' | 'old' | 'random' | 'key';
    fields?: string;
  } = {}
): Promise<OpenLibrarySearchResponse> {
  const { limit = 20, offset = 0, language, sort, fields } = options;
  
  const params: Record<string, any> = {
    q: query,
    limit,
    offset,
  };
  
  if (language) params.lang = language;
  if (sort) params.sort = sort;
  if (fields) params.fields = fields;
  
  const response = await openLibraryApi.get<OpenLibrarySearchResponse>('/search.json', { params });
  return response.data;
}

/**
 * Search by author
 */
export async function searchByAuthor(
  author: string,
  options: { limit?: number; offset?: number } = {}
): Promise<OpenLibrarySearchResponse> {
  const { limit = 20, offset = 0 } = options;
  const response = await openLibraryApi.get<OpenLibrarySearchResponse>('/search.json', {
    params: { author, limit, offset },
  });
  return response.data;
}

/**
 * Search by subject
 */
export async function searchBySubject(
  subject: string,
  options: { limit?: number; offset?: number } = {}
): Promise<OpenLibrarySearchResponse> {
  const { limit = 20, offset = 0 } = options;
  const response = await openLibraryApi.get<OpenLibrarySearchResponse>('/search.json', {
    params: { subject, limit, offset },
  });
  return response.data;
}

/**
 * Get work details by OLID
 */
export async function getWork(workId: string): Promise<OpenLibraryWork> {
  // workId can be like "OL45804W" or "/works/OL45804W"
  const id = workId.startsWith('/works/') ? workId : `/works/${workId}`;
  const response = await openLibraryApi.get<OpenLibraryWork>(`${id}.json`);
  return response.data;
}

/**
 * Get edition details
 */
export async function getEdition(editionId: string): Promise<OpenLibraryEdition> {
  const id = editionId.startsWith('/books/') ? editionId : `/books/${editionId}`;
  const response = await openLibraryApi.get<OpenLibraryEdition>(`${id}.json`);
  return response.data;
}

/**
 * Get book by ISBN
 */
export async function getBookByISBN(isbn: string): Promise<OpenLibraryEdition> {
  const response = await openLibraryApi.get<OpenLibraryEdition>(`/isbn/${isbn}.json`);
  return response.data;
}

/**
 * Get cover URL by cover ID
 * Size: S (small), M (medium), L (large)
 */
export function getCoverUrl(coverId: number, size: 'S' | 'M' | 'L' = 'M'): string {
  return `${COVERS_URL}/b/id/${coverId}-${size}.jpg`;
}

/**
 * Get cover URL by ISBN
 */
export function getCoverByISBN(isbn: string, size: 'S' | 'M' | 'L' = 'M'): string {
  return `${COVERS_URL}/b/isbn/${isbn}-${size}.jpg`;
}

/**
 * Get cover URL by OLID
 */
export function getCoverByOLID(olid: string, size: 'S' | 'M' | 'L' = 'M'): string {
  return `${COVERS_URL}/b/olid/${olid}-${size}.jpg`;
}

/**
 * Get author photo URL
 */
export function getAuthorPhotoUrl(authorOlid: string, size: 'S' | 'M' | 'L' = 'M'): string {
  return `${COVERS_URL}/a/olid/${authorOlid}-${size}.jpg`;
}

/**
 * Extract work ID from key
 */
export function extractWorkId(key: string): string {
  return key.replace('/works/', '');
}

/**
 * Get description as string (handles both formats)
 */
export function getDescriptionText(description?: string | { value: string }): string {
  if (!description) return '';
  if (typeof description === 'string') return description;
  return description.value || '';
}

/**
 * Trending/popular subjects for discovery
 */
export const POPULAR_SUBJECTS = [
  'fiction',
  'fantasy',
  'science_fiction',
  'romance',
  'mystery_and_detective_stories',
  'thriller',
  'historical_fiction',
  'young_adult',
  'biography',
  'self-help',
  'business',
  'psychology',
];

export default {
  searchBooks,
  searchByAuthor,
  searchBySubject,
  getWork,
  getEdition,
  getBookByISBN,
  getCoverUrl,
  getCoverByISBN,
  getCoverByOLID,
  getAuthorPhotoUrl,
  extractWorkId,
  getDescriptionText,
  POPULAR_SUBJECTS,
};
