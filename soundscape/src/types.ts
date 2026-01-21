export type SoundAssetType = 'music' | 'ambient';

export interface SoundAsset {
  id: string;
  type: SoundAssetType;
  genre?: string[];
  mood?: string[];
  intensity?: number;
  recommendedVolumeDb?: number;
  loopable?: boolean;
  durationSec?: number;
  loudnessLUFS?: number;
  filePath: string;
}

export interface SoundDirective {
  soundId: string;
  startChunk: number;
  endChunk: number;
  volumeDb: number;
  fadeInMs: number;
  fadeOutMs: number;
}

export interface SoundLibraryCatalog {
  assets: SoundAsset[];
}
