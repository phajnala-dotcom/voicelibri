/**
 * Theme Context and Hook
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, Theme } from './index';
import { useSettingsStore } from '../stores';

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  isDark: false,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  
  const value = useMemo(() => {
    let isDark: boolean;
    
    if (themeMode === 'system') {
      isDark = systemScheme === 'dark';
    } else {
      isDark = themeMode === 'dark';
    }
    
    const toggleTheme = () => {
      setThemeMode(isDark ? 'light' : 'dark');
    };
    
    return {
      theme: isDark ? darkTheme : lightTheme,
      isDark,
      toggleTheme,
    };
  }, [themeMode, systemScheme, setThemeMode]);
  
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
