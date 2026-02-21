/**
 * VoiceLibri - Neumorphism Mini Player
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Fixed bottom bar for audio playback
 */

import { Play, Pause, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { LinearProgress } from '../ui/ProgressBar';
import { formatDuration } from '../../utils/formatters';

interface MiniPlayerProps {
  onExpand: () => void;
}

/**
 * Neumorphism Mini Player
 * Compact player bar above navigation
 */
export function MiniPlayer({ onExpand }: MiniPlayerProps) {
  const {
    currentBook,
    currentChapter,
    playbackState,
    currentTime,
    playPause,
    skipBackward,
    previousChapter,
    nextChapter,
    isMiniPlayerVisible,
    playbackMode,
    currentSubChunk,
    ambientVolume,
    ambientEnabled,
    setAmbientVolume,
    toggleAmbient,
  } = usePlayerStore();

  const isPlaying = playbackState === 'playing';
  const progress = currentBook ? currentTime / currentBook.totalDuration : 0;
  
  // Determine if we can navigate chapters
  const currentChapterIndex = currentChapter?.index ?? 0;
  const canGoPrevious = currentChapterIndex > 0;
  const canGoNext = currentBook ? currentChapterIndex < currentBook.chapters.length - 1 : false;
  
  // Show different info based on playback mode
  const getPlaybackInfo = () => {
    if (playbackMode === 'progressive' && currentSubChunk) {
      return `Chapter ${currentSubChunk.chapterIndex + 1}, Part ${currentSubChunk.subChunkIndex + 1}`;
    }
    if (currentChapter) {
      return `${currentChapter.title} • ${formatDuration(currentTime)}`;
    }
    return currentBook?.author ? `${currentBook.author} • ${formatDuration(currentTime)}` : formatDuration(currentTime);
  };

  if (!isMiniPlayerVisible || !currentBook) {
    return null;
  }

  return (
    <div
      className="
        fixed left-0 right-0 z-40
        bg-[var(--neu-body-bg)]
        border-t border-[var(--neu-gray-400)]
      "
      style={{ bottom: 'calc(var(--nav-height) + var(--safe-area-bottom))' }}
    >
      {/* Progress bar at top */}
      <LinearProgress value={progress} />
      
      {/* Mini player content with card styling */}
      <div className="p-4">
        <div 
          className="neu-card px-4 py-3 flex items-center gap-3 cursor-pointer hover:shadow-[var(--neu-shadow-soft)] transition-all duration-200"
          onClick={onExpand}
        >
        {/* Artwork - inset frame */}
        <div className="w-12 h-12 neu-pressed rounded-[var(--neu-radius)] overflow-hidden flex-shrink-0">
          <img
            src={currentBook.coverUrl || '/default-audiobook-cover.png'}
            alt={currentBook.title}
            className="w-full h-full object-cover"
          />
        </div>
        
        {/* Title & Time */}
        <div className="flex-1 min-w-0">
          <h4 className="text-[var(--neu-dark)] font-semibold text-sm truncate">
            {currentBook.title}
          </h4>
          <p className="text-[var(--neu-gray-700)] text-xs truncate">
            {getPlaybackInfo()}
          </p>
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-1">
          {/* Previous chapter button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              previousChapter();
            }}
            disabled={!canGoPrevious}
            className={`
              neu-btn-icon-sm neu-raised
              flex items-center justify-center
              transition-all duration-200
              ${canGoPrevious 
                ? 'text-[var(--neu-gray-700)] hover:text-[var(--neu-secondary)] active:shadow-[var(--neu-shadow-inset)]' 
                : 'text-[var(--neu-gray-400)] cursor-not-allowed'
              }
            `}
            aria-label="Previous chapter"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          
          {/* Rewind button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              skipBackward();
            }}
            className="
              neu-btn-icon-sm neu-raised
              flex items-center justify-center
              text-[var(--neu-gray-700)]
              hover:text-[var(--neu-secondary)]
              active:shadow-[var(--neu-shadow-inset)]
              transition-all duration-200
            "
            aria-label="Rewind 15 seconds"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          
          {/* Play/Pause button - primary action */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              playPause();
            }}
            className="
              neu-btn-icon neu-btn-secondary
              flex items-center justify-center
              text-white
            "
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" fill="currentColor" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
            )}
          </button>
          
          {/* Next chapter button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              nextChapter();
            }}
            disabled={!canGoNext}
            className={`
              neu-btn-icon-sm neu-raised
              flex items-center justify-center
              transition-all duration-200
              ${canGoNext 
                ? 'text-[var(--neu-gray-700)] hover:text-[var(--neu-secondary)] active:shadow-[var(--neu-shadow-inset)]' 
                : 'text-[var(--neu-gray-400)] cursor-not-allowed'
              }
            `}
            aria-label="Next chapter"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
        </div>
        
        {/* Ambient controls row */}
        <div className="px-4 pb-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={toggleAmbient}
            className={`
              p-1 rounded transition-colors
              ${ambientEnabled
                ? 'text-[var(--neu-secondary)]'
                : 'text-[var(--neu-gray-400)]'
              }
            `}
            aria-label={ambientEnabled ? 'Disable ambient' : 'Enable ambient'}
          >
            {ambientEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
          <span className="text-[var(--neu-gray-600)] text-[10px] min-w-[40px]">Ambient</span>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(ambientVolume * 100)}
            onChange={(e) => setAmbientVolume(parseInt(e.target.value) / 100)}
            className="flex-1 h-1 accent-[var(--neu-secondary)] cursor-pointer"
            disabled={!ambientEnabled}
            title="Ambient volume"
            aria-label="Ambient volume"
          />
          <span className="text-[var(--neu-gray-600)] text-[10px] min-w-[24px] text-right">
            {Math.round(ambientVolume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
