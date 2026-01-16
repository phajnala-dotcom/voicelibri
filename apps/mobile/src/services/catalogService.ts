/**
 * VoiceLibri Unified Book Catalog
 * Seamlessly merges Gutendex + Open Library into one catalog experience
 * User sees only "VoiceLibri Catalog" - no awareness of underlying sources
 */

import * as gutendex from './gutendexApi';
import * as openLibrary from './openLibraryApi';

// ============================================================================
// UNIFIED BOOK TYPE - Single format for all books regardless of source
// ============================================================================

export type BookSource = 'gutendex' | 'openlibrary';

export interface CatalogBook {
  id: string; // Unified ID: "g_123" for gutendex, "ol_OL123W" for openlibrary
  title: string;
  authors: string[];
  coverUrl: string | null;
  description?: string;
  subjects: string[];
  languages: string[];
  publishYear?: number;
  rating?: number;
  downloadCount?: number;
  
  // For audiobook generation
  hasFullText: boolean;
  textUrl?: string;
  epubUrl?: string;
  
  // Internal - hidden from UI
  _source: BookSource;
  _sourceId: string | number;
}

export interface CatalogSearchResult {
  books: CatalogBook[];
  totalCount: number;
  hasMore: boolean;
  nextPage?: number;
}

// ============================================================================
// CURATED GENRES - Unified genres for both sources
// ============================================================================

export interface Genre {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export const GENRES: Genre[] = [
  { id: 'fiction', name: 'Fiction', icon: '📖', color: '#6366f1' },
  { id: 'science-fiction', name: 'Sci-Fi', icon: '🚀', color: '#8b5cf6' },
  { id: 'fantasy', name: 'Fantasy', icon: '🧙', color: '#a855f7' },
  { id: 'romance', name: 'Romance', icon: '💕', color: '#ec4899' },
  { id: 'mystery', name: 'Mystery', icon: '🔍', color: '#f43f5e' },
  { id: 'adventure', name: 'Adventure', icon: '🗺️', color: '#f97316' },
  { id: 'horror', name: 'Horror', icon: '👻', color: '#64748b' },
  { id: 'classics', name: 'Classics', icon: '🏛️', color: '#0ea5e9' },
  { id: 'history', name: 'History', icon: '📜', color: '#14b8a6' },
  { id: 'philosophy', name: 'Philosophy', icon: '🤔', color: '#22c55e' },
  { id: 'poetry', name: 'Poetry', icon: '✨', color: '#eab308' },
  { id: 'children', name: 'Children', icon: '🧸', color: '#f472b6' },
];

// ============================================================================
// CONVERTERS - Transform API responses to unified format
// ============================================================================

function gutendexToCatalogBook(book: gutendex.GutendexBook): CatalogBook {
  return {
    id: `g_${book.id}`,
    title: book.title,
    authors: book.authors.map(a => a.name),
    coverUrl: gutendex.getBookCoverUrl(book),
    description: book.summaries?.[0],
    subjects: [...book.subjects, ...book.bookshelves],
    languages: book.languages,
    publishYear: book.authors[0]?.birth_year ? book.authors[0].birth_year + 30 : undefined,
    downloadCount: book.download_count,
    hasFullText: true, // Gutenberg always has full text
    textUrl: gutendex.getTextUrl(book) || undefined,
    epubUrl: gutendex.getEpubUrl(book) || undefined,
    _source: 'gutendex',
    _sourceId: book.id,
  };
}

function openLibraryToCatalogBook(doc: openLibrary.OpenLibraryDoc): CatalogBook {
  const coverId = doc.cover_i;
  return {
    id: `ol_${doc.key.replace('/works/', '')}`,
    title: doc.title,
    authors: doc.author_name || [],
    coverUrl: coverId ? openLibrary.getCoverUrl(coverId, 'M') : null,
    subjects: doc.subject?.slice(0, 10) || [],
    languages: doc.language || ['en'],
    publishYear: doc.first_publish_year,
    rating: doc.ratings_average,
    hasFullText: doc.has_fulltext || false,
    _source: 'openlibrary',
    _sourceId: doc.key,
  };
}

// ============================================================================
// DEDUPLICATION - Merge results from both sources
// ============================================================================

function deduplicateBooks(books: CatalogBook[]): CatalogBook[] {
  const seen = new Map<string, CatalogBook>();
  
  for (const book of books) {
    // Create a normalized key for deduplication
    const normalizedTitle = book.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const firstAuthor = book.authors[0]?.toLowerCase().replace(/[^a-z]/g, '') || '';
    const dedupKey = `${normalizedTitle}_${firstAuthor}`;
    
    if (!seen.has(dedupKey)) {
      seen.set(dedupKey, book);
    } else {
      // Prefer Gutendex (has full text) over OpenLibrary
      const existing = seen.get(dedupKey)!;
      if (book._source === 'gutendex' && existing._source === 'openlibrary') {
        seen.set(dedupKey, book);
      }
    }
  }
  
  return Array.from(seen.values());
}

// ============================================================================
// UNIFIED CATALOG API
// ============================================================================

/**
 * Search the unified VoiceLibri catalog
 */
export async function searchCatalog(
  query: string,
  options: { page?: number; limit?: number } = {}
): Promise<CatalogSearchResult> {
  const { page = 1, limit = 20 } = options;
  
  try {
    // Search both sources in parallel
    const [gutendexResults, olResults] = await Promise.allSettled([
      gutendex.searchBooks({ search: query, page }),
      openLibrary.searchBooks(query, { limit, offset: (page - 1) * limit }),
    ]);
    
    const books: CatalogBook[] = [];
    let totalCount = 0;
    
    // Process Gutendex results
    if (gutendexResults.status === 'fulfilled') {
      const gBooks = gutendexResults.value.results.map(gutendexToCatalogBook);
      books.push(...gBooks);
      totalCount += gutendexResults.value.count;
    }
    
    // Process OpenLibrary results
    if (olResults.status === 'fulfilled') {
      const olBooks = olResults.value.docs.map(openLibraryToCatalogBook);
      books.push(...olBooks);
      totalCount += olResults.value.numFound;
    }
    
    // Deduplicate and sort by relevance (prefer books with covers and full text)
    const dedupedBooks = deduplicateBooks(books);
    dedupedBooks.sort((a, b) => {
      // Prioritize books with full text
      if (a.hasFullText && !b.hasFullText) return -1;
      if (!a.hasFullText && b.hasFullText) return 1;
      // Then by cover availability
      if (a.coverUrl && !b.coverUrl) return -1;
      if (!a.coverUrl && b.coverUrl) return 1;
      // Then by download count (Gutendex)
      return (b.downloadCount || 0) - (a.downloadCount || 0);
    });
    
    return {
      books: dedupedBooks.slice(0, limit),
      totalCount,
      hasMore: dedupedBooks.length > limit || page * limit < totalCount,
      nextPage: page + 1,
    };
  } catch (error) {
    console.error('Catalog search error:', error);
    return { books: [], totalCount: 0, hasMore: false };
  }
}

/**
 * Get popular/trending books
 */
export async function getPopularBooks(
  options: { page?: number; limit?: number } = {}
): Promise<CatalogSearchResult> {
  const { page = 1, limit = 20 } = options;
  
  try {
    // Gutendex returns popular by default
    const gutendexResults = await gutendex.getPopularBooks('en', page);
    const books = gutendexResults.results.map(gutendexToCatalogBook);
    
    return {
      books: books.slice(0, limit),
      totalCount: gutendexResults.count,
      hasMore: !!gutendexResults.next,
      nextPage: page + 1,
    };
  } catch (error) {
    console.error('Popular books error:', error);
    return { books: [], totalCount: 0, hasMore: false };
  }
}

/**
 * Get books by genre
 */
export async function getBooksByGenre(
  genreId: string,
  options: { page?: number; limit?: number } = {}
): Promise<CatalogSearchResult> {
  const { page = 1, limit = 20 } = options;
  
  try {
    // Search both sources for the genre
    const [gutendexResults, olResults] = await Promise.allSettled([
      gutendex.getBooksByTopic(genreId, 'en', page),
      openLibrary.searchBySubject(genreId, { limit, offset: (page - 1) * limit }),
    ]);
    
    const books: CatalogBook[] = [];
    let totalCount = 0;
    
    if (gutendexResults.status === 'fulfilled') {
      books.push(...gutendexResults.value.results.map(gutendexToCatalogBook));
      totalCount += gutendexResults.value.count;
    }
    
    if (olResults.status === 'fulfilled') {
      books.push(...olResults.value.docs.map(openLibraryToCatalogBook));
      totalCount += olResults.value.numFound;
    }
    
    const dedupedBooks = deduplicateBooks(books);
    dedupedBooks.sort((a, b) => {
      if (a.hasFullText && !b.hasFullText) return -1;
      if (!a.hasFullText && b.hasFullText) return 1;
      return (b.downloadCount || 0) - (a.downloadCount || 0);
    });
    
    return {
      books: dedupedBooks.slice(0, limit),
      totalCount,
      hasMore: dedupedBooks.length > limit,
      nextPage: page + 1,
    };
  } catch (error) {
    console.error('Genre books error:', error);
    return { books: [], totalCount: 0, hasMore: false };
  }
}

/**
 * Get curated featured books for home screen
 */
export async function getFeaturedBooks(): Promise<CatalogBook[]> {
  try {
    // Get top popular books with good covers
    const result = await getPopularBooks({ limit: 10 });
    return result.books.filter(b => b.coverUrl);
  } catch (error) {
    console.error('Featured books error:', error);
    return [];
  }
}

/**
 * Get book details by unified ID
 */
export async function getBookDetails(id: string): Promise<CatalogBook | null> {
  try {
    if (id.startsWith('g_')) {
      // Gutendex book
      const bookId = parseInt(id.replace('g_', ''), 10);
      const book = await gutendex.getBook(bookId);
      return gutendexToCatalogBook(book);
    } else if (id.startsWith('ol_')) {
      // OpenLibrary book
      const workId = id.replace('ol_', '');
      const work = await openLibrary.getWork(workId);
      
      // Convert work to CatalogBook format
      const coverId = work.covers?.[0];
      return {
        id,
        title: work.title,
        authors: [], // Need separate author fetch
        coverUrl: coverId ? openLibrary.getCoverUrl(coverId, 'L') : null,
        description: openLibrary.getDescriptionText(work.description),
        subjects: work.subjects || [],
        languages: ['en'],
        publishYear: work.first_publish_date ? parseInt(work.first_publish_date) : undefined,
        hasFullText: false,
        _source: 'openlibrary',
        _sourceId: work.key,
      };
    }
    return null;
  } catch (error) {
    console.error('Book details error:', error);
    return null;
  }
}

/**
 * Get text content URL for audiobook generation
 */
export function getTextContentUrl(book: CatalogBook): string | null {
  if (book.textUrl) return book.textUrl;
  if (book.epubUrl) return book.epubUrl;
  return null;
}

/**
 * Check if book can be converted to audiobook
 */
export function canGenerateAudiobook(book: CatalogBook): boolean {
  return book.hasFullText && (!!book.textUrl || !!book.epubUrl);
}

export default {
  searchCatalog,
  getPopularBooks,
  getBooksByGenre,
  getFeaturedBooks,
  getBookDetails,
  getTextContentUrl,
  canGenerateAudiobook,
  GENRES,
};
