/**
 * MiniPlayer Component - Persistent bottom player bar
 * Shows when audio is playing, tappable to expand to full player
 */

import React from 'react';
import { View, Image, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  interpolate,
  useSharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { usePlayerStore } from '../../stores';
import { useTheme } from '../../theme/ThemeContext';
import { borderRadius, spacing } from '../../theme';
import Text from './Text';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MINI_PLAYER_HEIGHT = 64;

export default function MiniPlayer() {
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const {
    nowPlaying,
    isPlaying,
    showMiniPlayer,
    position,
    duration,
    setIsPlaying,
  } = usePlayerStore();
  
  const scale = useSharedValue(1);
  
  if (!showMiniPlayer || !nowPlaying) {
    return null;
  }
  
  const progress = duration > 0 ? (position / duration) * 100 : 0;
  
  const handlePress = () => {
    Haptics.selectionAsync();
    router.push('/player');
  };
  
  const handlePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsPlaying(!isPlaying);
    // TODO: Actually control track player
  };
  
  const handlePressIn = () => {
    scale.value = withSpring(0.98);
  };
  
  const handlePressOut = () => {
    scale.value = withSpring(1);
  };
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const styles = StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: 90, // Above tab bar
      left: spacing.md,
      right: spacing.md,
      height: MINI_PLAYER_HEIGHT,
      borderRadius: borderRadius.xl,
      overflow: 'hidden',
    },
    blur: {
      flex: 1,
    },
    content: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
    },
    cover: {
      width: 48,
      height: 48,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.cardElevated,
    },
    info: {
      flex: 1,
      marginLeft: spacing.sm,
      marginRight: spacing.sm,
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },
    author: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    playButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    progressBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: theme.colors.progressTrack,
    },
    progressFill: {
      height: '100%',
      backgroundColor: theme.colors.progressFill,
    },
  });
  
  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={styles.blur}>
        <Pressable
          style={styles.content}
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          {nowPlaying.coverUrl ? (
            <Image source={{ uri: nowPlaying.coverUrl }} style={styles.cover} />
          ) : (
            <View style={styles.cover} />
          )}
          
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>
              {nowPlaying.bookTitle}
            </Text>
            <Text style={styles.author} numberOfLines={1}>
              {nowPlaying.author}
            </Text>
          </View>
          
          <View style={styles.controls}>
            <Pressable
              style={styles.playButton}
              onPress={handlePlayPause}
              hitSlop={8}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={20}
                color="#fff"
              />
            </Pressable>
          </View>
          
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </Pressable>
      </BlurView>
    </Animated.View>
  );
}

export { MINI_PLAYER_HEIGHT };
