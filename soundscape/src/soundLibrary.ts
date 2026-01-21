import type { SoundAsset, SoundLibraryCatalog } from './types';

export function loadSoundLibraryCatalog(catalog: SoundLibraryCatalog): SoundLibraryCatalog {
  return catalog;
}

export function selectMusicTheme(catalog: SoundLibraryCatalog, genres: string[] = []): SoundAsset | undefined {
  const matches = catalog.assets.filter(
    a => a.type === 'music' && (genres.length === 0 || a.genre?.some(g => genres.includes(g)))
  );
  return matches[0];
}

export function selectAmbientTracks(catalog: SoundLibraryCatalog, tags: string[] = []): SoundAsset[] {
  if (tags.length === 0) {
    return catalog.assets.filter(a => a.type === 'ambient');
  }
  return catalog.assets.filter(a => a.type === 'ambient' && a.mood?.some(m => tags.includes(m)));
}
