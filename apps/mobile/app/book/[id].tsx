/**
 * Book Details Screen
 * Shows book info, cover, and "Generate Audiobook" button
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  Image,
  StyleSheet,
  Dimensions,
  Pressable,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeIn,
  useAnimatedStyle,
  interpolate,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { getBookDetails, CatalogBook } from '../../src/services/catalogService';
import { createFromUrl } from '../../src/services/voiceLibriApi';
import { useBookStore, usePlayerStore, LibraryBook } from '../../src/stores';
import { Text, Button } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeContext';
import { spacing, borderRadius, shadows } from '../../src/theme';
import { startBook, playFromLocalStorage } from '../../src/services/audioService';
import { loadAudiobookMetadata, getDownloadedChapters } from '../../src/services/audioStorageService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const COVER_WIDTH = SCREEN_WIDTH * 0.54;
const COVER_HEIGHT = COVER_WIDTH * 1.5;

export default function BookDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const {
    library,
    addToLibrary,
    addBook,
    removeFromLibrary,
    updateBookStatus,
    getBookById,
  } = useBookStore();
  const { setNowPlaying, setShowMiniPlayer } = usePlayerStore();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  
  // Determine if this is a catalog book (g_* or ol_*) or a generated audiobook
  const isCatalogBook = id?.startsWith('g_') || id?.startsWith('ol_');
  
  // First, check if this book exists in our library (for generated audiobooks)
  const libraryBook = id ? getBookById(id) : null;
  
  // Fetch catalog book details (only for catalog books, skip for generated audiobooks)
  const { data: catalogBook, isLoading: catalogLoading, error: catalogError } = useQuery({
    queryKey: ['book', id],
    queryFn: () => getBookDetails(id!),
    enabled: !!id && isCatalogBook, // Only fetch for catalog books
  });
  
  // For generated audiobooks, convert library book to display format
  const book: CatalogBook | null = isCatalogBook 
    ? (catalogBook ?? null)
    : libraryBook 
      ? {
          id: libraryBook.id,
          title: libraryBook.title,
          authors: libraryBook.authors || ['Unknown Author'],
          coverUrl: libraryBook.coverUrl ?? null,
          description: libraryBook.description || 'Generated audiobook',
          subjects: libraryBook.subjects || [],
          languages: libraryBook.languages || ['en'],
          hasFullText: true,
          _source: 'gutendex' as const, // Placeholder
          _sourceId: libraryBook.id,
        }
      : null;
  
  // Loading state - only for catalog books
  const isLoading = isCatalogBook ? catalogLoading : false;
  const error = isCatalogBook ? catalogError : (!libraryBook ? new Error('Book not in library') : null);
  
  // Check if this is a generated audiobook with local files
  const isGenerated = libraryBook?.isGenerated || false;
  const hasLocalFiles = id ? getDownloadedChapters(id).length > 0 : false;
  const hasAudiobook = isGenerated || hasLocalFiles;
  const isInLibrary = !!libraryBook;
  
  const handleBack = () => {
    Haptics.selectionAsync();
    router.back();
  };
  
  const handleAddToLibrary = () => {
    if (!book) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (isInLibrary) {
      removeFromLibrary(book.id);
    } else {
      addToLibrary(book, 'wishlist');
    }
  };
  
  const handleGenerateAudiobook = async () => {
    if (!book) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Get best available download URL (EPUB > TXT > HTML > MOBI)
    const downloadUrl = book.epubUrl || book.textUrl || book.htmlUrl || book.mobiUrl;
    
    if (!downloadUrl) {
      Alert.alert(
        'No Text Available',
        'This book does not have a supported format for audiobook generation.\n\nSupported formats:\n• EPUB (.epub)\n• Plain Text (.txt)\n• HTML (.html, .htm)\n• MOBI (.mobi)\n• PDF (.pdf)\n• DOCX (.docx)',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setIsGenerating(true);
    setGenerationStatus('Downloading book...');
    
    try {
      console.log(`📥 Downloading book from: ${downloadUrl}`);
      
      // Step 1: Send URL to backend - it will download and process the ebook
      // NOTE: createFromUrl already triggers background dramatization and TTS
      // generation via loadBookFile(). No need to call generateAudiobook separately.
      setGenerationStatus('Processing ebook...');
      const result = await createFromUrl({
        url: downloadUrl,
        narratorVoice: 'Algieba', // Default voice
        targetLanguage: 'original',
      });
      
      console.log('📚 Book processed and generation started:', result.title);
      
      // Step 2: Create book entry for library
      const bookTitle = result.audiobookTitle || result.title;
      const hasChapters = result.chapters && result.chapters.length > 0;
      
      const libraryEntry = {
        id: bookTitle,
        title: result.title,
        authors: book.authors,
        coverUrl: book.coverUrl,
        totalDuration: result._internal?.durationSeconds || 0,
        chapters: hasChapters ? result.chapters!.map((ch, i) => ({
          id: `ch-${i}`,
          title: ch.title,
          index: i,
          duration: 0,
          url: '',
        })) : [{
          id: 'ch-0',
          title: 'Full Text',
          index: 0,
          duration: 0,
          url: '',
        }],
        isGenerated: false,
        generationProgress: 0,
        status: 'listening' as const,
      };
      
      // Add to library
      addBook(libraryEntry);
      
      // Step 3: Set up player
      setGenerationStatus('Starting playback...');
      const nowPlaying = {
        bookId: libraryEntry.id,
        bookTitle: libraryEntry.title,
        author: book.authors.join(', '),
        coverUrl: book.coverUrl,
        chapters: libraryEntry.chapters,
        totalDuration: libraryEntry.totalDuration,
      };
      
      setNowPlaying(nowPlaying);
      setShowMiniPlayer(true);
      
      // Start playback (will play first available chunk)
      try {
        await startBook(nowPlaying);
      } catch (playError) {
        console.warn('Could not start playback yet, audio may still be generating:', playError);
      }
      
      // Navigate to library to see progress
      router.push('/(tabs)/library');
      
    } catch (err) {
      console.error('Failed to create audiobook:', err);
      Alert.alert(
        'Generation Failed',
        err instanceof Error ? err.message : 'Failed to create audiobook. Please check your connection and try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsGenerating(false);
      setGenerationStatus('');
    }
  };
  
  const handlePlay = async () => {
    if (!book) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Check if we have local files to play
    const downloadedChapters = getDownloadedChapters(book.id);
    console.log(`🎵 Playing book "${book.title}", downloaded chapters:`, downloadedChapters);
    
    if (downloadedChapters.length === 0) {
      // No local files - check if generation is still in progress
      if (libraryBook?.generationProgress && libraryBook.generationProgress < 100) {
        Alert.alert(
          'Audiobook Generating',
          `This audiobook is still being generated (${libraryBook.generationProgress}% complete). Please wait for generation to complete.`,
          [{ text: 'OK' }]
        );
        return;
      }
      
      Alert.alert(
        'No Audio Available',
        'This audiobook has not been downloaded to your device yet. Please wait for the download to complete.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Set now playing with library book data
    // Build chapters array from downloaded chapters (LibraryBook doesn't have chapters field)
    const chaptersForPlayer = downloadedChapters.map((idx) => ({
      id: `ch-${idx}`,
      title: `Chapter ${idx + 1}`,
      index: idx,
      duration: 0,
      url: '',
    }));
    
    const nowPlaying = {
      bookId: book.id,
      bookTitle: book.id,
      author: book.authors.join(', '),
      coverUrl: book.coverUrl,
      chapters: chaptersForPlayer,
      totalDuration: libraryBook?.totalDuration || 0,
    };
    
    setNowPlaying(nowPlaying);
    setShowMiniPlayer(true);
    
    // Start playback from local storage
    try {
      await playFromLocalStorage(book.id, downloadedChapters[0]);
      router.push('/player');
    } catch (playError) {
      console.error('Failed to start playback:', playError);
      Alert.alert(
        'Playback Error',
        playError instanceof Error ? playError.message : 'Failed to start playback. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };
  
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      paddingTop: 50,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroContainer: {
      height: SCREEN_HEIGHT * 0.52,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: spacing.xl,
      overflow: 'visible',
    },
    heroBackground: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'hidden',
    },
    heroImage: {
      width: '100%',
      height: '100%',
      opacity: 0.3,
    },
    heroGradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '70%',
    },
    coverContainer: {
      ...shadows.xl,
      shadowColor: '#000',
      shadowOffset: { width: 10, height: 12 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 15,
      overflow: 'visible',
      transform: [
        { perspective: 1200 },
        { rotateY: '-8deg' },
      ],
    },
    cover: {
      width: COVER_WIDTH,
      height: COVER_HEIGHT,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.cardElevated,
      resizeMode: 'cover',
    },
    coverPlaceholder: {
      width: COVER_WIDTH,
      height: COVER_HEIGHT,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.cardElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      padding: spacing.lg,
    },
    titleContainer: {
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
    },
    authors: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.sm,
      marginBottom: spacing.xl,
    },
    actionButton: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: theme.colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.sm,
    },
    actionButtonActive: {
      backgroundColor: theme.colors.primary,
    },
    mainButton: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.lg,
    },
    metaContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    metaBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.card,
    },
    metaText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    section: {
      marginTop: spacing.lg,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: spacing.sm,
    },
    description: {
      fontSize: 15,
      lineHeight: 24,
      color: theme.colors.textSecondary,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
  
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text color={theme.colors.textSecondary}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  if (error || !book) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text color={theme.colors.textSecondary}>Book not found</Text>
          <Button title="Go Back" onPress={handleBack} variant="outline" />
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={handleBack}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>
      </View>
      
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.heroContainer}>
          <View style={styles.heroBackground}>
            {book.coverUrl && (
              <Image
                source={{ uri: book.coverUrl }}
                style={styles.heroImage}
                blurRadius={20}
              />
            )}
            <LinearGradient
              colors={['transparent', theme.colors.background]}
              style={styles.heroGradient}
            />
          </View>
          
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            style={styles.coverContainer}
          >
            {book.coverUrl ? (
              <Image source={{ uri: book.coverUrl }} style={styles.cover} />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="book" size={60} color={theme.colors.textMuted} />
              </View>
            )}
          </Animated.View>
        </Animated.View>
        
        {/* Content */}
        <View style={styles.content}>
          {/* Title & Author */}
          <Animated.View entering={FadeInDown.delay(300)} style={styles.titleContainer}>
            <Text style={styles.title}>{book.title}</Text>
            <Text style={styles.authors}>
              by {book.authors.length > 0 ? book.authors.join(', ') : 'Unknown Author'}
            </Text>
          </Animated.View>
          
          {/* Quick Actions */}
          <Animated.View entering={FadeInDown.delay(350)} style={styles.actionsRow}>
            <Pressable
              style={[
                styles.actionButton,
                isInLibrary && styles.actionButtonActive,
              ]}
              onPress={handleAddToLibrary}
            >
              <Ionicons
                name={isInLibrary ? 'heart' : 'heart-outline'}
                size={24}
                color={isInLibrary ? '#fff' : theme.colors.text}
              />
            </Pressable>
            <Pressable style={styles.actionButton}>
              <Ionicons name="share-outline" size={24} color={theme.colors.text} />
            </Pressable>
          </Animated.View>
          
          {/* Main Action Button */}
          <Animated.View entering={FadeInDown.delay(400)} style={styles.mainButton}>
            {hasAudiobook ? (
              <Button
                title="Play Audiobook"
                onPress={handlePlay}
                size="large"
                icon={<Ionicons name="play" size={22} color="#fff" />}
              />
            ) : (
              <Button
                title={isGenerating ? (generationStatus || 'Generating...') : 'Create Audiobook'}
                onPress={handleGenerateAudiobook}
                size="large"
                loading={isGenerating}
                disabled={isGenerating}
                icon={!isGenerating ? <Ionicons name="sparkles" size={22} color="#fff" /> : undefined}
              />
            )}
          </Animated.View>
          
          {/* Meta Info */}
          <Animated.View entering={FadeInDown.delay(450)} style={styles.metaContainer}>
            {book.languages.map((lang) => (
              <View key={lang} style={styles.metaBadge}>
                <Text style={styles.metaText}>{lang.toUpperCase()}</Text>
              </View>
            ))}
            {book.subjects.slice(0, 3).map((subject, i) => (
              <View key={i} style={styles.metaBadge}>
                <Text style={styles.metaText}>{subject}</Text>
              </View>
            ))}
            {book.hasFullText && (
              <View style={[styles.metaBadge, { backgroundColor: theme.colors.success + '20' }]}>
                <Text style={[styles.metaText, { color: theme.colors.success }]}>
                  Full Text Available
                </Text>
              </View>
            )}
          </Animated.View>
          
          {/* Description */}
          {book.description && (
            <Animated.View entering={FadeInDown.delay(500)} style={styles.section}>
              <Text style={styles.sectionTitle}>About this book</Text>
              <Text style={styles.description}>{book.description}</Text>
            </Animated.View>
          )}
          
          {/* Bottom spacing */}
          <View style={{ height: 150 }} />
        </View>
      </ScrollView>
    </View>
  );
}
