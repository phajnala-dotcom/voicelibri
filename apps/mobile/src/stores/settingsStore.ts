/**
 * Settings Store - App preferences and settings
 * Using Zustand persist with AsyncStorage per official docs
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface SettingsState {
  // Appearance
  themeMode: ThemeMode;
  
  // Playback defaults
  defaultPlaybackRate: number;
  autoPlayNext: boolean;
  skipSilence: boolean;
  
  // Audio generation
  defaultNarrator: string;
  defaultLanguage: string;
  
  // Notifications
  notificationsEnabled: boolean;
  downloadOverWifiOnly: boolean;
  
  // Actions
  setThemeMode: (mode: ThemeMode) => void;
  setDefaultPlaybackRate: (rate: number) => void;
  setAutoPlayNext: (enabled: boolean) => void;
  setSkipSilence: (enabled: boolean) => void;
  setDefaultNarrator: (narrator: string) => void;
  setDefaultLanguage: (language: string) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setDownloadOverWifiOnly: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      defaultPlaybackRate: 1.0,
      autoPlayNext: true,
      skipSilence: false,
      defaultNarrator: 'Algieba',
      defaultLanguage: 'en',
      notificationsEnabled: true,
      downloadOverWifiOnly: true,
      
      setThemeMode: (mode) => set({ themeMode: mode }),
      setDefaultPlaybackRate: (rate) => set({ defaultPlaybackRate: rate }),
      setAutoPlayNext: (enabled) => set({ autoPlayNext: enabled }),
      setSkipSilence: (enabled) => set({ skipSilence: enabled }),
      setDefaultNarrator: (narrator) => set({ defaultNarrator: narrator }),
      setDefaultLanguage: (language) => set({ defaultLanguage: language }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      setDownloadOverWifiOnly: (enabled) => set({ downloadOverWifiOnly: enabled }),
    }),
    {
      name: 'voicelibri-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
