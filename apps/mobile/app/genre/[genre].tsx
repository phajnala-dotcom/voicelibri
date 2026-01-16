/**
 * Genre Screen - Books filtered by genre
 */

import React from 'react';
import { View, FlatList, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getBooksByGenre, GENRES } from '../../src/services/catalogService';
import { BookCard, Text } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeContext';
import { spacing, borderRadius } from '../../src/theme';

export default function GenreScreen() {
  const { genre, name } = useLocalSearchParams<{ genre: string; name: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  
  const genreInfo = GENRES.find((g) => g.id === genre);
  
  const { data: genreData, isLoading, error } = useQuery({
    queryKey: ['genreBooks', genre],
    queryFn: () => getBooksByGenre(genre!),
    enabled: !!genre,
  });
  const books = genreData?.books || [];
  
  const handleBack = () => {
    Haptics.selectionAsync();
    router.back();
  };
  
  const handleBookPress = (bookId: string) => {
    router.push({
      pathname: '/book/[id]',
      params: { id: bookId },
    });
  };
  
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerContent: {
      flex: 1,
      marginLeft: spacing.sm,
    },
    headerIcon: {
      fontSize: 24,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text,
    },
    subtitle: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    listContainer: {
      padding: spacing.md,
    },
    row: {
      justifyContent: 'space-between',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
  });
  
  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {genreInfo && <Text style={styles.headerIcon}>{genreInfo.icon}</Text>}
            <Text style={styles.title}>{name || genre}</Text>
          </View>
          {books && (
            <Text style={styles.subtitle}>
              {books.length} {books.length === 1 ? 'book' : 'books'}
            </Text>
          )}
        </View>
      </View>
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Text color={theme.colors.textSecondary}>Loading books...</Text>
        </View>
      ) : books && books.length > 0 ? (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.listContainer}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 50)}>
              <BookCard
                book={item}
                size="small"
                onPress={() => handleBookPress(item.id)}
              />
            </Animated.View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="book-outline" size={60} color={theme.colors.textMuted} />
          <Text size="lg" color={theme.colors.textSecondary} center style={{ marginTop: spacing.md }}>
            No books found in this genre
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
