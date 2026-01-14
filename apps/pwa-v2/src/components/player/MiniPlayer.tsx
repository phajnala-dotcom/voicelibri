/**
 * VoiceLibri - Neumorphism Mini Player
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Fixed bottom bar for audio playback
 */

import { Play, Pause, RotateCcw } from 'lucide-react';
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
    playbackState,
    currentTime,
    playPause,
    skipBackward,
    isMiniPlayerVisible,
    playbackMode,
    currentSubChunk,
  } = usePlayerStore();

  const isPlaying = playbackState === 'playing';
  const progress = currentBook ? currentTime / currentBook.totalDuration : 0;
  
  // Show different info based on playback mode
  const getPlaybackInfo = () => {
    if (playbackMode === 'progressive' && currentSubChunk) {
      return `Chapter ${currentSubChunk.chapterIndex + 1}, Part ${currentSubChunk.subChunkIndex + 1}`;
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
        <div className="flex items-center gap-2">
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
        </div>
        </div>
      </div>
    </div>
  );
}
