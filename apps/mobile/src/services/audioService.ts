/**
 * VoiceLibri Audio Service
 * Advanced audio playback using expo-audio with:
 * - Lock screen controls (Control Center on iOS, notification controls on Android)
 * - Background audio playback
 * - Headphone button support
 * - Remote control events
 * - Progressive subchunk playback during real-time generation
 * 
 * Based on official Expo Audio documentation:
 * https://docs.expo.dev/versions/latest/sdk/audio/
 */

import { 
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import { usePlayerStore } from '../stores/playerStore';
import type { NowPlaying, Chapter } from '../stores/playerStore';
import { getChapterAudioUrl, getSubChunkAudioUrl, updatePlaybackPosition as apiUpdatePlaybackPosition } from './voiceLibriApi';
import { getLocalChapterUri, isChapterDownloaded } from './audioStorageService';

// ============================================================================
// TYPES
// ============================================================================

export interface AudioServiceState {
  isInitialized: boolean;
  player: AudioPlayer | null;
}

// ============================================================================
// SINGLETON STATE
// ============================================================================

let audioPlayer: AudioPlayer | null = null;
let isInitialized = false;
let positionUpdateInterval: NodeJS.Timeout | null = null;

// Progressive playback state
let currentSubChunkIndex = 0;
let currentChapterSubChunkCount = 0;
let isProgressiveMode = false;
let progressiveBookTitle = '';
let progressiveChapterIndex = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the audio service
 * Call this once when the app starts (in root layout)
 */
export async function initializeAudioService(): Promise<void> {
  if (isInitialized) {
    console.log('🎵 Audio service already initialized');
    return;
  }
  
  try {
    // Configure audio mode for background playback per official docs
    await setAudioModeAsync({
      // Allow audio to play when phone is silent/muted
      playsInSilentMode: true,
      // Enable background audio playback
      shouldPlayInBackground: true,
      // How to handle interruptions (e.g., phone calls)
      interruptionMode: 'doNotMix',
    });
    
    isInitialized = true;
    console.log('✓ Audio service initialized with background playback enabled');
  } catch (error) {
    console.error('✗ Failed to initialize audio service:', error);
    throw error;
  }
}

// ============================================================================
// PLAYER MANAGEMENT
// ============================================================================

/**
 * Create a new audio player instance using the official createAudioPlayer function
 */
export function createPlayer(): AudioPlayer {
  if (audioPlayer) {
    console.log('🎵 Reusing existing audio player');
    return audioPlayer;
  }
  
  // Use createAudioPlayer() per official docs for players that persist beyond component lifecycle
  audioPlayer = createAudioPlayer();
  console.log('✓ Created new audio player');
  return audioPlayer;
}

/**
 * Get the current audio player instance
 */
export function getPlayer(): AudioPlayer | null {
  return audioPlayer;
}

/**
 * Cleanup the audio player
 */
export async function cleanupPlayer(): Promise<void> {
  if (positionUpdateInterval) {
    clearInterval(positionUpdateInterval);
    positionUpdateInterval = null;
  }
  
  if (audioPlayer) {
    try {
      await audioPlayer.remove();
      audioPlayer = null;
      console.log('✓ Audio player cleaned up');
    } catch (error) {
      console.error('✗ Error cleaning up audio player:', error);
    }
  }
  
  // Reset progressive state
  isProgressiveMode = false;
  currentSubChunkIndex = 0;
}

// ============================================================================
// PROGRESSIVE PLAYBACK (Subchunks during real-time generation)
// ============================================================================

/**
 * Check if a subchunk is available
 */
async function isSubChunkAvailable(bookTitle: string, chapterIndex: number, subChunkIndex: number): Promise<boolean> {
  try {
    const url = getSubChunkAudioUrl(bookTitle, chapterIndex, subChunkIndex);
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for first subchunk to be ready (with timeout)
 */
async function waitForFirstSubChunk(
  bookTitle: string, 
  chapterIndex: number, 
  maxWaitMs: number = 60000
): Promise<boolean> {
  const pollIntervalMs = 500;
  const startTime = Date.now();
  
  console.log(`⏳ Waiting for first subchunk of chapter ${chapterIndex}...`);
  
  while (Date.now() - startTime < maxWaitMs) {
    if (await isSubChunkAvailable(bookTitle, chapterIndex, 0)) {
      console.log(`✅ First subchunk ready after ${Date.now() - startTime}ms`);
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  console.log(`❌ Timeout waiting for first subchunk`);
  return false;
}

/**
 * Play a specific subchunk
 */
async function playSubChunk(
  bookTitle: string,
  chapterIndex: number,
  subChunkIndex: number,
  chapter: Chapter
): Promise<void> {
  const player = createPlayer();
  const store = usePlayerStore.getState();
  
  const audioUri = getSubChunkAudioUrl(bookTitle, chapterIndex, subChunkIndex);
  
  console.log(`🎵 Playing subchunk ${chapterIndex}:${subChunkIndex}`);
  console.log(`   URI: ${audioUri}`);
  
  try {
    store.setIsBuffering(true);
    
    // Replace the current source
    await player.replace({ uri: audioUri });
    
    // Start playback
    await player.play();
    
    // Update store state
    store.setCurrentChapter(chapterIndex);
    store.setIsPlaying(true);
    store.setIsBuffering(false);
    
    // Track progressive state
    isProgressiveMode = true;
    progressiveBookTitle = bookTitle;
    progressiveChapterIndex = chapterIndex;
    currentSubChunkIndex = subChunkIndex;
    
    // Set up onEnd handler for next subchunk
    setupSubChunkEndHandler(bookTitle, chapterIndex, chapter);
    
    console.log(`✓ Playing subchunk ${chapterIndex}:${subChunkIndex}`);
  } catch (error) {
    console.error('✗ Error playing subchunk:', error);
    store.setIsBuffering(false);
    throw error;
  }
}

/**
 * Set up handler for when current subchunk ends
 */
function setupSubChunkEndHandler(bookTitle: string, chapterIndex: number, chapter: Chapter): void {
  const player = getPlayer();
  if (!player) return;
  
  // Add listener for playback status updates to detect when audio finishes
  const handlePlaybackStatus = async (status: { didJustFinish?: boolean }) => {
    if (!isProgressiveMode) return;
    if (!status.didJustFinish) return;
    
    const nextSubChunkIndex = currentSubChunkIndex + 1;
    console.log(`🎵 Subchunk ${chapterIndex}:${currentSubChunkIndex} ended, checking next...`);
    
    // Check if next subchunk is available
    if (await isSubChunkAvailable(bookTitle, chapterIndex, nextSubChunkIndex)) {
      await playSubChunk(bookTitle, chapterIndex, nextSubChunkIndex, chapter);
    } else {
      // Check if chapter file is now ready (consolidated)
      try {
        const chapterUrl = getChapterAudioUrl(bookTitle, chapterIndex);
        const response = await fetch(chapterUrl, { method: 'HEAD' });
        
        if (response.ok) {
          console.log(`✅ Chapter ${chapterIndex} is now consolidated, but we've been playing subchunks`);
          // Continue waiting for more subchunks or end
        }
      } catch {
        // Chapter not ready yet
      }
      
      // Wait a bit and try again
      console.log(`⏳ Waiting for next subchunk ${chapterIndex}:${nextSubChunkIndex}...`);
      setTimeout(async () => {
        if (await isSubChunkAvailable(bookTitle, chapterIndex, nextSubChunkIndex)) {
          await playSubChunk(bookTitle, chapterIndex, nextSubChunkIndex, chapter);
        } else {
          // Check if we should move to next chapter
          const store = usePlayerStore.getState();
          const { nowPlaying } = store;
          if (nowPlaying && chapterIndex < nowPlaying.chapters.length - 1) {
            console.log(`📚 Moving to next chapter`);
            const nextChapter = nowPlaying.chapters[chapterIndex + 1];
            await playChapter(bookTitle, nextChapter, chapterIndex + 1);
          } else {
            console.log(`📚 Audiobook playback complete or waiting for more content`);
            store.setIsPlaying(false);
          }
        }
      }, 2000);
    }
  };
  
  // Use playbackStatusUpdate event to detect when audio finishes
  player.addListener('playbackStatusUpdate', handlePlaybackStatus);
}

// ============================================================================
// PLAYBACK CONTROL
// ============================================================================

/**
 * Load and play a chapter
 * Tries: 1) Local storage, 2) Chapter file, 3) Progressive subchunks
 */
export async function playChapter(
  bookTitle: string,
  chapter: Chapter,
  chapterIndex: number,
  startPosition: number = 0
): Promise<void> {
  const player = createPlayer();
  const store = usePlayerStore.getState();
  
  // Check for local file first
  const localUri = getLocalChapterUri(bookTitle, chapterIndex);
  if (localUri) {
    console.log(`🎵 Loading chapter ${chapterIndex} from LOCAL: ${chapter.title}`);
    await playFromUri(player, store, localUri, chapter, chapterIndex, startPosition, bookTitle);
    return;
  }
  
  // Try chapter URL (consolidated chapter file)
  const chapterUri = getChapterAudioUrl(bookTitle, chapterIndex);
  try {
    const response = await fetch(chapterUri, { method: 'HEAD' });
    if (response.ok) {
      console.log(`🎵 Loading chapter ${chapterIndex} from STREAMING: ${chapter.title}`);
      await playFromUri(player, store, chapterUri, chapter, chapterIndex, startPosition, bookTitle);
      return;
    }
  } catch {
    // Chapter file not available, try progressive mode
  }
  
  // Fall back to progressive subchunk playback
  console.log(`🎵 Chapter ${chapterIndex} not ready, trying progressive subchunk playback...`);
  
  // Wait for first subchunk
  const firstSubChunkReady = await waitForFirstSubChunk(bookTitle, chapterIndex);
  
  if (firstSubChunkReady) {
    await playSubChunk(bookTitle, chapterIndex, 0, chapter);
  } else {
    console.error(`✗ Could not start playback for chapter ${chapterIndex} - no content available`);
    store.setIsBuffering(false);
    throw new Error('No audio content available yet. Please wait for generation to start.');
  }
}

/**
 * Internal helper to play from a URI (chapter or local file)
 */
async function playFromUri(
  player: AudioPlayer,
  store: ReturnType<typeof usePlayerStore.getState>,
  audioUri: string,
  chapter: Chapter,
  chapterIndex: number,
  startPosition: number,
  bookTitle: string
): Promise<void> {
  try {
    // Reset progressive mode
    isProgressiveMode = false;
    
    // Set buffering state
    store.setIsBuffering(true);
    
    // Replace the current source
    await player.replace({ uri: audioUri });
    
    // Seek to position if needed
    if (startPosition > 0) {
      await player.seekTo(startPosition);
    }
    
    // Start playback
    await player.play();
    
    // Update store state
    store.setCurrentChapter(chapterIndex);
    store.setIsPlaying(true);
    store.setIsBuffering(false);
    
    // Enable lock screen controls with metadata (if available)
    try {
      if (typeof player.setActiveForLockScreen === 'function') {
        player.setActiveForLockScreen(true, {
          title: chapter.title,
          artist: store.nowPlaying?.author || 'Unknown Author',
          albumTitle: store.nowPlaying?.bookTitle || 'VoiceLibri',
        });
      } else {
        console.log('⚠ Lock screen controls not available on this player instance');
      }
    } catch (lockScreenError) {
      console.warn('⚠ Could not enable lock screen controls:', lockScreenError);
    }
    
    // Start position tracking
    startPositionTracking(bookTitle, chapterIndex);
    
    console.log(`✓ Playing chapter: ${chapter.title}`);
  } catch (error) {
    console.error('✗ Error playing chapter:', error);
    store.setIsBuffering(false);
    throw error;
  }
}

/**
 * Toggle play/pause
 */
export async function togglePlayPause(): Promise<void> {
  const player = getPlayer();
  if (!player) return;
  
  const store = usePlayerStore.getState();
  
  if (store.isPlaying) {
    await player.pause();
    store.setIsPlaying(false);
  } else {
    await player.play();
    store.setIsPlaying(true);
  }
}

/**
 * Pause playback
 */
export async function pause(): Promise<void> {
  const player = getPlayer();
  if (!player) return;
  
  await player.pause();
  usePlayerStore.getState().setIsPlaying(false);
}

/**
 * Resume playback
 */
export async function play(): Promise<void> {
  const player = getPlayer();
  if (!player) return;
  
  await player.play();
  usePlayerStore.getState().setIsPlaying(true);
}

/**
 * Seek to a specific position
 */
export async function seekTo(position: number): Promise<void> {
  const player = getPlayer();
  if (!player) return;
  
  await player.seekTo(position);
  usePlayerStore.getState().setPosition(position);
}

/**
 * Skip forward by seconds
 */
export async function skipForward(seconds: number = 30): Promise<void> {
  const player = getPlayer();
  if (!player) return;
  
  const store = usePlayerStore.getState();
  const newPosition = Math.min(store.position + seconds, store.duration);
  await seekTo(newPosition);
}

/**
 * Skip backward by seconds
 */
export async function skipBackward(seconds: number = 15): Promise<void> {
  const player = getPlayer();
  if (!player) return;
  
  const store = usePlayerStore.getState();
  const newPosition = Math.max(store.position - seconds, 0);
  await seekTo(newPosition);
}

/**
 * Set playback rate (speed)
 */
export async function setPlaybackRate(rate: number): Promise<void> {
  const player = getPlayer();
  if (!player) return;
  
  player.playbackRate = rate;
  usePlayerStore.getState().setPlaybackRate(rate);
}

/**
 * Go to next chapter
 */
export async function nextChapter(): Promise<void> {
  const store = usePlayerStore.getState();
  const { nowPlaying, currentChapterIndex } = store;
  
  if (!nowPlaying || currentChapterIndex >= nowPlaying.chapters.length - 1) {
    console.log('📚 No next chapter available');
    return;
  }
  
  const nextIndex = currentChapterIndex + 1;
  const nextChapter = nowPlaying.chapters[nextIndex];
  await playChapter(nowPlaying.bookTitle, nextChapter, nextIndex);
}

/**
 * Go to previous chapter
 */
export async function previousChapter(): Promise<void> {
  const store = usePlayerStore.getState();
  const { nowPlaying, currentChapterIndex, position } = store;
  
  if (!nowPlaying) return;
  
  // If more than 3 seconds into chapter, restart current chapter
  if (position > 3) {
    await seekTo(0);
    return;
  }
  
  // Otherwise go to previous chapter
  if (currentChapterIndex > 0) {
    const prevIndex = currentChapterIndex - 1;
    const prevChapter = nowPlaying.chapters[prevIndex];
    await playChapter(nowPlaying.bookTitle, prevChapter, prevIndex);
  }
}

// ============================================================================
// BOOK PLAYBACK
// ============================================================================

/**
 * Start playing a book from the beginning or last position
 * @param downloadFirst - If true, download chapter to local storage before playing (default: false for immediate streaming)
 */
export async function startBook(
  nowPlaying: NowPlaying, 
  resumePosition?: { chapterIndex: number; position: number },
  options?: { downloadFirst?: boolean }
): Promise<void> {
  const store = usePlayerStore.getState();
  
  // Set the book as now playing
  store.setNowPlaying(nowPlaying);
  
  // Determine where to start
  const chapterIndex = resumePosition?.chapterIndex ?? 0;
  const position = resumePosition?.position ?? 0;
  const chapter = nowPlaying.chapters[chapterIndex];
  
  if (!chapter) {
    console.error('✗ Chapter not found:', chapterIndex);
    return;
  }
  
  // Optionally download chapter first for offline playback
  if (options?.downloadFirst && !isChapterDownloaded(nowPlaying.bookTitle, chapterIndex)) {
    console.log(`📥 Pre-downloading chapter ${chapterIndex} before playback...`);
    const { downloadChapter } = await import('./audioStorageService');
    try {
      await downloadChapter(nowPlaying.bookTitle, chapterIndex);
      console.log(`✓ Chapter ${chapterIndex} downloaded to local storage`);
    } catch (err) {
      console.warn(`⚠ Could not download chapter, will stream instead:`, err);
    }
  }
  
  // Start playing
  await playChapter(nowPlaying.bookTitle, chapter, chapterIndex, position);
}

/**
 * Play audiobook from local device storage
 * This is the primary playback method for downloaded audiobooks
 * 
 * @param bookTitle - Sanitized book title (same as folder name in storage)
 * @param chapterIndex - Chapter to start playing from
 */
export async function playFromLocalStorage(
  bookTitle: string,
  chapterIndex: number = 0
): Promise<void> {
  const player = createPlayer();
  const store = usePlayerStore.getState();
  
  // Get local chapter file URI
  const localUri = getLocalChapterUri(bookTitle, chapterIndex);
  
  if (!localUri) {
    console.error(`✗ Chapter ${chapterIndex} not found in local storage for "${bookTitle}"`);
    throw new Error(`Chapter ${chapterIndex} is not available on your device. Please download the audiobook first.`);
  }
  
  console.log(`🎵 Playing from LOCAL storage: ${bookTitle} chapter ${chapterIndex}`);
  console.log(`   URI: ${localUri}`);
  
  try {
    // Reset progressive mode
    isProgressiveMode = false;
    
    // Set buffering state
    store.setIsBuffering(true);
    
    // Replace the current source with local file
    await player.replace({ uri: localUri });
    
    // Start playback
    await player.play();
    
    // Update store state
    store.setCurrentChapter(chapterIndex);
    store.setIsPlaying(true);
    store.setIsBuffering(false);
    
    // Enable lock screen controls
    try {
      if (typeof player.setActiveForLockScreen === 'function') {
        player.setActiveForLockScreen(true, {
          title: `Chapter ${chapterIndex + 1}`,
          artist: store.nowPlaying?.author || 'Unknown Author',
          albumTitle: store.nowPlaying?.bookTitle || bookTitle,
        });
      }
    } catch (lockScreenError) {
      console.warn('⚠ Could not enable lock screen controls:', lockScreenError);
    }
    
    // Start position tracking (for progress sync)
    startPositionTracking(bookTitle, chapterIndex);
    
    // Set up handler for when chapter ends (to auto-play next chapter)
    setupLocalChapterEndHandler(bookTitle, chapterIndex);
    
    console.log(`✓ Playing from local storage: chapter ${chapterIndex}`);
  } catch (error) {
    console.error('✗ Error playing from local storage:', error);
    store.setIsBuffering(false);
    throw error;
  }
}

/**
 * Set up handler for when local chapter playback ends
 */
function setupLocalChapterEndHandler(bookTitle: string, currentChapterIndex: number): void {
  const player = getPlayer();
  if (!player) return;
  
  const handleChapterEnd = async (status: { didJustFinish?: boolean }) => {
    if (!status.didJustFinish) return;
    
    const store = usePlayerStore.getState();
    const { nowPlaying } = store;
    
    console.log(`📚 Chapter ${currentChapterIndex} finished`);
    
    // Check if there's a next chapter available locally
    const nextChapterIndex = currentChapterIndex + 1;
    const nextLocalUri = getLocalChapterUri(bookTitle, nextChapterIndex);
    
    if (nextLocalUri) {
      console.log(`📚 Auto-playing next chapter ${nextChapterIndex}`);
      await playFromLocalStorage(bookTitle, nextChapterIndex);
    } else if (nowPlaying && nextChapterIndex < nowPlaying.chapters.length) {
      // Next chapter exists in book but not downloaded
      console.log(`📚 Next chapter ${nextChapterIndex} not downloaded locally`);
      store.setIsPlaying(false);
    } else {
      // Book complete
      console.log(`📚 Audiobook playback complete`);
      store.setIsPlaying(false);
    }
  };
  
  player.addListener('playbackStatusUpdate', handleChapterEnd);
}

/**
 * Stop playback and clear now playing
 */
export async function stopPlayback(): Promise<void> {
  await cleanupPlayer();
  usePlayerStore.getState().setNowPlaying(null);
}

// ============================================================================
// POSITION TRACKING
// ============================================================================

/**
 * Start tracking position and sync to backend
 */
function startPositionTracking(bookTitle: string, chapterIndex: number): void {
  // Clear any existing interval
  if (positionUpdateInterval) {
    clearInterval(positionUpdateInterval);
  }
  
  // Update position every second
  positionUpdateInterval = setInterval(() => {
    const player = getPlayer();
    if (!player) return;
    
    const store = usePlayerStore.getState();
    
    // Get current position from player
    const currentTime = player.currentTime;
    const duration = player.duration;
    
    // Update store
    if (currentTime !== undefined) {
      store.setPosition(currentTime);
    }
    if (duration !== undefined && duration > 0) {
      store.setDuration(duration);
    }
    
    // Check if playback is still active
    if (!player.playing && store.isPlaying) {
      store.setIsPlaying(false);
    }
  }, 1000);
  
  // Save position to backend every 10 seconds
  const saveInterval = setInterval(async () => {
    const store = usePlayerStore.getState();
    if (store.nowPlaying && store.position > 0) {
      try {
        await apiUpdatePlaybackPosition(bookTitle, chapterIndex, store.position);
      } catch (error) {
        // Silently fail - position will be saved next time
        console.log('Could not save playback position');
      }
    }
  }, 10000);
  
  // Store save interval for cleanup
  (positionUpdateInterval as any).saveInterval = saveInterval;
}

// ============================================================================
// REACT HOOKS
// ============================================================================

/**
 * Hook to use the audio player with automatic state updates
 * Use this in components that need real-time player status
 */
export function useAudioService() {
  const player = audioPlayer;
  
  return {
    player,
    isInitialized,
    // Control methods
    play,
    pause,
    togglePlayPause,
    seekTo,
    skipForward,
    skipBackward,
    setPlaybackRate,
    nextChapter,
    previousChapter,
    startBook,
    stopPlayback,
    playChapter,
    playFromLocalStorage,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializeAudioService,
  createPlayer,
  getPlayer,
  cleanupPlayer,
  playChapter,
  playFromLocalStorage,
  togglePlayPause,
  pause,
  play,
  seekTo,
  skipForward,
  skipBackward,
  setPlaybackRate,
  nextChapter,
  previousChapter,
  startBook,
  stopPlayback,
  useAudioService,
};
