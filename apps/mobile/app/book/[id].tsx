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
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
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
import { useBookStore, usePlayerStore } from '../../src/stores';
import { Text, Button } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeContext';
import { spacing, borderRadius, shadows } from '../../src/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const COVER_WIDTH = SCREEN_WIDTH * 0.45;
const COVER_HEIGHT = COVER_WIDTH * 1.5;

export default function BookDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const {
    library,
    addToLibrary,
    removeFromLibrary,
    updateBookStatus,
    getBookById,
  } = useBookStore();
  const { setNowPlaying, setShowMiniPlayer } = usePlayerStore();
  
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Fetch book details
  const { data: book, isLoading, error } = useQuery({
    queryKey: ['book', id],
    queryFn: () => getBookDetails(id!),
    enabled: !!id,
  });
  
  const libraryBook = book ? getBookById(book.id) : null;
  const isInLibrary = !!libraryBook;
  const hasAudiobook = libraryBook?.isGenerated;
  
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
    
    setIsGenerating(true);
    
    // Add to library if not already
    if (!isInLibrary) {
      addToLibrary(book, 'listening');
    } else {
      updateBookStatus(book.id, 'listening');
    }
    
    // TODO: Integrate with VoiceLibri backend API
    // This would call generateAudiobook() from voiceLibriApi
    
    // For now, simulate generation
    setTimeout(() => {
      setIsGenerating(false);
      // Navigate to player or show success
    }, 2000);
  };
  
  const handlePlay = () => {
    if (!book || !libraryBook) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Set now playing
    setNowPlaying({
      bookId: book.id,
      bookTitle: book.title,
      author: book.authors.join(', '),
      coverUrl: book.coverUrl,
      chapters: [], // TODO: Load from audiobook data
      totalDuration: 0,
    });
    setShowMiniPlayer(true);
    
    router.push('/player');
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
      height: SCREEN_HEIGHT * 0.5,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: spacing.xl,
    },
    heroBackground: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
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
    },
    cover: {
      width: COVER_WIDTH,
      height: COVER_HEIGHT,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.cardElevated,
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
                title={isGenerating ? 'Generating...' : 'Generate AI Audiobook'}
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
