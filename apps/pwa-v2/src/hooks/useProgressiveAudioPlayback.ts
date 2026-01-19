/**
 * Progressive Audio Playback Hook
 * Handles real-time subchunk streaming during generation and automatic chapter switching
 */

import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { getChapterAudioUrl, getSubChunkAudioUrl, isChapterReady, getHighestReadyChapter } from '../services/api';

// Audio cache for blob URLs
interface AudioCache {
  [key: string]: string; // blob URL
}

/**
 * Enhanced audio playback hook with progressive subchunk support
 */
export function useProgressiveAudioPlayback() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<AudioCache>({});
  
  const {
    currentBook,
    currentChapter,
    playbackState,
    currentTime,
    playbackMode,
    currentSubChunk,
    highestReadyChapter,
    setPlaybackState,
    setCurrentTime,
    setCurrentSubChunk,
    setHighestReadyChapter,
    nextSubChunk,
    shouldSwitchToChapter,
    switchToChapterMode,
  } = usePlayerStore();

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'metadata';
    }

    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = async () => {
      console.log('🎵 Audio ended, determining next action...');
      
      if (playbackMode === 'progressive' && currentSubChunk) {
        await handleProgressiveEnd();
      } else if (playbackMode === 'chapters') {
        await handleChapterEnd();
      }
    };

    const handleError = (e: Event) => {
      console.error('Audio error:', e);
      setPlaybackState('error');
    };

    const handleCanPlayThrough = () => {
      if (playbackState === 'loading') {
        setPlaybackState('paused');
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplaythrough', handleCanPlayThrough);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplaythrough', handleCanPlayThrough);
      audio.pause();
      audio.src = '';
    };
  }, [playbackMode, currentSubChunk, playbackState, setPlaybackState, setCurrentTime]);

  // Handle progressive playback end (subchunk finished)
  const handleProgressiveEnd = useCallback(async () => {
    if (!currentBook || !currentSubChunk) return;
    
    const { chapterIndex, subChunkIndex } = currentSubChunk;
    
    console.log(`🎵 Subchunk ${chapterIndex}:${subChunkIndex} finished, checking next...`);
    
    // Check if current chapter is now ready (consolidated)
    if (await shouldSwitchToChapter(chapterIndex)) {
      console.log(`✅ Chapter ${chapterIndex} is ready, switching to chapter mode`);
      switchToChapterMode();
      await loadChapterAudio(chapterIndex);
      return;
    }
    
    // Try to play next subchunk
    if (nextSubChunk()) {
      const newSubChunk = usePlayerStore.getState().currentSubChunk;
      if (newSubChunk) {
        console.log(`▶️ Playing next subchunk: ${newSubChunk.chapterIndex}:${newSubChunk.subChunkIndex}`);
        await loadSubChunkAudio(newSubChunk.chapterIndex, newSubChunk.subChunkIndex, { autoPlay: true });
      }
    } else {
      // No more subchunks, check if next chapter is ready
      const nextChapterIndex = chapterIndex + 1;
      if (nextChapterIndex < currentBook.chapters.length) {
        if (await shouldSwitchToChapter(nextChapterIndex)) {
          console.log(`✅ Next chapter ${nextChapterIndex} is ready, switching to chapter mode`);
          switchToChapterMode();
          await loadChapterAudio(nextChapterIndex);
        } else {
          console.log(`⏳ Waiting for chapter ${nextChapterIndex} to be ready...`);
          // Wait and try playing first subchunk of next chapter
          setCurrentSubChunk({ chapterIndex: nextChapterIndex, subChunkIndex: 0 });
          await loadSubChunkAudio(nextChapterIndex, 0, { autoPlay: true });
        }
      } else {
        console.log('📚 Audiobook finished!');
        setPlaybackState('stopped');
      }
    }
  }, [currentBook, currentSubChunk, shouldSwitchToChapter, switchToChapterMode, nextSubChunk, setCurrentSubChunk, setPlaybackState]);

  // Handle chapter end (normal chapter playback)
  const handleChapterEnd = useCallback(async () => {
    if (!currentBook || !currentChapter) return;
    
    const currentIndex = currentBook.chapters.findIndex(c => c.id === currentChapter.id);
    const nextChapter = currentBook.chapters[currentIndex + 1];
    
    if (nextChapter) {
      console.log(`▶️ Playing next chapter: ${nextChapter.title}`);
      await loadChapterAudio(nextChapter.index);
    } else {
      console.log('📚 Audiobook finished!');
      setPlaybackState('stopped');
    }
  }, [currentBook, currentChapter, setPlaybackState]);

  // Load subchunk audio with real-time streaming
  const loadSubChunkAudio = useCallback(async (
    chapterIndex: number,
    subChunkIndex: number,
    options: { autoPlay?: boolean } = {}
  ) => {
    if (!currentBook || !audioRef.current) return;
    const autoPlay = options.autoPlay ?? (playbackState === 'playing');
    
    const cacheKey = `${currentBook.title}-subchunk-${chapterIndex}-${subChunkIndex}`;
    
    // Check cache first
    if (audioCacheRef.current[cacheKey]) {
      audioRef.current.src = audioCacheRef.current[cacheKey];
      if (autoPlay) {
        audioRef.current.play().catch(err => {
          console.error('Failed to play cached subchunk:', err);
          setPlaybackState('error');
        });
      }
      return;
    }
    
    setPlaybackState('loading');
    
    try {
      console.log(`🔄 Loading subchunk: ${chapterIndex}:${subChunkIndex}`);
      
      const subChunkUrl = getSubChunkAudioUrl(currentBook.title, chapterIndex, subChunkIndex);
      const response = await fetch(subChunkUrl);
      
      if (!response.ok) {
        throw new Error(`Subchunk not ready: ${response.status}`);
      }
      
      const audioBlob = await response.blob();
      const blobUrl = URL.createObjectURL(audioBlob);
      
      // Cache the blob URL
      audioCacheRef.current[cacheKey] = blobUrl;
      
      // Load and play
      audioRef.current.src = blobUrl;
      
      if (autoPlay) {
        setPlaybackState('playing');
        audioRef.current.play().catch(err => {
          console.error('Failed to play subchunk:', err);
          setPlaybackState('error');
        });
      } else {
        setPlaybackState('paused');
      }
      
    } catch (error) {
      console.error('Failed to load subchunk:', error);
      setPlaybackState('error');
    }
  }, [currentBook, playbackState, setPlaybackState]);

  // Load chapter audio (normal playback)
  const loadChapterAudio = useCallback(async (chapterIndex: number) => {
    if (!currentBook || !audioRef.current) return;
    
    const cacheKey = `${currentBook.title}-chapter-${chapterIndex}`;
    
    // Check cache first
    if (audioCacheRef.current[cacheKey]) {
      audioRef.current.src = audioCacheRef.current[cacheKey];
      if (playbackState === 'playing') {
        audioRef.current.play();
      }
      return;
    }
    
    setPlaybackState('loading');
    
    try {
      console.log(`🔄 Loading chapter: ${chapterIndex}`);
      
      const chapterUrl = getChapterAudioUrl(currentBook.title, chapterIndex);
      const response = await fetch(chapterUrl);
      
      if (!response.ok) {
        throw new Error(`Chapter not ready: ${response.status}`);
      }
      
      const audioBlob = await response.blob();
      const blobUrl = URL.createObjectURL(audioBlob);
      
      // Cache the blob URL
      audioCacheRef.current[cacheKey] = blobUrl;
      
      // Load and play
      audioRef.current.src = blobUrl;
      
      if (playbackState === 'loading') {
        setPlaybackState('playing');
        audioRef.current.play();
      }
      
    } catch (error) {
      console.error('Failed to load chapter:', error);
      setPlaybackState('error');
    }
  }, [currentBook, playbackState, setPlaybackState]);

  // Update highest ready chapter periodically during progressive mode
  useEffect(() => {
    if (playbackMode !== 'progressive' || !currentBook) return;
    
    const checkChapterReadiness = async () => {
      try {
        const newHighestReady = await getHighestReadyChapter(currentBook.title);
        if (newHighestReady > highestReadyChapter) {
          setHighestReadyChapter(newHighestReady);
          console.log(`📦 Chapters 1-${newHighestReady} are now ready`);
        }
      } catch (error) {
        console.error('Error checking chapter readiness:', error);
      }
    };
    
    // Check every 3 seconds during progressive playback
    const interval = setInterval(checkChapterReadiness, 3000);
    
    return () => clearInterval(interval);
  }, [playbackMode, currentBook, highestReadyChapter, setHighestReadyChapter]);

  // Handle play/pause state changes
  useEffect(() => {
    if (!audioRef.current) return;
    
    const audio = audioRef.current;
    
    if (playbackState === 'playing') {
      if (audio.src) {
        audio.play().catch(err => {
          console.error('Failed to play audio:', err);
          setPlaybackState('paused');
        });
      } else {
        // No source loaded, start playback
        if (playbackMode === 'progressive' && currentSubChunk) {
          loadSubChunkAudio(currentSubChunk.chapterIndex, currentSubChunk.subChunkIndex, { autoPlay: true });
        } else if (playbackMode === 'chapters' && currentChapter) {
          loadChapterAudio(currentChapter.index);
        }
      }
    } else if (playbackState === 'paused') {
      audio.pause();
    }
  }, [playbackState, playbackMode, currentSubChunk, currentChapter, setPlaybackState, loadSubChunkAudio, loadChapterAudio]);

  // Start progressive playback for a new audiobook
  const startProgressivePlayback = useCallback(async (book: any, startSubChunk = { chapterIndex: 0, subChunkIndex: 0 }) => {
    console.log('🚀 Starting progressive playback:', book.title);
    
    // Wait for first subchunk to be available
    let retries = 0;
    const maxRetries = 60; // 30 seconds
    
    while (retries < maxRetries) {
      try {
        const subChunkUrl = getSubChunkAudioUrl(book.title, startSubChunk.chapterIndex, startSubChunk.subChunkIndex);
        const response = await fetch(subChunkUrl, { method: 'HEAD' });
        
        if (response.ok) {
          console.log('✅ First subchunk is ready, starting playback');
          setCurrentSubChunk(startSubChunk);
          await loadSubChunkAudio(startSubChunk.chapterIndex, startSubChunk.subChunkIndex, { autoPlay: true });
          break;
        }
      } catch (error) {
        // Continue waiting
      }
      
      retries++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (retries >= maxRetries) {
      console.error('❌ Timeout waiting for first subchunk');
      setPlaybackState('error');
    }
  }, [setCurrentSubChunk, loadSubChunkAudio, setPlaybackState]);

  // Cleanup cached blob URLs
  useEffect(() => {
    return () => {
      Object.values(audioCacheRef.current).forEach(blobUrl => {
        URL.revokeObjectURL(blobUrl);
      });
      audioCacheRef.current = {};
    };
  }, []);

  return {
    startProgressivePlayback,
    loadSubChunkAudio,
    loadChapterAudio,
  };
}