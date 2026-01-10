// VoiceLibri - Theme Store
// Manages light/dark theme with system preference support

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface ThemeStore {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme;
  
  if (resolved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  
  return resolved;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'system',
      resolvedTheme: getSystemTheme(),
      
      setTheme: (theme) => {
        const resolvedTheme = applyTheme(theme);
        set({ theme, resolvedTheme });
      },
      
      toggleTheme: () => {
        const { resolvedTheme } = get();
        const newTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
        set({ theme: newTheme, resolvedTheme: newTheme });
      },
    }),
    {
      name: 'voicelibri-theme',
      onRehydrateStorage: () => (state) => {
        // Apply saved theme on app load
        if (state?.theme) {
          const resolved = applyTheme(state.theme);
          state.resolvedTheme = resolved;
        }
      },
    }
  )
);

// Listen for system theme changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const state = useThemeStore.getState();
    if (state.theme === 'system') {
      const resolved = e.matches ? 'dark' : 'light';
      applyTheme('system');
      useThemeStore.setState({ resolvedTheme: resolved });
    }
  });
}
