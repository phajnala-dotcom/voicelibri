/**
 * Chunks book text into smaller pieces for TTS processing
 * @param fullText - The complete book text
 * @param maxBytesPerChunk - Maximum bytes per chunk (default 200 for optimal real-time TTS)
 * @returns Array of text chunks
 */
export function chunkBookText(
  fullText: string,
  maxBytesPerChunk: number = 200
): string[] {
  const chunks: string[] = [];
  
  // Split by whitespace to get words
  const words = fullText.split(/\s+/).filter(word => word.length > 0);
  
  let currentChunk = '';
  
  for (const word of words) {
    // Try adding the word to current chunk
    const testChunk = currentChunk ? `${currentChunk} ${word}` : word;
    const byteLength = Buffer.byteLength(testChunk, 'utf8');
    
    if (byteLength <= maxBytesPerChunk) {
      // Word fits, add it
      currentChunk = testChunk;
    } else {
      // Word doesn't fit
      if (currentChunk) {
        // Save current chunk and start new one with this word
        chunks.push(currentChunk);
        currentChunk = word;
      } else {
        // Single word exceeds limit - add it anyway (edge case)
        chunks.push(word);
        currentChunk = '';
      }
    }
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
