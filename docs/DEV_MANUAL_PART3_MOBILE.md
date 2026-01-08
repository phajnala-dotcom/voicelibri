# VoiceLibri Development Manual - Part 3: Mobile Implementation

> **Purpose:** Complete mobile implementation guide for LLM coding agents  
> **Aligned with:** MOBILE_APP_DEVELOPMENT_GUIDE.md Section 6  
> **Audience:** Claude Opus 4.5 (Supervisor), GPT 5.1 Codex Max (Implementation)  
> **Last Updated:** January 7, 2026

---

## 1. Project Setup

### 1.1 PWA Setup (Primary - Weeks 1-5)

```bash
# Create project
npm create vite@latest voicelibri-pwa -- --template react-ts
cd voicelibri-pwa

# Install dependencies
npm install react-router-dom @tanstack/react-query zustand
npm install axios
npm install i18next react-i18next
npm install howler  # Web audio

# Install Tailwind
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Dev dependencies
npm install -D @types/howler
```

**Vite Config:**
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'VoiceLibri',
        short_name: 'VoiceLibri',
        description: 'AI-Powered Dramatized Audiobooks',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
```

**Tailwind Config:**
```javascript
// tailwind.config.js
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: {
          base: '#09090b',
          elevated: '#18181b',
          surface: '#27272a',
        },
        accent: {
          primary: '#8b5cf6',
          secondary: '#06b6d4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
```

### 1.2 React Native Setup (Clone - Weeks 10-14)

```bash
# Create Expo project
npx create-expo-app@latest voicelibri-app --template tabs
cd voicelibri-app

# Install core dependencies
npx expo install expo-router

# Storage
npx expo install react-native-mmkv @nozbe/watermelondb

# State Management
npm install zustand @tanstack/react-query

# UI
npm install nativewind tailwindcss
npx expo install react-native-reanimated react-native-gesture-handler

# Audio (requires development build)
npm install react-native-audio-pro

# Auth
npm install @supabase/supabase-js

# Payments
npm install react-native-purchases

# Utilities
npx expo install expo-file-system expo-secure-store expo-notifications
npx expo install expo-document-picker expo-sharing
```

**Configure EAS Build:**
```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Configure
eas build:configure

# Create development build
eas build --profile development --platform ios
eas build --profile development --platform android
```

**Babel Config (NativeWind):**
```javascript
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: ['react-native-reanimated/plugin'],
  };
};
```

---

## 2. Root Layout & Providers

### 2.1 PWA Root

```tsx
// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { MiniPlayer } from './components/player/MiniPlayer';

// Screens
import { LibraryScreen } from './screens/LibraryScreen';
import { PlayerScreen } from './screens/PlayerScreen';
import { GenerateScreen } from './screens/GenerateScreen';
import { FreeClassicsScreen } from './screens/FreeClassicsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { LoginScreen } from './screens/LoginScreen';
import { RegisterScreen } from './screens/RegisterScreen';

// i18n
import './i18n';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-background-base text-white">
            <Routes>
              {/* Auth routes */}
              <Route path="/login" element={<LoginScreen />} />
              <Route path="/register" element={<RegisterScreen />} />
              
              {/* Protected routes */}
              <Route path="/" element={<LibraryScreen />} />
              <Route path="/player/:bookId" element={<PlayerScreen />} />
              <Route path="/generate" element={<GenerateScreen />} />
              <Route path="/classics" element={<FreeClassicsScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
              
              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            
            {/* Persistent mini player */}
            <MiniPlayer />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

### 2.2 React Native Root

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DatabaseProvider } from '@nozbe/watermelondb/DatabaseProvider';
import { database } from '../src/database';
import { AuthProvider } from '../src/contexts/AuthContext';
import { MiniPlayer } from '../src/components/player/MiniPlayer';
import '../global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <DatabaseProvider database={database}>
          <AuthProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#09090b' },
              }}
            />
            <MiniPlayer />
          </AuthProvider>
        </DatabaseProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
```

---

## 3. API Client

```typescript
// services/api.ts
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) throw new Error('No refresh token');
        
        const { data } = await axios.post(`${API_BASE}/api/v1/auth/refresh`, {
          refreshToken,
        });
        
        useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
        
        // Retry original request
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        }
        return api(originalRequest);
      } catch {
        // Refresh failed - logout
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

// API methods
export const authApi = {
  register: (email: string, password: string) =>
    api.post('/auth/register', { email, password }),
  
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  
  socialLogin: (provider: 'google' | 'apple', idToken: string) =>
    api.post('/auth/social', { provider, idToken }),
  
  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
  
  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refreshToken }),
};

export const booksApi = {
  list: (params?: { cursor?: string; limit?: number; status?: string }) =>
    api.get('/books', { params }),
  
  get: (bookId: string) =>
    api.get(`/books/${bookId}`),
  
  delete: (bookId: string) =>
    api.delete(`/books/${bookId}`),
  
  estimate: (formData: FormData) =>
    api.post('/books/estimate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  
  generate: (formData: FormData, idempotencyKey: string) =>
    api.post('/books/generate', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Idempotency-Key': idempotencyKey,
      },
    }),
  
  getJobStatus: (jobId: string) =>
    api.get(`/jobs/${jobId}`),
  
  cancelJob: (jobId: string) =>
    api.post(`/jobs/${jobId}/cancel`),
};

export const classicsApi = {
  generate: (gutenbergId: number, targetLanguage: string, idempotencyKey: string) =>
    api.post('/classics/generate', 
      { gutenbergId, targetLanguage },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    ),
};

export const playbackApi = {
  savePosition: (bookId: string, chapterIndex: number, position: number) =>
    api.post('/playback/position', {
      bookId,
      chapterIndex,
      position,
      updatedAt: new Date().toISOString(),
    }),
  
  getPosition: (bookId: string) =>
    api.get(`/playback/position/${bookId}`),
  
  getAllPositions: () =>
    api.get('/playback/positions'),
};
```

---

## 4. Zustand Stores

### 4.1 Auth Store

```typescript
// stores/authStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  subscription: {
    plan: string;
    hoursRemaining: number;
  } | null;
  hoursBalance: number;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  
  setUser: (user: User | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      
      setTokens: (accessToken, refreshToken) => 
        set({ accessToken, refreshToken }),
      
      logout: () => set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage), // PWA
      // For React Native: use MMKV
      partialize: (state) => ({
        refreshToken: state.refreshToken,
        // Don't persist accessToken (short-lived)
      }),
    }
  )
);
```

### 4.2 Player Store

```typescript
// stores/playerStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

interface SleepTimer {
  type: 'time' | 'chapter';
  endsAt?: number;
}

interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  chapters: Array<{
    id: string;
    title: string;
    duration: number;
    audioUrl: string;
  }>;
}

interface PlayerState {
  // Current book
  currentBook: Book | null;
  currentChapterIndex: number;
  
  // Playback
  playbackState: PlaybackState;
  position: number;
  duration: number;
  playbackSpeed: number;
  
  // Timer
  sleepTimer: SleepTimer | null;
  
  // Actions
  setCurrentBook: (book: Book, chapterIndex?: number) => void;
  setChapter: (index: number) => void;
  setPlaybackState: (state: PlaybackState) => void;
  updateProgress: (position: number, duration: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setSleepTimer: (timer: SleepTimer | null) => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentBook: null,
      currentChapterIndex: 0,
      playbackState: 'idle',
      position: 0,
      duration: 0,
      playbackSpeed: 1.0,
      sleepTimer: null,
      
      setCurrentBook: (book, chapterIndex = 0) => set({
        currentBook: book,
        currentChapterIndex: chapterIndex,
        position: 0,
        playbackState: 'loading',
      }),
      
      setChapter: (index) => set({
        currentChapterIndex: index,
        position: 0,
      }),
      
      setPlaybackState: (state) => set({ playbackState: state }),
      
      updateProgress: (position, duration) => set({ position, duration }),
      
      setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
      
      setSleepTimer: (timer) => set({ sleepTimer: timer }),
      
      reset: () => set({
        currentBook: null,
        currentChapterIndex: 0,
        playbackState: 'idle',
        position: 0,
        duration: 0,
        sleepTimer: null,
      }),
    }),
    {
      name: 'player-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        playbackSpeed: state.playbackSpeed,
        // Don't persist current book (reload from API)
      }),
    }
  )
);
```

### 4.3 Settings Store

```typescript
// stores/settingsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type AppLanguage = 'en' | 'sk' | 'cs' | 'de' | 'es';

interface SettingsState {
  // App
  appLanguage: AppLanguage;
  darkMode: boolean; // Always dark for MVP
  
  // Playback defaults
  defaultSpeed: number;
  defaultSleepTimer: number | null; // minutes
  
  // Notifications
  notificationsEnabled: boolean;
  
  // Actions
  setAppLanguage: (lang: AppLanguage) => void;
  setDefaultSpeed: (speed: number) => void;
  setDefaultSleepTimer: (minutes: number | null) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      appLanguage: 'en',
      darkMode: true,
      defaultSpeed: 1.0,
      defaultSleepTimer: null,
      notificationsEnabled: true,
      
      setAppLanguage: (appLanguage) => set({ appLanguage }),
      setDefaultSpeed: (defaultSpeed) => set({ defaultSpeed }),
      setDefaultSleepTimer: (defaultSleepTimer) => set({ defaultSleepTimer }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
```

---

## 5. React Query Hooks

### 5.1 Library Hook

```typescript
// hooks/useLibrary.ts
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { booksApi } from '../services/api';
import type { Book } from '../types/book';

interface BooksResponse {
  books: Book[];
  nextCursor: string | null;
  totalCount: number;
}

export function useLibrary() {
  const queryClient = useQueryClient();
  
  const query = useInfiniteQuery({
    queryKey: ['books'],
    queryFn: async ({ pageParam }) => {
      const { data } = await booksApi.list({ cursor: pageParam, limit: 20 });
      return data as BooksResponse;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
  });
  
  const deleteMutation = useMutation({
    mutationFn: (bookId: string) => booksApi.delete(bookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
    },
  });
  
  // Flatten pages into single array
  const books = query.data?.pages.flatMap((page) => page.books) ?? [];
  
  // Separate generating books
  const readyBooks = books.filter((b) => b.status === 'ready');
  const generatingBooks = books.filter((b) => b.status === 'generating');
  
  return {
    books: readyBooks,
    generatingBooks,
    totalCount: query.data?.pages[0]?.totalCount ?? 0,
    isLoading: query.isLoading,
    isRefreshing: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    deleteBook: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}
```

### 5.2 Generation Hook

```typescript
// hooks/useGeneration.ts
import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { booksApi } from '../services/api';
import { v4 as uuid } from 'uuid';

interface EstimateResult {
  estimatedHours: number;
  estimatedChapters: number;
  detectedLanguage: string;
  detectedTitle: string | null;
  canGenerate: boolean;
  insufficientHours: number | null;
}

interface GenerateResult {
  jobId: string;
  bookId: string;
}

interface JobStatus {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentPhase: string;
  error: string | null;
}

export function useGeneration() {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const idempotencyKey = useRef(uuid());
  
  // Estimate mutation
  const estimateMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await booksApi.estimate(formData);
      return data as EstimateResult;
    },
  });
  
  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: async ({ file, options }: { file: File; options?: any }) => {
      const formData = new FormData();
      formData.append('file', file);
      if (options) {
        formData.append('options', JSON.stringify(options));
      }
      const { data } = await booksApi.generate(formData, idempotencyKey.current);
      return data as GenerateResult;
    },
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      // Reset idempotency key for next generation
      idempotencyKey.current = uuid();
    },
  });
  
  // Poll job status
  const jobQuery = useQuery({
    queryKey: ['job', activeJobId],
    queryFn: async () => {
      if (!activeJobId) return null;
      const { data } = await booksApi.getJobStatus(activeJobId);
      return data as JobStatus;
    },
    enabled: !!activeJobId,
    refetchInterval: (data) => {
      // Stop polling when complete or failed
      if (data?.status === 'completed' || data?.status === 'failed') {
        return false;
      }
      return 2000; // Poll every 2 seconds
    },
  });
  
  // Clear job when complete
  useEffect(() => {
    if (jobQuery.data?.status === 'completed' || jobQuery.data?.status === 'failed') {
      // Could show notification here
    }
  }, [jobQuery.data?.status]);
  
  return {
    // Estimate
    estimate: estimateMutation.data,
    getEstimate: estimateMutation.mutate,
    isEstimating: estimateMutation.isPending,
    estimateError: estimateMutation.error,
    
    // Generate
    generate: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
    generateError: generateMutation.error,
    
    // Job status
    jobStatus: jobQuery.data,
    isPolling: jobQuery.isFetching,
    
    // State
    activeJobId,
    clearJob: () => setActiveJobId(null),
  };
}
```

### 5.3 Player Hook

```typescript
// hooks/usePlayer.ts
import { useEffect, useRef, useCallback } from 'react';
import { Howl } from 'howler'; // PWA
// For React Native: import { audioService } from '../services/audioPlayer';
import { usePlayerStore } from '../stores/playerStore';
import { playbackApi, booksApi } from '../services/api';

export function usePlayer() {
  const store = usePlayerStore();
  const howlRef = useRef<Howl | null>(null);
  const saveIntervalRef = useRef<NodeJS.Timer | null>(null);
  
  // Load book
  const loadBook = useCallback(async (bookId: string, startChapter?: number) => {
    const { data: book } = await booksApi.get(bookId);
    
    // Get saved position
    try {
      const { data: position } = await playbackApi.getPosition(bookId);
      if (position && startChapter === undefined) {
        store.setCurrentBook(book, position.chapterIndex);
        // Will seek to position after audio loads
      } else {
        store.setCurrentBook(book, startChapter ?? 0);
      }
    } catch {
      store.setCurrentBook(book, startChapter ?? 0);
    }
    
    loadChapter(store.currentChapterIndex);
  }, []);
  
  // Load chapter audio
  const loadChapter = useCallback((chapterIndex: number) => {
    const { currentBook } = store;
    if (!currentBook) return;
    
    const chapter = currentBook.chapters[chapterIndex];
    if (!chapter) return;
    
    // Cleanup previous
    if (howlRef.current) {
      howlRef.current.unload();
    }
    
    store.setPlaybackState('loading');
    
    howlRef.current = new Howl({
      src: [chapter.audioUrl],
      html5: true, // Required for streaming
      rate: store.playbackSpeed,
      onload: () => {
        store.setPlaybackState('paused');
        store.updateProgress(0, howlRef.current?.duration() ?? 0);
      },
      onplay: () => {
        store.setPlaybackState('playing');
        startProgressTracking();
      },
      onpause: () => {
        store.setPlaybackState('paused');
      },
      onend: () => {
        // Auto-advance to next chapter
        const nextIndex = chapterIndex + 1;
        if (nextIndex < currentBook.chapters.length) {
          store.setChapter(nextIndex);
          loadChapter(nextIndex);
          play();
        } else {
          store.setPlaybackState('paused');
        }
      },
      onerror: () => {
        store.setPlaybackState('error');
      },
    });
  }, []);
  
  // Playback controls
  const play = useCallback(() => {
    howlRef.current?.play();
  }, []);
  
  const pause = useCallback(() => {
    howlRef.current?.pause();
    savePosition();
  }, []);
  
  const togglePlayPause = useCallback(() => {
    if (store.playbackState === 'playing') {
      pause();
    } else {
      play();
    }
  }, [store.playbackState]);
  
  const seekTo = useCallback((position: number) => {
    howlRef.current?.seek(position);
    store.updateProgress(position, store.duration);
  }, [store.duration]);
  
  const skip = useCallback((seconds: number) => {
    const current = howlRef.current?.seek() ?? 0;
    const newPosition = Math.max(0, Math.min(current + seconds, store.duration));
    seekTo(newPosition);
  }, [store.duration, seekTo]);
  
  const setSpeed = useCallback((speed: number) => {
    howlRef.current?.rate(speed);
    store.setPlaybackSpeed(speed);
  }, []);
  
  const nextChapter = useCallback(() => {
    const { currentBook, currentChapterIndex } = store;
    if (!currentBook) return;
    
    const nextIndex = currentChapterIndex + 1;
    if (nextIndex < currentBook.chapters.length) {
      store.setChapter(nextIndex);
      loadChapter(nextIndex);
      play();
    }
  }, []);
  
  const previousChapter = useCallback(() => {
    const { currentChapterIndex } = store;
    
    // If more than 3 seconds in, restart chapter
    if (store.position > 3) {
      seekTo(0);
      return;
    }
    
    // Otherwise go to previous
    if (currentChapterIndex > 0) {
      store.setChapter(currentChapterIndex - 1);
      loadChapter(currentChapterIndex - 1);
      play();
    }
  }, [store.position]);
  
  // Progress tracking
  const startProgressTracking = useCallback(() => {
    if (saveIntervalRef.current) {
      clearInterval(saveIntervalRef.current);
    }
    
    saveIntervalRef.current = setInterval(() => {
      if (howlRef.current) {
        const position = howlRef.current.seek();
        const duration = howlRef.current.duration();
        store.updateProgress(position, duration);
      }
    }, 250); // Update 4x per second for smooth progress bar
  }, []);
  
  // Save position to server
  const savePosition = useCallback(async () => {
    const { currentBook, currentChapterIndex, position } = store;
    if (!currentBook || position < 1) return;
    
    try {
      await playbackApi.savePosition(currentBook.id, currentChapterIndex, position);
    } catch (error) {
      console.error('Failed to save position:', error);
    }
  }, []);
  
  // Save every 5 seconds during playback
  useEffect(() => {
    if (store.playbackState === 'playing') {
      const interval = setInterval(savePosition, 5000);
      return () => clearInterval(interval);
    }
  }, [store.playbackState, savePosition]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (howlRef.current) {
        howlRef.current.unload();
      }
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);
  
  return {
    // State
    ...store,
    
    // Actions
    loadBook,
    play,
    pause,
    togglePlayPause,
    seekTo,
    skip,
    setSpeed,
    nextChapter,
    previousChapter,
  };
}
```

---

## 6. Key Screen Implementations

### 6.1 Library Screen

```tsx
// screens/LibraryScreen.tsx
import { useLibrary } from '../hooks/useLibrary';
import { BookCard } from '../components/library/BookCard';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function LibraryScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    books,
    generatingBooks,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useLibrary();

  if (isLoading) {
    return (
      <div className="p-4 pt-16">
        <Skeleton className="h-8 w-32 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-60 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-base pb-32">
      {/* Header */}
      <header className="p-4 pt-16">
        <h1 className="text-3xl font-bold text-white">{t('library.title')}</h1>
        <p className="text-zinc-400 mt-1">
          {books.length} {t('library.audiobooks')}
        </p>
      </header>

      {/* Generating Books */}
      {generatingBooks.length > 0 && (
        <section className="px-4 mb-6">
          <h2 className="text-lg font-semibold text-white mb-3">
            {t('library.generating')}
          </h2>
          {generatingBooks.map((book) => (
            <div
              key={book.id}
              className="bg-background-elevated rounded-xl p-4 mb-2"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-accent-primary/20 rounded-lg flex items-center justify-center">
                  <span className="animate-pulse">🎧</span>
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">{book.title}</p>
                  <p className="text-zinc-400 text-sm">
                    {book.progress}% - {t(`generation.${book.currentPhase}`)}
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-primary transition-all duration-300"
                  style={{ width: `${book.progress}%` }}
                />
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Book Grid */}
      {books.length === 0 ? (
        <EmptyState
          icon="📚"
          title={t('library.empty')}
          description={t('library.emptyDescription')}
          action={{
            label: t('library.emptyAction'),
            onPress: () => navigate('/classics'),
          }}
        />
      ) : (
        <section className="px-4">
          <div className="grid grid-cols-2 gap-4">
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onPress={() => navigate(`/player/${book.id}`)}
              />
            ))}
          </div>
          
          {/* Load more */}
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              className="w-full mt-4 py-3 text-accent-primary"
            >
              {t('common.loadMore')}
            </button>
          )}
        </section>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background-elevated border-t border-zinc-800">
        <div className="flex justify-around py-3">
          <NavItem icon="📚" label={t('nav.library')} active to="/" />
          <NavItem icon="➕" label={t('nav.generate')} to="/generate" />
          <NavItem icon="📖" label={t('nav.classics')} to="/classics" />
          <NavItem icon="⚙️" label={t('nav.settings')} to="/settings" />
        </div>
      </nav>
    </div>
  );
}
```

### 6.2 Free Classics Screen

```tsx
// screens/FreeClassicsScreen.tsx
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { gutendexApi } from '../services/gutendex';
import { useLocalizedBook } from '../hooks/useLocalizedBook';
import { useSettingsStore } from '../stores/settingsStore';
import { useTranslation } from 'react-i18next';

const CATALOG_LANGUAGES = [
  { code: 'en', name: 'English', books: '73,000+' },
  { code: 'de', name: 'German', books: '2,396' },
  { code: 'es', name: 'Spanish', books: '901' },
];

export function FreeClassicsScreen() {
  const { t } = useTranslation();
  const { appLanguage } = useSettingsStore();
  const [catalogLang, setCatalogLang] = useState(
    CATALOG_LANGUAGES.find((l) => l.code === appLanguage)?.code || 'en'
  );
  const [searchQuery, setSearchQuery] = useState('');

  const { data, fetchNextPage, hasNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['gutenberg', catalogLang, searchQuery],
    queryFn: ({ pageParam = 1 }) =>
      searchQuery
        ? gutendexApi.search(searchQuery, catalogLang)
        : gutendexApi.getPopular(catalogLang, pageParam),
    getNextPageParam: (lastPage) =>
      lastPage.next ? extractPageNumber(lastPage.next) : undefined,
    initialPageParam: 1,
  });

  const books = data?.pages.flatMap((page) => page.results) ?? [];

  return (
    <div className="min-h-screen bg-background-base pb-32">
      {/* Header */}
      <header className="p-4 pt-16">
        <h1 className="text-3xl font-bold text-white">{t('classics.title')}</h1>
        <p className="text-zinc-400 mt-1">{t('classics.subtitle')}</p>
      </header>

      {/* Language Filter */}
      <div className="px-4 mb-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {CATALOG_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setCatalogLang(lang.code)}
              className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                catalogLang === lang.code
                  ? 'bg-accent-primary text-white'
                  : 'bg-background-surface text-zinc-300'
              }`}
            >
              {lang.name} ({lang.books})
            </button>
          ))}
        </div>
      </div>

      {/* Notice for Slovak/Czech users */}
      {(appLanguage === 'sk' || appLanguage === 'cs') && (
        <div className="mx-4 mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <p className="text-amber-200 text-sm">
            {appLanguage === 'sk'
              ? t('classics.noSlovakBooks')
              : t('classics.noCzechBooks')}
          </p>
        </div>
      )}

      {/* Search */}
      <div className="px-4 mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('classics.searchPlaceholder')}
          className="w-full px-4 py-3 bg-background-surface rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-accent-primary"
        />
      </div>

      {/* Book Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 px-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-60 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 px-4">
          {books.map((book) => (
            <GutenbergBookCard key={book.id} book={book} />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          className="w-full mt-4 py-3 text-accent-primary"
        >
          {t('common.loadMore')}
        </button>
      )}
    </div>
  );
}

function GutenbergBookCard({ book }: { book: GutenbergBook }) {
  const { appLanguage } = useSettingsStore();
  const { data: localizedInfo } = useLocalizedBook(book);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const coverUrl = book.formats['image/jpeg'];
  const title = localizedInfo?.title || book.title;
  const author = localizedInfo?.author || book.authors[0]?.name || 'Unknown';

  return (
    <button
      onClick={() => navigate(`/classics/${book.id}`)}
      className="bg-background-elevated rounded-2xl overflow-hidden text-left transition-transform active:scale-98"
    >
      {/* Cover */}
      <div className="aspect-[2/3] relative">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center">
            <span className="text-4xl">📚</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-2 left-2 right-2">
          <p className="text-white font-semibold text-sm line-clamp-2">
            {title}
          </p>
          <p className="text-zinc-300 text-xs line-clamp-1">{author}</p>
        </div>
      </div>
      
      {/* Source indicator */}
      {localizedInfo?.source === 'translated' && (
        <span className="absolute top-2 right-2 text-xs bg-black/50 px-1.5 py-0.5 rounded">
          🔄
        </span>
      )}
    </button>
  );
}
```

---

## 7. i18n Configuration

### 7.1 Setup

```typescript
// i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import sk from './locales/sk.json';
import cs from './locales/cs.json';
import de from './locales/de.json';
import es from './locales/es.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      sk: { translation: sk },
      cs: { translation: cs },
      de: { translation: de },
      es: { translation: es },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
```

### 7.2 English Translations

```json
// i18n/locales/en.json
{
  "common": {
    "loading": "Loading...",
    "error": "Something went wrong",
    "retry": "Try again",
    "cancel": "Cancel",
    "save": "Save",
    "delete": "Delete",
    "loadMore": "Load more"
  },
  "nav": {
    "library": "Library",
    "generate": "Generate",
    "classics": "Classics",
    "settings": "Settings"
  },
  "library": {
    "title": "My Library",
    "audiobooks": "audiobooks",
    "generating": "Generating",
    "empty": "No audiobooks yet",
    "emptyDescription": "Upload your first ebook or explore our Free Classics library",
    "emptyAction": "Browse Free Classics"
  },
  "player": {
    "nowPlaying": "Now Playing",
    "chapter": "Chapter {{number}}",
    "speed": "Speed",
    "sleepTimer": "Sleep Timer",
    "sleepOff": "Off",
    "sleepMinutes": "{{minutes}} minutes",
    "sleepEndOfChapter": "End of chapter"
  },
  "classics": {
    "title": "Free Classics",
    "subtitle": "77,000+ public domain books",
    "searchPlaceholder": "Search titles or authors...",
    "createAudiobook": "Create Audiobook",
    "noSlovakBooks": "📚 Slovak books are not available in the catalog. Browse English or German classics and listen in Slovak!",
    "noCzechBooks": "📚 Czech books are not available in the catalog. Browse English or German classics and listen in Czech!"
  },
  "generation": {
    "title": "Generate Audiobook",
    "subtitle": "Transform your ebooks into audiobooks",
    "uploadFile": "Upload File",
    "uploadFormats": "TXT, EPUB, MOBI, AZW3, PDF, DOC, DOCX",
    "estimatedCost": "Estimated cost: {{hours}} hours",
    "estimatedTime": "~{{minutes}} minutes to generate",
    "start": "Generate Audiobook",
    "insufficientHours": "Need {{hours}} more hours",
    "parsing": "Parsing file...",
    "analyzing": "Analyzing characters...",
    "dramatizing": "Creating dramatization...",
    "generating": "Generating audio...",
    "finalizing": "Finalizing..."
  },
  "settings": {
    "title": "Settings",
    "language": "App Language",
    "playback": "Playback",
    "defaultSpeed": "Default Speed",
    "notifications": "Notifications",
    "subscription": "Subscription",
    "currentPlan": "Current Plan",
    "hoursRemaining": "{{hours}} hours remaining",
    "manage": "Manage Subscription",
    "about": "About",
    "version": "Version",
    "privacy": "Privacy Policy",
    "terms": "Terms of Service"
  },
  "auth": {
    "login": "Log In",
    "register": "Create Account",
    "email": "Email",
    "password": "Password",
    "forgotPassword": "Forgot password?",
    "noAccount": "Don't have an account?",
    "hasAccount": "Already have an account?",
    "orContinueWith": "Or continue with"
  }
}
```

---

*Part 3 of 5 - Continue to Part 4: Design System*
