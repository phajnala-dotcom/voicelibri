import type { SoundDirective, SoundLibraryCatalog } from './types';
import { extractSceneTags } from './sceneTagger';
import { selectAmbientTracks } from './soundLibrary';

export interface ChapterContext {
  chapterIndex: number;
  chunkCount: number;
  text: string;
}

export function buildSoundDirectives(
  catalog: SoundLibraryCatalog,
  context: ChapterContext
): SoundDirective[] {
  if (context.chunkCount <= 0) return [];

  const { tags, moods } = extractSceneTags(context.text);
  const ambient = selectAmbientTracks(catalog, moods.length > 0 ? moods : tags)[0];
  if (!ambient) return [];

  return [
    {
      soundId: ambient.id,
      startChunk: 0,
      endChunk: Math.max(0, context.chunkCount - 1),
      volumeDb: ambient.recommendedVolumeDb ?? -24,
      fadeInMs: 1500,
      fadeOutMs: 2000,
    },
  ];
}
