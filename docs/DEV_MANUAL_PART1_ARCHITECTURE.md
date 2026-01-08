# VoiceLibri Development Manual - Part 1: Architecture & Stack

> **Purpose:** Technical foundation for LLM coding agents  
> **Aligned with:** MOBILE_APP_DEVELOPMENT_GUIDE.md Sections 3, 4  
> **Audience:** Claude Opus 4.5 (Supervisor), GPT 5.1 Codex Max (Implementation)  
> **Last Updated:** January 7, 2026

---

## Quick Reference Card

| Attribute | Value |
|-----------|-------|
| **App Name** | VoiceLibri |
| **Frontends** | 1. PWA (primary) → 2. React Native (clone) |
| **Languages** | TypeScript strict mode only |
| **Styling** | Tailwind (PWA) / NativeWind (React Native) |
| **State** | Zustand (UI) + TanStack Query (server) |
| **Backend** | Express/Hono + TypeScript |
| **Database** | Supabase (Postgres) |
| **Storage** | Cloudflare R2 (audio files) |
| **TTS Engine** | Google Gemini TTS (multi-voice) |
| **Payments** | RevenueCat → App Store IAP + Google Play Billing |
| **Auth** | Supabase Auth |

---

## 1. Development Order (CRITICAL)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND BUILD SEQUENCE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   1️⃣ PWA (TypeScript/Vite)              Weeks 1-5                   │
│      └── PRIMARY development target                                  │
│      └── iPhone "Add to Home Screen" for realistic testing           │
│      └── Fast iteration, instant Vercel deploys                      │
│      └── Validate ALL features before native                         │
│                                                                      │
│   2️⃣ Backend Enhancement                 Weeks 6-9                  │
│      └── Already exists (POC in apps/backend)                        │
│      └── Add all format parsers                                      │
│      └── Gutenberg integration                                       │
│                                                                      │
│   3️⃣ React Native (Expo)                Weeks 10-14                 │
│      └── Clone proven PWA patterns                                   │
│      └── Same component names, same state logic                      │
│      └── Add native-only: background audio, IAP                      │
│      └── NativeWind = same Tailwind classes                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Why PWA First?**
| Benefit | Impact |
|---------|--------|
| No App Store delays | Test instantly on iPhone via Safari |
| Hot reload | See changes in <1 second |
| Same TypeScript | Code patterns transfer to React Native |
| Tailwind → NativeWind | Same utility classes work in both |
| Lower risk | Validate UX before investing in native complexity |
| Tester access | Share URL, no TestFlight invites needed |

---

## 2. Technology Stack Decisions

### 2.1 Framework: Expo (NOT Bare React Native)

**Decision: Use Expo SDK 53+ with Development Builds**

| Consideration | Bare React Native | Expo (Managed) | Expo (Dev Build) ✅ |
|---------------|-------------------|----------------|---------------------|
| Setup time | Days | Minutes | Minutes |
| Native modules | Manual linking | Limited | Full access |
| OTA updates | Manual setup | Built-in | Built-in |
| EAS Build | N/A | Yes | Yes |
| Background audio | Complex | Expo AV | Any library |
| Maintenance | High | Low | Low |

**Why Expo Development Builds:**
- React Native official docs NOW recommend Expo
- EAS Build handles iOS/Android compilation
- OTA updates for instant bug fixes
- Access to ANY native library via dev builds

### 2.2 State Management

**Decision: Zustand + TanStack Query**

| Purpose | Library | Reasoning |
|---------|---------|-----------|
| Server state | TanStack Query | Caching, deduplication, background refetch |
| UI state | Zustand | Simple, no boilerplate, persisted |
| Form state | React Hook Form | Validation, performance |

**NOT using Redux** - Overkill for this app. Zustand provides same benefits with 90% less code.

### 2.3 Storage Architecture

| Data Type | Storage | Sync Strategy |
|-----------|---------|---------------|
| Auth tokens | SecureStore | Never sync (device-local) |
| User preferences | MMKV | Sync on login |
| Book metadata | WatermelonDB | Offline-first with server sync |
| Audio files | File system | Download on demand |
| Playback position | MMKV + API | Sync every 5s while playing |

### 2.4 Audio Player Decision

**Decision: react-native-audio-pro**

| Library | Background | Lock Screen | Streaming | Our Choice |
|---------|------------|-------------|-----------|------------|
| Expo AV | ⚠️ Limited | ❌ No | ✅ Yes | ❌ |
| react-native-track-player | ✅ Yes | ✅ Yes | ✅ Yes | ❌ Unmaintained |
| react-native-audio-pro | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Active |

### 2.5 Payments Architecture

**Decision: RevenueCat with App Store IAP + Google Play Billing ONLY**

| Platform | Payment Method | Fee | Why |
|----------|---------------|-----|-----|
| iOS | App Store IAP | 15% (Small Business) | **Required by Apple** |
| Android | Google Play Billing | 15% | Simpler than Stripe alternative |
| PWA | N/A | - | No payments in PWA (testing only) |

**RevenueCat Benefits:**
- Single SDK for both platforms
- Handles receipt validation
- Subscription management dashboard
- Webhooks for backend sync
- Free up to $2,500/month MTR

```typescript
// Initialize RevenueCat
import Purchases from 'react-native-purchases';

await Purchases.configure({
  apiKey: Platform.OS === 'ios' 
    ? process.env.REVENUECAT_IOS_KEY
    : process.env.REVENUECAT_ANDROID_KEY,
});

// Purchase subscription
const { customerInfo } = await Purchases.purchasePackage(standardPackage);
```

**Products to Configure:**

| Product ID | Type | Price | Hours |
|------------|------|-------|-------|
| `standard_monthly` | Subscription | $7.99/mo | 20 hrs |
| `premium_monthly` | Subscription | $17.99/mo | 50 hrs |
| `hours_5` | Consumable | $2.50 | 5 hrs |
| `hours_15` | Consumable | $7.50 | 15 hrs |
| `hours_30` | Consumable | $15.00 | 30 hrs |

---

## 3. Architecture Overview

### 3.1 High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER DEVICES                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐              │
│   │   iOS App   │   │ Android App │   │     PWA     │              │
│   │   (Expo)    │   │   (Expo)    │   │   (Vite)    │              │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘              │
│          │                 │                 │                       │
│          └─────────────────┴─────────────────┘                       │
│                            │                                         │
│                     HTTPS REST API                                   │
│                            │                                         │
├────────────────────────────┼────────────────────────────────────────┤
│                            ▼                                         │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                     API GATEWAY                              │   │
│   │              (Express/Hono + TypeScript)                     │   │
│   │                                                              │   │
│   │  ┌───────────┐  ┌───────────┐  ┌───────────┐               │   │
│   │  │   Auth    │  │  Books    │  │ Generation│               │   │
│   │  │  Routes   │  │  Routes   │  │   Routes  │               │   │
│   │  └───────────┘  └───────────┘  └───────────┘               │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                            │                                         │
│          ┌─────────────────┼─────────────────┐                      │
│          ▼                 ▼                 ▼                       │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐              │
│   │  Supabase   │   │ Cloudflare  │   │   Gemini    │              │
│   │  (Postgres  │   │     R2      │   │    TTS      │              │
│   │   + Auth)   │   │  (Storage)  │   │   (Voice)   │              │
│   └─────────────┘   └─────────────┘   └─────────────┘              │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                      EXTERNAL SERVICES                               │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐              │
│   │  RevenueCat │   │  Gutendex   │   │   Sentry    │              │
│   │  (Payments) │   │ (Free Books)│   │  (Errors)   │              │
│   └─────────────┘   └─────────────┘   └─────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow: Book Generation

```
User uploads ebook
        │
        ▼
┌───────────────────┐
│  1. Parse file    │  TXT/EPUB/MOBI/AZW3/PDF/DOC/DOCX
│     (Backend)     │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  2. Chunk text    │  Split into ~2000 char chunks
│     by chapter    │  Detect dialogue/narration
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  3. Analyze       │  LLM identifies characters
│     characters    │  Assigns voice profiles
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  4. Generate TTS  │  Gemini TTS with multi-voice
│     (parallel)    │  ~3-5 min per hour of audio
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  5. Store audio   │  Upload to R2
│     + metadata    │  Create signed URLs
└────────┬──────────┘
         │
         ▼
    Book ready!
```

---

## 4. Folder Structure

### 4.1 PWA (`apps/pwa/`)

```
apps/pwa/
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── public/
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service worker
│   └── icons/                 # App icons
└── src/
    ├── main.tsx               # Entry point
    ├── App.tsx                # Root component
    ├── index.css              # Tailwind imports
    │
    ├── components/
    │   ├── ui/                # Reusable UI primitives
    │   │   ├── Button.tsx
    │   │   ├── Card.tsx
    │   │   ├── Input.tsx
    │   │   ├── Modal.tsx
    │   │   ├── Skeleton.tsx
    │   │   └── ProgressBar.tsx
    │   │
    │   ├── library/
    │   │   ├── BookCard.tsx
    │   │   ├── BookList.tsx
    │   │   └── EmptyLibrary.tsx
    │   │
    │   ├── player/
    │   │   ├── FullPlayer.tsx
    │   │   ├── MiniPlayer.tsx
    │   │   ├── ChapterList.tsx
    │   │   ├── SleepTimer.tsx
    │   │   └── SpeedControl.tsx
    │   │
    │   ├── generation/
    │   │   ├── FileUploader.tsx
    │   │   ├── CostEstimate.tsx
    │   │   └── ProgressTracker.tsx
    │   │
    │   └── classics/
    │       ├── ClassicsGrid.tsx
    │       ├── BookDetailModal.tsx
    │       └── LanguageFilter.tsx
    │
    ├── screens/               # Page components (routes)
    │   ├── LibraryScreen.tsx
    │   ├── PlayerScreen.tsx
    │   ├── GenerateScreen.tsx
    │   ├── FreeClassicsScreen.tsx
    │   ├── SettingsScreen.tsx
    │   ├── LoginScreen.tsx
    │   └── RegisterScreen.tsx
    │
    ├── hooks/
    │   ├── useAuth.ts
    │   ├── usePlayer.ts
    │   ├── useLibrary.ts
    │   ├── useGeneration.ts
    │   ├── useLocalizedBook.ts
    │   └── useSubscription.ts
    │
    ├── services/
    │   ├── api.ts             # API client (axios/fetch)
    │   ├── auth.ts            # Supabase auth wrapper
    │   ├── gutendex.ts        # Gutenberg API
    │   └── titleLocalization.ts
    │
    ├── stores/
    │   ├── playerStore.ts     # Zustand - playback state
    │   ├── authStore.ts       # Zustand - auth state
    │   └── settingsStore.ts   # Zustand - user preferences
    │
    ├── types/
    │   ├── book.ts
    │   ├── gutenberg.ts
    │   ├── player.ts
    │   ├── user.ts
    │   └── api.ts
    │
    ├── data/
    │   └── classicTitles.ts   # Curated title translations
    │
    ├── i18n/
    │   ├── index.ts           # i18next setup
    │   └── locales/
    │       ├── en.json
    │       ├── sk.json
    │       ├── cs.json
    │       ├── de.json
    │       └── es.json
    │
    └── utils/
        ├── formatters.ts      # Duration, date formatting
        ├── validators.ts      # Input validation
        └── constants.ts       # App constants
```

### 4.2 React Native (`apps/mobile/`)

**Same structure as PWA** - components port directly with minimal changes.

Key differences:
- `app/` folder uses Expo Router (file-based routing)
- `database/` folder for WatermelonDB
- Native-specific services (audioPlayer.ts uses react-native-audio-pro)

```
apps/mobile/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout with providers
│   ├── index.tsx                 # Entry redirect
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Tab bar configuration
│   │   ├── index.tsx             # Library (home)
│   │   ├── generate.tsx          # Upload & generate
│   │   ├── classics.tsx          # Free Classics
│   │   └── settings.tsx          # Settings & subscription
│   ├── book/
│   │   └── [id].tsx              # Book detail screen
│   └── player/
│       └── [id].tsx              # Full-screen player
│
├── src/
│   ├── components/               # Same as PWA
│   ├── hooks/                    # Same as PWA
│   ├── services/
│   │   ├── api.ts               # Same as PWA
│   │   ├── auth.ts              # Same as PWA
│   │   ├── gutendex.ts          # Same as PWA
│   │   ├── audioPlayer.ts       # NATIVE: react-native-audio-pro
│   │   ├── downloadManager.ts   # NATIVE: background downloads
│   │   └── syncManager.ts       # NATIVE: offline sync
│   ├── stores/                   # Same as PWA
│   ├── database/                 # NATIVE ONLY
│   │   ├── schema.ts            # WatermelonDB schema
│   │   ├── models/
│   │   │   ├── Book.ts
│   │   │   ├── Chapter.ts
│   │   │   └── PlaybackProgress.ts
│   │   └── index.ts
│   ├── types/                    # Same as PWA
│   ├── data/                     # Same as PWA
│   ├── i18n/                     # Same as PWA
│   └── utils/                    # Same as PWA
│
├── app.config.ts                 # Expo config
├── babel.config.js
├── tailwind.config.js            # Same as PWA
├── tsconfig.json
└── eas.json                      # EAS Build config
```

### 4.3 Backend (`apps/backend/`)

```
apps/backend/
├── src/
│   ├── index.ts                 # Entry point, server setup
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── books.ts
│   │   ├── generation.ts
│   │   ├── playback.ts
│   │   ├── subscription.ts
│   │   └── classics.ts          # Gutenberg processing
│   │
│   ├── services/
│   │   ├── bookParser.ts        # All format parsers
│   │   ├── chapterChunker.ts    # Text chunking
│   │   ├── characterAnalyzer.ts # LLM character detection
│   │   ├── ttsClient.ts         # Gemini TTS
│   │   ├── voiceAssigner.ts     # Voice assignment
│   │   ├── gutenbergProcessor.ts # PG header stripper
│   │   └── storageClient.ts     # R2 operations
│   │
│   ├── parsers/
│   │   ├── txtParser.ts
│   │   ├── epubParser.ts
│   │   ├── mobiParser.ts
│   │   ├── azw3Parser.ts
│   │   ├── pdfParser.ts
│   │   └── docxParser.ts
│   │
│   ├── middleware/
│   │   ├── auth.ts              # JWT validation
│   │   ├── rateLimit.ts
│   │   └── errorHandler.ts
│   │
│   ├── types/
│   │   └── index.ts
│   │
│   └── utils/
│       ├── logger.ts
│       └── validators.ts
│
├── package.json
└── tsconfig.json
```

---

## 5. Core Types

### 5.1 Book Types

```typescript
// types/book.ts

type BookStatus = 'uploading' | 'processing' | 'ready' | 'error';
type SourceFormat = 'txt' | 'epub' | 'mobi' | 'azw3' | 'pdf' | 'doc' | 'docx';

interface Book {
  id: string;
  userId: string;
  title: string;
  author: string;
  description?: string;
  coverUrl?: string;
  
  // Source info
  sourceFormat: SourceFormat;
  sourceLanguage: string;        // ISO 639-1 (e.g., 'en', 'cs')
  targetLanguage: string;        // Language of generated audio
  
  // Audio info
  totalDuration: number;         // Total seconds
  chapterCount: number;
  
  // Status
  status: BookStatus;
  progress?: number;             // 0-100 during processing
  errorMessage?: string;
  
  // Generation cost
  hoursUsed: number;
  
  // Timestamps
  createdAt: string;             // ISO 8601
  updatedAt: string;
  generatedAt?: string;
}

interface Chapter {
  id: string;
  bookId: string;
  number: number;                // 1-indexed
  title: string;
  duration: number;              // Seconds
  audioUrl: string;              // Signed URL (expires 24h)
  
  // For offline
  downloadedAt?: string;
  localPath?: string;
}

interface Character {
  name: string;
  voiceId: string;
  voiceName: string;             // Human-readable voice name
  gender: 'male' | 'female' | 'neutral';
  lineCount: number;
}
```

### 5.2 Gutenberg Types

```typescript
// types/gutenberg.ts

interface GutenbergBook {
  id: number;                    // Gutenberg ID
  title: string;
  authors: Array<{
    name: string;                // "Austen, Jane" format
    birth_year: number | null;
    death_year: number | null;
  }>;
  translators: Array<{
    name: string;
    birth_year: number | null;
    death_year: number | null;
  }>;
  subjects: string[];            // e.g., ["Fiction", "Love stories"]
  bookshelves: string[];         // e.g., ["Best Books Ever Listings"]
  languages: string[];           // ISO 639-1 codes
  copyright: boolean;            // false = public domain
  media_type: string;            // "Text"
  download_count: number;
  formats: {
    'application/epub+zip'?: string;
    'text/plain; charset=utf-8'?: string;
    'text/plain; charset=us-ascii'?: string;
    'text/html'?: string;
    'image/jpeg'?: string;       // Cover image
  };
}

interface GutenbergResponse {
  count: number;                 // Total results
  next: string | null;           // Next page URL
  previous: string | null;       // Previous page URL
  results: GutenbergBook[];
}

// Localized book info (our enhancement)
interface LocalizedBookInfo {
  title: string;                 // In user's language
  author: string;                // Localized author name
  source: 'curated' | 'wikipedia' | 'translated';
}
```

### 5.3 Player Types

```typescript
// types/player.ts

type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

interface PlayerState {
  // Current playback
  currentBookId: string | null;
  currentChapterIndex: number;
  
  // Playback status
  playbackState: PlaybackState;
  position: number;              // Current position in seconds
  duration: number;              // Chapter duration in seconds
  
  // Settings
  playbackSpeed: number;         // 0.5 - 2.0
  
  // Sleep timer
  sleepTimer: SleepTimer | null;
}

interface SleepTimer {
  type: 'time' | 'chapter';
  endsAt?: number;               // Unix timestamp for 'time' type
}

// Actions (Zustand store)
interface PlayerActions {
  setCurrentBook: (bookId: string, chapterIndex?: number) => void;
  setChapter: (index: number) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setPosition: (position: number) => void;
  setDuration: (duration: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setSleepTimer: (timer: SleepTimer | null) => void;
  updateProgress: (position: number, duration: number) => void;
}
```

### 5.4 User & Subscription Types

```typescript
// types/user.ts

type SubscriptionPlan = 'free' | 'standard' | 'premium' | 'none';

interface User {
  id: string;
  email: string;
  createdAt: string;
  
  // Subscription
  subscription: Subscription | null;
  
  // Pay-as-you-go balance
  hoursBalance: number;
}

interface Subscription {
  plan: SubscriptionPlan;
  expiresAt: string;             // ISO 8601
  hoursIncluded: number;         // Monthly hours
  hoursUsed: number;             // This billing period
  
  // RevenueCat info
  productId: string;
  purchaseDate: string;
  willRenew: boolean;
}

// For cost estimation
interface GenerationEstimate {
  estimatedHours: number;
  estimatedChapters: number;
  estimatedCharacters: number;   // Unique voices
  detectedLanguage: string;
  translationSurcharge: number | null;
  
  userBalance: {
    subscription: { hoursRemaining: number } | null;
    payAsYouGo: number;
  };
  
  canGenerate: boolean;
  insufficientHours: number | null;
}
```

---

## 6. Environment Variables

### 6.1 PWA (`.env`)

```bash
# API
VITE_API_URL=https://api.voicelibri.app
VITE_API_VERSION=v1

# Supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Analytics (optional)
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
VITE_MIXPANEL_TOKEN=xxx
```

### 6.2 React Native (`app.config.ts` extras)

```typescript
export default {
  expo: {
    extra: {
      apiUrl: process.env.API_URL,
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      revenueCatIosKey: process.env.REVENUECAT_IOS_KEY,
      revenueCatAndroidKey: process.env.REVENUECAT_ANDROID_KEY,
      sentryDsn: process.env.SENTRY_DSN,
    },
  },
};
```

### 6.3 Backend (`.env`)

```bash
# Server
PORT=3001
NODE_ENV=production

# Database
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Storage
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=voicelibri-audio

# TTS
GEMINI_API_KEY=xxx

# Payments (webhook validation)
REVENUECAT_WEBHOOK_SECRET=xxx

# Security
JWT_SECRET=xxx
CORS_ORIGINS=https://voicelibri.app,https://app.voicelibri.app
```

---

## 7. Development Commands

### 7.1 PWA

```bash
# Install dependencies
cd apps/pwa
npm install

# Development (hot reload)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Deploy to Vercel
vercel
# or auto-deploy via GitHub integration
```

### 7.2 React Native

```bash
# Install dependencies
cd apps/mobile
npm install

# Start Metro bundler (requires dev build)
npx expo start --dev-client

# Create development build
eas build --profile development --platform ios
eas build --profile development --platform android

# Create production build
eas build --profile production --platform all

# Submit to stores
eas submit --platform ios
eas submit --platform android

# OTA update (JavaScript only)
eas update --branch production
```

### 7.3 Backend

```bash
# Install dependencies
cd apps/backend
npm install

# Development (nodemon)
npm run dev

# Build TypeScript
npm run build

# Run production
npm start

# Run tests
npm test
```

---

## 8. Code Quality Standards

### 8.1 TypeScript Configuration

```json
// tsconfig.json (shared settings)
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### 8.2 ESLint Rules

```javascript
// .eslintrc.js
module.exports = {
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    'react-hooks/exhaustive-deps': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
```

### 8.3 Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `BookCard.tsx` |
| Hooks | camelCase, `use` prefix | `usePlayer.ts` |
| Services | camelCase | `gutendex.ts` |
| Stores | camelCase, `Store` suffix | `playerStore.ts` |
| Types/Interfaces | PascalCase | `GutenbergBook` |
| Constants | SCREAMING_SNAKE | `API_BASE_URL` |
| Files | camelCase or kebab-case | `formatters.ts` |

### 8.4 Component Pattern

```typescript
// Always use this structure for components

interface BookCardProps {
  book: Book;
  onPress?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export function BookCard({ 
  book, 
  onPress,
  size = 'md',
}: BookCardProps): JSX.Element {
  // 1. Hooks first
  const { t } = useTranslation();
  const navigation = useNavigation();
  
  // 2. Derived state
  const formattedDuration = formatDuration(book.totalDuration);
  
  // 3. Handlers
  const handlePress = () => {
    onPress?.();
    navigation.navigate('BookDetail', { id: book.id });
  };
  
  // 4. Render
  return (
    <Pressable onPress={handlePress} className="...">
      {/* ... */}
    </Pressable>
  );
}
```

---

*Part 1 of 5 - Continue to Part 2: API Contract & Backend*
