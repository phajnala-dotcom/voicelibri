// VoiceLibri - Library Store
// Manages the book library state

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Book } from '../types';

interface LibraryStore {
  books: Book[];
  isLoading: boolean;
  error: string | null;
  
  // Sorting & filtering
  sortBy: 'recent' | 'title' | 'author' | 'progress';
  filterBy: 'all' | 'inProgress' | 'finished' | 'notStarted';
  searchQuery: string;
  
  // Actions
  addBook: (book: Book) => void;
  removeBook: (bookId: string) => void;
  updateBook: (bookId: string, updates: Partial<Book>) => void;
  updateProgress: (bookId: string, position: number, chapterIndex: number) => void;
  markAsFinished: (bookId: string) => void;
  
  // Sorting & filtering
  setSortBy: (sort: LibraryStore['sortBy']) => void;
  setFilterBy: (filter: LibraryStore['filterBy']) => void;
  setSearchQuery: (query: string) => void;
  
  // Computed
  getFilteredBooks: () => Book[];
  getRecentBooks: (limit?: number) => Book[];
  getInProgressBooks: () => Book[];
}

export const useLibraryStore = create<LibraryStore>()(
  persist(
    (set, get) => ({
      books: [],
      isLoading: false,
      error: null,
      sortBy: 'recent',
      filterBy: 'all',
      searchQuery: '',
      
      addBook: (book) => set((state) => ({
        books: [book, ...state.books],
      })),
      
      removeBook: (bookId) => set((state) => ({
        books: state.books.filter(b => b.id !== bookId),
      })),
      
      updateBook: (bookId, updates) => set((state) => ({
        books: state.books.map(b => 
          b.id === bookId ? { ...b, ...updates } : b
        ),
      })),
      
      updateProgress: (bookId, position, chapterIndex) => set((state) => ({
        books: state.books.map(b => 
          b.id === bookId 
            ? { 
                ...b, 
                progress: { position, chapterIndex, updatedAt: new Date() },
                lastPlayedAt: new Date(),
              } 
            : b
        ),
      })),
      
      markAsFinished: (bookId) => set((state) => ({
        books: state.books.map(b => 
          b.id === bookId ? { ...b, isFinished: true } : b
        ),
      })),
      
      setSortBy: (sortBy) => set({ sortBy }),
      setFilterBy: (filterBy) => set({ filterBy }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      
      getFilteredBooks: () => {
        const { books, sortBy, filterBy, searchQuery } = get();
        
        let filtered = [...books];
        
        // Apply search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter(b => 
            b.title.toLowerCase().includes(query) ||
            b.author.toLowerCase().includes(query)
          );
        }
        
        // Apply status filter
        switch (filterBy) {
          case 'inProgress':
            filtered = filtered.filter(b => b.progress && !b.isFinished);
            break;
          case 'finished':
            filtered = filtered.filter(b => b.isFinished);
            break;
          case 'notStarted':
            filtered = filtered.filter(b => !b.progress && !b.isFinished);
            break;
        }
        
        // Apply sorting
        switch (sortBy) {
          case 'recent':
            filtered.sort((a, b) => {
              const aDate = a.lastPlayedAt || a.createdAt;
              const bDate = b.lastPlayedAt || b.createdAt;
              return new Date(bDate).getTime() - new Date(aDate).getTime();
            });
            break;
          case 'title':
            filtered.sort((a, b) => a.title.localeCompare(b.title));
            break;
          case 'author':
            filtered.sort((a, b) => a.author.localeCompare(b.author));
            break;
          case 'progress':
            filtered.sort((a, b) => {
              const aProgress = a.progress ? (a.progress.position / a.totalDuration) : 0;
              const bProgress = b.progress ? (b.progress.position / b.totalDuration) : 0;
              return bProgress - aProgress;
            });
            break;
        }
        
        return filtered;
      },
      
      getRecentBooks: (limit = 5) => {
        const { books } = get();
        return [...books]
          .filter(b => b.lastPlayedAt)
          .sort((a, b) => 
            new Date(b.lastPlayedAt!).getTime() - new Date(a.lastPlayedAt!).getTime()
          )
          .slice(0, limit);
      },
      
      getInProgressBooks: () => {
        const { books } = get();
        return books.filter(b => b.progress && !b.isFinished);
      },
    }),
    {
      name: 'voicelibri-library',
    }
  )
);
