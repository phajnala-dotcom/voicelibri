import React, { useState, useEffect, useRef } from 'react';

interface Book {
  filename: string;
  format: 'epub' | 'txt' | 'pdf';
  size: number;
  sizeFormatted: string;
  isActive: boolean;
}

interface BookSelectorProps {
  onBookSelected: (filename: string) => void;
  currentBook: string;
}

const API_BASE_URL = 'http://localhost:3001';

export const BookSelector: React.FC<BookSelectorProps> = ({ onBookSelected, currentBook }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const enableDramatization = true; // Always enabled
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load available books
  useEffect(() => {
    fetchBooks();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const fetchBooks = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/books`);
      const data = await response.json();
      setBooks(data.books || []);
    } catch (error) {
      console.error('Failed to fetch books:', error);
    }
  };

  const handleSelectBook = async (filename: string) => {
    if (filename === currentBook) {
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      // Get narrator voice from localStorage (user preference)
      const narratorVoice = localStorage.getItem('preferredNarratorVoice') || 'Achird';
      
      // First, select the book to check if library version exists
      const response = await fetch(`${API_BASE_URL}/api/book/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, dramatize: enableDramatization, narratorVoice }),
      });

      if (!response.ok) {
        throw new Error('Failed to select book');
      }

      const data = await response.json();
      console.log('✓ Book selected:', data.book);
      console.log('📚 Library version exists:', data.hasLibraryVersion);
      
      // Show confirmation dialog only if library version doesn't exist
      if (!data.hasLibraryVersion) {
        setLoading(false);
        const confirmed = window.confirm(
          `📚 Načítať knihu?\n\n` +
          `Kniha: ${filename}\n\n` +
          `Táto kniha bude načítaná do prehrávača.\n` +
          `Audio sa bude generovať na požiadanie pri prehrávaní.\n\n` +
          `Chcete pokračovať?`
        );

        if (!confirmed) {
          setIsOpen(false);
          return;
        }
        setLoading(true);
      } else {
        console.log('✓ Library version exists, loading without confirmation');
      }
      
      onBookSelected(filename);
      setIsOpen(false);
      
      // Refresh book list
      await fetchBooks();
    } catch (error) {
      console.error('Error selecting book:', error);
      alert('Nepodarilo sa načítať knihu. Skúste znova.');
    } finally {
      setLoading(false);
    }
  };

  const getFormatIcon = (format: string) => {
    switch (format) {
      case 'epub': return '📘';
      case 'pdf': return '📕';
      case 'txt': return '📄';
      default: return '📖';
    }
  };

  const getFormatColor = (format: string) => {
    switch (format) {
      case 'epub': return '#4a90e2';
      case 'pdf': return '#e74c3c';
      case 'txt': return '#95a5a6';
      default: return '#7f8c8d';
    }
  };

  const activeBook = books.find(b => b.isActive);
  const displayName = activeBook ? activeBook.filename : currentBook || 'Vybrať knihu...';

  return (
    <div style={styles.container} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={styles.selectorButton}
        disabled={loading}
      >
        <span style={styles.buttonContent}>
          <span style={styles.buttonIcon}>📚</span>
          <span style={styles.buttonText}>{displayName}</span>
          <span style={{...styles.arrow, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)'}}>
            ▼
          </span>
        </span>
      </button>

      {isOpen && (
        <div style={styles.dropdown}>
          <div style={styles.dropdownHeader}>
            Dostupné knihy ({books.length})
          </div>
          <div style={styles.bookList}>
            {books.length === 0 ? (
              <div style={styles.emptyState}>
                Žiadne knihy v priečinku assets/
              </div>
            ) : (
              books.map((book) => (
                <button
                  key={book.filename}
                  onClick={() => handleSelectBook(book.filename)}
                  style={{
                    ...styles.bookItem,
                    ...(book.isActive ? styles.bookItemActive : {}),
                  }}
                  disabled={loading}
                >
                  <div style={styles.bookItemContent}>
                    <span style={styles.bookIcon}>{getFormatIcon(book.format)}</span>
                    <div style={styles.bookItemDetails}>
                      <div style={styles.bookFilename}>{book.filename}</div>
                      <div style={styles.bookMeta}>
                        <span style={{
                          ...styles.formatBadge,
                          backgroundColor: getFormatColor(book.format),
                        }}>
                          {book.format.toUpperCase()}
                        </span>
                        <span style={styles.bookSize}>{book.sizeFormatted}</span>
                      </div>
                    </div>
                    {book.isActive && (
                      <span style={styles.activeIndicator}>✓</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {loading && (
        <div style={styles.loadingOverlay}>
          <div style={styles.spinner}></div>
          <div style={styles.loadingText}>Načítavam knihu...</div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    maxWidth: '500px',
    margin: '0 auto 24px',
    zIndex: 1000,
  },

  selectorButton: {
    width: '100%',
    padding: '12px 16px',
    backgroundColor: '#ffffff',
    border: '2px solid #e0e0e0',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '500',
    color: '#333',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
  },

  buttonContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },

  buttonIcon: {
    fontSize: '20px',
  },

  buttonText: {
    flex: 1,
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  arrow: {
    fontSize: '12px',
    color: '#666',
    transition: 'transform 0.2s ease',
  },

  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    border: '2px solid #e0e0e0',
    borderRadius: '12px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
    maxHeight: '400px',
    overflow: 'hidden',
    animation: 'slideDown 0.2s ease',
  },

  dropdownHeader: {
    padding: '12px 16px',
    backgroundColor: '#f8f9fa',
    borderBottom: '1px solid #e0e0e0',
    fontSize: '13px',
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  bookList: {
    maxHeight: '320px',
    overflowY: 'auto',
    padding: '8px',
  },

  bookItem: {
    width: '100%',
    padding: '12px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginBottom: '4px',
    textAlign: 'left',
  },

  bookItemActive: {
    backgroundColor: '#e8f4f8',
    border: '2px solid #4a90e2',
  },

  bookItemContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },

  bookIcon: {
    fontSize: '24px',
  },

  bookItemDetails: {
    flex: 1,
    minWidth: 0,
  },

  bookFilename: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
    marginBottom: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  bookMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  formatBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: '0.3px',
  },

  bookSize: {
    fontSize: '12px',
    color: '#999',
  },

  activeIndicator: {
    fontSize: '20px',
    color: '#4a90e2',
  },

  emptyState: {
    padding: '32px 16px',
    textAlign: 'center',
    color: '#999',
    fontSize: '14px',
  },

  loadingOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },

  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(255, 255, 255, 0.3)',
    borderTop: '4px solid #ffffff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },

  loadingText: {
    marginTop: '16px',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: '500',
  },
};

// Add CSS animations
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Scrollbar styling */
  .book-list::-webkit-scrollbar {
    width: 8px;
  }

  .book-list::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }

  .book-list::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 4px;
  }

  .book-list::-webkit-scrollbar-thumb:hover {
    background: #999;
  }

  /* Hover effects */
  button[style*="bookItem"]:hover:not(:disabled) {
    background-color: #f5f5f5 !important;
  }

  button[style*="bookItemActive"]:hover:not(:disabled) {
    background-color: #d6ebf5 !important;
  }

  button[style*="selectorButton"]:hover:not(:disabled) {
    border-color: #4a90e2;
    box-shadow: 0 4px 12px rgba(74, 144, 226, 0.15);
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
document.head.appendChild(styleSheet);
