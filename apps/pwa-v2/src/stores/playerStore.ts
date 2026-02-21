// VoiceLibri - Player Store
// State management inspired by BookPlayer's PlayerManager

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Book, Chapter, PlaybackState, SleepTimerState, UserSettings } from '../types';

interface PlayerStore {
  // Current playback state
  currentBook: Book | null;
  currentChapter: Chapter | null;
  playbackState: PlaybackState;
  currentTime: number;
  speed: number;
  volume: number;
  
  // Progressive playback mode for new audiobooks
  playbackMode: 'chapters' | 'subchunks' | 'progressive';
  currentSubChunk: { chapterIndex: number; subChunkIndex: number } | null;
  highestReadyChapter: number; // Tracks which chapters are fully consolidated
  
  // Ambient/soundscape controls (dual-player architecture)
  ambientVolume: number; // 0.0 – 1.0
  ambientEnabled: boolean; // enable/disable ambient layer
  
  // Sleep timer (BookPlayer pattern)
  sleepTimer: SleepTimerState;
  
  // Settings
  settings: UserSettings;
  
  // Mini player visibility
  isMiniPlayerVisible: boolean;
  isFullPlayerOpen: boolean;
  
  // Computed getters
  playbackSpeed: number;
  
  // Actions
  setCurrentBook: (book: Book | null) => void;
  setCurrentChapter: (chapter: Chapter | null) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setCurrentTime: (time: number) => void;
  setSpeed: (speed: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  
  // Playback controls (BookPlayer-style)
  play: () => void;
  pause: () => void;
  playPause: () => void;
  seekTo: (time: number) => void;
  skipForward: () => void;
  skipBackward: () => void;
  jumpToChapter: (target: Chapter | number | 'next' | 'previous') => void;
  nextChapter: () => void;
  previousChapter: () => void;
  
  // Sleep timer controls
  setSleepTimer: (state: SleepTimerState) => void;
  cancelSleepTimer: () => void;
  
  // Player visibility
  showMiniPlayer: () => void;
  hideMiniPlayer: () => void;
  openFullPlayer: () => void;
  closeFullPlayer: () => void;
  
  // Progressive playback controls
  setPlaybackMode: (mode: 'chapters' | 'subchunks' | 'progressive') => void;
  setCurrentSubChunk: (subChunk: { chapterIndex: number; subChunkIndex: number } | null) => void;
  setHighestReadyChapter: (chapterIndex: number) => void;
  startProgressivePlayback: (book: Book) => void;
  switchToChapterMode: () => void;
  nextSubChunk: () => boolean; // Returns true if there's a next subchunk
  shouldSwitchToChapter: (chapterIndex: number) => Promise<boolean>;
  
  // Settings
  updateSettings: (settings: Partial<UserSettings>) => void;
  
  // Ambient controls
  setAmbientVolume: (volume: number) => void;
  setAmbientEnabled: (enabled: boolean) => void;
  toggleAmbient: () => void;
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      // Initial state
      currentBook: null,
      currentChapter: null,
      playbackState: 'stopped',
      currentTime: 0,
      speed: 1.0,
      volume: 1.0,
      playbackMode: 'chapters',
      currentSubChunk: null,
      highestReadyChapter: 0,
      ambientVolume: 0.5,
      ambientEnabled: true,
      sleepTimer: { type: 'off' },
      settings: {
        playbackSpeed: 1.0,
        skipForwardDuration: 30,
        skipBackwardDuration: 15,
        autoPlay: true,
        preferChapterContext: true,
        preferRemainingTime: true,
      },
      isMiniPlayerVisible: false,
      isFullPlayerOpen: false,
      
      // Computed - actually just alias for speed
      get playbackSpeed() {
        return get().speed;
      },
      
      // Setters
      setCurrentBook: (book) => {
        const shouldShowPlayer = book !== null;
        set({ 
          currentBook: book,
          isMiniPlayerVisible: shouldShowPlayer,
          currentChapter: book?.chapters[0] ?? null,
          playbackMode: 'chapters',
          currentSubChunk: null,
          currentTime: 0,
        });
      },
      setCurrentChapter: (chapter) => set({ currentChapter: chapter }),
      setPlaybackState: (state) => set({ playbackState: state }),
      setCurrentTime: (time) => set({ currentTime: time }),
      setSpeed: (speed) => set({ speed }),
      setVolume: (volume) => set({ volume }),
      
      // Playback speed alias for convenience
      setPlaybackSpeed: (speed: number) => set({ speed }),
      
      // Playback controls
      play: () => set({ playbackState: 'playing' }),
      pause: () => set({ playbackState: 'paused' }),
      playPause: () => {
        const { playbackState } = get();
        set({ 
          playbackState: playbackState === 'playing' ? 'paused' : 'playing' 
        });
      },
      seekTo: (time) => set({ currentTime: time }),
      skipForward: () => {
        const { currentTime, settings, currentBook } = get();
        const newTime = Math.min(
          currentTime + settings.skipForwardDuration,
          currentBook?.totalDuration ?? currentTime
        );
        set({ currentTime: newTime });
      },
      skipBackward: () => {
        const { currentTime, settings } = get();
        const newTime = Math.max(currentTime - settings.skipBackwardDuration, 0);
        set({ currentTime: newTime });
      },
      jumpToChapter: (target) => {
        const { currentBook, currentChapter } = get();
        if (!currentBook) return;
        
        let chapter: Chapter | undefined;
        
        if (target === 'next') {
          if (!currentChapter) return;
          const currentIndex = currentBook.chapters.findIndex(c => c.id === currentChapter.id);
          chapter = currentBook.chapters[currentIndex + 1];
        } else if (target === 'previous') {
          if (!currentChapter) return;
          const currentIndex = currentBook.chapters.findIndex(c => c.id === currentChapter.id);
          chapter = currentBook.chapters[currentIndex - 1];
        } else if (typeof target === 'number') {
          chapter = currentBook.chapters[target];
        } else {
          chapter = target;
        }
        
        if (chapter) {
          set({ 
            currentChapter: chapter,
            currentTime: chapter.start,
          });
        }
      },
      nextChapter: () => {
        const { currentBook, currentChapter } = get();
        if (!currentBook || !currentChapter) return;
        
        const currentIndex = currentBook.chapters.findIndex(c => c.id === currentChapter.id);
        const nextChapter = currentBook.chapters[currentIndex + 1];
        if (nextChapter) {
          set({ 
            currentChapter: nextChapter,
            currentTime: nextChapter.start,
          });
        }
      },
      previousChapter: () => {
        const { currentBook, currentChapter, currentTime } = get();
        if (!currentBook || !currentChapter) return;
        
        const currentIndex = currentBook.chapters.findIndex(c => c.id === currentChapter.id);
        
        // If more than 3 seconds into chapter, restart current chapter
        if (currentTime - currentChapter.start > 3) {
          set({ currentTime: currentChapter.start });
          return;
        }
        
        // Otherwise go to previous chapter
        const prevChapter = currentBook.chapters[currentIndex - 1];
        if (prevChapter) {
          set({ 
            currentChapter: prevChapter,
            currentTime: prevChapter.start,
          });
        }
      },
      
      // Sleep timer
      setSleepTimer: (state) => set({ sleepTimer: state }),
      cancelSleepTimer: () => set({ sleepTimer: { type: 'off' } }),
      
      // Player visibility
      showMiniPlayer: () => set({ isMiniPlayerVisible: true }),
      hideMiniPlayer: () => set({ isMiniPlayerVisible: false }),
      openFullPlayer: () => set({ isFullPlayerOpen: true }),
      closeFullPlayer: () => set({ isFullPlayerOpen: false }),
      
      // Settings
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings },
      })),
      
      // Progressive playback controls
      setPlaybackMode: (mode) => set({ playbackMode: mode }),
      setCurrentSubChunk: (subChunk) => set({ currentSubChunk: subChunk }),
      setHighestReadyChapter: (chapterIndex) => set({ highestReadyChapter: chapterIndex }),
      
      startProgressivePlayback: (book) => {
        set({
          currentBook: book,
          currentChapter: book.chapters[0] || null,
          playbackMode: 'progressive',
          currentSubChunk: { chapterIndex: 0, subChunkIndex: 0 },
          highestReadyChapter: 0,
          isMiniPlayerVisible: true,
        });
      },
      
      switchToChapterMode: () => {
        set({ 
          playbackMode: 'chapters',
          currentSubChunk: null,
        });
      },
      
      nextSubChunk: () => {
        const { currentSubChunk, currentBook } = get();
        if (!currentSubChunk || !currentBook) return false;
        
        const nextSubChunk = {
          chapterIndex: currentSubChunk.chapterIndex,
          subChunkIndex: currentSubChunk.subChunkIndex + 1
        };
        
        // Check if we're moving to next chapter's first subchunk
        if (nextSubChunk.subChunkIndex >= 50) { // Assuming max 50 subchunks per chapter
          if (nextSubChunk.chapterIndex + 1 < currentBook.chapters.length) {
            nextSubChunk.chapterIndex++;
            nextSubChunk.subChunkIndex = 0;
          } else {
            return false; // No more content
          }
        }
        
        set({ currentSubChunk: nextSubChunk });
        return true;
      },
      
      shouldSwitchToChapter: async (chapterIndex: number) => {
        const { currentBook, highestReadyChapter } = get();
        if (!currentBook) return false;
        
        // If this chapter is already ready, switch to chapter mode
        if (chapterIndex <= highestReadyChapter) {
          return true;
        }
        
        // Check if chapter became ready since last check
        try {
          const { isChapterReady } = await import('../services/api');
          const isReady = await isChapterReady(currentBook.title, chapterIndex);
          if (isReady) {
            set({ highestReadyChapter: Math.max(chapterIndex, highestReadyChapter) });
            return true;
          }
        } catch (error) {
          console.error('Error checking chapter readiness:', error);
        }
        
        return false;
      },
      
      // Ambient controls
      setAmbientVolume: (volume) => set({ ambientVolume: Math.max(0, Math.min(1, volume)) }),
      setAmbientEnabled: (enabled) => set({ ambientEnabled: enabled }),
      toggleAmbient: () => set((s) => ({ ambientEnabled: !s.ambientEnabled })),
    }),
    {
      name: 'voicelibri-player',
      partialize: (state) => ({
        settings: state.settings,
        speed: state.speed,
        volume: state.volume,
        ambientVolume: state.ambientVolume,
        ambientEnabled: state.ambientEnabled,
        currentBook: state.currentBook,
        currentChapter: state.currentChapter,
        isMiniPlayerVisible: state.isMiniPlayerVisible,
        currentTime: state.currentTime,
        playbackMode: state.playbackMode,
        currentSubChunk: state.currentSubChunk,
        highestReadyChapter: state.highestReadyChapter,
      }),
    }
  )
);
