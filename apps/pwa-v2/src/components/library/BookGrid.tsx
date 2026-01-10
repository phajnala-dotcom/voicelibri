/**
 * VoiceLibri - Neumorphism Book Grid
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * 2-column responsive grid for library display
 */

import { BookCard, EmptyLibrary } from './BookCard';
import type { Book } from '../../types';

interface BookGridProps {
  books: Book[];
  onBookPress: (book: Book) => void;
  onLoadDemo?: () => void;
  isLoading?: boolean;
}

/**
 * Neumorphism Book Grid
 * Grid layout with neumorphism cards
 */
export function BookGrid({ books, onBookPress, onLoadDemo, isLoading }: BookGridProps) {
  if (isLoading) {
    return <BookGridSkeleton />;
  }

  if (books.length === 0) {
    return <EmptyLibrary onLoadDemo={onLoadDemo} />;
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {books.map((book) => (
        <BookCard
          key={book.id}
          book={book}
          onPress={() => onBookPress(book)}
        />
      ))}
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
