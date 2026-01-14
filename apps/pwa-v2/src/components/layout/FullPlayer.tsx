/**
 * VoiceLibri - Neumorphism Full Player
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Expanded audio player view
 */

import { 
  ChevronDown, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward,
  RotateCcw,
  RotateCw,
  Moon,
  ListMusic,
  Volume2,
  Gauge
} from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { formatDuration, formatDurationLong } from '../../utils/formatters';
import { useState, useEffect } from 'react';

interface FullPlayerProps {
  onCollapse: () => void;
}

/**
 * Neumorphism Full Player
 * Complete audio player with all controls
 */
export function FullPlayer({ onCollapse }: FullPlayerProps) {
  const {
    currentBook,
    currentChapter,
    playbackState,
    currentTime,
    playbackSpeed,
    playPause,
    skipForward,
    skipBackward,
    seekTo,
    setPlaybackSpeed,
    jumpToChapter,
  } = usePlayerStore();

  const [showChapters, setShowChapters] = useState(false);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Slide-up animation on mount
  useEffect(() => {
    // Trigger animation after mount
    requestAnimationFrame(() => {
      setIsVisible(true);
    });
  }, []);

  // Handle collapse with slide-down animation
  const handleCollapse = () => {
    setIsVisible(false);
    // Wait for animation to complete before calling onCollapse
    setTimeout(onCollapse, 300);
  };

  const isPlaying = playbackState === 'playing';
  const progress = currentBook ? currentTime / currentBook.totalDuration : 0;
  const remainingTime = currentBook ? currentBook.totalDuration - currentTime : 0;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!currentBook) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seekTo(percent * currentBook.totalDuration);
  };

  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  return (
    <div 
      className={`
        fixed inset-0 z-50 bg-[var(--neu-body-bg)] overflow-y-auto
        transition-transform duration-300 ease-out
        ${isVisible ? 'translate-y-0' : 'translate-y-full'}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <button
          onClick={handleCollapse}
          className="
            neu-btn-icon-sm neu-raised
            flex items-center justify-center
            text-[var(--neu-gray-700)]
            hover:text-[var(--neu-dark)]
            active:shadow-[var(--neu-shadow-inset)]
          "
          aria-label="Close player"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
        
        <span className="text-xs text-[var(--neu-gray-600)] uppercase tracking-wider font-semibold">
          Now Playing
        </span>
        
        <button
          onClick={() => setShowChapters(true)}
          className="
            neu-btn-icon-sm neu-raised
            flex items-center justify-center
            text-[var(--neu-gray-700)]
            hover:text-[var(--neu-dark)]
            active:shadow-[var(--neu-shadow-inset)]
          "
          aria-label="Show chapters"
        >
          <ListMusic className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-col items-center px-8 pt-4 pb-8">
        {/* Album Art - neumorphism inset frame */}
        <div 
          className={`
            w-64 h-64 
            neu-pressed 
            rounded-[var(--neu-radius-lg)] 
            overflow-hidden
            transition-transform duration-300
            ${isPlaying ? 'scale-100' : 'scale-95'}
          `.replace(/\s+/g, ' ').trim()}
        >
          {currentBook?.coverUrl ? (
            <img
              src={currentBook.coverUrl}
              alt={currentBook.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src="/default-audiobook-cover.png"
              alt={currentBook?.title ?? 'Audiobook'}
              className="w-full h-full object-contain bg-gradient-to-br from-[var(--neu-secondary)]/10 to-[var(--neu-info)]/10"
            />
          )}
        </div>

        {/* Title & Author */}
        <div className="mt-8 text-center w-full">
          <h2 className="text-xl font-bold text-[var(--neu-dark)] truncate">
            {currentBook?.title ?? 'No Book Selected'}
          </h2>
          <p className="text-[var(--neu-gray-700)] mt-1 truncate">
            {currentBook?.author ?? 'Select a book to play'}
          </p>
          {currentChapter && (
            <p className="text-[var(--neu-secondary)] text-sm mt-2 truncate font-medium">
              {currentChapter.title}
            </p>
          )}
        </div>

        {/* Progress - inset track */}
        <div className="w-full mt-8">
          <div 
            className="neu-progress neu-progress-lg cursor-pointer"
            onClick={handleSeek}
          >
            <div
              className="neu-progress-bar"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-[var(--neu-gray-600)] font-medium">
            <span>{formatDuration(currentTime)}</span>
            <span>-{formatDuration(remainingTime)}</span>
          </div>
        </div>

        {/* Main Controls - neumorphism buttons */}
        <div className="flex items-center justify-center gap-4 mt-8 w-full">
          {/* Skip backward */}
          <button
            onClick={() => jumpToChapter('previous')}
            className="
              neu-btn-icon neu-raised
              flex items-center justify-center
              text-[var(--neu-gray-700)]
              hover:text-[var(--neu-dark)]
              active:shadow-[var(--neu-shadow-inset)]
            "
            aria-label="Previous chapter"
          >
            <SkipBack className="w-5 h-5" fill="currentColor" />
          </button>

          {/* Rewind 15s */}
          <button
            onClick={() => skipBackward()}
            className="
              neu-btn-icon-lg neu-raised
              flex items-center justify-center
              text-[var(--neu-dark)]
              hover:text-[var(--neu-secondary)]
              active:shadow-[var(--neu-shadow-inset)]
            "
            aria-label="Rewind 15 seconds"
          >
            <div className="relative">
              <RotateCcw className="w-6 h-6" />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
                15
              </span>
            </div>
          </button>

          {/* Play/Pause - primary button */}
          <button
            onClick={playPause}
            className="
              w-20 h-20 
              neu-btn-secondary
              rounded-full
              flex items-center justify-center
              shadow-[var(--neu-shadow-soft)]
              active:shadow-[var(--neu-shadow-inset)]
              transition-all duration-200
            "
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 text-white" fill="currentColor" />
            ) : (
              <Play className="w-8 h-8 text-white ml-1" fill="currentColor" />
            )}
          </button>

          {/* Forward 15s */}
          <button
            onClick={() => skipForward()}
            className="
              neu-btn-icon-lg neu-raised
              flex items-center justify-center
              text-[var(--neu-dark)]
              hover:text-[var(--neu-secondary)]
              active:shadow-[var(--neu-shadow-inset)]
            "
            aria-label="Forward 15 seconds"
          >
            <div className="relative">
              <RotateCw className="w-6 h-6" />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
                15
              </span>
            </div>
          </button>

          {/* Skip forward */}
          <button
            onClick={() => jumpToChapter('next')}
            className="
              neu-btn-icon neu-raised
              flex items-center justify-center
              text-[var(--neu-gray-700)]
              hover:text-[var(--neu-dark)]
              active:shadow-[var(--neu-shadow-inset)]
            "
            aria-label="Next chapter"
          >
            <SkipForward className="w-5 h-5" fill="currentColor" />
          </button>
        </div>

        {/* Secondary Controls */}
        <div className="flex items-center justify-around w-full mt-10 px-4">
          {/* Sleep Timer */}
          <button className="flex flex-col items-center gap-1 text-[var(--neu-gray-600)] hover:text-[var(--neu-dark)] transition-colors">
            <Moon className="w-5 h-5" />
            <span className="text-[10px] font-medium">Sleep</span>
          </button>

          {/* Playback Speed */}
          <button
            onClick={() => setShowSpeedPicker(!showSpeedPicker)}
            className="flex flex-col items-center gap-1 text-[var(--neu-gray-600)] hover:text-[var(--neu-dark)] transition-colors"
          >
            <Gauge className="w-5 h-5" />
            <span className="text-[10px] font-medium">{playbackSpeed}x</span>
          </button>

          {/* Volume */}
          <button className="flex flex-col items-center gap-1 text-[var(--neu-gray-600)] hover:text-[var(--neu-dark)] transition-colors">
            <Volume2 className="w-5 h-5" />
            <span className="text-[10px] font-medium">Volume</span>
          </button>
        </div>

        {/* Speed Picker */}
        {showSpeedPicker && (
          <div className="neu-card p-3 mt-4 flex items-center gap-2">
            {speeds.map((speed) => (
              <button
                key={speed}
                onClick={() => {
                  setPlaybackSpeed(speed);
                  setShowSpeedPicker(false);
                }}
                className={`
                  px-3 py-1.5 rounded-[var(--neu-radius)] text-sm font-medium
                  transition-all duration-200
                  ${playbackSpeed === speed
                    ? 'neu-btn-secondary text-white'
                    : 'neu-raised text-[var(--neu-gray-700)] hover:text-[var(--neu-dark)]'
                  }
                `.replace(/\s+/g, ' ').trim()}
              >
                {speed}x
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chapter List Modal */}
      {showChapters && currentBook && (
        <div
          className="fixed inset-0 bg-black/50 z-60 flex items-end"
          onClick={() => setShowChapters(false)}
        >
          <div
            className="
              w-full max-h-[70vh] 
              bg-[var(--neu-body-bg)] 
              rounded-t-[var(--neu-radius-lg)]
              overflow-y-auto
            "
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[var(--neu-body-bg)] p-4 border-b border-[var(--neu-gray-400)]">
              <h3 className="text-lg font-bold text-[var(--neu-dark)] text-center">Chapters</h3>
            </div>
            <div className="p-2">
              {currentBook.chapters.map((chapter, index) => (
                <button
                  key={chapter.id}
                  onClick={() => {
                    jumpToChapter(index);
                    setShowChapters(false);
                  }}
                  className={`
                    w-full p-4 flex items-center justify-between 
                    rounded-[var(--neu-radius)] 
                    transition-all duration-200
                    ${currentChapter?.id === chapter.id
                      ? 'neu-pressed text-[var(--neu-secondary)]'
                      : 'text-[var(--neu-body-color)] hover:bg-[var(--neu-gray-300)]'
                    }
                  `.replace(/\s+/g, ' ').trim()}
                >
                  <div className="flex-1 text-left">
                    <span className="font-medium">{chapter.title}</span>
                    <span className="text-xs text-[var(--neu-gray-600)] ml-2">
                      {formatDurationLong(chapter.duration)}
                    </span>
                  </div>
                  {currentChapter?.id === chapter.id && (
                    <div className="w-2 h-2 bg-[var(--neu-secondary)] rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
