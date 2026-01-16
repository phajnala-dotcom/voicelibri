/**
 * VoiceLibri - Storage Service (Mobile-only)
 * Uses AsyncStorage per official Expo/Zustand documentation
 * 
 * References:
 * - https://docs.expo.dev/versions/latest/sdk/async-storage/
 * - https://zustand.docs.pmnd.rs/integrations/persisting-store-data
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

// Zustand storage adapter using createJSONStorage (official pattern)
export const zustandStorage = createJSONStorage(() => AsyncStorage);

// Legacy export name for backward compatibility
export const zustandMMKVStorage = zustandStorage;

// Storage utilities
export async function clearAllStorage(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const voiceLibriKeys = keys.filter(key => key.startsWith('voicelibri-'));
    await AsyncStorage.multiRemove(voiceLibriKeys);
    console.log(`✓ Cleared ${voiceLibriKeys.length} items from AsyncStorage`);
  } catch (e) {
    console.warn('clearAllStorage failed:', e);
  }
}

export async function getStorageSize(): Promise<{ keys: number; estimatedSize: string }> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const voiceLibriKeys = keys.filter(key => key.startsWith('voicelibri-'));
    return {
      keys: voiceLibriKeys.length,
      estimatedSize: 'N/A (AsyncStorage)',
    };
  } catch (e) {
    return { keys: 0, estimatedSize: '0 bytes' };
  }
}
