/**
 * BookList Component - Horizontal scrollable book list
 * Inspired by himanchau/react-native-book-app BookList.jsx
 */

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { CatalogBook } from '../../services/catalogService';
import { LibraryBook } from '../../stores/bookStore';
import { useTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme';
import BookCard from './BookCard';
import Text from './Text';

interface BookListProps {
  title: string;
  books: (CatalogBook | LibraryBook)[];
  showCount?: boolean;
  showProgress?: boolean;
  onSeeAll?: () => void;
  emptyMessage?: string;
}

export default function BookList({
  title,
  books,
  showCount = true,
  showProgress = false,
  onSeeAll,
  emptyMessage = 'No books yet',
}: BookListProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const scrollX = useSharedValue(0);
  
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });
  
  const handleBookPress = (book: CatalogBook | LibraryBook) => {
    router.push({
      pathname: '/book/[id]',
      params: { id: book.id },
    });
  };
  
  const styles = StyleSheet.create({
    container: {
      marginBottom: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    titleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    count: {
      color: theme.colors.textSecondary,
    },
    seeAll: {
      color: theme.colors.primary,
    },
    listContainer: {
      paddingHorizontal: spacing.md,
    },
    emptyContainer: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing['2xl'],
      alignItems: 'center',
    },
    emptyText: {
      color: theme.colors.textSecondary,
    },
  });
  
  if (books.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text size="lg" weight="semibold">{title}</Text>
          </View>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text size="lg" weight="semibold">{title}</Text>
          {showCount && (
            <Text size="sm" style={styles.count}>{books.length}</Text>
          )}
        </View>
        {onSeeAll && (
          <Pressable onPress={onSeeAll}>
            <Text size="sm" weight="medium" style={styles.seeAll}>
              See All
            </Text>
          </Pressable>
        )}
      </View>
      
      <Animated.FlatList
        horizontal
        data={books}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContainer}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <BookCard
            book={item}
            size="medium"
            onPress={() => handleBookPress(item)}
            showProgress={showProgress}
            progress={'progress' in item ? item.progress : 0}
          />
        )}
      />
    </View>
  );
}
