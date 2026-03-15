/**
 * Soundscape Module — Deterministic Text Splitter
 *
 * Pure deterministic text splitting into paragraphs and sentences
 * with character offsets. 100% language-agnostic — operates on
 * punctuation and whitespace structure only.
 *
 * No sub-sentence fragmentation: sentences are the smallest unit
 * for SFX matching (see Decision #2 in the Option C spec).
 *
 * This module is synchronous, pure, and has no side effects.
 * No external NLP libraries — just regex and string operations.
 */

// ========================================
// Types
// ========================================

export interface ParagraphInfo {
  /** Trimmed paragraph text */
  text: string;
  /** Character offset of the paragraph start in the original text */
  charIndex: number;
  /** Character offset of the paragraph end (exclusive) in the original text */
  charEnd: number;
}

export interface SentenceInfo {
  /** Trimmed sentence text */
  text: string;
  /** Character offset of the sentence start in the original text */
  charIndex: number;
  /** Character offset of the sentence end (exclusive) in the original text */
  charEnd: number;
  /** Index of the parent paragraph in the paragraphs array */
  paragraphIndex: number;
}

export interface TextSplitResult {
  /** All paragraphs with char offsets */
  paragraphs: ParagraphInfo[];
  /** All sentences with char offsets — used for both ambient matching and SFX matching */
  sentences: SentenceInfo[];
}

// ========================================
// Constants
// ========================================

/** Minimum sentence length (chars) — shorter fragments merge with preceding sentence */
const MIN_SENTENCE_LENGTH = 10;



// ========================================
// Public API
// ========================================

/**
 * Split chapter text into paragraphs and sentences.
 * Pure synchronous function, language-agnostic.
 * Sentences are the smallest unit — no sub-sentence fragmentation.
 *
 * @param chapterText - Full chapter text (any language)
 * @returns TextSplitResult with paragraphs and sentences, each with char offsets
 */
export function splitText(chapterText: string): TextSplitResult {
  if (!chapterText || chapterText.trim().length === 0) {
    return { paragraphs: [], sentences: [] };
  }

  const paragraphs = splitParagraphs(chapterText);
  const sentences: SentenceInfo[] = [];

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi];
    const paraSentences = splitSentences(para.text, para.charIndex, pi);
    sentences.push(...paraSentences);
  }

  return { paragraphs, sentences };
}

// ========================================
// Paragraph Splitting
// ========================================

/**
 * Split text on double-newlines (paragraph boundaries).
 * Handles both \n\n and \r\n\r\n. Trims whitespace.
 * Tracks character offsets in the original text.
 */
function splitParagraphs(text: string): ParagraphInfo[] {
  const paragraphs: ParagraphInfo[] = [];

  // Split on two or more consecutive newlines (with optional carriage returns and spaces)
  const paraRegex = /(?:\r?\n[ \t]*){2,}/g;
  let match: RegExpExecArray | null;

  const boundaries: Array<{ start: number; end: number }> = [];
  while ((match = paraRegex.exec(text)) !== null) {
    boundaries.push({ start: match.index, end: match.index + match[0].length });
  }

  // Build paragraphs from the gaps between boundaries
  const starts = [0, ...boundaries.map((b) => b.end)];
  const ends = [...boundaries.map((b) => b.start), text.length];

  for (let i = 0; i < starts.length; i++) {
    const rawStart = starts[i];
    const rawEnd = ends[i];
    const raw = text.substring(rawStart, rawEnd);
    const trimmed = raw.trim();

    if (trimmed.length === 0) continue;

    // Find the actual start after leading whitespace
    const leadingWhitespace = raw.length - raw.trimStart().length;
    const charIndex = rawStart + leadingWhitespace;
    // Find actual end before trailing whitespace
    const trailingWhitespace = raw.length - raw.trimEnd().length;
    const charEnd = rawEnd - trailingWhitespace;

    paragraphs.push({ text: trimmed, charIndex, charEnd });
  }

  return paragraphs;
}

// ========================================
// Sentence Splitting
// ========================================

/**
 * Split a paragraph into sentences using sentence-ending punctuation.
 * Language-agnostic: uses `. `, `! `, `? ` as primary delimiters.
 * Handles ellipsis and quoted dialogue.
 * Merges short fragments (< MIN_SENTENCE_LENGTH) with the preceding sentence.
 *
 * @param paragraphText - Trimmed paragraph text
 * @param paragraphCharIndex - Char offset of paragraph start in original text
 * @param paragraphIndex - Index of parent paragraph
 */
function splitSentences(
  paragraphText: string,
  paragraphCharIndex: number,
  paragraphIndex: number,
): SentenceInfo[] {
  if (paragraphText.length === 0) return [];

  // Strategy: walk the text character by character, identifying sentence boundaries.
  // A sentence boundary is: [.!?] followed by a space (or end of text),
  // but NOT if the period is part of an abbreviation or ellipsis.
  const rawSentences: Array<{ text: string; localStart: number; localEnd: number }> = [];
  let sentenceStart = 0;

  for (let i = 0; i < paragraphText.length; i++) {
    const char = paragraphText[i];

    // Check for sentence-ending punctuation
    if (char === '.' || char === '!' || char === '?') {
      // Look ahead: must be followed by whitespace, end-of-text, or closing quote + whitespace
      const nextChar = paragraphText[i + 1];
      const afterClosingQuote =
        (nextChar === '"' || nextChar === '\'' || nextChar === '"' || nextChar === '»' || nextChar === '«') &&
        (i + 2 >= paragraphText.length || /\s/.test(paragraphText[i + 2]));
      const isEndOfText = i === paragraphText.length - 1;
      const isFollowedBySpace = nextChar !== undefined && /\s/.test(nextChar);
      // After closing quote, next char is space or end
      const isBoundary = isEndOfText || isFollowedBySpace || afterClosingQuote;

      if (!isBoundary) continue;

      // Check for ellipsis (... or …) — not a sentence boundary in the middle
      if (char === '.') {
        // Check if this is part of an ellipsis
        if (paragraphText[i - 1] === '.' || paragraphText[i + 1] === '.') continue;
      }

      // Determine end of sentence (include closing quotes)
      let endIndex = i + 1;
      if (afterClosingQuote) {
        endIndex = i + 2;
      }

      const sentenceText = paragraphText.substring(sentenceStart, endIndex).trim();
      if (sentenceText.length > 0) {
        rawSentences.push({
          text: sentenceText,
          localStart: sentenceStart,
          localEnd: endIndex,
        });
      }

      // Advance past whitespace to next sentence
      sentenceStart = endIndex;
      while (sentenceStart < paragraphText.length && /\s/.test(paragraphText[sentenceStart])) {
        sentenceStart++;
      }
    }
  }

  // Handle remaining text after the last sentence boundary
  if (sentenceStart < paragraphText.length) {
    const remaining = paragraphText.substring(sentenceStart).trim();
    if (remaining.length > 0) {
      rawSentences.push({
        text: remaining,
        localStart: sentenceStart,
        localEnd: paragraphText.length,
      });
    }
  }

  // If no sentence boundaries found at all, treat entire paragraph as one sentence
  if (rawSentences.length === 0) {
    return [{
      text: paragraphText,
      charIndex: paragraphCharIndex,
      charEnd: paragraphCharIndex + paragraphText.length,
      paragraphIndex,
    }];
  }

  // Merge short sentences with neighbors (bidirectional, language-agnostic)
  // This replaces abbreviation detection — short fragments like "Dr.", "Ing.", "J. K."
  // are merged with adjacent sentences by length threshold alone. No word lists needed.
  // Backward merge: short fragment merges with preceding sentence
  const merged: typeof rawSentences = [];
  for (const sent of rawSentences) {
    if (merged.length > 0 && sent.text.length < MIN_SENTENCE_LENGTH) {
      const prev = merged[merged.length - 1];
      prev.text = paragraphText.substring(prev.localStart, sent.localEnd).trim();
      prev.localEnd = sent.localEnd;
    } else {
      merged.push({ ...sent });
    }
  }

  // Forward merge: if first fragment is still too short, merge into next sentence
  if (merged.length > 1 && merged[0].text.length < MIN_SENTENCE_LENGTH) {
    const second = merged[1];
    second.text = paragraphText.substring(merged[0].localStart, second.localEnd).trim();
    second.localStart = merged[0].localStart;
    merged.shift();
  }

  // Convert to SentenceInfo with absolute character offsets
  return merged.map((s) => ({
    text: s.text,
    charIndex: paragraphCharIndex + s.localStart,
    charEnd: paragraphCharIndex + s.localEnd,
    paragraphIndex,
  }));
}


