/**
 * VoiceLibri - Neumorphism Book Grid
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * List layout for library display with BookPlayer-style click zones
 */

import { BookCard, EmptyLibrary } from './BookCard';
import type { Book, Chapter } from '../../types';

interface BookGridProps {
  books: Book[];
  onCoverPress: (book: Book) => void;      // Opens FullPlayer
  onChapterPress: (book: Book, chapter: Chapter) => void;  // Opens FullPlayer at specific chapter
  onDeleteBook?: (bookId: string) => void;  // Delete audiobook
  onLoadDemo?: () => void;
  isLoading?: boolean;
  generatingBooks?: Map<string, number>;  // bookId -> progress percentage
}

/**
 * Neumorphism Book List
 * List layout with neumorphism cards and expandable chapters
 */
export function BookGrid({ books, onCoverPress, onChapterPress, onDeleteBook, onLoadDemo, isLoading, generatingBooks }: BookGridProps) {
  if (isLoading) {
    return <BookGridSkeleton />;
  }

  if (books.length === 0) {
    return <EmptyLibrary onLoadDemo={onLoadDemo} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {books.map((book) => {
        const isGenerating = generatingBooks?.has(book.id);
        const generationProgress = generatingBooks?.get(book.id);
        
        return (
          <BookCard
            key={book.id}
            book={book}
            onCoverPress={() => onCoverPress(book)}
            onChapterPress={(chapter) => onChapterPress(book, chapter)}
            onDelete={onDeleteBook}
            isGenerating={isGenerating}
            generationProgress={generationProgress}
          />
        );
      })}
    </div>
  );
}

/**
 * Skeleton Loading State
 * Neumorphism styled loading placeholders
 */
function BookGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="neu-card p-4 animate-pulse"
        >
          {/* Cover skeleton */}
          <div className="neu-pressed rounded-[var(--neu-radius)] aspect-[2/3] mb-4" />
          
          {/* Title skeleton */}
          <div className="h-4 neu-pressed rounded w-3/4 mb-2" />
          
          {/* Author skeleton */}
          <div className="h-3 neu-pressed rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}
