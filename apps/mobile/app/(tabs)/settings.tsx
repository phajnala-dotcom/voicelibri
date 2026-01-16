/**
 * Settings Screen
 * App preferences and configurations
 */

import React from 'react';
import { View, ScrollView, StyleSheet, Pressable, Switch, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '../../src/stores';
import { Text } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeContext';
import { spacing, borderRadius } from '../../src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface SettingRowProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  hasSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  onPress?: () => void;
}

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  hasSwitch,
  switchValue,
  onSwitchChange,
  onPress,
}: SettingRowProps) {
  const { theme } = useTheme();
  
  const handlePress = () => {
    Haptics.selectionAsync();
    onPress?.();
  };
  
  const styles = StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    iconContainer: {
      width: 36,
      height: 36,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.cardElevated,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    content: {
      flex: 1,
    },
    title: {
      fontSize: 16,
      color: theme.colors.text,
    },
    subtitle: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    value: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginRight: 4,
    },
  });
  
  return (
    <Pressable
      style={styles.row}
      onPress={!hasSwitch ? handlePress : undefined}
      disabled={hasSwitch}
    >
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {value && <Text style={styles.value}>{value}</Text>}
      {hasSwitch && (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: theme.colors.progressTrack, true: theme.colors.primary }}
          thumbColor="#fff"
        />
      )}
      {!hasSwitch && onPress && (
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
      )}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const {
    themeMode,
    setThemeMode,
    defaultPlaybackRate,
    setDefaultPlaybackRate,
    autoPlayNext,
    setAutoPlayNext,
    downloadOverWifiOnly,
    setDownloadOverWifiOnly,
    notificationsEnabled,
    setNotificationsEnabled,
  } = useSettingsStore();
  
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  
  const handlePlaybackRateCycle = () => {
    const currentIndex = playbackRates.indexOf(defaultPlaybackRate);
    const nextIndex = (currentIndex + 1) % playbackRates.length;
    setDefaultPlaybackRate(playbackRates[nextIndex]);
    Haptics.selectionAsync();
  };
  
  const handleThemeCycle = () => {
    const modes: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark'];
    const currentIndex = modes.indexOf(themeMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setThemeMode(modes[nextIndex]);
    Haptics.selectionAsync();
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
    section: {
      marginTop: spacing.lg,
    },
    sectionHeader: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionContent: {
      backgroundColor: theme.colors.card,
      marginHorizontal: spacing.md,
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
    },
    footer: {
      alignItems: 'center',
      paddingVertical: spacing['2xl'],
    },
    footerText: {
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    version: {
      fontSize: 12,
      color: theme.colors.textMuted,
      marginTop: 4,
    },
  });
  
  const themeModeLabel = themeMode === 'system' ? 'System' : themeMode === 'light' ? 'Light' : 'Dark';
  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </Animated.View>
        
        {/* Playback Section */}
        <Animated.View entering={FadeInDown.delay(150)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Playback</Text>
          </View>
          <View style={styles.sectionContent}>
            <SettingRow
              icon="speedometer-outline"
              title="Default Speed"
              subtitle="Initial playback speed for new audiobooks"
              value={`${defaultPlaybackRate}x`}
              onPress={handlePlaybackRateCycle}
            />
            <SettingRow
              icon="play-forward-outline"
              title="Auto-play Next"
              subtitle="Continue to next chapter automatically"
              hasSwitch
              switchValue={autoPlayNext}
              onSwitchChange={setAutoPlayNext}
            />
          </View>
        </Animated.View>
        
        {/* Appearance Section */}
        <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Appearance</Text>
          </View>
          <View style={styles.sectionContent}>
            <SettingRow
              icon={isDark ? 'moon-outline' : 'sunny-outline'}
              title="Theme"
              subtitle="Choose your preferred appearance"
              value={themeModeLabel}
              onPress={handleThemeCycle}
            />
          </View>
        </Animated.View>
        
        {/* Downloads Section */}
        <Animated.View entering={FadeInDown.delay(250)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Downloads</Text>
          </View>
          <View style={styles.sectionContent}>
            <SettingRow
              icon="wifi-outline"
              title="Wi-Fi Only"
              subtitle="Only download audiobooks on Wi-Fi"
              hasSwitch
              switchValue={downloadOverWifiOnly}
              onSwitchChange={setDownloadOverWifiOnly}
            />
          </View>
        </Animated.View>
        
        {/* Notifications Section */}
        <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Notifications</Text>
          </View>
          <View style={styles.sectionContent}>
            <SettingRow
              icon="notifications-outline"
              title="Push Notifications"
              subtitle="Get updates on audiobook generation"
              hasSwitch
              switchValue={notificationsEnabled}
              onSwitchChange={setNotificationsEnabled}
            />
          </View>
        </Animated.View>
        
        {/* About Section */}
        <Animated.View entering={FadeInDown.delay(350)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>About</Text>
          </View>
          <View style={styles.sectionContent}>
            <SettingRow
              icon="information-circle-outline"
              title="About VoiceLibri"
              onPress={() => {}}
            />
            <SettingRow
              icon="document-text-outline"
              title="Terms of Service"
              onPress={() => Linking.openURL('https://voicelibri.app/terms')}
            />
            <SettingRow
              icon="shield-checkmark-outline"
              title="Privacy Policy"
              onPress={() => Linking.openURL('https://voicelibri.app/privacy')}
            />
          </View>
        </Animated.View>
        
        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>VoiceLibri</Text>
          <Text style={styles.version}>Version 1.0.0</Text>
        </View>
        
        {/* Bottom spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
