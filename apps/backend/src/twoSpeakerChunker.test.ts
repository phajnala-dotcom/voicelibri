import { describe, it, expect } from 'vitest';
import { chunkForTwoSpeakers, formatForMultiSpeakerTTS } from './twoSpeakerChunker';

// Helper: create tagged text with N speakers
function makeTaggedText(speakers: string[], linesPerSpeaker: number = 2): string {
  return speakers.map(speaker =>
    Array(linesPerSpeaker).fill(`[VOICE=${speaker}] Hello from ${speaker}.`).join('\n')
  ).join('\n');
}

describe('chunkForTwoSpeakers', () => {
    it('splits only at sentence boundaries', () => {
      // This text has two sentences in one segment, and should split only at the period
      const text = '[VOICE=ALICE] First sentence. Second sentence. Third sentence.';
      // Set a low byte limit to force splitting
      const chunks = chunkForTwoSpeakers(text, { maxBytes: 25, minBytes: 0 });
      // Each chunk should end with a period (sentence boundary)
      chunks.forEach(chunk => {
        expect(chunk.formattedText.trim().endsWith('.')).toBe(true);
      });
      // All sentences should be present
      const allOutput = chunks.map(c => c.formattedText).join(' ');
      expect(allOutput).toContain('First sentence.');
      expect(allOutput).toContain('Second sentence.');
      expect(allOutput).toContain('Third sentence.');
    });

    it('throws if a segment cannot be split at a sentence boundary', () => {
      // This text is a single long sentence (no split possible)
      const longSentence = 'A'.repeat(100);
      const text = `[VOICE=ALICE] ${longSentence}`;
      expect(() => {
        chunkForTwoSpeakers(text, { maxBytes: 10, minBytes: 0 });
      }).toThrow();
    });
  it('never produces chunk with >2 speakers', () => {
    const text = [
      '[VOICE=ALICE] Hello.',
      '[VOICE=BOB] Hi!',
      '[VOICE=CAROL] Hey there.',
      '[VOICE=ALICE] How are you?',
      '[VOICE=BOB] Good.',
      '[VOICE=CAROL] Fine.'
    ].join('\n');
    const chunks = chunkForTwoSpeakers(text);
    chunks.forEach(chunk => {
      expect(chunk.speakers.length).toBeLessThanOrEqual(2);
    });
  });

  it('preserves all text and speakers', () => {
    const speakers = ['A', 'B', 'C', 'D'];
    const text = makeTaggedText(speakers, 3);
    const chunks = chunkForTwoSpeakers(text);
    // All speakers should appear somewhere in the output
    const allOutput = chunks.map(c => c.formattedText).join('\n');
    speakers.forEach(speaker => {
      expect(allOutput).toContain(`: Hello from ${speaker}.`);
    });
    // All lines should be present
    speakers.forEach(speaker => {
      for (let i = 0; i < 3; ++i) {
        expect(allOutput).toContain(`: Hello from ${speaker}.`);
      }
    });
  });

  it('never exceeds byte limit', () => {
    const text = makeTaggedText(['A', 'B'], 50);
    const chunks = chunkForTwoSpeakers(text, { maxBytes: 3300, minBytes: 0 });
    chunks.forEach(chunk => {
      expect(chunk.byteCount).toBeLessThanOrEqual(3300);
    });
  });

  it('handles single speaker', () => {
    const text = makeTaggedText(['NARRATOR'], 5);
    const chunks = chunkForTwoSpeakers(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0].speakers).toEqual(['NARRATOR']);
  });
});
