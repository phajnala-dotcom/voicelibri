/**
 * VoiceLibri - Multi-Format Text Extraction
 * Supports: TXT, EPUB, HTML, MOBI/KF8, DOCX, DOC, ODT, RTF, MD, Pages, WPS, PDF (clean)
 * 
 * SUPPORTED FORMATS (good for audiobooks):
 * - EPUB: Best quality, chapters preserved
 * - TXT: Clean text, easy to process
 * - HTML: Stripped tags, usable text
 * - MOBI/KF8: Kindle format, convertible
 * - DOCX: Microsoft Word (via mammoth - official API: {buffer})
 * - DOC: Legacy Word (via mammoth - official API: {buffer})
 * - ODT: OpenDocument Text (ZIP with content.xml)
 * - RTF: Rich Text Format (via rtf-parser)
 * - MD: Markdown (via marked.parse() - official API)
 * - Pages: Apple Pages (ZIP with content)
 * - WPS: WPS Writer (similar to DOC)
 * - PDF: Clean digital PDFs only (via pdf-parse - official PDFParse class)
 * 
 * PDF QUALITY DETECTION:
 * - Checks if PDF is digitally created (clean text) vs scanned (OCR/image-based)
 * - Only clean digital PDFs are accepted for audiobook generation
 * - Scanned PDFs are rejected with user-friendly message
 */

import * as cheerio from 'cheerio';

// Supported MIME types for audiobook generation
export const SUPPORTED_MIME_TYPES = [
  'application/epub+zip',                           // EPUB
  'text/plain',                                     // TXT (with various charset suffixes)
  'text/plain; charset=utf-8',
  'text/plain; charset=us-ascii',
  'text/html',                                      // HTML
  'text/html; charset=utf-8',
  'text/html; charset=us-ascii',
  'application/x-mobipocket-ebook',                 // MOBI/KF8
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/msword',                             // DOC
  'application/vnd.oasis.opendocument.text',        // ODT
  'application/rtf',                                // RTF
  'text/rtf',
  'text/markdown',                                  // Markdown
  'text/x-markdown',
  'application/vnd.apple.pages',                    // Apple Pages
  'application/wps-office.wps',                     // WPS Writer
  'application/pdf',                                // PDF (clean digital only)
];

// Supported file extensions - ALL text-based document formats
export const SUPPORTED_EXTENSIONS = [
  // Ebook formats
  '.epub', '.mobi', '.azw', '.azw3', '.kf8',
  // Plain text
  '.txt',
  // Web formats
  '.html', '.htm',
  // Microsoft Office
  '.docx', '.doc',
  // OpenDocument
  '.odt',
  // Rich Text
  '.rtf',
  // Markdown
  '.md', '.markdown',
  // Apple
  '.pages',
  // WPS Office
  '.wps',
  // PDF (clean digital only)
  '.pdf',
];

// Excluded MIME types (explicitly not supported)
export const EXCLUDED_MIME_TYPES = [
  'application/rdf+xml',            // Metadata only
  'application/octet-stream',       // Binary/unknown
  'image/jpeg',                     // Cover images
  'image/png',
  'image/gif',
  'audio/',                         // Audio files
  'video/',                         // Video files
];

/**
 * Check if a MIME type is supported for audiobook generation
 */
export function isSupportedMimeType(mimeType: string): boolean {
  const normalizedMime = mimeType.toLowerCase().split(';')[0].trim();
  
  // Check exclusions first
  for (const excluded of EXCLUDED_MIME_TYPES) {
    if (normalizedMime.startsWith(excluded)) {
      return false;
    }
  }
  
  // Check supported types
  return SUPPORTED_MIME_TYPES.some(supported => 
    normalizedMime.startsWith(supported.split(';')[0])
  );
}

/**
 * Check if a file extension is supported
 */
export function isSupportedExtension(ext: string): boolean {
  const normalizedExt = ext.toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(normalizedExt);
}

/**
 * Detect format from content-type header or file extension
 */
export function detectFormat(contentType?: string, filename?: string): 'epub' | 'txt' | 'html' | 'mobi' | 'unknown' {
  // Try content-type first
  if (contentType) {
    const mime = contentType.toLowerCase();
    if (mime.includes('epub')) return 'epub';
    if (mime.includes('text/plain')) return 'txt';
    if (mime.includes('text/html')) return 'html';
    if (mime.includes('mobipocket') || mime.includes('x-mobi')) return 'mobi';
  }
  
  // Fall back to extension
  if (filename) {
    const ext = filename.toLowerCase();
    if (ext.endsWith('.epub')) return 'epub';
    if (ext.endsWith('.txt')) return 'txt';
    if (ext.endsWith('.html') || ext.endsWith('.htm')) return 'html';
    if (ext.endsWith('.mobi') || ext.endsWith('.azw') || ext.endsWith('.azw3') || ext.endsWith('.kf8')) return 'mobi';
  }
  
  return 'unknown';
}

/**
 * Extract clean text from HTML content
 * Removes scripts, styles, and extracts readable text
 */
export function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html);
  
  // Remove non-content elements
  $('script, style, noscript, iframe, object, embed, svg, canvas').remove();
  $('head, header, footer, nav, aside, form, button, input, select, textarea').remove();
  $('[hidden], [aria-hidden="true"]').remove();
  
  // Try to find main content areas
  const mainContent = $('main, article, .content, .main, #content, #main, .chapter, .text, .body').first();
  
  let text: string;
  if (mainContent.length > 0) {
    text = mainContent.text();
  } else {
    // Fall back to body
    text = $('body').text() || $('html').text() || '';
  }
  
  // Clean up whitespace
  text = text
    .replace(/\s+/g, ' ')           // Multiple spaces to single
    .replace(/\n\s*\n/g, '\n\n')    // Multiple newlines to double
    .replace(/^\s+|\s+$/gm, '')     // Trim lines
    .trim();
  
  return text;
}

/**
 * Extract text from MOBI/KF8 format
 * MOBI files contain HTML internally, so we extract and clean it
 * 
 * Uses @lingo-reader/mobi-parser for proper MOBI/KF8 parsing
 */
export async function extractTextFromMobi(buffer: Buffer): Promise<string> {
  try {
    // Import the mobi-parser library
    const { initMobiFile, initKf8File } = await import('@lingo-reader/mobi-parser');
    
    // Create a Uint8Array from buffer (the library expects Uint8Array/InputFile)
    const uint8Array = new Uint8Array(buffer);
    
    // Try MOBI format first, then KF8
    let parser: Awaited<ReturnType<typeof initMobiFile>> | Awaited<ReturnType<typeof initKf8File>>;
    try {
      parser = await initMobiFile(uint8Array);
    } catch {
      // Try KF8 format
      parser = await initKf8File(uint8Array);
    }
    
    // Get the spine (list of chapters)
    const spine = parser.getSpine();
    const textParts: string[] = [];
    
    // Extract text from each chapter
    for (const chapter of spine) {
      const processed = parser.loadChapter(chapter.id);
      if (processed?.html) {
        const chapterText = extractTextFromHtml(processed.html);
        if (chapterText.trim()) {
          textParts.push(chapterText);
        }
      }
    }
    
    // Clean up
    parser.destroy();
    
    if (textParts.length === 0) {
      throw new Error('No text content extracted from MOBI');
    }
    
    return textParts.join('\n\n');
  } catch (error) {
    console.error('MOBI parsing error:', error);
    
    // Fallback: Try to find HTML content in the buffer
    // MOBI files often have readable HTML sections
    const bufferStr = buffer.toString('utf-8', 0, Math.min(buffer.length, 1024 * 1024));
    
    // Look for HTML markers
    const htmlStart = bufferStr.indexOf('<html');
    const bodyStart = bufferStr.indexOf('<body');
    
    if (htmlStart !== -1 || bodyStart !== -1) {
      // Extract what looks like HTML content
      const startIndex = htmlStart !== -1 ? htmlStart : bodyStart;
      const htmlContent = bufferStr.substring(startIndex);
      return extractTextFromHtml(htmlContent);
    }
    
    throw new Error('Failed to extract text from MOBI file: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Extract text from a file based on its format
 */
export async function extractText(
  buffer: Buffer, 
  format: 'epub' | 'txt' | 'html' | 'mobi' | 'docx' | 'doc' | 'odt' | 'rtf' | 'md' | 'pages' | 'wps' | 'pdf'
): Promise<string> {
  switch (format) {
    case 'txt':
      return buffer.toString('utf-8').trim();
      
    case 'html':
      return extractTextFromHtml(buffer.toString('utf-8'));
      
    case 'mobi':
      return extractTextFromMobi(buffer);
      
    case 'md':
      return extractTextFromMarkdown(buffer.toString('utf-8'));
      
    case 'docx':
    case 'doc':
      return extractTextFromDocx(buffer);
      
    case 'odt':
      return extractTextFromOdt(buffer);
      
    case 'rtf':
      return extractTextFromRtf(buffer);
      
    case 'pages':
      return extractTextFromPages(buffer);
      
    case 'wps':
      return extractTextFromWps(buffer);
      
    case 'pdf':
      return extractTextFromPdf(buffer);
      
    case 'epub':
      // EPUB uses existing extractTextFromEpub function in bookChunker.ts
      throw new Error('Use extractTextFromEpub for EPUB files');
      
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

// ============================================================================
// NEW FORMAT EXTRACTORS
// ============================================================================

/**
 * Extract text from DOCX/DOC (Microsoft Word) using mammoth
 */
export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    
    if (!result.value || result.value.trim().length === 0) {
      throw new Error('No text content extracted from Word document');
    }
    
    return result.value.trim();
  } catch (error) {
    console.error('DOCX extraction error:', error);
    throw new Error('Failed to extract text from Word document: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Extract text from Markdown using marked
 */
export async function extractTextFromMarkdown(markdown: string): Promise<string> {
  try {
    const { marked } = await import('marked');
    
    // Convert markdown to HTML, then extract text
    const html = await marked.parse(markdown);
    return extractTextFromHtml(html);
  } catch (error) {
    console.error('Markdown extraction error:', error);
    // Fallback: return raw markdown with basic cleanup
    return markdown
      .replace(/^#+\s+/gm, '')      // Remove heading markers
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove bold
      .replace(/\*([^*]+)\*/g, '$1')      // Remove italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Convert links to text
      .replace(/`([^`]+)`/g, '$1')  // Remove code markers
      .trim();
  }
}

/**
 * Extract text from RTF using rtf-parser
 */
export async function extractTextFromRtf(buffer: Buffer): Promise<string> {
  try {
    const rtfParser = await import('rtf-parser');
    
    return new Promise((resolve, reject) => {
      const rtfContent = buffer.toString('utf-8');
      
      rtfParser.string(rtfContent, (err: Error | null, doc: any) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Extract text from RTF document structure
        const textParts: string[] = [];
        
        function extractFromNode(node: any) {
          if (typeof node === 'string') {
            textParts.push(node);
          } else if (node && node.content) {
            for (const child of node.content) {
              extractFromNode(child);
            }
          } else if (node && node.value) {
            textParts.push(node.value);
          }
        }
        
        if (doc && doc.content) {
          for (const item of doc.content) {
            extractFromNode(item);
          }
        }
        
        const text = textParts.join(' ').replace(/\s+/g, ' ').trim();
        if (!text) {
          reject(new Error('No text content extracted from RTF'));
          return;
        }
        
        resolve(text);
      });
    });
  } catch (error) {
    console.error('RTF extraction error:', error);
    
    // Fallback: Try basic regex extraction
    const rtfContent = buffer.toString('utf-8');
    const textMatch = rtfContent.match(/\\[a-z]+\s*([^\\{}]+)/g);
    if (textMatch) {
      const text = textMatch
        .map(m => m.replace(/^\\[a-z]+\s*/, ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) return text;
    }
    
    throw new Error('Failed to extract text from RTF: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Extract text from ODT (OpenDocument Text)
 * ODT is a ZIP archive containing XML content
 */
export async function extractTextFromOdt(buffer: Buffer): Promise<string> {
  try {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(buffer);
    
    // ODT content is in content.xml
    const contentEntry = zip.getEntry('content.xml');
    if (!contentEntry) {
      throw new Error('ODT file does not contain content.xml');
    }
    
    const contentXml = contentEntry.getData().toString('utf-8');
    
    // Parse XML and extract text from <text:p> elements
    const $ = cheerio.load(contentXml, { xmlMode: true });
    const textParts: string[] = [];
    
    // Extract all text content from text:p, text:h, and text:span elements
    $('*').each((_, elem) => {
      const tagName = (elem as any).tagName || '';
      if (tagName.startsWith('text:p') || tagName.startsWith('text:h') || tagName.startsWith('text:span')) {
        const text = $(elem).text();
        if (text.trim()) {
          textParts.push(text.trim());
        }
      }
    });
    
    // If no text found with namespace, try without
    if (textParts.length === 0) {
      $('p, h1, h2, h3, h4, h5, h6, span').each((_, elem) => {
        const text = $(elem).text();
        if (text.trim()) {
          textParts.push(text.trim());
        }
      });
    }
    
    const text = textParts.join('\n\n');
    if (!text) {
      throw new Error('No text content found in ODT');
    }
    
    return text;
  } catch (error) {
    console.error('ODT extraction error:', error);
    throw new Error('Failed to extract text from ODT: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Extract text from Apple Pages
 * Pages is a ZIP archive containing IWA (protobuf) or XML content
 */
export async function extractTextFromPages(buffer: Buffer): Promise<string> {
  try {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(buffer);
    
    // Try to find text content in various locations
    const possiblePaths = [
      'Index/Document.iwa',  // Modern Pages format (protobuf)
      'index.xml',           // Older Pages format
      'Contents/Document.xml',
    ];
    
    for (const path of possiblePaths) {
      const entry = zip.getEntry(path);
      if (entry) {
        const content = entry.getData().toString('utf-8');
        
        // For XML content
        if (path.endsWith('.xml')) {
          const $ = cheerio.load(content, { xmlMode: true });
          const text = $('*').text();
          if (text.trim()) {
            return text.replace(/\s+/g, ' ').trim();
          }
        }
      }
    }
    
    // Fallback: Extract all text from all entries
    const textParts: string[] = [];
    zip.getEntries().forEach(entry => {
      if (!entry.isDirectory && entry.entryName.endsWith('.xml')) {
        try {
          const content = entry.getData().toString('utf-8');
          const $ = cheerio.load(content, { xmlMode: true });
          const text = $('*').text().trim();
          if (text) {
            textParts.push(text);
          }
        } catch {
          // Skip entries that can't be parsed
        }
      }
    });
    
    if (textParts.length === 0) {
      throw new Error('No text content found in Pages document. Note: Modern .pages files use a proprietary format that may not be fully extractable.');
    }
    
    return textParts.join('\n\n');
  } catch (error) {
    console.error('Pages extraction error:', error);
    throw new Error('Failed to extract text from Pages: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Extract text from WPS Writer (.wps)
 * WPS is similar to DOC format, try mammoth first
 */
export async function extractTextFromWps(buffer: Buffer): Promise<string> {
  try {
    // Try mammoth first (WPS often compatible with DOC)
    return await extractTextFromDocx(buffer);
  } catch {
    // Fallback: Try to find text patterns in binary
    const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 1024 * 1024));
    
    // Look for readable text sections
    const textMatches = content.match(/[\x20-\x7E]{20,}/g);
    if (textMatches && textMatches.length > 0) {
      const text = textMatches.join(' ').trim();
      if (text.length > 100) {
        return text;
      }
    }
    
    throw new Error('Failed to extract text from WPS file. Consider converting to DOCX or TXT.');
  }
}

// ============================================================================
// PDF EXTRACTION WITH QUALITY DETECTION
// ============================================================================

/**
 * Result of PDF quality analysis
 */
export interface PDFQualityResult {
  isClean: boolean;           // true if PDF is suitable for audiobook
  text: string;               // extracted text (if clean)
  pageCount: number;          // number of pages
  textDensity: number;        // characters per page (higher = better)
  wordCount: number;          // total word count
  reason?: string;            // reason if not clean
}

/**
 * Analyze PDF quality to determine if suitable for audiobook generation
 * 
 * QUALITY CRITERIA (based on empirical analysis):
 * - Text density: Clean PDFs typically have >500 chars/page average
 * - Word distribution: Real text has consistent word patterns
 * - Character patterns: OCR artifacts create unusual character sequences
 * - Readability: Clean text should have proper sentences
 */
function analyzePdfQuality(text: string, pageCount: number): PDFQualityResult {
  // Basic text stats
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;
  const charCount = cleanText.length;
  const textDensity = pageCount > 0 ? charCount / pageCount : 0;
  
  // Quality checks
  const issues: string[] = [];
  
  // 1. Minimum content check - at least 100 words
  if (wordCount < 100) {
    issues.push('Too little text extracted (less than 100 words)');
  }
  
  // 2. Text density check - clean PDFs have substantial text per page
  // Scanned/OCR PDFs often have very low or very high density (garbage chars)
  if (textDensity < 200 && pageCount > 1) {
    issues.push('Very low text density - may be scanned or image-based PDF');
  }
  
  // 3. Check for OCR artifacts - unusual character sequences
  const ocrArtifacts = (cleanText.match(/[^\w\s.,!?;:'"()-]{3,}/g) || []).length;
  const artifactRatio = ocrArtifacts / Math.max(1, wordCount);
  if (artifactRatio > 0.05) {
    issues.push('High occurrence of unusual characters - likely OCR artifacts');
  }
  
  // 4. Check for word validity - most words should be in typical length range
  const words = cleanText.split(/\s+/);
  const validWordCount = words.filter(w => w.length >= 2 && w.length <= 25).length;
  const validRatio = validWordCount / Math.max(1, words.length);
  if (validRatio < 0.7) {
    issues.push('Many words have unusual lengths - may indicate OCR errors');
  }
  
  // 5. Check for sentence structure - clean text has proper punctuation
  const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length < 5 && charCount > 1000) {
    issues.push('Text lacks proper sentence structure');
  }
  
  // 6. Check for repeated garbage patterns (common in scanned PDFs)
  const repeatedPattern = /(.{5,})\1{3,}/g;
  if (repeatedPattern.test(cleanText)) {
    issues.push('Detected repeated character patterns - possible scan artifact');
  }
  
  const isClean = issues.length === 0;
  
  return {
    isClean,
    text: isClean ? cleanText : '',
    pageCount,
    textDensity: Math.round(textDensity),
    wordCount,
    reason: issues.length > 0 ? issues.join('; ') : undefined,
  };
}

/**
 * Extract text from PDF using pdf-parse library (v2 API per official docs)
 * Only accepts clean digital PDFs, rejects scanned/OCR PDFs
 * 
 * @throws Error with user-friendly message if PDF is not suitable
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // Import pdf-parse using official v2 API
    const { PDFParse } = await import('pdf-parse');
    
    // Create parser from buffer per official docs
    const parser = new PDFParse({ data: buffer });
    
    // Get text content
    const textResult = await parser.getText();
    
    // Get page info for quality analysis
    const info = await parser.getInfo({ parsePageInfo: true });
    
    // Clean up parser
    await parser.destroy();
    
    const pageCount = info.total || 1;
    const rawText = textResult.text || '';
    
    // Analyze quality
    const quality = analyzePdfQuality(rawText, pageCount);
    
    if (!quality.isClean) {
      throw new Error(
        `This PDF cannot be used for audiobook generation. ${quality.reason}. ` +
        `The PDF appears to be scanned or contains images rather than clean digital text. ` +
        `Please use a digitally created PDF (e.g., exported from Word, Google Docs, or similar) ` +
        `or convert your document to EPUB, DOCX, or TXT format for better results.`
      );
    }
    
    console.log(`✓ PDF quality check passed: ${quality.wordCount} words, ${quality.textDensity} chars/page avg`);
    return quality.text;
    
  } catch (error) {
    // Re-throw our quality errors as-is
    if (error instanceof Error && error.message.includes('cannot be used for audiobook')) {
      throw error;
    }
    
    // Handle pdf-parse specific errors
    console.error('PDF extraction error:', error);
    
    // Check for password protected PDFs
    if (error instanceof Error && error.message.toLowerCase().includes('password')) {
      throw new Error(
        'This PDF is password protected. Please remove the password protection and try again, ' +
        'or convert to a different format (EPUB, DOCX, TXT).'
      );
    }
    
    // Check for corrupted PDFs
    if (error instanceof Error && (
      error.message.toLowerCase().includes('invalid') ||
      error.message.toLowerCase().includes('corrupt')
    )) {
      throw new Error(
        'This PDF file appears to be corrupted or invalid. ' +
        'Please try re-downloading the file or converting to a different format.'
      );
    }
    
    throw new Error(
      'Failed to extract text from PDF. ' +
      'The file may be damaged, encrypted, or contain only images. ' +
      'Please try EPUB, DOCX, or TXT format instead.'
    );
  }
}

/**
 * Get the best download URL from Gutenberg formats
 * Priority: EPUB > TXT > HTML > MOBI
 */
export function getBestDownloadUrl(formats: Record<string, string>): { url: string; format: string } | null {
  // Priority order for audiobook generation
  const priorities = [
    { key: 'application/epub+zip', format: 'epub' },
    { key: 'text/plain; charset=utf-8', format: 'txt' },
    { key: 'text/plain; charset=us-ascii', format: 'txt' },
    { key: 'text/plain', format: 'txt' },
    { key: 'text/html', format: 'html' },
    { key: 'application/x-mobipocket-ebook', format: 'mobi' },
  ];
  
  for (const { key, format } of priorities) {
    // Check for exact match or partial match
    const matchingKey = Object.keys(formats).find(k => k.startsWith(key));
    if (matchingKey && formats[matchingKey]) {
      return { url: formats[matchingKey], format };
    }
  }
  
  return null;
}

/**
 * Check if a Gutenberg book has downloadable text content
 */
export function hasDownloadableText(formats: Record<string, string>): boolean {
  return getBestDownloadUrl(formats) !== null;
}

export default {
  SUPPORTED_MIME_TYPES,
  SUPPORTED_EXTENSIONS,
  EXCLUDED_MIME_TYPES,
  isSupportedMimeType,
  isSupportedExtension,
  detectFormat,
  extractTextFromHtml,
  extractTextFromMobi,
  extractTextFromPdf,
  extractText,
  getBestDownloadUrl,
  hasDownloadableText,
};
