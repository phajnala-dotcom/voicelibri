/**
 * Library Screen - User's book collection
 * Shows: Currently Listening, Completed, Wishlist
 */

import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useBookStore } from '../../src/stores';
import { BookList, Text, Button } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeContext';
import { spacing, borderRadius } from '../../src/theme';

export default function LibraryScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { library } = useBookStore();
  
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
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
            />
          </Animated.View>
        )}
        
        {/* Bottom spacing */}
        <View style={{ height: 150 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
