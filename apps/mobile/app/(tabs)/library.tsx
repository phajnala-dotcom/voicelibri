/**
 * Library Screen - User's book collection
 * Shows: Currently Listening, Completed, Wishlist
 * 
 * Architecture:
 * - Backend generates audiobooks and stores on server temporarily
 * - Mobile downloads generated audiobooks to device storage (sandboxed)
 * - Library displays locally stored audiobooks for offline playback
 */

import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBookStore } from '../../src/stores';
import { BookList, Text, Button, CreateAudiobookSheet } from '../../src/components/ui';
import type { CreateAudiobookSheetRef } from '../../src/components/ui/CreateAudiobookSheet';
import { useTheme } from '../../src/theme/ThemeContext';
import { spacing, borderRadius, colors } from '../../src/theme';
import { getAudiobooks, getAudiobook, deleteAudiobook } from '../../src/services/voiceLibriApi';
import { 
  getLocalAudiobooks, 
  downloadAudiobook, 
  loadAudiobookMetadata,
  type LocalAudiobook 
} from '../../src/services/audioStorageService';

export default function LibraryScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { library, addBook, removeFromLibrary } = useBookStore();
  const createSheetRef = useRef<CreateAudiobookSheetRef>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingBooks, setDownloadingBooks] = useState<Set<string>>(new Set());

  // Get locally stored audiobooks (on device)
  const [localAudiobooks, setLocalAudiobooks] = useState<LocalAudiobook[]>([]);
  
  // Load local audiobooks on mount
  useEffect(() => {
    const loadLocalBooks = () => {
      try {
        const books = getLocalAudiobooks();
        setLocalAudiobooks(books);
        console.log(`📚 Loaded ${books.length} local audiobooks from device storage`);
      } catch (error) {
        console.error('Failed to load local audiobooks:', error);
      }
    };
    loadLocalBooks();
  }, []);

  // Fetch audiobooks from backend (to check for new ones to download)
  const { data: backendAudiobooks, refetch } = useQuery({
    queryKey: ['audiobooks'],
    queryFn: getAudiobooks,
    refetchInterval: 30000, // Check every 30s for new audiobooks
  });

  // Sync: Download new backend audiobooks to device, remove stale library entries
  useEffect(() => {
    if (!backendAudiobooks) return;
    
    const syncAudiobooks = async () => {
      const localTitles = localAudiobooks.map(ab => ab.title);
      
      // Filter to only completed audiobooks - don't download while still generating
      const completedBooks = backendAudiobooks.filter(
        book => book.metadata?.generationStatus === 'completed'
      );
      
      // Find new completed audiobooks on backend that aren't downloaded yet
      for (const backendBook of completedBooks) {
        if (!localTitles.includes(backendBook.title) && !downloadingBooks.has(backendBook.title)) {
          console.log(`📥 Completed audiobook found on backend: ${backendBook.title}, starting download...`);
          
          // Mark as downloading
          setDownloadingBooks(prev => new Set(prev).add(backendBook.title));
          
          try {
            // Get chapter count from backend
            const bookDetails = await getAudiobook(backendBook.title);
            const totalChapters = bookDetails.chapters?.length || bookDetails.chapterCount || 1;
            
            // Download to device storage
            const localBook = await downloadAudiobook(
              backendBook.title,
              totalChapters,
              (progress) => {
                console.log(`📥 Download progress for ${backendBook.title}: ${progress.overallProgress}%`);
              }
            );
            
            // Update local audiobooks list
            setLocalAudiobooks(prev => [...prev, localBook]);
            
            // Add to library store
            addBook({
              id: backendBook.title,
              title: backendBook.metadata?.title || backendBook.title,
              authors: [backendBook.metadata?.author || 'Unknown Author'],
              status: 'listening',
              isGenerated: true,
              totalDuration: backendBook.metadata?.totalDuration || 0,
            });
            
            console.log(`✅ Downloaded audiobook to device: ${backendBook.title}`);
          } catch (error) {
            console.error(`❌ Failed to download ${backendBook.title}:`, error);
          } finally {
            setDownloadingBooks(prev => {
              const newSet = new Set(prev);
              newSet.delete(backendBook.title);
              return newSet;
            });
          }
        }
      }
      
      // Log books still generating
      const generatingBooks = backendAudiobooks.filter(
        book => book.metadata?.generationStatus === 'in-progress'
      );
      if (generatingBooks.length > 0) {
        console.log(`⏳ Books still generating: ${generatingBooks.map(b => b.title).join(', ')}`);
      }
      
      // Remove stale library entries (books not on device and not being downloaded)
      const localLibrary = useBookStore.getState().library;
      const localBookTitles = localAudiobooks.map(ab => ab.title);
      const backendTitles = backendAudiobooks.map(b => b.title);
      const staleBooks = localLibrary.filter(
        book => book.isGenerated && 
                !localBookTitles.includes(book.id) && 
                !downloadingBooks.has(book.id) &&
                !backendTitles.includes(book.id) // Don't remove if still on backend (might be generating)
      );
      
      staleBooks.forEach(book => {
        console.log(`🗑️ Removing stale book from library (not on device or backend): ${book.title}`);
        removeFromLibrary(book.id);
      });
    };
    
    syncAudiobooks();
  }, [backendAudiobooks, localAudiobooks, addBook, removeFromLibrary, downloadingBooks]);

  // Filter books by status
  const listeningBooks = useMemo(
    () => library.filter((book) => book.status === 'listening'),
    [library]
  );

  const completedBooks = useMemo(
    () => library.filter((book) => book.status === 'completed'),
    [library]
  );

  const wishlistBooks = useMemo(
    () => library.filter((book) => book.status === 'wishlist'),
    [library]
  );

  const handleExplore = () => {
    router.push('/(tabs)');
  };

  const handleCreateAudiobook = () => {
    createSheetRef.current?.open();
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Reload local audiobooks from device storage
    try {
      const books = getLocalAudiobooks();
      setLocalAudiobooks(books);
    } catch (error) {
      console.error('Failed to reload local audiobooks:', error);
    }
    // Also check backend for new audiobooks
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.text,
    },
    subtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginTop: 4,
    },
    content: {
      flex: 1,
    },
    section: {
      marginTop: spacing.lg,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing['2xl'],
      paddingVertical: spacing['4xl'],
    },
    emptyIcon: {
      marginBottom: spacing.lg,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.text,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
      lineHeight: 20,
    },
    statsContainer: {
      flexDirection: 'row',
      paddingHorizontal: spacing.md,
      marginTop: spacing.lg,
      gap: spacing.sm,
    },
    statCard: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      alignItems: 'center',
    },
    statNumber: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    statLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 4,
    },
    fab: {
      position: 'absolute',
      bottom: 100,
      right: spacing.lg,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary[500],
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
  });

  const isEmpty = library.length === 0;

  if (isEmpty) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>My Library</Text>
        </View>

        <View style={styles.emptyContainer}>
          <Ionicons
            name="library-outline"
            size={80}
            color={theme.colors.textMuted}
            style={styles.emptyIcon}
          />
          <Text style={styles.emptyTitle}>Your library is empty</Text>
          <Text style={styles.emptyText}>
            Explore our catalog of classic literature and{'\n'}
            generate AI-powered audiobooks with{'\n'}
            multi-voice dramatization.
          </Text>
          <Button
            title="Explore Catalog"
            onPress={handleExplore}
            icon={<Ionicons name="compass-outline" size={20} color="#fff" />}
          />
          <View style={{ height: spacing.md }} />
          <Button
            title="Create Audiobook"
            variant="outline"
            onPress={handleCreateAudiobook}
            icon={<Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />}
          />
        </View>

        <CreateAudiobookSheet ref={createSheetRef} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          <Text style={styles.title}>My Library</Text>
          <Text style={styles.subtitle}>
            {library.length} {library.length === 1 ? 'book' : 'books'} in your collection
          </Text>
        </Animated.View>

        {/* Stats */}
        <Animated.View entering={FadeInDown.delay(150)} style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{listeningBooks.length}</Text>
            <Text style={styles.statLabel}>Listening</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{completedBooks.length}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{wishlistBooks.length}</Text>
            <Text style={styles.statLabel}>Wishlist</Text>
          </View>
        </Animated.View>

        {/* Currently Listening */}
        {listeningBooks.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
            <BookList
              title="Continue Listening"
              books={listeningBooks}
              showProgress
              showCount={false}
              nestedInScrollView
            />
          </Animated.View>
        )}

        {/* Completed */}
        {completedBooks.length > 0 && (
          <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
            <BookList
              title="Completed"
              books={completedBooks}
              showCount
              nestedInScrollView
            />
          </Animated.View>
        )}

        {/* Wishlist */}
        {wishlistBooks.length > 0 && (
          <Animated.View entering={FadeInDown.delay(400)} style={styles.section}>
            <BookList
              title="Wishlist"
              books={wishlistBooks}
              emptyMessage="Add books to your wishlist"
              nestedInScrollView
            />
          </Animated.View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 150 }} />
      </ScrollView>

      {/* FAB for Create Audiobook */}
      <Pressable style={styles.fab} onPress={handleCreateAudiobook}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <CreateAudiobookSheet ref={createSheetRef} />
    </SafeAreaView>
  );
}
