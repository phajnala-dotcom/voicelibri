export interface IntroSegment {
  type: 'music' | 'voice';
  durationMs: number;
  volumeDb?: number;
  text?: string;
}

export function buildBookIntroSequence(bookTitle: string, author: string, chapterTitle: string): IntroSegment[] {
  return [
    { type: 'music', durationMs: 4000, volumeDb: -14 },
    { type: 'music', durationMs: 2000, volumeDb: -22 },
    { type: 'voice', durationMs: 3500, text: `${bookTitle}. ${author}. This audiobook was brought to you by VoiceLibri.` },
    { type: 'music', durationMs: 2000, volumeDb: -18 },
    { type: 'voice', durationMs: 2500, text: `Chapter 1. ${chapterTitle}.` },
    { type: 'music', durationMs: 1500, volumeDb: -16 },
  ];
}

export function buildChapterIntroSequence(chapterNumber: number, chapterTitle: string): IntroSegment[] {
  return [
    { type: 'music', durationMs: 2000, volumeDb: -14 },
    { type: 'music', durationMs: 1500, volumeDb: -22 },
    { type: 'voice', durationMs: 2000, text: `Chapter ${chapterNumber}. ${chapterTitle}.` },
    { type: 'music', durationMs: 1000, volumeDb: -16 },
  ];
}
