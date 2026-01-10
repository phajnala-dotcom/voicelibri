/**
 * VoiceLibri - Neumorphism Explore Screen
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Browse public domain audiobooks
 */

import { useState } from 'react';
import { Search, Star, Clock, Download, Play } from 'lucide-react';
import { Card } from '../components/ui';

interface ClassicBook {
  id: string;
  title: string;
  author: string;
  duration: string;
  rating: number;
  category: string;
}

const MOCK_CLASSICS: ClassicBook[] = [
  { id: '1', title: 'Pride and Prejudice', author: 'Jane Austen', duration: '11h 35m', rating: 4.8, category: 'Romance' },
  { id: '2', title: 'Sherlock Holmes', author: 'Arthur Conan Doyle', duration: '9h 20m', rating: 4.9, category: 'Mystery' },
  { id: '3', title: 'Dracula', author: 'Bram Stoker', duration: '15h 45m', rating: 4.7, category: 'Horror' },
  { id: '4', title: 'Frankenstein', author: 'Mary Shelley', duration: '8h 10m', rating: 4.6, category: 'Horror' },
  { id: '5', title: 'Moby Dick', author: 'Herman Melville', duration: '21h 30m', rating: 4.5, category: 'Adventure' },
  { id: '6', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', duration: '4h 49m', rating: 4.7, category: 'Classic' },
];

const CATEGORIES = ['All', 'Romance', 'Mystery', 'Horror', 'Adventure', 'Classic'];

/**
 * Neumorphism Explore Screen
 */
export function ClassicsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredBooks = MOCK_CLASSICS.filter((book) => {
    const matchesSearch = book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || book.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-[var(--neu-body-bg)]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[var(--neu-body-bg)] shadow-[var(--neu-shadow-light)]">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold text-[var(--neu-dark)]">Explore</h1>
          <p className="text-[var(--neu-gray-700)] text-sm mt-1">
            Free public domain audiobooks
          </p>
        </div>

        {/* Search - neumorphism input */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--neu-gray-600)]" />
            <input
              type="text"
              placeholder="Search books..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="neu-input pl-10"
            />
          </div>
        </div>

        {/* Categories - neumorphism pills */}
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`
                px-3 py-1.5 rounded-[var(--neu-radius-pill)] 
                text-xs font-semibold whitespace-nowrap 
                transition-all duration-200
                ${selectedCategory === category
                  ? 'neu-btn-secondary text-white'
                  : 'neu-raised text-[var(--neu-gray-700)] hover:text-[var(--neu-dark)]'
                }
              `}
            >
              {category}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="px-4 py-4 space-y-3">
        {filteredBooks.map((book) => (
          <Card key={book.id} className="p-3 flex gap-3">
            {/* Cover - inset frame */}
            <div className="w-20 h-28 neu-pressed rounded-[var(--neu-radius)] flex items-center justify-center flex-shrink-0">
              <span className="text-3xl">📖</span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
              <div>
                <h3 className="text-[var(--neu-dark)] font-semibold truncate">{book.title}</h3>
                <p className="text-[var(--neu-gray-700)] text-sm truncate">{book.author}</p>
              </div>
              
              <div className="flex items-center gap-3 text-xs text-[var(--neu-gray-600)]">
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-[var(--neu-warning)]" fill="currentColor" />
                  {book.rating}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {book.duration}
                </span>
              </div>
              
              <div className="flex items-center gap-2 mt-1">
                <button className="
                  flex-1 py-1.5 
                  neu-btn-secondary 
                  rounded-[var(--neu-radius)] 
                  text-xs font-semibold 
                  flex items-center justify-center gap-1
                ">
                  <Play className="w-3 h-3" />
                  Stream
                </button>
                <button 
                  className="
                    py-1.5 px-3 
                    neu-raised 
                    rounded-[var(--neu-radius)] 
                    text-[var(--neu-gray-700)] 
                    text-xs font-semibold 
                    flex items-center justify-center gap-1
                    hover:text-[var(--neu-dark)]
                    active:shadow-[var(--neu-shadow-inset)]
                  "
                  aria-label="Download"
                >
                  <Download className="w-3 h-3" />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
