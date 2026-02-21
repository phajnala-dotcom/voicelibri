/**
 * VoiceLibri - Neumorphism App Shell
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Main layout wrapper
 */

import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNavigation } from '../navigation';
import { MiniPlayer } from '../player';
import { FullPlayer } from './FullPlayer';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useProgressiveAudioPlayback } from '../../hooks/useProgressiveAudioPlayback';
import { getAudiobooks, convertToBook } from '../../services/api';

/**
 * Neumorphism App Shell
 * Main app layout with navigation and player
 */
export function AppShell() {
  const { currentBook, setCurrentBook, setCurrentChapter, showMiniPlayer, isMiniPlayerVisible, isFullPlayerOpen, openFullPlayer, closeFullPlayer } = usePlayerStore();
  const { addBook, books } = useLibraryStore();
  
  // Initialize progressive audio playback
  useProgressiveAudioPlayback();
  
  // Load last played book on app start
  useEffect(() => {
    const loadLastPlayedBook = async () => {
      // If we already have a book loaded (from persistence), show MiniPlayer
      if (currentBook) {
        showMiniPlayer();
        return;
      }
      
      // Try to load last played book from backend
      try {
        const audiobooks = await getAudiobooks();
        
        // Find the most recently played audiobook
        let mostRecentBook = null;
        let mostRecentTime = 0;
        
        for (const metadata of audiobooks) {
          // Add to library if not already there
          const book = convertToBook(metadata);
          const existing = books.find(b => b.id === book.id);
          if (!existing) {
            addBook(book);
          }
          
          // Track most recently played
          if (metadata.playback?.lastPlayedAt) {
            const playedTime = new Date(metadata.playback.lastPlayedAt).getTime();
            if (playedTime > mostRecentTime) {
              mostRecentTime = playedTime;
              mostRecentBook = { book, metadata };
            }
          }
        }
        
        // Set the most recently played book as current
        if (mostRecentBook) {
          setCurrentBook(mostRecentBook.book);
          const chapterIndex = mostRecentBook.metadata.playback?.currentChapter ?? 0;
          if (mostRecentBook.book.chapters[chapterIndex]) {
            setCurrentChapter(mostRecentBook.book.chapters[chapterIndex]);
          }
          showMiniPlayer();
        }
      } catch (error) {
        console.error('Failed to load audiobooks on app start:', error);
      }
    };
    
    loadLastPlayedBook();
  }, []); // Run once on mount

  return (
    <div className="min-h-screen bg-[var(--neu-body-bg)]">
      {/* Main content area */}
      <main 
        className="pb-safe"
        style={{ 
          paddingBottom: (currentBook || isMiniPlayerVisible)
            ? 'calc(var(--nav-height) + var(--mini-player-height) + var(--safe-area-bottom))' 
            : 'calc(var(--nav-height) + var(--safe-area-bottom))'
        }}
      >
        <Outlet />
      </main>
      
      {/* Mini Player */}
      <MiniPlayer onExpand={() => openFullPlayer()} />
      
      {/* Bottom Navigation */}
      <BottomNavigation />
      
      {/* Full Player Modal */}
      {isFullPlayerOpen && (
        <FullPlayer onCollapse={() => closeFullPlayer()} />
      )}
    </div>
  );
}
