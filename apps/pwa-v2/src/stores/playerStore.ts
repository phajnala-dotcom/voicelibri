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
  
  // Settings
  updateSettings: (settings: Partial<UserSettings>) => void;
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
    }),
    {
      name: 'voicelibri-player',
      partialize: (state) => ({
        settings: state.settings,
        speed: state.speed,
        volume: state.volume,
      }),
    }
  )
);
