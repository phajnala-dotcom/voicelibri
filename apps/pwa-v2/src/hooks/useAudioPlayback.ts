/**
 * VoiceLibri Audio Playback Hook
 * Manages HTML5 Audio playback and syncs with player store
 */

import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useLibraryStore } from '../stores/libraryStore';
import { getChapterAudioUrl, updatePlaybackPosition } from '../services/api';

/**
 * Hook to manage audio playback for current book
 * Connects player store state to HTML5 Audio API
 */
export function useAudioPlayback() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { currentBook, currentChapter, playbackState, currentTime, speed, setPlaybackState } = usePlayerStore();
  const { updateProgress } = useLibraryStore();
  const lastSaveTimeRef = useRef<number>(0);

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      
      // Set up event listeners
      audioRef.current.addEventListener('ended', () => {
        // Auto-advance to next chapter
        const store = usePlayerStore.getState();
        if (store.currentBook && store.currentChapter) {
          const currentIndex = store.currentBook.chapters.findIndex(
            ch => ch.id === store.currentChapter?.id
          );
          if (currentIndex < store.currentBook.chapters.length - 1) {
            store.jumpToChapter('next');
          } else {
            // Book finished
            store.pause();
          }
        }
      });

      audioRef.current.addEventListener('timeupdate', () => {
        if (audioRef.current) {
          usePlayerStore.getState().setCurrentTime(audioRef.current.currentTime);
        }
      });

      audioRef.current.addEventListener('error', (e) => {
        console.error('Audio playback error:', e);
        usePlayerStore.getState().setPlaybackState('paused');
      });
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // Update audio source when chapter changes
  useEffect(() => {
    if (!currentBook || !currentChapter || !audioRef.current) return;

    const audio = audioRef.current;
    const chapterUrl = getChapterAudioUrl(currentBook.title, currentChapter.index);
    
    // Only update source if it changed
    if (audio.src !== chapterUrl) {
      audio.src = chapterUrl;
      audio.load();
      
      // If we were playing, resume playback
      if (playbackState === 'playing') {
        audio.play().catch(err => {
          console.error('Failed to play audio:', err);
          setPlaybackState('paused');
        });
      }
    }
  }, [currentBook, currentChapter]);

  // Handle play/pause state changes
  useEffect(() => {
    if (!audioRef.current) return;

    const audio = audioRef.current;

    if (playbackState === 'playing') {
      audio.play().catch(err => {
        console.error('Failed to play audio:', err);
        setPlaybackState('paused');
      });
    } else {
      audio.pause();
    }
  }, [playbackState, setPlaybackState]);

  // Handle playback speed changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  // Handle seek operations
  useEffect(() => {
    if (audioRef.current && Math.abs(audioRef.current.currentTime - currentTime) > 1) {
      audioRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  // Save progress periodically (every 10 seconds)
  useEffect(() => {
    if (!currentBook || !currentChapter) return;

    const now = Date.now();
    if (now - lastSaveTimeRef.current > 10000) {
      lastSaveTimeRef.current = now;
      
      // Update local store
      updateProgress(currentBook.id, currentTime, currentChapter.index);
      
      // Sync to backend
      updatePlaybackPosition(currentBook.title, currentChapter.index, currentTime).catch(err => {
        console.error('Failed to save playback position:', err);
      });
    }
  }, [currentTime, currentBook, currentChapter, updateProgress]);

  // Save progress on unmount or book change
  useEffect(() => {
    return () => {
      const state = usePlayerStore.getState();
      if (state.currentBook && state.currentChapter) {
        useLibraryStore.getState().updateProgress(
          state.currentBook.id,
          state.currentTime,
          state.currentChapter.index
        );
        
        updatePlaybackPosition(
          state.currentBook.title,
          state.currentChapter.index,
          state.currentTime
        ).catch(err => {
          console.error('Failed to save playback position on unmount:', err);
        });
      }
    };
  }, [currentBook?.id]);

  return audioRef;
}
