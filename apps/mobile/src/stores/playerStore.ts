/**
 * Player Store - Zustand state management for audio playback
 * Manages react-native-track-player state
 * Mobile-only (iOS/Android)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// TYPES
// ============================================================================

export interface Chapter {
  id: string;
  title: string;
  index?: number;
  duration: number;
  url: string;
  subChunkCount?: number;
}

export interface NowPlaying {
  bookId: string;
  bookTitle: string;
  author: string;
  coverUrl: string | null;
  chapters: Chapter[];
  totalDuration: number;
}

export interface PlayerState {
  // Current playback
  nowPlaying: NowPlaying | null;
  currentChapterIndex: number;
  position: number; // seconds
  duration: number; // seconds
  isPlaying: boolean;
  isBuffering: boolean;
  
  // Settings
  playbackRate: number;
  sleepTimer: number | null; // minutes remaining, null = off
  
  // Mini player visibility
  showMiniPlayer: boolean;
  
  // Actions
  setNowPlaying: (nowPlaying: NowPlaying | null) => void;
  setCurrentChapter: (index: number) => void;
  setPosition: (position: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsBuffering: (isBuffering: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setSleepTimer: (minutes: number | null) => void;
  setShowMiniPlayer: (show: boolean) => void;
  
  // Helpers
  nextChapter: () => void;
  previousChapter: () => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
}

// ============================================================================
// STORE
// ============================================================================

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      nowPlaying: null,
      currentChapterIndex: 0,
      position: 0,
      duration: 0,
      isPlaying: false,
      isBuffering: false,
      playbackRate: 1.0,
      sleepTimer: null,
      showMiniPlayer: false,
      
      setNowPlaying: (nowPlaying) => {
        set({
          nowPlaying,
          currentChapterIndex: 0,
          position: 0,
          isPlaying: false,
          showMiniPlayer: !!nowPlaying,
        });
      },
      
      setCurrentChapter: (index) => {
        set({ currentChapterIndex: index, position: 0 });
      },
      
      setPosition: (position) => set({ position }),
      
      setDuration: (duration) => set({ duration }),
      
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      
      setIsBuffering: (isBuffering) => set({ isBuffering }),
      
      setPlaybackRate: (rate) => set({ playbackRate: rate }),
      
      setSleepTimer: (minutes) => set({ sleepTimer: minutes }),
      
      setShowMiniPlayer: (show) => set({ showMiniPlayer: show }),
      
      nextChapter: () => {
        const { nowPlaying, currentChapterIndex } = get();
        if (nowPlaying && currentChapterIndex < nowPlaying.chapters.length - 1) {
          set({ currentChapterIndex: currentChapterIndex + 1, position: 0 });
        }
      },
      
      previousChapter: () => {
        const { currentChapterIndex, position } = get();
        if (position > 3) {
          // If more than 3 seconds in, restart current chapter
          set({ position: 0 });
        } else if (currentChapterIndex > 0) {
          // Go to previous chapter
          set({ currentChapterIndex: currentChapterIndex - 1, position: 0 });
        }
      },
      
      skipForward: (seconds = 30) => {
        const { position, duration } = get();
        set({ position: Math.min(position + seconds, duration) });
      },
      
      skipBackward: (seconds = 15) => {
        const { position } = get();
        set({ position: Math.max(position - seconds, 0) });
      },
    }),
    {
      name: 'voicelibri-player',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        playbackRate: state.playbackRate,
        // Don't persist now playing - reload on app start
      }),
    }
  )
);
