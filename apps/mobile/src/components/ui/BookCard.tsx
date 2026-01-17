/**
 * BookCard Component
 * Animated book cover card with shadow and 3D effect
 * Inspired by himanchau/react-native-book-app Book.jsx
 */

import React, { useEffect } from 'react';
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CatalogBook } from '../../services/catalogService';
import { useTheme } from '../../theme/ThemeContext';
import { shadows, borderRadius, colors } from '../../theme';
import Text from './Text';

// Default cover image
const DEFAULT_COVER = require('../../../assets/default-cover.png');

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface BookCardProps {
  book: CatalogBook;
  size?: 'small' | 'medium' | 'large';
  onPress?: () => void;
  onLongPress?: () => void;
  showAuthor?: boolean;
  showProgress?: boolean;
  progress?: number;
  isGenerating?: boolean;
}

const SIZES = {
  small: { width: 100, height: 150 },
  medium: { width: 120, height: 180 },
  large: { width: 160, height: 240 },
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function BookCard({
  book,
  size = 'medium',
  onPress,
  onLongPress,
  showAuthor = true,
  showProgress = false,
  progress = 0,
  isGenerating = false,
}: BookCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.3);
  const dimensions = SIZES[size];
  
  // Pulse animation for generating state
  useEffect(() => {
    if (isGenerating) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 800 }),
          withTiming(0.3, { duration: 800 })
        ),
        -1, // Infinite
        false
      );
    } else {
      pulseOpacity.value = 0.3;
    }
  }, [isGenerating]);
  
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));
  
  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15 });
  };
  
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };
  
  const handlePress = () => {
    Haptics.selectionAsync();
    onPress?.();
  };
  
  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress?.();
  };
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { perspective: 1000 },
      { rotateY: '-15deg' },
    ],
  }));
  
  const styles = StyleSheet.create({
    container: {
      marginRight: 16,
    },
    imageContainer: {
      width: dimensions.width,
      height: dimensions.height,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.card,
      overflow: 'hidden',
      ...shadows.lg,
      shadowColor: '#000',
      shadowOffset: { width: 8, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 10,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    placeholder: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.colors.cardElevated,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
    },
    placeholderText: {
      textAlign: 'center',
      color: theme.colors.textSecondary,
      fontSize: 12,
    },
    titleContainer: {
      width: dimensions.width,
      marginTop: 8,
    },
    title: {
      fontSize: size === 'small' ? 12 : 13,
      fontWeight: '500',
      color: theme.colors.text,
    },
    author: {
      fontSize: size === 'small' ? 10 : 11,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    progressBar: {
      height: 3,
      backgroundColor: theme.colors.progressTrack,
      borderRadius: 2,
      marginTop: 6,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: theme.colors.progressFill,
      borderRadius: 2,
    },
    generatingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.primary[500],
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.lg,
    },
    generatingText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '600',
      marginTop: 4,
      textAlign: 'center',
    },
    defaultCover: {
      width: '70%',
      height: '70%',
      opacity: 0.8,
    },
  });
  
  return (
    <AnimatedPressable
      style={[styles.container, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      onLongPress={handleLongPress}
    >
      <View style={styles.imageContainer}>
        {book.coverUrl ? (
          <Image
            source={{ uri: book.coverUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholder}>
            <Image
              source={DEFAULT_COVER}
              style={styles.defaultCover}
              resizeMode="contain"
            />
          </View>
        )}
        
        {/* Generation indicator overlay */}
        {isGenerating && (
          <Animated.View style={[styles.generatingOverlay, pulseStyle]}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.generatingText}>Creating...</Text>
          </Animated.View>
        )}
      </View>
      
      {showAuthor && (
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {book.title}
          </Text>
          {book.authors && book.authors.length > 0 && (
            <Text style={styles.author} numberOfLines={1}>
              {book.authors[0]}
            </Text>
          )}
          {showProgress && progress > 0 && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          )}
        </View>
      )}
    </AnimatedPressable>
  );
}
