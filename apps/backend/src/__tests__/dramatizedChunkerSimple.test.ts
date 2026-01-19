import { describe, expect, test } from 'vitest';
import { extractVoiceSegments } from '../dramatizedChunkerSimple.js';

describe('extractVoiceSegments', () => {
  test('associates directive lines (with or without colon) to next speaker', () => {
    const input = [
      'NARRATOR: It was quiet.',
      'Shout as angry roman emperor',
      'JOSEPHRAGOWSKI: "Enough!"',
    ].join('\n');

    const segments = extractVoiceSegments(input);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      speaker: 'NARRATOR',
      text: 'It was quiet.',
      speechStyle: undefined,
    });
    expect(segments[1]).toMatchObject({
      speaker: 'JOSEPHRAGOWSKI',
      text: '"Enough!"',
      speechStyle: 'Shout as angry roman emperor',
    });
  });

  test('also accepts directive lines with colon for backward compatibility', () => {
    const input = [
      'NARRATOR: It was quiet.',
      'Shout as angry roman emperor:',
      'JOSEPHRAGOWSKI: "Enough!"',
    ].join('\n');

    const segments = extractVoiceSegments(input);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      speaker: 'NARRATOR',
      text: 'It was quiet.',
      speechStyle: undefined,
    });
    expect(segments[1]).toMatchObject({
      speaker: 'JOSEPHRAGOWSKI',
      text: '"Enough!"',
      speechStyle: 'Shout as angry roman emperor',
    });
  });
});