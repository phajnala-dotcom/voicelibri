/**
 * SearchBar Component
 */

import React from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { borderRadius, spacing } from '../../theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

export default function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search books...',
  onFocus,
  onBlur,
  onSubmit,
  autoFocus = false,
}: SearchBarProps) {
  const { theme } = useTheme();
  
  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.md,
      height: 44,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    icon: {
      marginRight: spacing.sm,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: theme.colors.text,
    },
    clearButton: {
      padding: 4,
    },
  });
  
  return (
    <View style={styles.container}>
      <Ionicons
        name="search"
        size={20}
        color={theme.colors.textSecondary}
        style={styles.icon}
      />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        onFocus={onFocus}
        onBlur={onBlur}
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <Pressable
          style={styles.clearButton}
          onPress={() => onChangeText('')}
          hitSlop={8}
        >
          <Ionicons
            name="close-circle"
            size={20}
            color={theme.colors.textSecondary}
          />
        </Pressable>
      )}
    </View>
  );
}
