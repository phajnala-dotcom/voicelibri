import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BookSelector } from './BookSelector';

// ========================================
// TypeScript Interfaces
// ========================================

interface BookInfo {
  title: string;
  author: string;
  language?: string;
  estimatedDuration: string; // Format: "hh:mm"
  // Internal data for calculations (not for display)
  _internal: {
    totalChunks: number;
    durationSeconds: number;
  };
}

interface AudioCache {
  blobUrl: string;
  loading?: boolean;
  duration?: number; // Store actual audio duration in seconds
}

// ========================================
// Constants
// ========================================

const API_BASE_URL = 'http://localhost:3001';
const RETRY_ATTEMPTS = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

const SPEED_OPTIONS = [0.75, 0.9, 1.0, 1.25, 1.5];

// ========================================
// Voice Configuration - All 30 Gemini TTS Voices
// Source: https://docs.cloud.google.com/text-to-speech/docs/gemini-tts
// ========================================

interface VoiceConfig {
  gender: 'mužský' | 'ženský';
  voiceName: string;       // Star name of the voice
}

const VOICE_MATRIX: VoiceConfig[] = [
  // Mužské hlasy (16)
  { gender: 'mužský', voiceName: 'Achird' },
  { gender: 'mužský', voiceName: 'Algenib' },
  { gender: 'mužský', voiceName: 'Algieba' },
  { gender: 'mužský', voiceName: 'Alnilam' },
  { gender: 'mužský', voiceName: 'Charon' },
  { gender: 'mužský', voiceName: 'Enceladus' },
  { gender: 'mužský', voiceName: 'Fenrir' },
  { gender: 'mužský', voiceName: 'Iapetus' },
  { gender: 'mužský', voiceName: 'Orus' },
  { gender: 'mužský', voiceName: 'Puck' },
  { gender: 'mužský', voiceName: 'Rasalgethi' },
  { gender: 'mužský', voiceName: 'Sadachbia' },
  { gender: 'mužský', voiceName: 'Sadaltager' },
  { gender: 'mužský', voiceName: 'Schedar' },
  { gender: 'mužský', voiceName: 'Umbriel' },
  { gender: 'mužský', voiceName: 'Zubenelgenubi' },
  
  // Ženské hlasy (14)
  { gender: 'ženský', voiceName: 'Achernar' },
  { gender: 'ženský', voiceName: 'Aoede' },
  { gender: 'ženský', voiceName: 'Autonoe' },
  { gender: 'ženský', voiceName: 'Callirrhoe' },
  { gender: 'ženský', voiceName: 'Despina' },
  { gender: 'ženský', voiceName: 'Erinome' },
  { gender: 'ženský', voiceName: 'Gacrux' },
  { gender: 'ženský', voiceName: 'Kore' },
  { gender: 'ženský', voiceName: 'Laomedeia' },
  { gender: 'ženský', voiceName: 'Leda' },
  { gender: 'ženský', voiceName: 'Pulcherrima' },
  { gender: 'ženský', voiceName: 'Sulafat' },
  { gender: 'ženský', voiceName: 'Vindemiatrix' },
  { gender: 'ženský', voiceName: 'Zephyr' },
];

// Helper functions for filtering dropdown options
const getUniqueGenders = (): string[] => {
  return Array.from(new Set(VOICE_MATRIX.map(v => v.gender))).sort();
};

const getUniqueVoiceNames = (): string[] => {
  return Array.from(new Set(VOICE_MATRIX.map(v => v.voiceName))).sort();
};

// Filter voice names based on selected gender
const getFilteredVoiceNames = (gender: string | null): string[] => {
  if (!gender || gender === '') {
    return getUniqueVoiceNames();
  }
  return VOICE_MATRIX
    .filter(v => v.gender === gender)
    .map(v => v.voiceName)
    .sort();
};

// ========================================
// Helper Functions
// ========================================

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// ========================================
// Custom Hooks
// ========================================

const useLongPress = (callback: () => void, ms = 3000) => {
  const [startLongPress, setStartLongPress] = useState(false);

  useEffect(() => {
    let timerId: NodeJS.Timeout;
    if (startLongPress) {
      timerId = setTimeout(callback, ms);
    }
    return () => clearTimeout(timerId);
  }, [startLongPress, callback, ms]);

  return {
    onMouseDown: () => setStartLongPress(true),
    onMouseUp: () => setStartLongPress(false),
    onMouseLeave: () => setStartLongPress(false),
    onTouchStart: () => setStartLongPress(true),
    onTouchEnd: () => setStartLongPress(false),
  };
};

// ========================================
// Main Component
// ========================================

const BookPlayer: React.FC = () => {
  // ========================================
  // State Management
  // ========================================

  const [bookInfo, setBookInfo] = useState<BookInfo | null>(null);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [audioCache, setAudioCache] = useState<Map<number, AudioCache>>(new Map());
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingChunk, setLoadingChunk] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentBookFile, setCurrentBookFile] = useState<string>('');

  // Save playback position whenever it changes
  useEffect(() => {
    if (currentBookFile && bookInfo) {
      const position = {
        chunkIndex: currentChunkIndex,
        timeInChunk: currentTime,
        timestamp: Date.now()
      };
      localStorage.setItem(`playbackPosition_${currentBookFile}`, JSON.stringify(position));
    }
  }, [currentChunkIndex, currentTime, currentBookFile, bookInfo]);

  // Voice selection state (3-level filtering: Gender → Characteristic → Voice Name)
  // Load from localStorage or use defaults
  const [selectedGender, setSelectedGender] = useState<string | null>(() => {
    return localStorage.getItem('preferredNarratorGender') || 'mužský';
  });
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>(() => {
    return localStorage.getItem('preferredNarratorVoice') || 'Achird'; // Default: Achird (first male voice)
  });

  const audioRef = useRef<HTMLAudioElement>(null);
  const preloadTriggeredRef = useRef<boolean>(false); // Track if next chunk preload started
  const hasInitializedRef = useRef<boolean>(false); // Prevent duplicate initialization in StrictMode

  // Update voice dropdowns when values load from localStorage
  useEffect(() => {
    const savedVoice = localStorage.getItem('preferredNarratorVoice');
    const savedGender = localStorage.getItem('preferredNarratorGender');
    if (savedVoice) {
      setSelectedVoiceName(savedVoice);
    }
    if (savedGender) {
      setSelectedGender(savedGender);
    }
    console.log(`🎙️ Voice loaded from localStorage: ${savedVoice} (${savedGender})`);
  }, []); // Run once on mount

  // ========================================
  // API Functions
  // ========================================

  const fetchBookInfo = async (): Promise<BookInfo> => {
    const response = await fetch(`${API_BASE_URL}/api/book/info`);
    if (!response.ok) {
      throw new Error(`Failed to fetch book info: ${response.statusText}`);
    }
    return response.json();
  };

  const fetchChunkAudio = async (
    chunkIndex: number,
    retryCount = 0,
    bookFileOverride?: string // Allow override for book selection race condition
  ): Promise<string> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tts/chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chunkIndex,
          voiceName: selectedVoiceName || 'Algieba', // Send selected voice to backend
          bookFile: bookFileOverride || currentBookFile // Use override if provided
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`❌ Fetch failed for chunk ${chunkIndex}:`, response.status, errorText);
        console.error(`   Voice: ${selectedVoiceName}`);
        console.error(`   Book file: ${bookFileOverride || currentBookFile}`);
        throw new Error(`Failed to fetch chunk ${chunkIndex}: ${response.statusText} - ${errorText}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      return blobUrl;
    } catch (error) {
      // Retry logic with exponential backoff
      if (retryCount < RETRY_ATTEMPTS) {
        const delay = RETRY_DELAYS[retryCount];
        console.warn(`Retry ${retryCount + 1}/${RETRY_ATTEMPTS} for chunk ${chunkIndex} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchChunkAudio(chunkIndex, retryCount + 1, bookFileOverride);
      }
      throw error;
    }
  };

  // ========================================
  // Audio Playback Logic
  // ========================================

  const playChunk = useCallback(async (chunkIndex: number, bookFileOverride?: string) => {
    console.log('🎵 playChunk called for chunk:', chunkIndex, 'bookFile:', bookFileOverride || currentBookFile);
    
    if (!bookInfo) {
      console.log('❌ No bookInfo, returning');
      return;
    }

    try {
      // Check cache first - FAST PATH for instant transition
      let cachedAudio = audioCache.get(chunkIndex);
      console.log('🎵 Cache check:', cachedAudio ? 'HIT ⚡' : 'MISS');

      if (cachedAudio?.blobUrl) {
        // FAST PATH: Audio is cached, play immediately without loading states
        if (audioRef.current) {
          console.log('⚡ FAST PATH: Using cached audio, instant playback');
          audioRef.current.src = cachedAudio.blobUrl;
          audioRef.current.playbackRate = playbackSpeed;
          await audioRef.current.play();
          setIsPlaying(true);
          setCurrentChunkIndex(chunkIndex);
          
          // Reset preload trigger flag
          preloadTriggeredRef.current = false;
          
          // Note: Preloading now happens at 10% mark (see handleTimeUpdate)
          
          console.log('✅ Fast playback started');
          return; // Early return, skip loading states
        }
      }

      // SLOW PATH: Need to fetch from API
      setLoading(true);
      setError(null);
      setLoadingChunk(chunkIndex);
      console.log('🐌 SLOW PATH: Fetching from API...');

      // Fetch from API (pass bookFile override to avoid race condition)
      const blobUrl = await fetchChunkAudio(chunkIndex, 0, bookFileOverride);
      console.log('🎵 Received blobUrl:', blobUrl.substring(0, 50) + '...');

      // Cache it
      setAudioCache(prev => {
        const newCache = new Map(prev);
        newCache.set(chunkIndex, { blobUrl });
        return newCache;
      });

      cachedAudio = { blobUrl };

      // Play audio
      if (audioRef.current) {
        console.log('🎵 Setting audio src and playing...');
        // Clear previous source first to avoid 'no supported source' errors
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
        // Set new source
        audioRef.current.src = cachedAudio.blobUrl;
        audioRef.current.playbackRate = playbackSpeed;
        await audioRef.current.play();
        setIsPlaying(true);
        setCurrentChunkIndex(chunkIndex);
        
        // Reset preload trigger flag when starting a new chunk
        preloadTriggeredRef.current = false;
        
        // Note: Preloading now happens at 10% mark (see handleTimeUpdate)
        
        console.log('✅ Playback started successfully');
      }

      // Clear loading state on success
      setLoading(false);
      setLoadingChunk(null);
    } catch (error) {
      // Clear loading state on error
      setLoading(false);
      setLoadingChunk(null);
      
      console.error('❌ Error playing chunk:', error);
      console.error('   Current book file:', currentBookFile);
      console.error('   Book override:', bookFileOverride);
      console.error('   Chunk index:', chunkIndex);
      console.error('   Book info:', bookInfo);
      console.error('   Total chunks:', bookInfo?._internal.totalChunks);
      console.error('   Cache has chunk:', audioCache.has(chunkIndex));
      
      // Show user-friendly error message with actual error details
      const errorMsg = error instanceof Error ? error.message : String(error);
      setError(`Nepodarilo sa načítať audio chunk ${chunkIndex + 1}: ${errorMsg}. Skúsiť znova?`);
      setIsPlaying(false);
    }
  }, [bookInfo, audioCache, playbackSpeed, fetchChunkAudio]);

  const preloadNextChunk = async (nextIndex: number) => {
    if (!bookInfo || nextIndex >= bookInfo._internal.totalChunks) return;
    if (audioCache.has(nextIndex)) return; // Already cached

    console.log(`Preloading chunk ${nextIndex + 1}/${bookInfo._internal.totalChunks}...`);

    try {
      // Mark as loading
      setAudioCache(prev => {
        const newCache = new Map(prev);
        newCache.set(nextIndex, { blobUrl: '', loading: true });
        return newCache;
      });

      const blobUrl = await fetchChunkAudio(nextIndex);

      // Update cache with blob URL
      setAudioCache(prev => {
        const newCache = new Map(prev);
        newCache.set(nextIndex, { blobUrl, loading: false });
        return newCache;
      });

      console.log(`✓ Preloaded chunk ${nextIndex + 1}`);
    } catch (error) {
      console.warn('Preload failed for chunk', nextIndex, error);
      
      // Remove loading marker and failed cache entry
      setAudioCache(prev => {
        const newCache = new Map(prev);
        newCache.delete(nextIndex);
        return newCache;
      });
    }
  };

  // ========================================
  // Playback Controls
  // ========================================

  const togglePlayPause = async () => {
    console.log('🎮 togglePlayPause called, isPlaying:', isPlaying, 'audioRef.current:', !!audioRef.current);
    
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // If not initialized, play current chunk
      const hasAudioSrc = audioRef.current.src && audioRef.current.src !== '';
      console.log('🎮 hasAudioSrc:', hasAudioSrc, 'src:', audioRef.current.src);
      
      if (!hasAudioSrc) {
        console.log('🎮 Calling playChunk for chunk:', currentChunkIndex);
        await playChunk(currentChunkIndex);
      } else {
        await audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  /**
   * Skip forward/backward with cross-chunk seeking
   * Uses actual cached audio durations for precise skip intervals
   */
  const skipSeconds = async (seconds: number) => {
    if (!audioRef.current || !bookInfo) return;

    const currentTimeInChunk = audioRef.current.currentTime;
    const currentChunkDuration = audioRef.current.duration || 0;
    const newTimeInChunk = currentTimeInChunk + seconds;

    console.log(`🔍 Skip ${seconds}s: currentChunk=${currentChunkIndex}, currentTime=${currentTimeInChunk.toFixed(2)}s, duration=${currentChunkDuration.toFixed(2)}s`);

    // If new time is within current chunk bounds, simple seek
    if (newTimeInChunk >= 0 && newTimeInChunk < currentChunkDuration) {
      console.log(`✅ Simple seek to ${newTimeInChunk.toFixed(2)}s within current chunk`);
      audioRef.current.currentTime = newTimeInChunk;
      return;
    }

    // Cross-chunk seeking needed
    let remainingSkip = seconds;
    let targetChunkIndex = currentChunkIndex;
    let targetTimeInChunk = currentTimeInChunk;

    if (seconds > 0) {
      // Skip forward
      remainingSkip = seconds - (currentChunkDuration - currentTimeInChunk);
      targetChunkIndex++;
      targetTimeInChunk = 0;

      // Use cached durations when available, fall back to estimate
      const avgChunkDuration = bookInfo._internal.durationSeconds / bookInfo._internal.totalChunks;
      
      while (remainingSkip > 0 && targetChunkIndex < bookInfo._internal.totalChunks) {
        const cachedChunk = audioCache.get(targetChunkIndex);
        const chunkDuration = cachedChunk?.duration || avgChunkDuration;
        
        if (remainingSkip <= chunkDuration) {
          // This is our target chunk
          targetTimeInChunk = remainingSkip;
          break;
        }
        
        remainingSkip -= chunkDuration;
        targetChunkIndex++;
      }

      // Clamp to last chunk
      if (targetChunkIndex >= bookInfo._internal.totalChunks) {
        targetChunkIndex = bookInfo._internal.totalChunks - 1;
        targetTimeInChunk = 0; // Will be set to end of last chunk
      }
    } else {
      // Skip backward
      remainingSkip = Math.abs(seconds) - currentTimeInChunk;
      
      console.log(`⬅️ Backward skip: remainingSkip=${remainingSkip.toFixed(2)}s after current chunk`);
      
      const avgChunkDuration = bookInfo._internal.durationSeconds / bookInfo._internal.totalChunks;
      
      // If we can stay in current chunk
      if (remainingSkip <= 0) {
        targetTimeInChunk = currentTimeInChunk + seconds; // seconds is negative
        targetChunkIndex = currentChunkIndex;
        console.log(`✅ Stay in current chunk, new time=${targetTimeInChunk.toFixed(2)}s`);
      } else {
        // Need to go to previous chunks
        targetChunkIndex = currentChunkIndex - 1;
        console.log(`🔙 Going backward from chunk ${currentChunkIndex}, starting at chunk ${targetChunkIndex}`);
        
        while (remainingSkip > 0 && targetChunkIndex >= 0) {
          const cachedChunk = audioCache.get(targetChunkIndex);
          const chunkDuration = cachedChunk?.duration || avgChunkDuration;
          
          console.log(`  Checking chunk ${targetChunkIndex}: duration=${chunkDuration.toFixed(2)}s, remaining=${remainingSkip.toFixed(2)}s`);
          
          if (remainingSkip <= chunkDuration) {
            // This is our target chunk
            targetTimeInChunk = chunkDuration - remainingSkip;
            console.log(`  ✅ Target found! chunk=${targetChunkIndex}, time=${targetTimeInChunk.toFixed(2)}s`);
            break;
          }
          
          remainingSkip -= chunkDuration;
          targetChunkIndex--;
        }

        // Clamp to first chunk
        if (targetChunkIndex < 0) {
          targetChunkIndex = 0;
          targetTimeInChunk = 0;
          console.log(`⚠️ Clamped to first chunk`);
        }
      }
    }

    // Validate target chunk index
    if (targetChunkIndex < 0 || targetChunkIndex >= bookInfo._internal.totalChunks) {
      console.warn(`⚠️ Invalid target chunk: ${targetChunkIndex}, clamping to valid range`);
      targetChunkIndex = Math.max(0, Math.min(targetChunkIndex, bookInfo._internal.totalChunks - 1));
    }

    console.log(`🎯 Final target: chunk=${targetChunkIndex}, time=${targetTimeInChunk.toFixed(2)}s`);

    // Execute the skip
    if (targetChunkIndex !== currentChunkIndex) {
      console.log(`⏩ Cross-chunk skip: chunk ${currentChunkIndex} → ${targetChunkIndex}, target time: ${targetTimeInChunk.toFixed(1)}s`);
      
      const wasPlaying = isPlaying;
      if (wasPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      }

      // Don't set currentChunkIndex here - let playChunk do it on success
      await playChunk(targetChunkIndex);
      
      // Set time position after chunk loads
      setTimeout(() => {
        if (audioRef.current) {
          const safeDuration = audioRef.current.duration || 0;
          audioRef.current.currentTime = Math.min(Math.max(0, targetTimeInChunk), safeDuration);
          if (wasPlaying) {
            audioRef.current.play();
          }
        }
      }, 100);
    } else {
      // Same chunk, just adjust time
      console.log(`↔️ Same chunk skip to ${newTimeInChunk.toFixed(2)}s`);
      audioRef.current.currentTime = Math.max(0, Math.min(currentChunkDuration, newTimeInChunk));
    }
  };

  const skipMinutes = (minutes: number) => {
    skipSeconds(minutes * 60);
  };

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  // Voice selection handlers - 2-level filtering: Gender → Voice Name
  // "-" zostáva vybraná ak používateľ nevyberie konkrétnu hodnotu
  const handleGenderChange = (gender: string) => {
    setSelectedGender(gender || null);
    
    // If gender selected, find first matching voice
    if (gender && gender !== '') {
      const matchingVoice = VOICE_MATRIX.find(v => v.gender === gender);
      if (matchingVoice) {
        setSelectedVoiceName(matchingVoice.voiceName);
        console.log(`🎙️ Voice changed to: ${matchingVoice.voiceName} (${matchingVoice.gender})`);
      }
    }
  };

  const handleVoiceNameChange = (voiceName: string) => {
    setSelectedVoiceName(voiceName);
    // Find the voice and set gender
    const matchingVoice = VOICE_MATRIX.find(v => v.voiceName === voiceName);
    if (matchingVoice) {
      setSelectedGender(matchingVoice.gender);
      console.log(`🎙️ Voice changed to: ${matchingVoice.voiceName} (${matchingVoice.gender})`);
      // Save to localStorage for persistence
      localStorage.setItem('preferredNarratorVoice', voiceName);
      localStorage.setItem('preferredNarratorGender', matchingVoice.gender);
    }
  };

  const retryCurrentChunk = () => {
    setError(null);
    
    // Clear failed cache entry
    setAudioCache(prev => {
      const newCache = new Map(prev);
      newCache.delete(currentChunkIndex);
      return newCache;
    });
    
    // Retry playback
    playChunk(currentChunkIndex);
  };

  // ========================================
  // Audio Event Handlers
  // ========================================

  const handleAudioEnded = useCallback(() => {
    if (!bookInfo) return;

    // Auto-advance to next chunk
    if (currentChunkIndex < bookInfo._internal.totalChunks - 1) {
      playChunk(currentChunkIndex + 1);
    } else {
      // Book finished
      setIsPlaying(false);
      setCurrentChunkIndex(0);
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
      console.log('📚 Book finished!');
    }
  }, [bookInfo, currentChunkIndex, playChunk]);

  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current || !bookInfo) return;
    
    const currentTime = audioRef.current.currentTime;
    const duration = audioRef.current.duration;
    
    setCurrentTime(currentTime);
    
    // Aggressive preloading: Start at 0% for multi-voice (TTS generation takes 3-5s)
    if (duration && !isNaN(duration) && currentTime / duration >= 0.0) {
      const nextIndex = currentChunkIndex + 1;
      
      // Preload next chunk at 0% mark
      if (!preloadTriggeredRef.current) {
        console.log(`⏰ 0% mark reached (${currentTime.toFixed(1)}s/${duration.toFixed(1)}s), preloading next chunk...`);
        preloadTriggeredRef.current = true;
        preloadNextChunk(nextIndex);
      }
    }
  }, [bookInfo, currentChunkIndex, audioCache, preloadNextChunk]);

  const handleLoadedMetadata = useCallback(() => {
    if (!audioRef.current) return;
    
    // Store actual audio duration in cache
    const duration = audioRef.current.duration;
    if (duration && !isNaN(duration)) {
      setAudioCache(prev => {
        const newCache = new Map(prev);
        const existing = newCache.get(currentChunkIndex);
        if (existing) {
          newCache.set(currentChunkIndex, { ...existing, duration });
        }
        return newCache;
      });
      console.log(`📊 Chunk ${currentChunkIndex} duration: ${duration.toFixed(2)}s`);
    }
  }, [currentChunkIndex]);

  const handleAudioError = useCallback((e: Event) => {
    console.error('Audio playback error:', e);
    setError('Chyba pri prehrávaní audio. Skúsiť znova?');
    setIsPlaying(false);
  }, []);

  // ========================================
  // Progress Calculation
  // ========================================

  const calculateProgress = (): number => {
    if (!bookInfo) return 0;

    const avgChunkDuration = bookInfo._internal.durationSeconds / bookInfo._internal.totalChunks;
    const totalElapsed = currentChunkIndex * avgChunkDuration + currentTime;
    return Math.min(100, (totalElapsed / bookInfo._internal.durationSeconds) * 100);
  };

  const getCurrentTotalTime = (): number => {
    if (!bookInfo) return 0;
    const avgChunkDuration = bookInfo._internal.durationSeconds / bookInfo._internal.totalChunks;
    return currentChunkIndex * avgChunkDuration + currentTime;
  };

  // ========================================
  // Effects
  // ========================================

  // Initial load: Try to load last book or show book selector
  useEffect(() => {
    // Prevent duplicate initialization in React StrictMode
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;

    const initializePlayer = async () => {
      // Set a safety timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        console.warn('⚠️ Initialization timeout - showing UI anyway');
        setLoading(false);
        setIsInitialized(true);
      }, 10000); // 10 second timeout

      try {
        setLoading(true);
        
        // No auto-restore - user must select a book manually
        console.log('📚 Initialized - waiting for user book selection');
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize player:', error);
        setError('Nepodarilo sa načítať knihu. Skúste vybrať knihu z menu.');
        setIsInitialized(true); // Still show UI
      } finally {
        clearTimeout(timeoutId); // Clear the safety timeout
        setLoading(false);
      }
    };

    initializePlayer();
  }, []);

  // Attach audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.addEventListener('ended', handleAudioEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleAudioError);

    return () => {
      audio.removeEventListener('ended', handleAudioEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleAudioError);
    };
  }, [handleAudioEnded, handleTimeUpdate, handleLoadedMetadata, handleAudioError]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      audioCache.forEach(({ blobUrl }) => {
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
        }
      });
    };
  }, [audioCache]);

  // ========================================
  // Book Selection Handler
  // ========================================

  const handleBookSelected = async (filename: string) => {
    try {
      console.log('📚 Book selection changed:', filename);
      
      // Stop playback immediately
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = ''; // Clear current audio source
      }
      setIsPlaying(false);
      
      // Clear cache completely
      audioCache.forEach(({ blobUrl }) => {
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
        }
      });
      setAudioCache(new Map());
      setError(null);
      
      // Fetch new book info (backend already loaded it via /api/book/select)
      const info = await fetchBookInfo();
      console.log('📖 Book info received:', info);
      
      // CRITICAL: Update state synchronously BEFORE playing chunks
      // This ensures fetchChunkAudio uses the correct currentBookFile
      setBookInfo(info);
      setCurrentBookFile(filename);
      
      // Load saved playback position for this book
      const savedPosition = localStorage.getItem(`playbackPosition_${filename}`);
      let startChunkIndex = 0;
      let startTime = 0;
      if (savedPosition) {
        try {
          const position = JSON.parse(savedPosition);
          startChunkIndex = position.chunkIndex || 0;
          startTime = position.timeInChunk || 0;
          console.log(`📍 Resuming from chunk ${startChunkIndex} at ${startTime.toFixed(1)}s`);
        } catch (e) {
          console.warn('Failed to parse saved position, starting from beginning');
        }
      } else {
        console.log('📍 Starting from beginning');
      }
      
      setCurrentChunkIndex(startChunkIndex);
      setCurrentTime(startTime);
        
      // Preload/resume chunk (pass filename to avoid race condition)
      console.log(`🔄 Loading chunk ${startChunkIndex}`);
      await playChunk(startChunkIndex, filename);
      
      // If resuming mid-chunk, seek to saved time
      if (startTime > 0 && audioRef.current) {
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.currentTime = startTime;
            console.log(`⏩ Seeked to ${startTime.toFixed(1)}s`);
          }
        }, 200);
      }
      
      console.log('✓ New book loaded:', info);
    } catch (error) {
      console.error('Failed to load new book:', error);
      setError('Nepodarilo sa načítať novú knihu.');
    }
  };

  // ========================================
  // Long Press Handlers
  // ========================================

  const backwardBigPress = useLongPress(() => {
    console.log('⏪ Long press: -5 minutes');
    skipMinutes(-5);
  });

  const forwardBigPress = useLongPress(() => {
    console.log('⏩ Long press: +5 minutes');
    skipMinutes(5);
  });

  // ========================================
  // Render
  // ========================================

  if (!isInitialized) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <h2>📚 Načítavam knihu...</h2>
          {loading && <p>Čakajte prosím...</p>}
          {error && (
            <div style={styles.errorBox}>
              <p>{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If no book is loaded, show book selector UI
  if (!bookInfo) {
    return (
      <div style={styles.container}>
        <div style={styles.player}>
          <BookSelector 
            onBookSelected={handleBookSelected}
            currentBook={currentBookFile}
          />
          <div style={styles.loadingContainer}>
            <h2>📖 Vyberte knihu</h2>
            <p>Použite tlačidlo vyššie na výber knihy z knižnice</p>
            {error && (
              <div style={styles.errorBox}>
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const progress = calculateProgress();
  const totalElapsed = getCurrentTotalTime();

  return (
    <div style={styles.container}>
      <div style={styles.player}>
        {/* Book Selector Dropdown */}
        <BookSelector 
          onBookSelected={handleBookSelected}
          currentBook={currentBookFile}
        />

        {/* Book Metadata Header - Centered */}
        <div style={styles.bookHeader}>
          <h1 style={styles.bookTitle}>{bookInfo.title}</h1>
          <h2 style={styles.bookAuthor}>{bookInfo.author}</h2>
          <div style={styles.bookDetails}>
            {bookInfo.language && (
              <span style={styles.languageBadge}>
                🌐 {bookInfo.language.toUpperCase()}
              </span>
            )}
            <span style={styles.durationBadge}>
              ⏱️ {bookInfo.estimatedDuration}
            </span>
          </div>
        </div>

        {/* Progress Bar - Celá kniha */}
        <div style={styles.progressSection}>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
          <div style={styles.progressText}>
            {Math.round(progress)}%
          </div>
        </div>

        {/* Chunk Info */}
        <div style={styles.chunkInfo}>
          Chunk {currentChunkIndex + 1}/{bookInfo._internal.totalChunks} | {formatTime(totalElapsed)} /{' '}
          {bookInfo.estimatedDuration}
        </div>

        {/* Playback Controls */}
        <div style={styles.controls}>
          {/* Skip Backward 5 min (long press) */}
          <button
            {...backwardBigPress}
            onClick={() => skipSeconds(-30)}
            style={styles.controlButton}
            title="Click: -30s | Hold 3s: -5min"
          >
            <span style={styles.buttonIcon}>◀◀</span>
            <span style={styles.buttonLabel}>-5min</span>
          </button>

          {/* Skip Backward 30s */}
          <button onClick={() => skipSeconds(-30)} style={styles.controlButton} title="-30s">
            <span style={styles.buttonIcon}>◀</span>
            <span style={styles.buttonLabel}>-30s</span>
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlayPause}
            style={{ ...styles.controlButton, ...styles.playButton }}
            disabled={loading}
          >
            {loading ? (
              <span style={styles.buttonIcon}>⏳</span>
            ) : isPlaying ? (
              <span style={styles.buttonIcon}>⏸</span>
            ) : (
              <span style={styles.buttonIcon}>▶</span>
            )}
            <span style={styles.buttonLabel}>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
          </button>

          {/* Skip Forward 30s */}
          <button onClick={() => skipSeconds(30)} style={styles.controlButton} title="+30s">
            <span style={styles.buttonIcon}>▶</span>
            <span style={styles.buttonLabel}>+30s</span>
          </button>

          {/* Skip Forward 5 min (long press) */}
          <button
            {...forwardBigPress}
            onClick={() => skipSeconds(30)}
            style={styles.controlButton}
            title="Click: +30s | Hold 3s: +5min"
          >
            <span style={styles.buttonIcon}>▶▶</span>
            <span style={styles.buttonLabel}>+5min</span>
          </button>
        </div>

        {/* Speed Control */}
        <div style={styles.speedControl}>
          <label style={styles.speedLabel}>Rýchlosť:</label>
          <select
            value={playbackSpeed}
            onChange={e => changeSpeed(parseFloat(e.target.value))}
            style={styles.speedSelect}
          >
            {SPEED_OPTIONS.map(speed => (
              <option key={speed} value={speed}>
                {speed.toFixed(2)}x
              </option>
            ))}
          </select>
        </div>

        {/* Voice Control - 2-level Filtering Selector (Gender → Voice Name) */}
        <div style={styles.voiceControl}>
          <label style={styles.voiceLabel}>Hlas rozprávača:</label>
          
          {/* Gender Filter */}
          <select
            value={selectedGender || ''}
            onChange={e => handleGenderChange(e.target.value)}
            style={styles.voiceSelectNarrow}
            title="Pohlavie hlasu"
          >
            <option value="">-</option>
            {getUniqueGenders().map(gender => (
              <option key={gender} value={gender}>
                {gender}
              </option>
            ))}
          </select>

          {/* Voice Name (filtered by gender) */}
          <select
            value={selectedVoiceName}
            onChange={e => handleVoiceNameChange(e.target.value)}
            style={styles.voiceSelectNarrow}
            title="Meno hlasu"
          >
            {getFilteredVoiceNames(selectedGender).map(voiceName => (
              <option key={voiceName} value={voiceName}>
                {voiceName}
              </option>
            ))}
          </select>
        </div>

        {/* Loading/Error Messages */}
        {loadingChunk !== null && (
          <div style={styles.loadingMessage}>
            ⏳ Generujem audio chunk {loadingChunk + 1}/{bookInfo._internal.totalChunks}... (cca 25s)
          </div>
        )}

        {audioCache.get(currentChunkIndex + 1)?.loading && (
          <div style={styles.preloadMessage}>
            🔄 Preloadujem ďalší chunk...
          </div>
        )}

        {error && (
          <div style={styles.errorBox}>
            <p>{error}</p>
            <button onClick={retryCurrentChunk} style={styles.retryButton}>
              🔄 Skúsiť znova
            </button>
          </div>
        )}

        {/* Native Audio Player - Current Chunk Progress */}
        <div style={styles.audioSection}>
          <p style={styles.audioLabel}>🔊 Aktuálny chunk:</p>
          <audio ref={audioRef} controls style={styles.audioPlayer} />
        </div>

        {/* Debug Info */}
        <div style={styles.debugInfo}>
          <small>
            Cache: {audioCache.size} chunks | Playing: {isPlaying ? 'Yes' : 'No'} | Speed:{' '}
            {playbackSpeed}x
          </small>
        </div>
      </div>
    </div>
  );
};

// ========================================
// Styles
// ========================================

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '20px',
  },
  player: {
    backgroundColor: 'white',
    borderRadius: '16px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    padding: '40px',
    maxWidth: '700px',
    width: '100%',
  },
  // Book metadata header - centered layout
  bookHeader: {
    textAlign: 'center',
    marginBottom: '32px',
    paddingBottom: '24px',
    borderBottom: '2px solid #e0e0e0',
  },
  bookTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    margin: '0 0 12px 0',
    color: '#1a1a1a',
    lineHeight: '1.3',
  },
  bookAuthor: {
    fontSize: '20px',
    margin: '0 0 16px 0',
    color: '#666',
    fontWeight: '500',
  },
  bookDetails: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  languageBadge: {
    display: 'inline-block',
    padding: '6px 14px',
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600',
  },
  durationBadge: {
    display: 'inline-block',
    padding: '6px 14px',
    backgroundColor: '#f3e5f5',
    color: '#7b1fa2',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600',
  },
  progressSection: {
    marginBottom: '16px',
  },
  progressBar: {
    width: '100%',
    height: '12px',
    backgroundColor: '#e0e0e0',
    borderRadius: '6px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    transition: 'width 0.3s ease',
  },
  progressText: {
    textAlign: 'right',
    fontSize: '14px',
    color: '#666',
    fontWeight: 'bold',
  },
  chunkInfo: {
    textAlign: 'center',
    fontSize: '18px',
    marginBottom: '32px',
    color: '#333',
    fontWeight: '500',
  },
  controls: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  controlButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 16px',
    border: '2px solid #ddd',
    borderRadius: '8px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s',
    minWidth: '80px',
  },
  playButton: {
    backgroundColor: '#4CAF50',
    color: 'white',
    borderColor: '#4CAF50',
    minWidth: '100px',
    fontWeight: 'bold',
  },
  buttonIcon: {
    fontSize: '24px',
    marginBottom: '4px',
  },
  buttonLabel: {
    fontSize: '12px',
    textTransform: 'uppercase',
  },
  speedControl: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px',
  },
  speedLabel: {
    fontSize: '16px',
    fontWeight: '500',
  },
  speedSelect: {
    padding: '8px 12px',
    fontSize: '16px',
    borderRadius: '6px',
    border: '2px solid #ddd',
    cursor: 'pointer',
  },
  voiceControl: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  voiceLabel: {
    fontSize: '16px',
    fontWeight: '500',
  },
  voiceSelect: {
    padding: '8px 12px',
    fontSize: '14px',
    borderRadius: '6px',
    border: '2px solid #ddd',
    cursor: 'pointer',
    backgroundColor: 'white',
    minWidth: '180px',
  },
  voiceSelectNarrow: {
    padding: '8px 12px',
    fontSize: '14px',
    borderRadius: '6px',
    border: '2px solid #ddd',
    cursor: 'pointer',
    backgroundColor: 'white',
    minWidth: '120px',
    maxWidth: '140px',
  },
  audioSection: {
    marginTop: '24px',
    padding: '16px',
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
  },
  audioLabel: {
    marginBottom: '8px',
    fontSize: '14px',
    color: '#666',
  },
  audioPlayer: {
    width: '100%',
  },
  loadingMessage: {
    textAlign: 'center',
    padding: '12px',
    backgroundColor: '#fff3cd',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
    color: '#856404',
  },
  preloadMessage: {
    textAlign: 'center',
    padding: '8px',
    backgroundColor: '#d1ecf1',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '12px',
    color: '#0c5460',
  },
  errorBox: {
    padding: '16px',
    backgroundColor: '#f8d7da',
    borderRadius: '6px',
    marginBottom: '16px',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: '12px',
    padding: '8px 16px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  debugInfo: {
    marginTop: '16px',
    textAlign: 'center',
    color: '#999',
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '40px',
  },
};

export default BookPlayer;
