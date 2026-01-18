/**
 * Book Store - Zustand state management for catalog and library
 * Using Zustand persist with AsyncStorage per official docs
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CatalogBook } from '../services/catalogService';

// ============================================================================
// TYPES
// ============================================================================

export type ReadingStatus = 'listening' | 'completed' | 'wishlist' | 'none';

export interface LibraryBook extends CatalogBook {
  status: ReadingStatus;
  addedAt: number;
  lastPlayedAt?: number;
  progress?: number; // 0-100
  currentChapter?: number;
  currentPosition?: number; // in seconds
  totalDuration?: number;
  isGenerated?: boolean; // Has audiobook been generated
  hasGeneratedAudiobook?: boolean; // Alias for isGenerated
  isGenerating?: boolean; // Currently generating audio
  generationProgress?: number;
  chapters?: Array<{ id: string; title: string; index: number; duration: number; url: string; subChunkCount?: number }>;
}

export interface BookState {
  // Library - user's books
  library: LibraryBook[];
  
  // Currently selected book for details
  selectedBook: CatalogBook | null;
  
  // Actions
  addToLibrary: (book: CatalogBook, status: ReadingStatus) => void;
  addBook: (book: Partial<LibraryBook> & { id: string; title: string }) => void;
  removeFromLibrary: (bookId: string) => void;
  updateBookStatus: (bookId: string, status: ReadingStatus) => void;
  updateBookProgress: (bookId: string, progress: number, position?: number, chapter?: number) => void;
  updateGenerationProgress: (bookId: string, progress: number) => void;
  markAsGenerated: (bookId: string, totalDuration: number) => void;
  setSelectedBook: (book: CatalogBook | null) => void;
  clearLibrary: () => void; // Clear all books from library
  
  // Getters
  getBookById: (bookId: string) => LibraryBook | undefined;
  getBooksByStatus: (status: ReadingStatus) => LibraryBook[];
  isInLibrary: (bookId: string) => boolean;
  getLastPlayed: () => LibraryBook | undefined;
  getGeneratingBooks: () => LibraryBook[];
}

// ============================================================================
// STORE
// ============================================================================

export const useBookStore = create<BookState>()(
  persist(
    (set, get) => ({
      library: [],
      selectedBook: null,
      
      addToLibrary: (book: CatalogBook, status: ReadingStatus) => {
        set((state) => {
          // Check if already in library
          const existingIndex = state.library.findIndex(b => b.id === book.id);
          if (existingIndex >= 0) {
            // Update status
            const updated = [...state.library];
            updated[existingIndex] = { ...updated[existingIndex], status };
            return { library: updated };
          }
          
          // Add new book
          const libraryBook: LibraryBook = {
            ...book,
            status,
            addedAt: Date.now(),
            progress: 0,
          };
          return { library: [libraryBook, ...state.library] };
        });
      },
      
      // Add book from backend API response (used by Create screen and Library sync)
      addBook: (book: Partial<LibraryBook> & { id: string; title: string }) => {
        set((state) => {
          const existingIndex = state.library.findIndex(b => b.id === book.id);
          if (existingIndex >= 0) {
            // Update existing book
            const updated = [...state.library];
            updated[existingIndex] = { ...updated[existingIndex], ...book };
            return { library: updated };
          }
          
          // Add new book with defaults
          const libraryBook: LibraryBook = {
            id: book.id,
            title: book.title,
            authors: book.authors || ['Unknown Author'],
            description: book.description || '',
            coverUrl: book.coverUrl ?? null,
            status: book.status || 'listening',
            addedAt: Date.now(),
            progress: book.progress || 0,
            isGenerated: book.isGenerated || false,
            isGenerating: book.isGenerating || false,
            generationProgress: book.generationProgress || 0,
            totalDuration: book.totalDuration || 0,
            chapters: book.chapters || undefined,
            // Required CatalogBook fields
            subjects: book.subjects || [],
            languages: book.languages || [],
            hasFullText: book.hasFullText ?? false,
            _source: book._source || 'gutendex',
            _sourceId: book._sourceId || book.id,
          };
          return { library: [libraryBook, ...state.library] };
        });
      },
      
      removeFromLibrary: (bookId: string) => {
        set((state) => ({
          library: state.library.filter(b => b.id !== bookId),
        }));
      },
      
      updateBookStatus: (bookId: string, status: ReadingStatus) => {
        set((state) => ({
          library: state.library.map(b =>
            b.id === bookId ? { ...b, status } : b
          ),
        }));
      },
      
      updateBookProgress: (bookId: string, progress: number, position?: number, chapter?: number) => {
        set((state) => ({
          library: state.library.map(b =>
            b.id === bookId
              ? {
                  ...b,
                  progress,
                  currentPosition: position ?? b.currentPosition,
                  currentChapter: chapter ?? b.currentChapter,
                  lastPlayedAt: Date.now(),
                }
              : b
          ),
        }));
      },
      
      updateGenerationProgress: (bookId: string, progress: number) => {
        set((state) => ({
          library: state.library.map(b =>
            b.id === bookId
              ? { ...b, generationProgress: progress }
              : b
          ),
        }));
      },
      
      markAsGenerated: (bookId: string, totalDuration: number) => {
        set((state) => ({
          library: state.library.map(b =>
            b.id === bookId
              ? { ...b, isGenerated: true, totalDuration, generationProgress: 100 }
              : b
          ),
        }));
      },
      
      setSelectedBook: (book: CatalogBook | null) => {
        set({ selectedBook: book });
      },
      
      getBookById: (bookId: string) => {
        return get().library.find(b => b.id === bookId);
      },
      
      getBooksByStatus: (status: ReadingStatus) => {
        return get().library.filter(b => b.status === status);
      },
      
      isInLibrary: (bookId: string) => {
        return get().library.some(b => b.id === bookId);
      },
      
      getLastPlayed: () => {
        const listening = get().library.filter(b => b.status === 'listening' && b.lastPlayedAt);
        if (listening.length === 0) return undefined;
        return listening.sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))[0];
      },
      
      getGeneratingBooks: () => {
        return get().library.filter(b => 
          b.generationProgress !== undefined && 
          b.generationProgress > 0 && 
          b.generationProgress < 100
        );
      },
      
      clearLibrary: () => {
        set({ library: [] });
      },
    }),
    {
      name: 'voicelibri-books',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ library: state.library }), // Only persist library
    }
  )
);
