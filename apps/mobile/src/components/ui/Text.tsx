/**
 * Text Component with theme support
 */

import React from 'react';
import { Text as RNText, TextProps, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';
import { typography } from '../../theme';

interface CustomTextProps extends TextProps {
  size?: keyof typeof typography | number;
  weight?: 'light' | 'normal' | 'medium' | 'semibold' | 'bold';
  color?: string;
  center?: boolean;
  animated?: boolean;
}

export default function Text({
  children,
  style,
  size = 'base',
  weight = 'normal',
  color,
  center,
  animated,
  ...props
}: CustomTextProps) {
  const { theme } = useTheme();
  
  const fontSize = typeof size === 'number' ? size : typography[size];
  const fontWeight = typography[weight];
  
  const textStyle = StyleSheet.flatten([
    {
      fontSize,
      fontWeight,
      color: color || theme.colors.text,
      textAlign: center ? 'center' : undefined,
    },
    style,
  ]);
  
  if (animated) {
    return (
      <Animated.Text style={textStyle} {...props}>
        {children}
      </Animated.Text>
    );
  }
  
  return (
    <RNText style={textStyle} {...props}>
      {children}
    </RNText>
  );
}
