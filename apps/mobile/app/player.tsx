/**
 * Full Player Screen
 * Immersive audio player with controls and chapter navigation
 * Integrates with expo-audio via audioService
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  Pressable,
  ScrollView,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Slider from '@react-native-community/slider';
import { usePlayerStore, useSettingsStore } from '../src/stores';
import { Text, Button } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeContext';
import { spacing, borderRadius, colors } from '../src/theme';
import {
  togglePlayPause,
  seekTo,
  skipForward as audioSkipForward,
  skipBackward as audioSkipBackward,
  nextChapter as audioNextChapter,
  previousChapter as audioPreviousChapter,
  setPlaybackRate as audioSetPlaybackRate,
} from '../src/services/audioService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const COVER_SIZE = SCREEN_WIDTH * 0.7;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function PlayerScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const {
    nowPlaying,
    currentChapterIndex,
    position,
    duration,
    isPlaying,
    playbackRate,
    setIsPlaying,
    setPosition,
    setPlaybackRate,
    skipForward,
    skipBackward,
    nextChapter,
    previousChapter,
  } = usePlayerStore();
  const { defaultPlaybackRate } = useSettingsStore();
  
  const [showChapters, setShowChapters] = useState(false);
  const [localPosition, setLocalPosition] = useState(position);
  const [isSeeking, setIsSeeking] = useState(false);
  
  const playButtonScale = useSharedValue(1);
  const coverRotation = useSharedValue(0);
  
  useEffect(() => {
    if (!isSeeking) {
      setLocalPosition(position);
    }
  }, [position, isSeeking]);
  
  // Subtle cover animation when playing
  useEffect(() => {
    if (isPlaying) {
      coverRotation.value = withRepeat(
        withTiming(360, { duration: 30000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      coverRotation.value = withTiming(0, { duration: 500 });
    }
  }, [isPlaying]);
  
  const handleBack = () => {
    Haptics.selectionAsync();
    router.back();
  };
  
  const handlePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playButtonScale.value = withSpring(0.9, {}, () => {
      playButtonScale.value = withSpring(1);
    });
    // Toggle playback via audio service
    togglePlayPause();
  };
  
  const handleSkipForward = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    audioSkipForward(30);
  };
  
  const handleSkipBackward = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    audioSkipBackward(15);
  };
  
  const handleNextChapter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    audioNextChapter();
  };
  
  const handlePreviousChapter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    audioPreviousChapter();
  };
  
  const handleSeekStart = () => {
    setIsSeeking(true);
  };
  
  const handleSeekEnd = (value: number) => {
    setIsSeeking(false);
    setPosition(value);
    seekTo(value);
  };
  
  const handlePlaybackRateCycle = () => {
    Haptics.selectionAsync();
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    const newRate = rates[nextIndex];
    setPlaybackRate(newRate);
    audioSetPlaybackRate(newRate);
  };
  
  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playButtonScale.value }],
  }));
  
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    backgroundImage: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 0.15,
    },
    gradient: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    headerButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitleText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    content: {
      flex: 1,
      justifyContent: 'space-between',
      paddingBottom: spacing.xl,
    },
    coverContainer: {
      alignItems: 'center',
      marginTop: spacing.xl,
    },
    cover: {
      width: COVER_SIZE,
      height: COVER_SIZE,
      borderRadius: borderRadius.xl,
      backgroundColor: theme.colors.cardElevated,
    },
    coverPlaceholder: {
      width: COVER_SIZE,
      height: COVER_SIZE,
      borderRadius: borderRadius.xl,
      backgroundColor: theme.colors.cardElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoContainer: {
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      marginTop: spacing.xl,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
    },
    author: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      marginTop: spacing.xs,
    },
    chapterInfo: {
      fontSize: 14,
      color: theme.colors.primary,
      marginTop: spacing.sm,
    },
    sliderContainer: {
      paddingHorizontal: spacing.lg,
      marginTop: spacing.xl,
    },
    slider: {
      width: '100%',
      height: 40,
    },
    timeContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: -spacing.sm,
    },
    timeText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    controlsContainer: {
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    mainControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
    },
    controlButton: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
    },
    skipButton: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    skipLabel: {
      fontSize: 10,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    playButton: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryControls: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      marginTop: spacing.xl,
    },
    speedButton: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.card,
    },
    speedText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
  });
  
  if (!nowPlaying) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <Pressable style={styles.headerButton} onPress={handleBack}>
            <Ionicons name="chevron-down" size={28} color={theme.colors.text} />
          </Pressable>
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="musical-notes-outline" size={60} color={theme.colors.textMuted} />
          <Text size="lg" color={theme.colors.textSecondary} center style={{ marginTop: spacing.md }}>
            No audiobook playing
          </Text>
          <Button
            title="Browse Library"
            variant="outline"
            onPress={handleBack}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      </SafeAreaView>
    );
  }
  
  const currentChapter = nowPlaying.chapters[currentChapterIndex];
  const progress = duration > 0 ? (localPosition / duration) * 100 : 0;
  
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Background */}
      {nowPlaying.coverUrl && (
        <Image
          source={{ uri: nowPlaying.coverUrl }}
          style={styles.backgroundImage}
          blurRadius={50}
        />
      )}
      <LinearGradient
        colors={[
          isDark ? 'rgba(15,23,42,0.5)' : 'rgba(255,255,255,0.7)',
          theme.colors.background,
        ]}
        style={styles.gradient}
      />
      
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <Animated.View entering={FadeIn} style={styles.header}>
          <Pressable style={styles.headerButton} onPress={handleBack}>
            <Ionicons name="chevron-down" size={28} color={theme.colors.text} />
          </Pressable>
          <View style={styles.headerTitle}>
            <Text style={styles.headerTitleText}>Now Playing</Text>
          </View>
          <Pressable style={styles.headerButton} onPress={() => setShowChapters(true)}>
            <Ionicons name="list" size={24} color={theme.colors.text} />
          </Pressable>
        </Animated.View>
        
        <View style={styles.content}>
          {/* Cover */}
          <Animated.View entering={FadeInDown.delay(100)} style={styles.coverContainer}>
            {nowPlaying.coverUrl ? (
              <Image source={{ uri: nowPlaying.coverUrl }} style={styles.cover} />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="book" size={80} color={theme.colors.textMuted} />
              </View>
            )}
          </Animated.View>
          
          {/* Info */}
          <Animated.View entering={FadeInDown.delay(200)} style={styles.infoContainer}>
            <Text style={styles.title} numberOfLines={2}>
              {nowPlaying.bookTitle}
            </Text>
            <Text style={styles.author}>{nowPlaying.author}</Text>
            {currentChapter && (
              <Text style={styles.chapterInfo}>
                Chapter {currentChapterIndex + 1}: {currentChapter.title}
              </Text>
            )}
          </Animated.View>
          
          {/* Progress Slider */}
          <Animated.View entering={FadeInDown.delay(300)} style={styles.sliderContainer}>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={duration || 100}
              value={localPosition}
              onValueChange={setLocalPosition}
              onSlidingStart={handleSeekStart}
              onSlidingComplete={handleSeekEnd}
              minimumTrackTintColor={theme.colors.primary}
              maximumTrackTintColor={theme.colors.progressTrack}
              thumbTintColor={theme.colors.primary}
            />
            <View style={styles.timeContainer}>
              <Text style={styles.timeText}>{formatTime(localPosition)}</Text>
              <Text style={styles.timeText}>-{formatTime(duration - localPosition)}</Text>
            </View>
          </Animated.View>
          
          {/* Controls */}
          <Animated.View entering={FadeInDown.delay(400)} style={styles.controlsContainer}>
            <View style={styles.mainControls}>
              {/* Previous Chapter */}
              <Pressable style={styles.controlButton} onPress={handlePreviousChapter}>
                <Ionicons name="play-skip-back" size={28} color={theme.colors.text} />
              </Pressable>
              
              {/* Skip Back */}
              <Pressable style={styles.skipButton} onPress={handleSkipBackward}>
                <Ionicons name="play-back" size={32} color={theme.colors.text} />
                <Text style={styles.skipLabel}>30s</Text>
              </Pressable>
              
              {/* Play/Pause */}
              <Animated.View style={playButtonStyle}>
                <Pressable style={styles.playButton} onPress={handlePlayPause}>
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={36}
                    color="#fff"
                    style={!isPlaying ? { marginLeft: 4 } : {}}
                  />
                </Pressable>
              </Animated.View>
              
              {/* Skip Forward */}
              <Pressable style={styles.skipButton} onPress={handleSkipForward}>
                <Ionicons name="play-forward" size={32} color={theme.colors.text} />
                <Text style={styles.skipLabel}>30s</Text>
              </Pressable>
              
              {/* Next Chapter */}
              <Pressable style={styles.controlButton} onPress={handleNextChapter}>
                <Ionicons name="play-skip-forward" size={28} color={theme.colors.text} />
              </Pressable>
            </View>
            
            {/* Secondary Controls */}
            <View style={styles.secondaryControls}>
              <Pressable style={styles.speedButton} onPress={handlePlaybackRateCycle}>
                <Text style={styles.speedText}>{playbackRate}x</Text>
              </Pressable>
              
              <Pressable style={styles.controlButton}>
                <Ionicons name="moon-outline" size={24} color={theme.colors.text} />
              </Pressable>
              
              <Pressable style={styles.controlButton}>
                <Ionicons name="bookmark-outline" size={24} color={theme.colors.text} />
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}
