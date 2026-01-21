export interface SoundscapeConfig {
  enableAmbient: boolean;
  enableMusicIntro: boolean;
  defaultAmbientDb: number;
  defaultFadeInMs: number;
  defaultFadeOutMs: number;
}

export const DEFAULT_SOUNDSCAPE_CONFIG: SoundscapeConfig = {
  enableAmbient: true,
  enableMusicIntro: true,
  defaultAmbientDb: -24,
  defaultFadeInMs: 1500,
  defaultFadeOutMs: 2000,
};
