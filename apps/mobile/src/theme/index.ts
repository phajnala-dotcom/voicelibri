/**
 * VoiceLibri Theme Configuration
 * Premium AI-tech aesthetic with minimalistic, emotionally positive feel
 */

export const colors = {
  // Primary brand colors
  primary: {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1', // Main brand color
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
  },
  
  // Accent colors
  accent: {
    purple: '#8b5cf6',
    pink: '#ec4899',
    cyan: '#06b6d4',
    emerald: '#10b981',
  },
  
  // Neutral grays
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#030712',
  },
  
  // Semantic colors
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
};

export const lightTheme = {
  dark: false,
  colors: {
    primary: colors.primary[500],
    background: colors.gray[50],
    card: '#ffffff',
    cardElevated: '#ffffff',
    text: colors.gray[900],
    textSecondary: colors.gray[500],
    textMuted: colors.gray[400],
    border: colors.gray[200],
    notification: colors.primary[500],
    
    // Player
    playerBackground: '#ffffff',
    playerControls: colors.gray[900],
    progressTrack: colors.gray[200],
    progressFill: colors.primary[500],
    
    // Semantic
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    
    // Status bar
    statusBar: 'dark-content' as const,
  },
};

export const darkTheme = {
  dark: true,
  colors: {
    primary: colors.primary[400],
    background: colors.gray[950],
    card: colors.gray[900],
    cardElevated: colors.gray[800],
    text: colors.gray[50],
    textSecondary: colors.gray[400],
    textMuted: colors.gray[500],
    border: colors.gray[800],
    notification: colors.primary[400],
    
    // Player
    playerBackground: colors.gray[900],
    playerControls: colors.gray[50],
    progressTrack: colors.gray[700],
    progressFill: colors.primary[400],
    
    // Semantic
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    
    // Status bar
    statusBar: 'light-content' as const,
  },
};

export type Theme = typeof lightTheme;

// Spacing scale
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
  '4xl': 80,
};

// Border radius
export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
};

// Typography
export const typography = {
  // Font sizes
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  
  // Font weights (as string for React Native)
  light: '300' as const,
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

// Shadows
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 6,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 25,
    elevation: 10,
  },
};

// Animation durations
export const animation = {
  fast: 150,
  normal: 300,
  slow: 500,
};

export default {
  colors,
  lightTheme,
  darkTheme,
  spacing,
  borderRadius,
  typography,
  shadows,
  animation,
};
