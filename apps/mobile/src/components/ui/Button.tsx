/**
 * Button Component
 */

import React from 'react';
import { Pressable, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { borderRadius, spacing, colors } from '../../theme';
import Text from './Text';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  icon,
  style,
}: ButtonProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  
  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(0.97, { damping: 15 });
    }
  };
  
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };
  
  const handlePress = () => {
    if (!disabled && !loading) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress?.();
    }
  };
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const sizeStyles = {
    small: { height: 36, paddingHorizontal: 12, fontSize: 14 },
    medium: { height: 44, paddingHorizontal: 16, fontSize: 16 },
    large: { height: 52, paddingHorizontal: 24, fontSize: 18 },
  };
  
  const variantStyles = {
    primary: {
      backgroundColor: disabled ? colors.gray[400] : colors.primary[500],
      borderWidth: 0,
      textColor: '#ffffff',
    },
    secondary: {
      backgroundColor: theme.colors.cardElevated,
      borderWidth: 0,
      textColor: theme.colors.text,
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
      textColor: theme.colors.primary,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      textColor: theme.colors.primary,
    },
  };
  
  const currentSize = sizeStyles[size];
  const currentVariant = variantStyles[variant];
  
  const styles = StyleSheet.create({
    button: {
      height: currentSize.height,
      paddingHorizontal: currentSize.paddingHorizontal,
      backgroundColor: currentVariant.backgroundColor,
      borderRadius: borderRadius.full,
      borderWidth: currentVariant.borderWidth,
      borderColor: currentVariant.borderColor,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      opacity: disabled ? 0.6 : 1,
    },
    text: {
      fontSize: currentSize.fontSize,
      fontWeight: '600',
      color: currentVariant.textColor,
    },
  });
  
  return (
    <AnimatedPressable
      style={[styles.button, animatedStyle, style]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={currentVariant.textColor} />
      ) : (
        <>
          {icon}
          <Text style={styles.text}>{title}</Text>
        </>
      )}
    </AnimatedPressable>
  );
}
