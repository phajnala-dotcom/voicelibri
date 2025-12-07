import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import path from 'path';

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
 * Parses book metadata from text file or EPUB buffer
 * Supports simple .txt format with metadata in first lines
 * Extensible for future formats (EPUB, PDF) through strategy pattern
 * 
 * @param contentOrBuffer - Complete book text (for txt) or Buffer (for epub/pdf)
 * @param format - Book format ('txt', 'epub', 'pdf', etc.)
 * @param filePath - Optional file path for EPUB/PDF parsing
 * @returns Parsed metadata or defaults
 */
export function parseBookMetadata(
  contentOrBuffer: string | Buffer,
  format: 'txt' | 'epub' | 'pdf' = 'txt',
  filePath?: string
): BookMetadata {
  // Strategy pattern - easy to extend for other formats
  switch (format) {
    case 'txt':
      if (typeof contentOrBuffer !== 'string') {
        throw new Error('TXT format requires string content');
      }
      return parseTxtMetadata(contentOrBuffer);
    case 'epub':
      if (typeof contentOrBuffer === 'string') {
        throw new Error('EPUB format requires Buffer');
      }
      return parseEpubMetadata(contentOrBuffer, filePath);
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
 * Helper function to strip HTML tags from text
 * @param html - HTML content
 * @returns Plain text without HTML tags
 */
function stripHtml(html: string): string {
  // Remove script and style tags with their content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&apos;/g, "'");
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ');
  text = text.trim();
  
  return text;
}

/**
 * Parses EPUB file and extracts metadata
 * EPUB is a ZIP archive containing XML files (OPF metadata) and HTML/XHTML content
 * 
 * @param epubBuffer - EPUB file as Buffer
 * @param filePath - Optional file path for error messages
 * @returns Extracted metadata
 */
function parseEpubMetadata(epubBuffer: Buffer, filePath?: string): BookMetadata {
  try {
    const zip = new AdmZip(epubBuffer);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    
    // Find container.xml to locate OPF file
    const containerEntry = zip.getEntry('META-INF/container.xml');
    if (!containerEntry) {
      console.warn('⚠️ EPUB: container.xml not found');
      return { title: 'Unknown EPUB', author: 'Unknown' };
    }
    
    const containerXml = containerEntry.getData().toString('utf8');
    const containerData = parser.parse(containerXml);
    
    // Get OPF file path from container
    const rootfile = containerData?.container?.rootfiles?.rootfile;
    const opfPath = rootfile?.['@_full-path'];
    
    if (!opfPath) {
      console.warn('⚠️ EPUB: OPF path not found in container.xml');
      return { title: 'Unknown EPUB', author: 'Unknown' };
    }
    
    // Read OPF file
    const opfEntry = zip.getEntry(opfPath);
    if (!opfEntry) {
      console.warn(`⚠️ EPUB: OPF file not found at ${opfPath}`);
      return { title: 'Unknown EPUB', author: 'Unknown' };
    }
    
    const opfXml = opfEntry.getData().toString('utf8');
    const opfData = parser.parse(opfXml);
    
    // Extract metadata from OPF
    const metadata = opfData?.package?.metadata;
    
    let title = 'Unknown EPUB';
    let author = 'Unknown';
    let language: string | undefined;
    
    // Parse title (can be string or object with #text)
    if (metadata?.['dc:title']) {
      const titleData = metadata['dc:title'];
      title = typeof titleData === 'string' ? titleData : titleData['#text'] || title;
    }
    
    // Parse author/creator (can be string, object, or array)
    if (metadata?.['dc:creator']) {
      const creatorData = metadata['dc:creator'];
      
      if (Array.isArray(creatorData)) {
        // Multiple authors - take first
        const firstAuthor = creatorData[0];
        author = typeof firstAuthor === 'string' ? firstAuthor : firstAuthor['#text'] || author;
      } else if (typeof creatorData === 'string') {
        author = creatorData;
      } else if (creatorData['#text']) {
        author = creatorData['#text'];
      }
    }
    
    // Parse language (can be string or object)
    if (metadata?.['dc:language']) {
      const langData = metadata['dc:language'];
      const langCode = typeof langData === 'string' ? langData : langData['#text'];
      
      if (langCode) {
        // Normalize language code (e.g., 'en-US' -> 'en', 'cs-CZ' -> 'cs')
        language = langCode.split('-')[0].toLowerCase();
      }
    }
    
    console.log(`✓ EPUB metadata extracted: "${title}" by ${author} [${language || 'unknown'}]`);
    
    return {
      title,
      author,
      language,
    };
    
  } catch (error) {
    console.error('✗ Failed to parse EPUB metadata:', error);
    const fileName = filePath ? path.basename(filePath) : 'Unknown';
    return {
      title: fileName,
      author: 'Unknown',
    };
  }
}

/**
 * Extracts plain text content from EPUB file
 * Reads HTML/XHTML files in spine order and strips HTML tags
 * 
 * @param epubBuffer - EPUB file as Buffer
 * @returns Plain text content ready for TTS
 */
export function extractTextFromEpub(epubBuffer: Buffer): string {
  try {
    const zip = new AdmZip(epubBuffer);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    
    // Find container.xml to locate OPF file
    const containerEntry = zip.getEntry('META-INF/container.xml');
    if (!containerEntry) {
      throw new Error('container.xml not found in EPUB');
    }
    
    const containerXml = containerEntry.getData().toString('utf8');
    const containerData = parser.parse(containerXml);
    
    // Get OPF file path
    const rootfile = containerData?.container?.rootfiles?.rootfile;
    const opfPath = rootfile?.['@_full-path'];
    
    if (!opfPath) {
      throw new Error('OPF path not found in container.xml');
    }
    
    // Read OPF file
    const opfEntry = zip.getEntry(opfPath);
    if (!opfEntry) {
      throw new Error(`OPF file not found at ${opfPath}`);
    }
    
    const opfXml = opfEntry.getData().toString('utf8');
    const opfData = parser.parse(opfXml);
    
    // Get base directory of OPF file (for resolving relative paths)
    const opfDir = path.dirname(opfPath);
    
    // Get manifest (maps IDs to file paths)
    const manifest = opfData?.package?.manifest?.item;
    const manifestMap = new Map<string, string>();
    
    if (Array.isArray(manifest)) {
      manifest.forEach((item: any) => {
        const id = item['@_id'];
        const href = item['@_href'];
        if (id && href) {
          manifestMap.set(id, href);
        }
      });
    } else if (manifest) {
      const id = manifest['@_id'];
      const href = manifest['@_href'];
      if (id && href) {
        manifestMap.set(id, href);
      }
    }
    
    // Get spine (reading order)
    const spine = opfData?.package?.spine?.itemref;
    const spineItems: string[] = [];
    
    if (Array.isArray(spine)) {
      spine.forEach((item: any) => {
        const idref = item['@_idref'];
        if (idref) {
          spineItems.push(idref);
        }
      });
    } else if (spine) {
      const idref = spine['@_idref'];
      if (idref) {
        spineItems.push(idref);
      }
    }
    
    // Extract text from each spine item in order
    const textParts: string[] = [];
    
    for (const itemId of spineItems) {
      const href = manifestMap.get(itemId);
      if (!href) {
        console.warn(`⚠️ EPUB: Item ${itemId} not found in manifest`);
        continue;
      }
      
      // Resolve path relative to OPF directory
      const fullPath = path.posix.join(opfDir, href);
      const contentEntry = zip.getEntry(fullPath);
      
      if (!contentEntry) {
        console.warn(`⚠️ EPUB: Content file not found: ${fullPath}`);
        continue;
      }
      
      const htmlContent = contentEntry.getData().toString('utf8');
      const plainText = stripHtml(htmlContent);
      
      if (plainText.trim().length > 0) {
        textParts.push(plainText);
      }
    }
    
    const fullText = textParts.join('\n\n');
    console.log(`✓ EPUB text extracted: ${fullText.length} characters from ${spineItems.length} chapters`);
    
    return fullText;
    
  } catch (error) {
    console.error('✗ Failed to extract text from EPUB:', error);
    throw error;
  }
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

