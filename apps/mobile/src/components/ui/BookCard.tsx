/**
 * BookCard Component
 * Animated book cover card with shadow and 3D effect
 * Inspired by himanchau/react-native-book-app Book.jsx
 */

import React from 'react';
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CatalogBook } from '../../services/catalogService';
import { useTheme } from '../../theme/ThemeContext';
import { shadows, borderRadius } from '../../theme';
import Text from './Text';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface BookCardProps {
  book: CatalogBook;
  size?: 'small' | 'medium' | 'large';
  onPress?: () => void;
  onLongPress?: () => void;
  showAuthor?: boolean;
  showProgress?: boolean;
  progress?: number;
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
}: BookCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const dimensions = SIZES[size];
  
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
    transform: [{ scale: scale.value }],
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
            <Text style={styles.placeholderText} numberOfLines={3}>
              {book.title}
            </Text>
          </View>
        )}
      </View>
      
      {showAuthor && (
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {book.title}
          </Text>
          {book.authors.length > 0 && (
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
