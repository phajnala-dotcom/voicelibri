import { describe, it, expect } from 'vitest';
import { chunkBookText, getBookInfo } from './bookChunker';

describe('chunkBookText', () => {
  it('should split text into chunks respecting byte limit', () => {
    const text = 'This is a test sentence with multiple words to be chunked properly.';
    const chunks = chunkBookText(text, 30);
    
    // Verify all chunks are within byte limit
    chunks.forEach(chunk => {
      expect(Buffer.byteLength(chunk, 'utf8')).toBeLessThanOrEqual(30);
    });
    
    // Verify we have multiple chunks
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should not split words', () => {
    const text = 'One two three four five six seven eight nine ten';
    const chunks = chunkBookText(text, 20);
    
    // Each chunk should contain complete words only
    chunks.forEach(chunk => {
      const words = chunk.split(/\s+/);
      words.forEach(word => {
        expect(word.length).toBeGreaterThan(0);
      });
    });
  });

  it('should handle text smaller than chunk size', () => {
    const text = 'Short text';
    const chunks = chunkBookText(text, 1000);
    
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe(text);
  });

  it('should handle empty text', () => {
    const chunks = chunkBookText('', 1000);
    expect(chunks.length).toBe(0);
  });

  it('should handle text with multiple whitespaces', () => {
    const text = 'Word1    Word2     Word3';
    const chunks = chunkBookText(text, 1000);
    
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe('Word1 Word2 Word3');
  });

  it('should handle very long words that exceed chunk size', () => {
    const longWord = 'a'.repeat(5000);
    const chunks = chunkBookText(longWord, 3000);
    
    // Should still create a chunk even if word exceeds limit
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe(longWord);
  });

  it('should maintain word order and continuity', () => {
    const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
    const text = words.join(' ');
    const chunks = chunkBookText(text, 20);
    
    // Reconstruct text from chunks
    const reconstructed = chunks.join(' ');
    expect(reconstructed).toBe(text);
  });
});

describe('getBookInfo', () => {
  it('should calculate correct metadata', () => {
    const chunks = [
      'This is chunk one with some words',
      'This is chunk two with more words',
      'This is chunk three with even more words',
    ];
    
    const info = getBookInfo(chunks);
    
    expect(info.totalChunks).toBe(3);
    expect(info.totalWords).toBeGreaterThan(0);
    expect(info.estimatedDuration).toBeTruthy();
  });

  it('should calculate duration in seconds', () => {
    // Create exactly 150 words (150 words/min = 60 seconds)
    const words = Array(150).fill('word').join(' ');
    const chunks = [words];
    
    const info = getBookInfo(chunks);
    expect(info.estimatedDuration).toBe(60);
  });

  it('should handle large duration calculations', () => {
    // Create exactly 9000 words (9000 words / 150 wpm = 60 min = 3600 seconds)
    const words = Array(9000).fill('word').join(' ');
    const chunks = [words];
    
    const info = getBookInfo(chunks);
    expect(info.estimatedDuration).toBe(3600);
  });
});
