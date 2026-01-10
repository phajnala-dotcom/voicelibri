/**
 * VoiceLibri Audio Playback Hook
 * Manages HTML5 Audio playback and syncs with player store
 */

import { useEffect, useRef, useCallback } from 'react';
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
  const isSeekingRef = useRef<boolean>(false);

  // Handle audio end - advance to next chapter
  const handleEnded = useCallback(() => {
    const store = usePlayerStore.getState();
    if (store.currentBook && store.currentChapter) {
      const currentIndex = store.currentBook.chapters.findIndex(
        ch => ch.id === store.currentChapter?.id
      );
      if (currentIndex < store.currentBook.chapters.length - 1) {
        // Auto-advance to next chapter
        store.jumpToChapter('next');
      } else {
        // Book finished
        store.pause();
        useLibraryStore.getState().markAsFinished(store.currentBook.id);
      }
    }
  }, []);

  // Handle time update
  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current && !isSeekingRef.current) {
      const store = usePlayerStore.getState();
      // Only update if difference is significant (avoid feedback loop)
      if (Math.abs(audioRef.current.currentTime - store.currentTime) > 0.5) {
        store.setCurrentTime(audioRef.current.currentTime);
      }
    }
  }, []);

  // Handle audio errors
  const handleError = useCallback((e: Event) => {
    console.error('Audio playback error:', e);
    const audio = audioRef.current;
    if (audio?.error) {
      console.error('Audio error code:', audio.error.code, 'message:', audio.error.message);
    }
    usePlayerStore.getState().setPlaybackState('paused');
  }, []);

  // Handle can play through - resume if was playing
  const handleCanPlayThrough = useCallback(() => {
    const store = usePlayerStore.getState();
    if (store.playbackState === 'playing' && audioRef.current) {
      audioRef.current.play().catch(err => {
        console.error('Failed to resume playback:', err);
      });
    }
  }, []);

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
      
      // Set up event listeners
      audioRef.current.addEventListener('ended', handleEnded);
      audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
      audioRef.current.addEventListener('error', handleError);
      audioRef.current.addEventListener('canplaythrough', handleCanPlayThrough);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('ended', handleEnded);
        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
        audioRef.current.removeEventListener('error', handleError);
        audioRef.current.removeEventListener('canplaythrough', handleCanPlayThrough);
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, [handleEnded, handleTimeUpdate, handleError, handleCanPlayThrough]);

  // Update audio source when chapter changes
  useEffect(() => {
    if (!currentBook || !currentChapter || !audioRef.current) return;

    const audio = audioRef.current;
    const chapterUrl = getChapterAudioUrl(currentBook.title, currentChapter.index);
    
    // Only update source if it changed
    if (!audio.src.endsWith(encodeURIComponent(currentBook.title) + '/chapters/' + currentChapter.index)) {
      console.log('Loading chapter audio:', chapterUrl);
      audio.src = chapterUrl;
      audio.load();
      
      // If we were playing, resume playback after load
      if (playbackState === 'playing') {
        audio.play().catch(err => {
          console.error('Failed to play audio:', err);
          setPlaybackState('paused');
        });
      }
    }
  }, [currentBook?.id, currentChapter?.id, playbackState, setPlaybackState]);

  // Handle play/pause state changes
  useEffect(() => {
    if (!audioRef.current || !currentBook || !currentChapter) return;

    const audio = audioRef.current;

    if (playbackState === 'playing') {
      // Only play if we have a source loaded
      if (audio.src) {
        audio.play().catch(err => {
          console.error('Failed to play audio:', err);
          setPlaybackState('paused');
        });
      }
    } else {
      audio.pause();
    }
  }, [playbackState, setPlaybackState, currentBook, currentChapter]);

  // Handle playback speed changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  // Handle seek operations from store (e.g., skip forward/backward)
  useEffect(() => {
    if (audioRef.current && !isSeekingRef.current) {
      const diff = Math.abs(audioRef.current.currentTime - currentTime);
      // Only seek if difference is more than 1 second (avoid feedback loop)
      if (diff > 1) {
        isSeekingRef.current = true;
        audioRef.current.currentTime = currentTime;
        // Reset seeking flag after a short delay
        setTimeout(() => {
          isSeekingRef.current = false;
        }, 100);
      }
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
