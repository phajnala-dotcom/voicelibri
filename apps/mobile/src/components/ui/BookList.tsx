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
import { getDownloadedChapters, getDownloadedSubChunks } from '../../services/audioStorageService';
import { playChapter } from '../../services/audioService';

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
    // Check if this is a generated audiobook
    const isLibraryBook = 'isGenerated' in book;
    const isGeneratedAudiobook = isLibraryBook && (book as LibraryBook).isGenerated;
    const isGeneratingAudiobook = isLibraryBook && (book as LibraryBook).isGenerating;
    
    // DEBUG: Trace audiobook detection
    console.log('📚 [BookList.handleBookPress] Book pressed:', {
      id: book.id,
      title: book.title,
      isLibraryBook,
      isGeneratedAudiobook,
      isGeneratingAudiobook,
      isGeneratedFlag: isLibraryBook ? (book as LibraryBook).isGenerated : 'N/A',
    });
    
    if (isGeneratedAudiobook || isGeneratingAudiobook) {
      // For generated audiobooks, check if we have local files
      const libBook = book as LibraryBook;
      const downloadedChapters = getDownloadedChapters(book.id);
      const firstChapterIndex = libBook.chapters?.[0]?.index ?? 1;
      const downloadedSubChunks = getDownloadedSubChunks(book.id, firstChapterIndex);
      console.log('📚 [BookList.handleBookPress] Downloaded chapters:', downloadedChapters);
      console.log('📚 [BookList.handleBookPress] Downloaded subchunks (chapter 0):', downloadedSubChunks);
      
      // Get chapters from book or create default
      const bookChapters = libBook.chapters || [{ id: 'ch-0', title: 'Full Text', index: 1, duration: 0, url: '' }];
      
      // Prepare now playing data
      const nowPlayingData = {
        bookId: book.id,
        bookTitle: book.id,
        author: 'authors' in book ? (book as CatalogBook).authors?.join(', ') || 'Unknown' : libBook.authors?.join(', ') || 'Unknown',
        coverUrl: book.coverUrl || null,
        chapters: bookChapters,
        totalDuration: libBook.totalDuration || 0,
      };
      
      if (downloadedChapters.length > 0) {
        // Play from local storage
        console.log(`🎵 Playing from LOCAL storage: ${book.title}`);
        
        setNowPlaying(nowPlayingData);
        setShowMiniPlayer(true);
        
        try {
          await playChapter(book.id, bookChapters[0], 0);
          router.push('/player');
        } catch (error) {
          console.error('Failed to start local playback:', error);
          router.push({ pathname: '/book/[id]', params: { id: book.id } });
        }
        return;
      }

      // No local chapter yet - start progressive playback from local subchunks
      console.log(`🎵 Starting progressive playback (local subchunks): ${book.title}`);
      
      setNowPlaying(nowPlayingData);
      setShowMiniPlayer(true);
      router.push('/player');
      
      try {
        await playChapter(book.id, bookChapters[0], 0);
        console.log('✅ Progressive playback started!');
      } catch (error) {
        console.log('⏳ Playback will start when audio is ready:', error);
      }
      return;
    }
    
    // For catalog books or non-generated audiobooks, go to book details
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
          {books.map((item, index) => {
            const isGenerating = 'isGenerating' in item && (item as LibraryBook).isGenerating;
            return (
              <BookCard
                key={item.id ? `${item.id}-${index}` : `book-${index}`}
                book={item}
                size="medium"
                onPress={() => handleBookPress(item)}
                showProgress={showProgress}
                progress={'progress' in item ? item.progress : 0}
                isGenerating={isGenerating}
              />
            );
          })}
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
          renderItem={({ item }) => {
            const isGenerating = 'isGenerating' in item && (item as LibraryBook).isGenerating;
            return (
              <BookCard
                book={item}
                size="medium"
                onPress={() => handleBookPress(item)}
                showProgress={showProgress}
                progress={'progress' in item ? item.progress : 0}
                isGenerating={isGenerating}
              />
            );
          }}
        />
      )}
    </View>
  );
}
