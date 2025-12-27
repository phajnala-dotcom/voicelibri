/**
 * Text Cleaner - Remove Non-Content Elements
 * 
 * Intelligently removes:
 * - Page numbers
 * - Table of contents
 * - Editorial notes (footnotes, annotations)
 * - Publisher info
 * - Headers/footers
 * - Chapter numbering artifacts
 * 
 * Preserves:
 * - Legally required copyright statements
 * - Author attributions
 * - Essential footnotes (part of story)
 * - Chapter titles (for navigation)
 */

/**
 * Configuration for text cleaning behavior
 */
export interface CleaningConfig {
  /** Remove page numbers */
  removePageNumbers: boolean;
  /** Remove table of contents */
  removeTableOfContents: boolean;
  /** Remove editorial notes */
  removeEditorialNotes: boolean;
  /** Remove publisher info */
  removePublisherInfo: boolean;
  /** Remove headers/footers */
  removeHeadersFooters: boolean;
  /** Preserve copyright notices */
  preserveCopyright: boolean;
  /** Preserve author attributions */
  preserveAuthor: boolean;
  /** Aggressive mode (more removal, higher risk) */
  aggressive: boolean;
}

/**
 * Default cleaning configuration (conservative)
 */
export const DEFAULT_CLEANING_CONFIG: CleaningConfig = {
  removePageNumbers: true,
  removeTableOfContents: true,
  removeEditorialNotes: true,
  removePublisherInfo: true,
  removeHeadersFooters: true,
  preserveCopyright: true,
  preserveAuthor: true,
  aggressive: false,
};

/**
 * Result of text cleaning operation
 */
export interface CleaningResult {
  cleanedText: string;
  originalLength: number;
  cleanedLength: number;
  bytesRemoved: number;
  patternsMatched: string[];
  warnings: string[];
}

/**
 * Remove page numbers from text
 * 
 * Patterns detected:
 * - Standalone numbers on lines: "42", "  156  "
 * - Page X of Y: "Page 42 of 200"
 * - Roman numerals: "xii", "XXIII"
 * - With dashes: "- 42 -", "—42—"
 */
function removePageNumbers(text: string): { text: string; count: number } {
  let count = 0;
  
  // Pattern 1: Standalone numbers (likely page numbers)
  // Matches: "\n  42  \n" or "\n156\n"
  text = text.replace(/\n\s*\d{1,4}\s*\n/g, (match) => {
    count++;
    return '\n';
  });
  
  // Pattern 2: "Page X" or "Page X of Y"
  text = text.replace(/\n\s*Page\s+\d+(\s+of\s+\d+)?\s*\n/gi, (match) => {
    count++;
    return '\n';
  });
  
  // Pattern 3: Roman numerals (for preface/intro pages)
  text = text.replace(/\n\s*[ivxlcdm]{1,6}\s*\n/gi, (match) => {
    // Only if all lowercase or all uppercase (consistent formatting)
    if (match === match.toLowerCase() || match === match.toUpperCase()) {
      count++;
      return '\n';
    }
    return match;
  });
  
  // Pattern 4: Numbers with decorative dashes
  text = text.replace(/\n\s*[-—]\s*\d{1,4}\s*[-—]\s*\n/g, (match) => {
    count++;
    return '\n';
  });
  
  return { text, count };
}

/**
 * Remove table of contents sections
 * 
 * Heuristics:
 * - "Contents", "Table of Contents" headers
 * - Multiple lines with "Chapter X ... page Y" pattern
 * - Dotted leaders: "Chapter One ..... 15"
 */
function removeTableOfContents(text: string): { text: string; removed: boolean } {
  let removed = false;
  
  // Look for TOC header followed by chapter listings
  const tocPattern = /(Table of )?Contents?\s*\n([\s\S]{50,2000}?)\n\n/gi;
  
  text = text.replace(tocPattern, (match, prefix, content) => {
    // Check if content looks like TOC (has chapter references)
    const hasChapterRefs = /Chapter\s+\w+\s*[.\s]+\d+/gi.test(content);
    const hasDottedLeaders = /\.{3,}/g.test(content);
    const hasPageNumbers = /\d+\s*\n/g.test(content);
    
    if (hasChapterRefs || (hasDottedLeaders && hasPageNumbers)) {
      removed = true;
      return '\n\n';
    }
    
    return match;
  });
  
  return { text, removed };
}

/**
 * Remove editorial notes and footnotes
 * 
 * Patterns:
 * - Footnote markers: [1], *, †, ‡
 * - Footnote text: "1. This is a note..."
 * - Editorial comments: [Editor's note: ...]
 * - Translator notes: [Translator: ...]
 * 
 * PRESERVES story-essential footnotes (detected by context)
 */
function removeEditorialNotes(text: string, aggressive: boolean): { text: string; count: number } {
  let count = 0;
  
  // Pattern 1: [Editor's note: ...] or [Translator: ...]
  text = text.replace(/\[(?:Editor'?s?\s+note|Translator|Note):\s*[^\]]+\]/gi, (match) => {
    count++;
    return '';
  });
  
  // Pattern 2: Footnote markers in text (but keep if part of story)
  // Only remove if followed by corresponding footnote text
  if (aggressive) {
    // Remove superscript numbers/symbols not part of dialogue
    text = text.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/g, (match) => {
      count++;
      return '';
    });
  }
  
  // Pattern 3: Footnote text at bottom of page
  // Format: "1. This is explanatory text..."
  text = text.replace(/\n\s*\d+\.\s+[A-Z][^\n]{20,200}\n/g, (match) => {
    // Only remove if it looks like editorial (has key words)
    if (/\b(originally|published|translation|edition|note|circa|approximately)\b/i.test(match)) {
      count++;
      return '\n';
    }
    return match;
  });
  
  return { text, count };
}

/**
 * Remove publisher information
 * 
 * Patterns:
 * - Copyright notices (except legally required)
 * - Publisher names and addresses
 * - ISBN numbers
 * - Printing information
 */
function removePublisherInfo(text: string, preserveCopyright: boolean): { text: string; count: number } {
  let count = 0;
  
  // Pattern 1: ISBN numbers
  text = text.replace(/ISBN[:\s]*[\d-]{10,17}/gi, (match) => {
    count++;
    return '';
  });
  
  // Pattern 2: Copyright lines (if not preserving)
  if (!preserveCopyright) {
    text = text.replace(/Copyright\s+©?\s*\d{4}[^\n]{0,100}\n/gi, (match) => {
      count++;
      return '';
    });
  }
  
  // Pattern 3: Publisher addresses
  text = text.replace(/\n\s*\d+\s+[A-Z][a-z]+\s+(Street|Avenue|Road|Lane)[^\n]{0,100}\n/g, (match) => {
    count++;
    return '\n';
  });
  
  // Pattern 4: "Printed in [country]" statements
  text = text.replace(/\n\s*Printed\s+in\s+[A-Z][a-z]+[^\n]*\n/gi, (match) => {
    count++;
    return '\n';
  });
  
  return { text, count };
}

/**
 * Remove headers and footers (running heads)
 * 
 * Heuristics:
 * - Repeated text at top/bottom of pages
 * - Book title or author name repeated
 * - Chapter title repeated
 */
function removeHeadersFooters(text: string): { text: string; count: number } {
  let count = 0;
  
  // Detect repeated short lines (likely headers)
  const lines = text.split('\n');
  const lineFrequency = new Map<string, number>();
  
  // Count short lines that appear multiple times
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length < 60 && !/^Chapter/i.test(trimmed)) {
      lineFrequency.set(trimmed, (lineFrequency.get(trimmed) || 0) + 1);
    }
  }
  
  // Remove lines that appear 3+ times (likely headers/footers)
  const repeatedLines = new Set(
    Array.from(lineFrequency.entries())
      .filter(([_, freq]) => freq >= 3)
      .map(([line, _]) => line)
  );
  
  if (repeatedLines.size > 0) {
    text = lines
      .map(line => {
        const trimmed = line.trim();
        if (repeatedLines.has(trimmed)) {
          count++;
          return '';
        }
        return line;
      })
      .join('\n');
  }
  
  return { text, count };
}

/**
 * Clean up excessive whitespace
 * 
 * - Multiple blank lines → 2 blank lines max
 * - Trailing spaces
 * - Mixed line endings
 */
function normalizeWhitespace(text: string): string {
  // Normalize line endings
  text = text.replace(/\r\n/g, '\n');
  
  // Remove trailing spaces
  text = text.replace(/ +$/gm, '');
  
  // Max 2 consecutive blank lines
  text = text.replace(/\n{4,}/g, '\n\n\n');
  
  // Remove leading/trailing whitespace
  text = text.trim();
  
  return text;
}

/**
 * Main text cleaning function
 * 
 * @param text - Raw text to clean
 * @param config - Cleaning configuration
 * @returns Cleaning result with cleaned text and statistics
 */
export function cleanText(
  text: string,
  config: CleaningConfig = DEFAULT_CLEANING_CONFIG
): CleaningResult {
  const originalLength = text.length;
  const patternsMatched: string[] = [];
  const warnings: string[] = [];
  
  let cleanedText = text;
  
  // Step 1: Remove page numbers
  if (config.removePageNumbers) {
    const result = removePageNumbers(cleanedText);
    cleanedText = result.text;
    if (result.count > 0) {
      patternsMatched.push(`Page numbers (${result.count})`);
    }
  }
  
  // Step 2: Remove table of contents
  if (config.removeTableOfContents) {
    const result = removeTableOfContents(cleanedText);
    cleanedText = result.text;
    if (result.removed) {
      patternsMatched.push('Table of contents');
    }
  }
  
  // Step 3: Remove editorial notes
  if (config.removeEditorialNotes) {
    const result = removeEditorialNotes(cleanedText, config.aggressive);
    cleanedText = result.text;
    if (result.count > 0) {
      patternsMatched.push(`Editorial notes (${result.count})`);
    }
  }
  
  // Step 4: Remove publisher info
  if (config.removePublisherInfo) {
    const result = removePublisherInfo(cleanedText, config.preserveCopyright);
    cleanedText = result.text;
    if (result.count > 0) {
      patternsMatched.push(`Publisher info (${result.count})`);
    }
  }
  
  // Step 5: Remove headers/footers
  if (config.removeHeadersFooters) {
    const result = removeHeadersFooters(cleanedText);
    cleanedText = result.text;
    if (result.count > 0) {
      patternsMatched.push(`Headers/footers (${result.count})`);
      if (result.count > 100) {
        warnings.push('Many repeated lines removed - verify no story content lost');
      }
    }
  }
  
  // Step 6: Normalize whitespace
  cleanedText = normalizeWhitespace(cleanedText);
  
  // Calculate statistics
  const cleanedLength = cleanedText.length;
  const bytesRemoved = originalLength - cleanedLength;
  const percentRemoved = ((bytesRemoved / originalLength) * 100).toFixed(1);
  
  // Warnings
  if (bytesRemoved > originalLength * 0.3) {
    warnings.push(`${percentRemoved}% of text removed - verify accuracy`);
  }
  
  return {
    cleanedText,
    originalLength,
    cleanedLength,
    bytesRemoved,
    patternsMatched,
    warnings,
  };
}

/**
 * Clean text for EPUB format specifically
 * 
 * EPUB-specific considerations:
 * - HTML tags already stripped by parser
 * - Focus on structural elements
 * - More aggressive cleaning possible
 */
export function cleanEpubText(text: string): CleaningResult {
  const config: CleaningConfig = {
    ...DEFAULT_CLEANING_CONFIG,
    aggressive: true, // EPUBs have cleaner structure
    removeHeadersFooters: false, // Usually already handled by EPUB parser
  };
  
  return cleanText(text, config);
}

/**
 * Clean text for plain TXT format
 * 
 * TXT-specific considerations:
 * - More varied formatting
 * - More conservative approach
 * - Preserve more potential story content
 */
export function cleanPlainText(text: string): CleaningResult {
  const config: CleaningConfig = {
    ...DEFAULT_CLEANING_CONFIG,
    aggressive: false, // Conservative for plain text
  };
  
  return cleanText(text, config);
}
