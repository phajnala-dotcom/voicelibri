/**
 * VoiceLibri - Neumorphism Book Card
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Profile card widget for audiobook items
 */

import { Play } from 'lucide-react';
import type { Book } from '../../types';
import { formatDurationLong } from '../../utils/formatters';

interface BookCardProps {
  book: Book;
  onPress: () => void;
}

/**
 * Neumorphism Book Card
 * Based on neumorphism profile/widget cards
 */
export function BookCard({ book, onPress }: BookCardProps) {
  const progressPercent = book.progress 
    ? Math.round((book.progress.position / book.totalDuration) * 100)
    : 0;

  return (
    <button
      onClick={onPress}
      className="
        neu-card p-4 w-full text-left
        transition-all duration-200
        hover:shadow-[var(--neu-shadow-soft)]
        active:shadow-[var(--neu-shadow-inset)]
        group
      "
    >
      {/* Cover Image - inset frame */}
      <div className="neu-pressed rounded-[var(--neu-radius)] overflow-hidden aspect-[2/3] relative mb-4">
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[var(--neu-secondary)]/20 to-[var(--neu-info)]/20 flex items-center justify-center">
            <span className="text-5xl">📚</span>
          </div>
        )}
        
        {/* Hover play overlay */}
        <div className="
          absolute inset-0 
          bg-[var(--neu-dark)]/60 
          flex items-center justify-center
          opacity-0 group-hover:opacity-100
          transition-opacity duration-200
        ">
          <div className="
            w-12 h-12 
            neu-raised 
            rounded-full 
            flex items-center justify-center
            text-[var(--neu-secondary)]
          ">
            <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
          </div>
        </div>
        
        {/* Finished badge */}
        {book.isFinished && (
          <div className="
            absolute top-2 right-2 
            neu-badge neu-badge-pill
            bg-[var(--neu-success)] text-white
            text-[10px] px-2 py-1
          ">
            ✓ Done
          </div>
        )}
      </div>
      
      {/* Progress bar */}
      {progressPercent > 0 && !book.isFinished && (
        <div className="neu-progress mb-3">
          <div
            className="neu-progress-bar"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
      
      {/* Title & Author */}
      <h3 className="text-[var(--neu-dark)] font-semibold text-sm line-clamp-2 mb-1">
        {book.title}
      </h3>
      <p className="text-[var(--neu-gray-700)] text-xs line-clamp-1">
        {book.author}
      </p>
      
      {/* Duration & progress */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-[var(--neu-gray-600)]">
          {formatDurationLong(book.totalDuration)}
        </span>
        {progressPercent > 0 && !book.isFinished && (
          <span className="neu-badge text-[var(--neu-secondary)] text-[10px]">
            {progressPercent}%
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * Empty Library State
 * Neumorphism styled empty state
 */
interface EmptyLibraryProps {
  onLoadDemo?: () => void;
}

export function EmptyLibrary({ onLoadDemo }: EmptyLibraryProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      {/* Icon in inset circle */}
      <div className="w-24 h-24 neu-pressed rounded-full flex items-center justify-center mb-6">
        <span className="text-4xl">📚</span>
      </div>
      
      <h2 className="text-xl font-bold text-[var(--neu-dark)] mb-2">
        Your Library is Empty
      </h2>
      <p className="text-[var(--neu-gray-700)] mb-6 max-w-sm">
        Generate your first audiobook or explore our collection of free public domain books to get started.
      </p>
      
      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 justify-center">
        <button className="neu-btn neu-btn-secondary">
          Generate Book
        </button>
        <button className="neu-btn neu-btn-primary">
          Browse Library
        </button>
        {onLoadDemo && (
          <button 
            onClick={onLoadDemo}
            className="neu-btn neu-btn-warning"
          >
            🎧 Load Demo
          </button>
        )}
      </div>
    </div>
  );
}
