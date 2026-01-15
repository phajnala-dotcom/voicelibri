/**
 * VoiceLibri - Neumorphism Book Card
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Profile card widget for audiobook items
 * 
 * BookPlayer-style display logic:
 * - Click on cover/picture = open FullPlayer
 * - Click elsewhere on row = expand chapters
 * - Click chapter = open FullPlayer at that chapter
 */

import { useState } from 'react';
import { Play, ChevronDown, ChevronUp, Trash2, Loader } from 'lucide-react';
import type { Book, Chapter } from '../../types';
import { formatDurationLong, formatDuration } from '../../utils/formatters';

interface BookCardProps {
  book: Book;
  onCoverPress: () => void;     // Opens FullPlayer
  onChapterPress: (chapter: Chapter) => void;  // Opens FullPlayer at specific chapter
  onDelete?: (bookId: string) => void;  // Delete audiobook
  isGenerating?: boolean;  // Show generation indicator
  generationProgress?: number;  // 0-100 percentage
}

/**
 * Neumorphism Book Card with BookPlayer-style click zones
 * - Cover click = FullPlayer
 * - Row click = expand chapters  
 * - Chapter click = FullPlayer at chapter
 */
export function BookCard({ book, onCoverPress, onChapterPress, onDelete, isGenerating, generationProgress }: BookCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const progressPercent = book.progress
    ? Math.round((book.progress.position / book.totalDuration) * 100)
    : 0;

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't expand if clicking the cover
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(book.id);
    setShowDeleteConfirm(false);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  return (
    <div className="neu-card w-full transition-all duration-200 overflow-hidden">
      {/* Main card content - click to expand chapters */}
      <button
        onClick={handleRowClick}
        className="
          p-4 w-full text-left
          hover:bg-[var(--neu-body-bg)]/50
          active:bg-[var(--neu-gray-200)]/30
          transition-colors duration-200
          group
        "
      >
        <div className="flex gap-3">
          {/* Cover Image - click opens FullPlayer */}
          <div 
            onClick={(e) => {
              e.stopPropagation();
              onCoverPress();
            }}
            className="
              neu-pressed rounded-[var(--neu-radius)] overflow-hidden 
              w-20 h-28 flex-shrink-0 relative
              cursor-pointer
            "
          >
            <img
              src={book.coverUrl || '/vl-logo.png'}
              alt={book.title}
              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            />
            
            {/* Hover play overlay on cover */}
            <div className="
              absolute inset-0 
              bg-[var(--neu-dark)]/60 
              flex items-center justify-center
              opacity-0 hover:opacity-100
              transition-opacity duration-200
            ">
              <div className="
                w-10 h-10 
                neu-raised 
                rounded-full 
                flex items-center justify-center
                text-[var(--neu-secondary)]
              ">
                <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
              </div>
            </div>
            
            {/* Finished badge */}
            {book.isFinished && (
              <div className="
                absolute top-1 right-1 
                bg-[var(--neu-success)] text-white
                text-[8px] px-1.5 py-0.5 rounded-full
              ">
                ✓
              </div>
            )}
            
            {/* Generation indicator */}
            {isGenerating && (
              <div className="
                absolute inset-0 
                bg-[var(--neu-dark)]/70 
                flex flex-col items-center justify-center
              ">
                <Loader className="w-6 h-6 text-[var(--neu-secondary)] animate-spin" />
                {generationProgress !== undefined && (
                  <span className="text-white text-[10px] mt-1 font-medium">
                    {generationProgress}%
                  </span>
                )}
              </div>
            )}
          </div>
          
          {/* Book Info */}
          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-[var(--neu-dark)] font-semibold text-sm line-clamp-2 mb-1">
                  {book.title}
                </h3>
                <p className="text-[var(--neu-gray-700)] text-xs line-clamp-1">
                  {book.author}
                </p>
              </div>
              
              {/* Delete button */}
              {onDelete && !showDeleteConfirm && (
                <button
                  onClick={handleDeleteClick}
                  className="
                    p-1.5 rounded-full
                    text-[var(--neu-gray-500)]
                    hover:text-[var(--neu-danger)]
                    hover:bg-[var(--neu-danger)]/10
                    transition-colors duration-150
                    flex-shrink-0
                  "
                  title="Delete audiobook"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              
              {/* Delete confirmation */}
              {showDeleteConfirm && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={handleConfirmDelete}
                    className="
                      px-2 py-1 text-[10px] rounded
                      bg-[var(--neu-danger)] text-white
                      hover:bg-[var(--neu-danger)]/80
                      transition-colors duration-150
                    "
                  >
                    Delete
                  </button>
                  <button
                    onClick={handleCancelDelete}
                    className="
                      px-2 py-1 text-[10px] rounded
                      bg-[var(--neu-gray-300)] text-[var(--neu-gray-700)]
                      hover:bg-[var(--neu-gray-400)]
                      transition-colors duration-150
                    "
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            
            {/* Generation progress bar */}
            {isGenerating && generationProgress !== undefined && (
              <div className="neu-progress mt-2">
                <div
                  className="neu-progress-bar bg-[var(--neu-warning)]"
                  style={{ width: `${generationProgress}%` }}
                />
              </div>
            )}
            
            {/* Playback progress bar */}
            {!isGenerating && progressPercent > 0 && !book.isFinished && (
              <div className="neu-progress mt-2">
                <div
                  className="neu-progress-bar"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
            
            {/* Duration & progress */}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-[var(--neu-gray-600)]">
                {formatDurationLong(book.totalDuration)}
              </span>
              <div className="flex items-center gap-2">
                {progressPercent > 0 && !book.isFinished && (
                  <span className="text-[var(--neu-secondary)] text-[10px] font-medium">
                    {progressPercent}%
                  </span>
                )}
                {/* Expand indicator */}
                {book.chapters.length > 0 && (
                  <span className="text-[var(--neu-gray-500)]">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </button>
      
      {/* Expanded Chapters List */}
      {isExpanded && book.chapters.length > 0 && (
        <div className="border-t border-[var(--neu-gray-300)]/30 bg-[var(--neu-body-bg)]/30">
          <div className="max-h-60 overflow-y-auto">
            {book.chapters.map((chapter, index) => {
              const isCurrentChapter = book.progress?.chapterIndex === index;
              return (
                <button
                  key={chapter.id}
                  onClick={() => onChapterPress(chapter)}
                  className={`
                    w-full px-4 py-3 text-left flex items-center gap-3
                    border-b border-[var(--neu-gray-300)]/20 last:border-b-0
                    hover:bg-[var(--neu-secondary)]/10
                    active:bg-[var(--neu-secondary)]/20
                    transition-colors duration-150
                    ${isCurrentChapter ? 'bg-[var(--neu-secondary)]/5' : ''}
                  `}
                >
                  {/* Chapter number */}
                  <span className={`
                    w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-xs
                    ${isCurrentChapter 
                      ? 'bg-[var(--neu-secondary)] text-white' 
                      : 'bg-[var(--neu-gray-200)] text-[var(--neu-gray-700)]'
                    }
                  `}>
                    {index + 1}
                  </span>
                  
                  {/* Chapter title */}
                  <span className={`
                    flex-1 text-sm truncate
                    ${isCurrentChapter 
                      ? 'text-[var(--neu-secondary)] font-medium' 
                      : 'text-[var(--neu-dark)]'
                    }
                  `}>
                    {chapter.title}
                  </span>
                  
                  {/* Chapter duration */}
                  <span className="text-xs text-[var(--neu-gray-600)] flex-shrink-0">
                    {formatDuration(chapter.duration)}
                  </span>
                  
                  {/* Currently playing indicator */}
                  {isCurrentChapter && (
                    <Play className="w-3 h-3 text-[var(--neu-secondary)] flex-shrink-0" fill="currentColor" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
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
        Create your first audiobook or explore our collection of free public domain books to get started.
      </p>
      
      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 justify-center">
        <button className="neu-btn neu-btn-secondary">
          Create Book
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
