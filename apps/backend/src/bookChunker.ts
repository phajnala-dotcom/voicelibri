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
    // ALSO skip voice tags like "[VOICE=NARRATOR]" or "[voice=character]"
    const skipPatterns = [
      /^e\s+knizky/i, 
      /^pdf/i, 
      /^www\./i, 
      /^http/i, 
      /©/, 
      /obsah/i,
      /^\[VOICE=/i,      // Skip [VOICE=...] tags (uppercase)
      /^\[voice=/i,      // Skip [voice=...] tags (lowercase)
      /^\[\/VOICE\]/i,   // Skip [/VOICE] closing tags
      /^\[\/voice\]/i    // Skip [/voice] closing tags
    ];
    
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
      
      if (isUppercase && !foundAuthor) {
        // Author name (must be all uppercase)
        // Stop at first uppercase line that looks like author
        authorLines.push(line);
        foundAuthor = true;
        break;
      }
      
      // If we've skipped several lines after title and found no uppercase author,
      // stop looking (probably narrative text)
      if (!foundAuthor && i > 5) {
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

// ========================================
// CHAPTER DETECTION (Phase 3)
// ========================================

/**
 * Chapter information
 */
export interface Chapter {
  index: number;
  title: string;
  startOffset: number; // Character position in full text
  endOffset: number;
  text: string;
}

/**
 * Extract chapters from EPUB file using spine structure
 * Each spine item (typically an XHTML file) represents one chapter
 * 
 * @param epubBuffer - EPUB file as Buffer
 * @returns Array of chapters
 */
export function extractEpubChapters(epubBuffer: Buffer): Chapter[] {
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
    
    // Get base directory of OPF file
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
    
    // Try to get chapter titles from TOC (toc.ncx or nav.xhtml)
    const chapterTitles = extractEpubTocTitles(zip, opfPath, opfData);
    
    // Extract chapters from spine items
    const chapters: Chapter[] = [];
    let currentOffset = 0;
    
    for (let i = 0; i < spineItems.length; i++) {
      const itemId = spineItems[i];
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
      
      if (plainText.trim().length === 0) {
        continue; // Skip empty chapters
      }
      
      // Try to get title from TOC or generate one
      const title = chapterTitles[i] || `Chapter ${i + 1}`;
      
      const startOffset = currentOffset;
      const endOffset = currentOffset + plainText.length;
      
      chapters.push({
        index: chapters.length,
        title,
        startOffset,
        endOffset,
        text: plainText,
      });
      
      currentOffset = endOffset + 2; // +2 for "\n\n" separator
    }
    
    console.log(`✓ Extracted ${chapters.length} chapters from EPUB`);
    return chapters;
    
  } catch (error) {
    console.error('✗ Failed to extract EPUB chapters:', error);
    throw error;
  }
}

/**
 * Extract chapter titles from EPUB TOC (toc.ncx or nav.xhtml)
 * 
 * @param zip - EPUB zip archive
 * @param opfPath - Path to OPF file
 * @param opfData - Parsed OPF data
 * @returns Array of chapter titles (may be incomplete)
 */
function extractEpubTocTitles(zip: AdmZip, opfPath: string, opfData: any): string[] {
  const titles: string[] = [];
  
  try {
    // Try to find TOC reference in OPF
    const manifest = opfData?.package?.manifest?.item;
    let tocPath: string | null = null;
    
    if (Array.isArray(manifest)) {
      const tocItem = manifest.find((item: any) => 
        item['@_id'] === 'ncx' || 
        item['@_media-type'] === 'application/x-dtbncx+xml' ||
        item['@_properties']?.includes('nav')
      );
      if (tocItem) {
        tocPath = tocItem['@_href'];
      }
    }
    
    if (!tocPath) {
      return titles; // No TOC found
    }
    
    const opfDir = path.dirname(opfPath);
    const fullTocPath = path.posix.join(opfDir, tocPath);
    const tocEntry = zip.getEntry(fullTocPath);
    
    if (!tocEntry) {
      return titles;
    }
    
    const tocXml = tocEntry.getData().toString('utf8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    const tocData = parser.parse(tocXml);
    
    // Parse NCX format (older EPUB2)
    if (tocData.ncx) {
      const navPoints = tocData.ncx.navMap?.navPoint;
      if (Array.isArray(navPoints)) {
        navPoints.forEach((np: any) => {
          const label = np.navLabel?.text;
          if (label) {
            titles.push(typeof label === 'string' ? label : label['#text'] || 'Untitled');
          }
        });
      }
    }
    
    // Parse XHTML nav format (EPUB3)
    if (tocData.html || tocData.xhtml) {
      // Simple extraction - just get text from nav ol li elements
      // This is a basic implementation and may need refinement
      const htmlContent = tocXml;
      const navMatch = htmlContent.match(/<nav[^>]*epub:type="toc"[^>]*>([\s\S]*?)<\/nav>/i);
      if (navMatch) {
        const navContent = navMatch[1];
        const titleMatches = navContent.matchAll(/<a[^>]*>(.*?)<\/a>/gi);
        for (const match of titleMatches) {
          const title = stripHtml(match[1]).trim();
          if (title) {
            titles.push(title);
          }
        }
      }
    }
    
  } catch (error) {
    console.warn('⚠️ Failed to extract TOC titles:', error);
  }
  
  return titles;
}

/**
 * Detect chapters in plain text using common chapter markers
 * 
 * Patterns detected:
 * - "Chapter 1", "Chapter I", "Chapter One"
 * - "1.", "I.", "Part 1"
 * - "===" or "---" separators
 * 
 * @param text - Full book text
 * @returns Array of chapters (or single chapter if none detected)
 */
export function detectTextChapters(text: string): Chapter[] {
  const chapters: Chapter[] = [];
  
  // Chapter detection patterns (case-insensitive)
  const patterns = [
    /^Chapter\s+(\d+|[IVXLCDM]+|\w+)/mi,     // "Chapter 1", "Chapter I", "Chapter One"
    /^(\d+|[IVXLCDM]+)\.\s+[A-Z]/mi,         // "1. Title", "I. Title"
    /^={3,}$/mi,                               // "===" separator
    /^-{3,}$/mi,                               // "---" separator
    /^PART\s+(\d+|[IVXLCDM]+)/mi,            // "PART 1", "PART I"
    /^BOOK\s+(\d+|[IVXLCDM]+)/mi,            // "BOOK 1", "BOOK I"
  ];
  
  const lines = text.split('\n');
  const chapterStarts: Array<{ lineIndex: number; title: string; charOffset: number }> = [];
  
  let charOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if this line matches any chapter pattern
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        // Extract title (use next non-empty line if current line is just a marker)
        let title = line;
        if (line.match(/^={3,}$/) || line.match(/^-{3,}$/)) {
          // Separator found - title might be above or below
          if (i > 0 && lines[i - 1].trim().length > 0) {
            title = lines[i - 1].trim();
          } else if (i < lines.length - 1 && lines[i + 1].trim().length > 0) {
            title = lines[i + 1].trim();
          }
        }
        
        chapterStarts.push({
          lineIndex: i,
          title: title.substring(0, 100), // Limit title length
          charOffset,
        });
        break; // Don't check other patterns for this line
      }
    }
    
    charOffset += lines[i].length + 1; // +1 for newline
  }
  
  // If no chapters detected, treat entire text as single chapter
  if (chapterStarts.length === 0) {
    return createSingleChapter(text, 'Full Text');
  }
  
  // Build chapters from detected starts
  for (let i = 0; i < chapterStarts.length; i++) {
    const start = chapterStarts[i];
    const nextStart = chapterStarts[i + 1];
    
    const startOffset = start.charOffset;
    const endOffset = nextStart ? nextStart.charOffset : text.length;
    const chapterText = text.substring(startOffset, endOffset).trim();
    
    chapters.push({
      index: i,
      title: start.title,
      startOffset,
      endOffset,
      text: chapterText,
    });
  }
  
  console.log(`✓ Detected ${chapters.length} chapters in plain text`);
  return chapters;
}

/**
 * Create a single chapter from entire text (fallback when no chapters detected)
 * 
 * @param text - Full book text
 * @param title - Chapter title
 * @returns Array with single chapter
 */
export function createSingleChapter(text: string, title: string): Chapter[] {
  console.log('✓ No chapters detected - treating as single chapter');
  return [
    {
      index: 0,
      title,
      startOffset: 0,
      endOffset: text.length,
      text: text.trim(),
    },
  ];
}

