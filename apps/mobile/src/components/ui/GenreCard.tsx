/**
 * GenreCard Component - For genre/topic selection
 */

import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Genre } from '../../services/catalogService';
import { useTheme } from '../../theme/ThemeContext';
import { borderRadius } from '../../theme';
import Text from './Text';

interface GenreCardProps {
  genre: Genre;
  onPress?: () => void;
  size?: 'small' | 'medium';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function GenreCard({ genre, onPress, size = 'medium' }: GenreCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  
  const dimensions = size === 'small' 
    ? { width: 100, height: 60 }
    : { width: 140, height: 80 };
  
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
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  // Create gradient from genre color
  const gradientColors = [
    genre.color,
    `${genre.color}99`, // Add transparency
  ];
  
  const styles = StyleSheet.create({
    container: {
      width: dimensions.width,
      height: dimensions.height,
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
      marginRight: 12,
    },
    gradient: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
    },
    icon: {
      fontSize: size === 'small' ? 20 : 24,
      marginBottom: 4,
    },
    name: {
      color: '#ffffff',
      fontWeight: '600',
      fontSize: size === 'small' ? 12 : 14,
      textAlign: 'center',
    },
  });
  
  return (
    <AnimatedPressable
      style={[styles.container, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
    >
      <LinearGradient
        colors={gradientColors as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Text style={styles.icon}>{genre.icon}</Text>
        <Text style={styles.name}>{genre.name}</Text>
      </LinearGradient>
    </AnimatedPressable>
  );
}
