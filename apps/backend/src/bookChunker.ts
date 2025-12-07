/**
 * Chunks book text into smaller pieces for TTS processing
 * Breaks at sentence endings AFTER reaching minimum chunk size
 * @param fullText - The complete book text
 * @param minBytesPerChunk - Minimum bytes before looking for sentence end (default 200)
 * @returns Array of text chunks ending at sentence boundaries
 */
export function chunkBookText(
  fullText: string,
  minBytesPerChunk: number = 200
): string[] {
  const chunks: string[] = [];
  
  // Split by whitespace to get words
  const words = fullText.split(/\s+/).filter(word => word.length > 0);
  
  // Sentence-ending punctuation (period, exclamation, question mark, ellipsis)
  const isSentenceEnding = (word: string): boolean => {
    return /[.!?…]$/.test(word.trim());
  };
  
  let currentChunk = '';
  let i = 0;
  
  while (i < words.length) {
    const word = words[i];
    const testChunk = currentChunk ? `${currentChunk} ${word}` : word;
    currentChunk = testChunk;
    
    const byteLength = Buffer.byteLength(currentChunk, 'utf8');
    
    // Once we've reached minimum size, look for sentence ending
    if (byteLength >= minBytesPerChunk) {
      if (isSentenceEnding(word)) {
        // Perfect! End chunk at sentence boundary
        chunks.push(currentChunk);
        currentChunk = '';
        i++;
        continue;
      }
      
      // Continue adding words until we find sentence ending
      // (with safety limit to prevent extremely long chunks)
      if (byteLength >= 500) {
        // Safety: chunk is too long, break anyway
        chunks.push(currentChunk);
        currentChunk = '';
      }
    }
    
    i++;
  }
  
  // Add the last chunk if not empty
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Book metadata interface - extensible for future formats (EPUB, PDF, MOBI, etc.)
 */
export interface BookMetadata {
  title: string;           // Book title only (no author duplication)
  author: string;          // Primary author
  language?: string;       // Language code (cs, sk, en, etc.)
  publisher?: string;      // Publisher name
  year?: number;          // Publication year
  isbn?: string;          // ISBN if available
}

/**
 * Parses book metadata from text file
 * Supports simple .txt format with metadata in first lines
 * Extensible for future formats (EPUB, PDF) through strategy pattern
 * 
 * @param fullText - Complete book text
 * @param format - Book format ('txt', 'epub', 'pdf', etc.)
 * @returns Parsed metadata or defaults
 */
export function parseBookMetadata(
  fullText: string,
  format: 'txt' | 'epub' | 'pdf' = 'txt'
): BookMetadata {
  // Strategy pattern - easy to extend for other formats
  switch (format) {
    case 'txt':
      return parseTxtMetadata(fullText);
    case 'epub':
      // TODO: Implement EPUB metadata parsing
      return { title: 'Unknown', author: 'Unknown' };
    case 'pdf':
      // TODO: Implement PDF metadata parsing
      return { title: 'Unknown', author: 'Unknown' };
    default:
      return { title: 'Unknown', author: 'Unknown' };
  }
}

/**
 * Parses metadata from simple .txt format
 * Expects format:
 * Line 1: TITLE (uppercase or mixed case)
 * Line 2-5: AUTHOR NAME (look for all caps or specific patterns, may span multiple lines)
 * 
 * @param fullText - Complete text file content
 * @returns Extracted metadata
 */
function parseTxtMetadata(fullText: string): BookMetadata {
  const lines = fullText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  let title = 'Unknown Title';
  let author = 'Unknown Author';
  let language: string | undefined;
  
  // Heuristic: First meaningful line is often the title
  if (lines.length > 0) {
    // Skip common headers like "e Knizky.sk", "PDFknihy.sk"
    const skipPatterns = [/^e\s+knizky/i, /^pdf/i, /^www\./i, /^http/i, /©/, /obsah/i];
    
    let titleLine = '';
    const authorLines: string[] = [];
    let foundAuthor = false;
    
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      const line = lines[i];
      
      // Skip metadata/publisher lines
      if (skipPatterns.some(pattern => pattern.test(line))) continue;
      
      // Skip very short lines (likely headers)
      if (line.length < 2) continue;
      
      // First valid line = title
      if (!titleLine) {
        titleLine = line;
        continue;
      }
      
      // Collect author lines (typically 1-3 consecutive uppercase lines after title)
      const isUppercase = line === line.toUpperCase();
      const hasSpecialChars = /[A-ZÁÉÍÓÚÝČĎĚŇŘŠŤŽ]/u.test(line);
      
      if ((isUppercase || hasSpecialChars) && !foundAuthor) {
        // Could be author name
        authorLines.push(line);
        
        // Check next line - if it's also uppercase/special, add it
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          if (nextLine === nextLine.toUpperCase() && nextLine.length < 20 && nextLine.length > 2) {
            // Likely continuation of author name (e.g., "ÉMILE" then "ZOLA")
            continue;
          }
        }
        
        // Stop collecting author lines
        foundAuthor = true;
        break;
      }
    }
    
    if (titleLine) {
      // Clean title (remove extra whitespace, convert to title case if all caps)
      title = titleLine.trim();
      if (title === title.toUpperCase() && title.length < 50) {
        // Convert "POVÍDKY" to "Povídky"
        title = title.charAt(0) + title.slice(1).toLowerCase();
      }
    }
    
    if (authorLines.length > 0) {
      // Combine author lines (e.g., "ÉMILE" + "ZOLA" = "ÉMILE ZOLA")
      const combinedAuthor = authorLines.join(' ').trim();
      author = combinedAuthor;
      
      // Convert "ÉMILE ZOLA" to "Émile Zola"
      if (author === author.toUpperCase()) {
        author = author.split(' ').map(word => 
          word.charAt(0) + word.slice(1).toLowerCase()
        ).join(' ');
      }
    }
  }
  
  // Detect language from content (simple heuristic)
  const czechSlovakMarkers = ['ě', 'ř', 'ů', 'ľ', 'ĺ', 'ŕ'];
  const hasSpecialChars = czechSlovakMarkers.some(char => fullText.includes(char));
  
  if (hasSpecialChars) {
    // Distinguish Czech vs Slovak
    if (fullText.includes('ě') || fullText.includes('ř')) {
      language = 'cs'; // Czech
    } else if (fullText.includes('ľ') || fullText.includes('ĺ')) {
      language = 'sk'; // Slovak
    } else {
      language = 'cs'; // Default to Czech if unsure
    }
  }
  
  return {
    title,
    author,
    language,
  };
}

/**
 * Gets information about a chunked book
 * @param chunks - Array of text chunks
 * @returns Book metadata
 */
export function getBookInfo(chunks: string[]) {
  const totalWords = chunks.reduce((sum, chunk) => {
    return sum + chunk.split(/\s+/).length;
  }, 0);
  
  // Estimate reading time (average speaking rate: 150 words/minute)
  const estimatedSeconds = Math.ceil((totalWords / 150) * 60);
  
  return {
    totalChunks: chunks.length,
    totalWords,
    estimatedDuration: estimatedSeconds, // in seconds
  };
}

/**
 * Formats duration in seconds to "hh:mm" format
 * @param seconds - Duration in seconds
 * @returns Formatted string "hh:mm"
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

