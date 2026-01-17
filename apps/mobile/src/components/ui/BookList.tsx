/**
 * BookList Component - Horizontal scrollable book list
 * Inspired by himanchau/react-native-book-app BookList.jsx
 */

import React from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { CatalogBook } from '../../services/catalogService';
import { LibraryBook } from '../../stores/bookStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme';
import BookCard from './BookCard';
import Text from './Text';
import { getDownloadedChapters } from '../../services/audioStorageService';
import { playFromLocalStorage } from '../../services/audioService';

interface BookListProps {
  title: string;
  books: (CatalogBook | LibraryBook)[];
  showCount?: boolean;
  showProgress?: boolean;
  onSeeAll?: () => void;
  emptyMessage?: string;
  /** Set to true when used inside a ScrollView to avoid nesting warnings */
  nestedInScrollView?: boolean;
}

export default function BookList({
  title,
  books,
  showCount = true,
  showProgress = false,
  onSeeAll,
  emptyMessage = 'No books yet',
  nestedInScrollView = false,
}: BookListProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const scrollX = useSharedValue(0);
  
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const { setNowPlaying, setShowMiniPlayer } = usePlayerStore();
  
  const handleBookPress = async (book: CatalogBook | LibraryBook) => {
    // Check if this is a generated audiobook with downloaded chapters
    const isLibraryBook = 'isGenerated' in book;
    const isGeneratedAudiobook = isLibraryBook && (book as LibraryBook).isGenerated;
    
    if (isGeneratedAudiobook) {
      // For generated audiobooks, check if we have local files and play directly
      const downloadedChapters = getDownloadedChapters(book.id);
      
      if (downloadedChapters.length > 0) {
        console.log(`🎵 Playing generated audiobook: ${book.title}`);
        
        // Set up now playing
        const chaptersForPlayer = downloadedChapters.map((idx) => ({
          id: `ch-${idx}`,
          title: `Chapter ${idx + 1}`,
          index: idx,
          duration: 0,
          url: '',
        }));
        
        setNowPlaying({
          bookId: book.id,
          bookTitle: book.title,
          author: 'authors' in book ? (book as CatalogBook).authors?.join(', ') || 'Unknown' : (book as LibraryBook).authors?.join(', ') || 'Unknown',
          coverUrl: book.coverUrl || null,
          chapters: chaptersForPlayer,
          totalDuration: 'totalDuration' in book ? (book as LibraryBook).totalDuration || 0 : 0,
        });
        setShowMiniPlayer(true);
        
        // Start playback from local storage
        try {
          await playFromLocalStorage(book.id, downloadedChapters[0]);
          router.push('/player');
        } catch (error) {
          console.error('Failed to start playback:', error);
          // Fall back to book details page
          router.push({
            pathname: '/book/[id]',
            params: { id: book.id },
          });
        }
        return;
      }
    }
    
    // For catalog books or audiobooks without local files, go to book details
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
      
      {/* Per React Native docs: When nested in ScrollView, use regular horizontal ScrollView 
          instead of FlatList to avoid VirtualizedList nesting warning */}
      {nestedInScrollView ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
        >
          {books.map((item, index) => (
            <BookCard
              key={item.id ? `${item.id}-${index}` : `book-${index}`}
              book={item}
              size="medium"
              onPress={() => handleBookPress(item)}
              showProgress={showProgress}
              progress={'progress' in item ? item.progress : 0}
            />
          ))}
        </ScrollView>
      ) : (
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
      )}
    </View>
  );
}
