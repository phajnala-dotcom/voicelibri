/**
 * Explore Screen - Main catalog browsing
 * Features: Search, Genres, Featured, Popular books
 * All from unified VoiceLibri catalog
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  FlatList,
  Pressable,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  FadeInRight,
} from 'react-native-reanimated';
import {
  searchCatalog,
  getPopularBooks,
  getFeaturedBooks,
  GENRES,
  Genre,
} from '../../src/services/catalogService';
import {
  Text,
  BookCard,
  BookList,
  GenreCard,
  SearchBar,
} from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeContext';
import { spacing } from '../../src/theme';

export default function ExploreScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Fetch featured books
  const { data: featuredBooks, refetch: refetchFeatured, isLoading: loadingFeatured } = useQuery({
    queryKey: ['featuredBooks'],
    queryFn: getFeaturedBooks,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
  
  // Fetch popular books
  const { data: popularData, refetch: refetchPopular, isLoading: loadingPopular } = useQuery({
    queryKey: ['popularBooks'],
    queryFn: () => getPopularBooks(),
    staleTime: 1000 * 60 * 30,
  });
  const popularBooks = popularData?.books || [];
  
  // Search query
  const { data: searchData, isLoading: searching } = useQuery({
    queryKey: ['search', searchQuery],
    queryFn: () => searchCatalog(searchQuery),
    enabled: searchQuery.length >= 2,
  });
  const searchResults = searchData?.books || [];
  
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchFeatured(), refetchPopular()]);
    setRefreshing(false);
  }, [refetchFeatured, refetchPopular]);
  
  const handleGenrePress = (genre: Genre) => {
    router.push({
      pathname: '/genre/[genre]',
      params: { genre: genre.id, name: genre.name },
    });
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
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    greeting: {
      marginBottom: spacing.md,
    },
    greetingText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
    },
    titleText: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: '700',
      marginTop: 4,
    },
    searchContainer: {
      marginTop: spacing.sm,
    },
    content: {
      flex: 1,
    },
    section: {
      marginTop: spacing.lg,
    },
    sectionTitle: {
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    genresContainer: {
      paddingHorizontal: spacing.md,
    },
    searchResultsContainer: {
      flex: 1,
      paddingHorizontal: spacing.md,
    },
    searchResultItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    searchResultCover: {
      width: 50,
      height: 70,
      borderRadius: 6,
      backgroundColor: theme.colors.cardElevated,
    },
    searchResultInfo: {
      flex: 1,
      marginLeft: spacing.sm,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing['2xl'],
    },
    emptyText: {
      color: theme.colors.textSecondary,
      textAlign: 'center',
      paddingVertical: spacing['2xl'],
    },
  });
  
  // Show search results when searching
  if (searchQuery.length >= 2) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.searchContainer}>
            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search the VoiceLibri catalog..."
              autoFocus={isSearchFocused}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
          </View>
        </View>
        
        {searching ? (
          <View style={styles.loadingContainer}>
            <Text color={theme.colors.textSecondary}>Searching...</Text>
          </View>
        ) : searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.md }}
            renderItem={({ item }) => (
              <Pressable
                style={styles.searchResultItem}
                onPress={() => handleBookPress(item.id)}
              >
                <BookCard
                  book={item}
                  size="small"
                  showAuthor={false}
                  onPress={() => handleBookPress(item.id)}
                />
                <View style={styles.searchResultInfo}>
                  <Text weight="semibold" numberOfLines={2}>{item.title}</Text>
                  <Text size="sm" color={theme.colors.textSecondary}>
                    {item.authors.join(', ')}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        ) : (
          <Text style={styles.emptyText}>No books found</Text>
        )}
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          <View style={styles.greeting}>
            <Text style={styles.greetingText}>Welcome to</Text>
            <Text style={styles.titleText}>VoiceLibri</Text>
          </View>
          
          <View style={styles.searchContainer}>
            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search the VoiceLibri catalog..."
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
          </View>
        </Animated.View>
        
        {/* Genres */}
        <Animated.View entering={FadeInRight.delay(200)} style={styles.section}>
          <Text size="lg" weight="semibold" style={styles.sectionTitle}>
            Browse by Genre
          </Text>
          <FlatList
            horizontal
            data={GENRES}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.genresContainer}
            renderItem={({ item }) => (
              <GenreCard
                genre={item}
                onPress={() => handleGenrePress(item)}
              />
            )}
          />
        </Animated.View>
        
        {/* Featured Books */}
        <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
          <BookList
            title="Featured Books"
            books={featuredBooks || []}
            emptyMessage={loadingFeatured ? 'Loading...' : 'No featured books'}
            nestedInScrollView
          />
        </Animated.View>
        
        {/* Popular Books */}
        <Animated.View entering={FadeInDown.delay(400)} style={styles.section}>
          <BookList
            title="Popular Classics"
            books={popularBooks}
            emptyMessage={loadingPopular ? 'Loading...' : 'No popular books'}
            nestedInScrollView
          />
        </Animated.View>
        
        {/* Bottom spacing for tab bar */}
        <View style={{ height: 150 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
