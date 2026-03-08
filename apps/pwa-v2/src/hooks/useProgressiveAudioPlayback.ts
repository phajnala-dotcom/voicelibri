/**
 * Progressive Audio Playback Hook
 * Handles real-time subchunk streaming during generation and automatic chapter switching.
 * Includes dual-player support: voice (master) + ambient (follower).
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import {
  getChapterAudioUrl,
  getSubChunkAudioUrl,
  isChapterReady,
  getHighestReadyChapter,
  getChapterAmbientUrl,
  isAmbientReady,
} from '../services/api';

// Audio cache for blob URLs
interface AudioCache {
  [key: string]: string; // blob URL
}

/**
 * Enhanced audio playback hook with progressive subchunk support
 * and independent ambient track playback.
 */
export function useProgressiveAudioPlayback() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ambientRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<AudioCache>({});
  const driftIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastShownChaptersRef = useRef<Set<number>>(new Set());
  const [soundscapeToast, setSoundscapeToast] = useState<string | null>(null);
  
  const {
    currentBook,
    currentChapter,
    playbackState,
    currentTime,
    playbackMode,
    currentSubChunk,
    highestReadyChapter,
    ambientVolume,
    ambientEnabled,
    setPlaybackState,
    setCurrentTime,
    setCurrentSubChunk,
    setHighestReadyChapter,
    nextSubChunk,
    shouldSwitchToChapter,
    switchToChapterMode,
  } = usePlayerStore();

  // Initialize audio elements (voice + ambient)
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'metadata';
    }
    if (!ambientRef.current) {
      ambientRef.current = new Audio();
      ambientRef.current.preload = 'metadata';
      ambientRef.current.loop = true; // Loop ambient in case it's shorter than voice
      ambientRef.current.volume = ambientEnabled ? ambientVolume : 0;
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
      // Only set paused if we're explicitly in loading state AND not in auto-play flow
      // (loadSubChunkAudio with autoPlay handles its own state transition)
      if (playbackState === 'loading' && !audioRef.current?.dataset.autoPlay) {
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
      // Also stop ambient
      if (ambientRef.current) {
        ambientRef.current.pause();
        ambientRef.current.src = '';
      }
    };
  }, [playbackMode, currentSubChunk, playbackState, setPlaybackState, setCurrentTime]);

  // Sync ambient volume and enabled state
  useEffect(() => {
    if (ambientRef.current) {
      ambientRef.current.volume = ambientEnabled ? ambientVolume : 0;
    }
  }, [ambientVolume, ambientEnabled]);

  // Drift correction: keep ambient in sync with voice (chapter mode only)
  useEffect(() => {
    if (driftIntervalRef.current) {
      clearInterval(driftIntervalRef.current);
      driftIntervalRef.current = null;
    }

    if (playbackMode === 'chapters' && playbackState === 'playing') {
      driftIntervalRef.current = setInterval(() => {
        const voice = audioRef.current;
        const ambient = ambientRef.current;
        if (!voice || !ambient || !ambient.src || ambient.readyState < 2) return;
        
        const drift = Math.abs(voice.currentTime - ambient.currentTime);
        if (drift > 0.05) { // 50ms tolerance
          ambient.currentTime = voice.currentTime;
        }
      }, 500);
    }

    return () => {
      if (driftIntervalRef.current) {
        clearInterval(driftIntervalRef.current);
        driftIntervalRef.current = null;
      }
    };
  }, [playbackMode, playbackState]);

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
      
      // Load voice
      if (autoPlay) {
        audioRef.current.dataset.autoPlay = 'true'; // Prevent handleCanPlayThrough interference
      }
      audioRef.current.src = blobUrl;

      // Step 10: Show soundscape toast if ambient is not ready yet (once per chapter)
      if (ambientEnabled && !toastShownChaptersRef.current.has(chapterIndex)) {
        isAmbientReady(currentBook.title, chapterIndex).then(ready => {
          if (!ready) {
            toastShownChaptersRef.current.add(chapterIndex);
            setSoundscapeToast('✨ Creating your soundscape...');
            setTimeout(() => setSoundscapeToast(null), 5000);
          }
        }).catch(() => { /* non-critical */ });
      }
      
      if (autoPlay) {
        setPlaybackState('playing');
        audioRef.current.play().catch(err => {
          console.error('Failed to play subchunk:', err);
          setPlaybackState('error');
        }).finally(() => {
          delete audioRef.current?.dataset.autoPlay;
        });
      } else {
        setPlaybackState('paused');
      }
      
    } catch (error) {
      console.error('Failed to load subchunk:', error);
      setPlaybackState('error');
    }
  }, [currentBook, playbackState, setPlaybackState]);

  // Load chapter audio (normal playback) with ambient track
  const loadChapterAudio = useCallback(async (chapterIndex: number) => {
    if (!currentBook || !audioRef.current) return;
    
    const cacheKey = `${currentBook.title}-chapter-${chapterIndex}`;
    
    // Check cache first
    if (audioCacheRef.current[cacheKey]) {
      audioRef.current.src = audioCacheRef.current[cacheKey];
      if (playbackState === 'playing') {
        audioRef.current.play();
      }
      // Load ambient for cached chapter too
      loadAmbientForChapter(chapterIndex);
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
      
      // Load ambient (fire-and-forget, non-blocking)
      loadAmbientForChapter(chapterIndex);
      
    } catch (error) {
      console.error('Failed to load chapter:', error);
      setPlaybackState('error');
    }
  }, [currentBook, playbackState, setPlaybackState]);

  // Update highest ready chapter periodically during progressive mode
  // Also handles ambient hot-swap (Step 11)
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

      // Step 11: Ambient hot-swap — check if chapter ambient is ready during progressive playback
      if (currentSubChunk && ambientRef.current) {
        try {
          const chapterIndex = currentSubChunk.chapterIndex;
          const expectedAmbientUrl = getChapterAmbientUrl(currentBook.title, chapterIndex);
          const currentAmbientSrc = ambientRef.current.src || '';

          // Only check if we haven't already loaded the chapter ambient
          if (!currentAmbientSrc.includes(`/chapters/${chapterIndex}/ambient`)) {
            const ready = await isAmbientReady(currentBook.title, chapterIndex);
            if (ready) {
              ambientRef.current.src = expectedAmbientUrl;
              if (audioRef.current) {
                ambientRef.current.currentTime = audioRef.current.currentTime;
              }
              ambientRef.current.volume = ambientEnabled ? ambientVolume : 0;
              if (audioRef.current && !audioRef.current.paused && ambientEnabled) {
                ambientRef.current.play().catch(() => { /* autoplay blocked */ });
              }
              console.log('🔊 Ambient upgraded to full soundscape');
            }
          }
        } catch {
          // Non-critical
        }
      }
    };
    
    // Check every 3 seconds during progressive playback
    const interval = setInterval(checkChapterReadiness, 3000);
    
    return () => clearInterval(interval);
  }, [playbackMode, currentBook, highestReadyChapter, setHighestReadyChapter, currentSubChunk, ambientEnabled, ambientVolume]);

  // Load ambient track for a chapter (non-blocking)
  const loadAmbientForChapter = useCallback(async (chapterIndex: number) => {    if (!currentBook || !ambientRef.current) return;
    
    try {
      const ready = await isAmbientReady(currentBook.title, chapterIndex);
      if (!ready) {
        console.log(`🔊 Ambient: Not ready for chapter ${chapterIndex}`);
        return;
      }
      
      const ambientUrl = getChapterAmbientUrl(currentBook.title, chapterIndex);
      const ambient = ambientRef.current;
      ambient.src = ambientUrl;
      ambient.volume = ambientEnabled ? ambientVolume : 0;
      ambient.currentTime = 0;
      
      // Wait for the ambient to be loadable, then sync with voice
      ambient.addEventListener('canplay', () => {
        if (audioRef.current && !audioRef.current.paused && ambientEnabled) {
          // Sync ambient time to voice time (they should start together)
          ambient.currentTime = audioRef.current.currentTime;
          ambient.play().catch(() => {
            console.log(`🔊 Ambient: Autoplay blocked for chapter ${chapterIndex}`);
          });
        }
      }, { once: true });
      
      // Trigger load
      ambient.load();
      
      console.log(`🔊 Ambient: Loaded for chapter ${chapterIndex}`);
    } catch (err) {
      // Non-fatal
      console.log(`🔊 Ambient: Failed to load for chapter ${chapterIndex}:`, err);
    }
  }, [currentBook, ambientEnabled, ambientVolume]);

  // Handle play/pause state changes (sync voice + ambient)
  useEffect(() => {
    if (!audioRef.current) return;
    
    const audio = audioRef.current;
    const ambient = ambientRef.current;
    
    if (playbackState === 'playing') {
      if (audio.src) {
        // Only call play() if audio is actually paused (avoid AbortError from double-play)
        if (audio.paused) {
          audio.play().catch(err => {
            // Ignore AbortError (caused by rapid play/pause or src changes)
            if (err.name === 'AbortError') return;
            console.error('Failed to play audio:', err);
            setPlaybackState('paused');
          });
        }
        // Sync ambient
        if (ambient?.src && ambientEnabled && ambient.paused) {
          ambient.play().catch(() => { /* non-fatal */ });
        }
      } else if (playbackMode === 'chapters' && currentChapter) {
        // Chapter mode: load chapter audio directly
        loadChapterAudio(currentChapter.index);
      }
      // Progressive mode with no src: handled by auto-start useEffect (polling)
    } else if (playbackState === 'paused') {
      audio.pause();
      if (ambient) ambient.pause();
    } else if (playbackState === 'stopped') {
      audio.pause();
      audio.currentTime = 0;
      if (ambient) {
        ambient.pause();
        ambient.currentTime = 0;
      }
    }
  }, [playbackState, playbackMode, currentSubChunk, currentChapter, ambientEnabled, setPlaybackState, loadSubChunkAudio, loadChapterAudio]);

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

  // Auto-start progressive playback when store signals progressive mode
  const progressiveStartedRef = useRef(false);
  useEffect(() => {
    if (playbackMode === 'progressive' && currentBook && currentSubChunk && !progressiveStartedRef.current) {
      // Check that audio hasn't been loaded yet (avoid re-triggering on re-renders)
      if (!audioRef.current?.src) {
        progressiveStartedRef.current = true;
        console.log('🔄 Auto-starting progressive playback...');
        startProgressivePlayback(currentBook, currentSubChunk);
      }
    } else if (playbackMode !== 'progressive') {
      progressiveStartedRef.current = false;
    }
  }, [playbackMode, currentBook, currentSubChunk]); // eslint-disable-line react-hooks/exhaustive-deps

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
    soundscapeToast,
  };
}