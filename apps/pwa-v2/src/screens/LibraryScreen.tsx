/**
 * VoiceLibri - Neumorphism Library Screen
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Main library view for audiobooks
 * 
 * BookPlayer-style display logic:
 * - Click on book cover = open FullPlayer
 * - Click elsewhere on book row = expand chapters
 * - Click chapter = open FullPlayer at that chapter
 */

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useLibraryStore } from '../stores/libraryStore';
import { usePlayerStore } from '../stores/playerStore';
import { BookGrid } from '../components/library';
import { getAudiobooks, convertToBook } from '../services/api';
import type { Book, Chapter } from '../types';

// Demo book for testing
const demoBook: Book = {
  id: 'demo-1',
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  totalDuration: 41700, // 11h 35m
  coverUrl: undefined,
  audioUrl: '',
  chapters: [
    { id: 'ch1', title: 'Chapter 1', index: 0, start: 0, end: 3600, duration: 3600 },
    { id: 'ch2', title: 'Chapter 2', index: 1, start: 3600, end: 7200, duration: 3600 },
    { id: 'ch3', title: 'Chapter 3', index: 2, start: 7200, end: 10800, duration: 3600 },
  ],
  progress: { position: 3600, chapterIndex: 1, updatedAt: new Date() },
  isFinished: false,
  createdAt: new Date(),
  lastPlayedAt: new Date(),
};

/**
 * Neumorphism Library Screen
 */
export function LibraryScreen() {
  const { addBook, sortBy, setSortBy, searchQuery, setSearchQuery, getFilteredBooks } = useLibraryStore();
  const { setCurrentBook, setCurrentChapter, openFullPlayer, showMiniPlayer } = usePlayerStore();
  const [showSearch, setShowSearch] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Load audiobooks from backend on mount
  useEffect(() => {
    const loadAudiobooks = async () => {
      setIsLoading(true);
      try {
        const audiobookList = await getAudiobooks();
        let mostRecentBook: Book | null = null;
        let mostRecentTime = 0;
        
        // Add each audiobook to library
        audiobookList.forEach(metadata => {
          const book = convertToBook(metadata);
          
          // Only add if not already in library
          const existing = useLibraryStore.getState().books.find(b => b.id === book.id);
          if (!existing) {
            addBook(book);
          }
          
          // Track most recently played book
          if (metadata.playback && metadata.playback.lastPlayedAt) {
            const playedTime = new Date(metadata.playback.lastPlayedAt).getTime();
            if (playedTime > mostRecentTime) {
              mostRecentTime = playedTime;
              mostRecentBook = book;
            }
          }
        });
        
        // Restore most recently played book to player (if no book currently loaded)
        const currentBook = usePlayerStore.getState().currentBook;
        if (!currentBook && mostRecentBook) {
          const bookToRestore = mostRecentBook as Book;
          setCurrentBook(bookToRestore);
          const metadata = audiobookList.find(m => m.title === bookToRestore.title);
          if (metadata?.playback && bookToRestore.chapters[metadata.playback.currentChapter]) {
            setCurrentChapter(bookToRestore.chapters[metadata.playback.currentChapter]);
          }
        }
      } catch (error) {
        console.error('Failed to load audiobooks:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAudiobooks();
  }, []); // Run once on mount

  const filteredBooks = getFilteredBooks();

  // Cover click = open FullPlayer with the book
  const handleCoverPress = (book: Book) => {
    setCurrentBook(book);
    if (book.chapters.length > 0) {
      // Restore to saved position or start from beginning
      const chapterIndex = book.progress?.chapterIndex ?? 0;
      setCurrentChapter(book.chapters[chapterIndex]);
    }
    showMiniPlayer();
    openFullPlayer();
  };

  // Chapter click = select chapter in MiniPlayer (do NOT open FullPlayer)
  const handleChapterPress = (book: Book, chapter: Chapter) => {
    setCurrentBook(book);
    setCurrentChapter(chapter);
    showMiniPlayer();
    // Note: Do NOT call openFullPlayer() - same behavior as row click
  };

  const loadDemoBook = () => {
    addBook(demoBook);
    setCurrentBook(demoBook);
    setCurrentChapter(demoBook.chapters[0]);
    showMiniPlayer();
  };

  const sortOptions = [
    { value: 'recent', label: 'Recent' },
    { value: 'title', label: 'Title' },
    { value: 'author', label: 'Author' },
    { value: 'progress', label: 'Progress' },
  ] as const;

  return (
    <div className="min-h-screen bg-[var(--neu-body-bg)]">
      {/* Header - neumorphism card */}
      <header className="sticky top-0 z-30 bg-[var(--neu-body-bg)] shadow-[var(--neu-shadow-light)]">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold text-[var(--neu-dark)]">Library</h1>
        </div>
        
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 mb-4">
            {/* Search toggle */}
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`
                neu-btn-icon-sm 
                ${showSearch ? 'neu-pressed' : 'neu-raised'}
                flex items-center justify-center
                text-[var(--neu-gray-700)]
                hover:text-[var(--neu-secondary)]
                transition-all duration-200
              `}
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>

          {/* Search bar - neumorphism input */}
          {showSearch && (
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--neu-gray-600)]" />
                <input
                  type="text"
                  placeholder="Search books..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="neu-input pl-10"
                />
              </div>
            </div>
          )}

          {/* Sort pills - neumorphism badges */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSortBy(option.value)}
                className={`
                  px-3 py-1.5 rounded-[var(--neu-radius-pill)] 
                  text-xs font-semibold whitespace-nowrap 
                  transition-all duration-200
                  ${sortBy === option.value
                    ? 'neu-btn-secondary text-white'
                    : 'neu-raised text-[var(--neu-gray-700)] hover:text-[var(--neu-dark)]'
                  }
                `}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="px-4 py-4">
        {filteredBooks.length === 0 && searchQuery ? (
          <div className="text-center py-12 neu-card p-8">
            <p className="text-[var(--neu-gray-700)]">No books found for "{searchQuery}"</p>
          </div>
        ) : (
          <BookGrid
            books={filteredBooks}
            onCoverPress={handleCoverPress}
            onChapterPress={handleChapterPress}
            onLoadDemo={loadDemoBook}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  );
}
