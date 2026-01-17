/**
 * Text Component with theme support
 */

import React from 'react';
import { Text as RNText, TextProps, StyleSheet, TextStyle } from 'react-native';
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
  
  // Get font size - ensure it's a number
  const fontSize = typeof size === 'number' ? size : (
    typeof typography[size] === 'number' ? typography[size] : 16
  );
  
  // Get font weight - typography stores weights as string literals
  const fontWeight = typography[weight] as TextStyle['fontWeight'];
  
  const textStyle: TextStyle = StyleSheet.flatten([
    {
      fontSize: fontSize as number,
      fontWeight,
      color: color || theme.colors.text,
      textAlign: center ? 'center' : undefined,
    },
    style as TextStyle,
  ]) as TextStyle;
  
  if (animated) {
    return (
      <Animated.Text style={textStyle as any} {...props}>
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
