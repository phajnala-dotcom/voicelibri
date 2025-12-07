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
