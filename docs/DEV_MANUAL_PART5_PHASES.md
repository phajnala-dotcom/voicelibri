# VoiceLibri Development Manual - Part 5: Development Phases

> **Purpose:** Complete development workflow and phase breakdown for LLM coding agents  
> **Aligned with:** MOBILE_APP_DEVELOPMENT_GUIDE.md Section 9  
> **Audience:** Claude Opus 4.5 (Supervisor), GPT 5.1 Codex Max (Implementation)  
> **Last Updated:** January 7, 2026

---

## 1. Development Sequence Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT SEQUENCE (20 weeks)                      │
├──────────────────┬──────────────────┬──────────────────────────────────┤
│   PHASE 1-2      │    PHASE 3       │        PHASE 4-5                 │
│   PWA (5 wks)    │  Backend (4 wks) │   React Native (6 wks)          │
├──────────────────┼──────────────────┼──────────────────────────────────┤
│ • Vite + React   │ • Express/Hono   │ • Expo SDK 53+                  │
│ • Tailwind CSS   │ • Supabase       │ • NativeWind                     │
│ • UI Components  │ • R2 Storage     │ • Audio Player                   │
│ • All Screens    │ • TTS Pipeline   │ • Offline Mode                   │
│ • State Mgmt     │ • Gutendex API   │ • RevenueCat IAP                 │
│ • i18n           │ • Auth           │ • Store Submission               │
├──────────────────┴──────────────────┴──────────────────────────────────┤
│                        PWA FIRST APPROACH                              │
│   Why: Faster iteration, instant preview, component validation         │
│   Then: Clone to React Native with NativeWind (same Tailwind classes)  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 1: PWA Core (Weeks 1-3)

### 2.1 Week 1: Project Setup & Foundation

**Day 1-2: Project Scaffolding**
```bash
# Create project
npm create vite@latest voicelibri-pwa -- --template react-ts
cd voicelibri-pwa

# Core dependencies
npm install react-router-dom@6 @tanstack/react-query zustand axios
npm install i18next react-i18next i18next-browser-languagedetector
npm install howler  # Audio playback

# Tailwind setup
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Dev dependencies
npm install -D @types/howler eslint prettier
```

**Day 2-3: Configure Tailwind**
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
      },
    },
  },
  plugins: [],
};
```

**Day 3-4: Folder Structure**
```
src/
├── components/
│   ├── ui/            # Button, Input, Card, etc.
│   ├── library/       # BookCard, EmptyState
│   ├── player/        # Controls, Progress, MiniPlayer
│   └── layout/        # Screen, BottomNav
├── screens/
│   ├── LibraryScreen.tsx
│   ├── PlayerScreen.tsx
│   ├── GenerateScreen.tsx
│   ├── FreeClassicsScreen.tsx
│   ├── SettingsScreen.tsx
│   ├── LoginScreen.tsx
│   └── RegisterScreen.tsx
├── hooks/
│   ├── useLibrary.ts
│   ├── usePlayer.ts
│   └── useGeneration.ts
├── stores/
│   ├── authStore.ts
│   ├── playerStore.ts
│   └── settingsStore.ts
├── services/
│   ├── api.ts
│   └── gutendex.ts
├── i18n/
│   ├── index.ts
│   └── locales/
│       ├── en.json
│       ├── sk.json
│       ├── cs.json
│       ├── de.json
│       └── es.json
├── types/
│   └── index.ts
├── App.tsx
├── main.tsx
└── index.css
```

**Day 5: UI Foundation Components**
- [ ] Button (primary, secondary, ghost, destructive)
- [ ] Input (with label, error, icons)
- [ ] Card (elevated, outlined, glass)
- [ ] Skeleton loading states
- [ ] Spinner

### 2.2 Week 2: Core Screens

**Day 1-2: Auth Screens**
- [ ] LoginScreen
- [ ] RegisterScreen
- [ ] AuthContext with mock tokens
- [ ] Protected route wrapper

**Day 3-4: Library Screen**
- [ ] BookCard component
- [ ] Grid layout (2 columns mobile, 3-4 desktop)
- [ ] Empty state with CTA
- [ ] Pull-to-refresh
- [ ] Infinite scroll
- [ ] Generating books section

**Day 5: Player Screen Foundation**
- [ ] Full-screen layout
- [ ] Cover art display
- [ ] Chapter info
- [ ] Placeholder controls

### 2.3 Week 3: Player & Generation

**Day 1-2: Audio Player Implementation**
- [ ] Howler.js integration
- [ ] Progress slider
- [ ] Play/Pause/Skip controls
- [ ] Speed selector (0.5x - 2x)
- [ ] Chapter navigation
- [ ] Mini player component

**Day 3-4: Generation Screen**
- [ ] File upload (drag & drop)
- [ ] Estimation display
- [ ] Progress tracking UI
- [ ] Generation status polling

**Day 5: Free Classics Screen**
- [ ] Gutendex API integration
- [ ] Language filter (en/de/es)
- [ ] Search functionality
- [ ] Book detail modal
- [ ] Generate from classic button

---

## 3. Phase 2: PWA Polish (Weeks 4-5)

### 3.1 Week 4: i18n & State Management

**Day 1-2: Complete i18n**
- [ ] All 5 languages (en, sk, cs, de, es)
- [ ] Language switcher in Settings
- [ ] Number/date formatting
- [ ] RTL prep (for future)

**Day 3-4: Zustand Stores**
- [ ] authStore with persistence
- [ ] playerStore with speed persistence
- [ ] settingsStore

**Day 5: React Query Integration**
- [ ] useLibrary hook
- [ ] useGeneration hook
- [ ] Optimistic updates
- [ ] Error handling

### 3.2 Week 5: PWA Features & Polish

**Day 1-2: PWA Configuration**
```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'VoiceLibri',
        short_name: 'VoiceLibri',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.voicelibri\.app\/api/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
});
```

**Day 3: Animations & Transitions**
- [ ] Page transitions
- [ ] Button press feedback
- [ ] Loading skeletons
- [ ] Toast notifications

**Day 4: Settings Screen**
- [ ] Language selector
- [ ] Default speed
- [ ] Notifications toggle
- [ ] Subscription info (placeholder)
- [ ] About section

**Day 5: Testing & Deployment**
- [ ] Cross-browser testing
- [ ] Mobile responsiveness
- [ ] Deploy to Vercel
- [ ] PWA installation test

---

## 4. Phase 3: Backend (Weeks 6-9)

### 4.1 Week 6: Backend Foundation

**Day 1-2: Project Setup**
```bash
mkdir voicelibri-backend && cd voicelibri-backend
npm init -y
npm install express cors helmet compression
npm install @supabase/supabase-js
npm install @google-cloud/text-to-speech
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
npm install zod express-rate-limit
npm install -D typescript @types/express tsx
```

**Day 3: Supabase Schema**
```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  subscription_plan TEXT DEFAULT 'free',
  hours_balance DECIMAL(10,2) DEFAULT 0,
  subscription_hours_remaining DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Books table
CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  cover_url TEXT,
  source_type TEXT NOT NULL, -- 'upload' | 'gutenberg'
  gutenberg_id INTEGER,
  original_language TEXT,
  output_language TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating',
  total_duration INTEGER DEFAULT 0,
  hours_used DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chapters table
CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  title TEXT,
  audio_url TEXT,
  duration INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(book_id, chapter_index)
);

-- Playback positions
CREATE TABLE playback_positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  position DECIMAL(10,2) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, book_id)
);

-- Generation jobs
CREATE TABLE generation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  current_phase TEXT,
  error TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE playback_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can view own books" ON books
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view chapters of own books" ON chapters
  FOR SELECT USING (
    book_id IN (SELECT id FROM books WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage own playback" ON playback_positions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own jobs" ON generation_jobs
  FOR SELECT USING (auth.uid() = user_id);
```

**Day 4-5: Core API Routes**
- [ ] Auth routes (register, login, refresh, logout)
- [ ] Books CRUD
- [ ] Playback position sync
- [ ] Error handling middleware

### 4.2 Week 7: TTS Integration

**Day 1-2: Google Gemini TTS**
```typescript
// services/ttsClient.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface TTSOptions {
  text: string;
  voice: string;
  language: string;
  speakingRate?: number;
}

export async function generateSpeech(options: TTSOptions): Promise<Buffer> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    generationConfig: {
      responseModalities: ['audio'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: options.voice,
          },
        },
      },
    },
  });

  const result = await model.generateContent(options.text);
  
  // Extract audio data from response
  const audioData = result.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  
  if (!audioData) {
    throw new Error('No audio generated');
  }
  
  return Buffer.from(audioData, 'base64');
}

// Voice mapping per language
export const VOICE_CONFIG = {
  en: { narrator: 'Puck', male: 'Charon', female: 'Kore' },
  sk: { narrator: 'Puck', male: 'Charon', female: 'Kore' },
  cs: { narrator: 'Puck', male: 'Charon', female: 'Kore' },
  de: { narrator: 'Kore', male: 'Charon', female: 'Aoede' },
  es: { narrator: 'Aoede', male: 'Charon', female: 'Kore' },
};
```

**Day 3-4: R2 Storage**
```typescript
// services/storageClient.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET!;

export async function uploadAudio(
  key: string,
  data: Buffer,
  contentType = 'audio/mpeg'
): Promise<string> {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: data,
    ContentType: contentType,
  }));
  
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

export async function getSignedDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  
  return getSignedUrl(r2, command, { expiresIn: 3600 });
}
```

**Day 5: Generation Pipeline**
```typescript
// services/generationPipeline.ts
import { supabase } from './supabase';
import { generateSpeech, VOICE_CONFIG } from './ttsClient';
import { uploadAudio } from './storageClient';
import { parseBook } from './bookParser';
import { dramatizeChapter } from './dramatizer';

interface GenerationJob {
  jobId: string;
  bookId: string;
  userId: string;
  content: string;
  language: string;
}

export async function processGeneration(job: GenerationJob): Promise<void> {
  const { jobId, bookId, content, language } = job;
  
  try {
    // Phase 1: Parse
    await updateJobStatus(jobId, 'processing', 10, 'parsing');
    const chapters = parseBook(content);
    
    // Phase 2: Dramatize
    await updateJobStatus(jobId, 'processing', 20, 'analyzing');
    const dramatized = await Promise.all(
      chapters.map((ch) => dramatizeChapter(ch, language))
    );
    
    // Phase 3: Generate audio
    const voices = VOICE_CONFIG[language as keyof typeof VOICE_CONFIG];
    let totalDuration = 0;
    
    for (let i = 0; i < dramatized.length; i++) {
      const progress = 30 + Math.round((i / dramatized.length) * 60);
      await updateJobStatus(jobId, 'processing', progress, 'generating');
      
      const chapter = dramatized[i];
      const audioBuffers: Buffer[] = [];
      
      for (const segment of chapter.segments) {
        const voice = segment.speaker === 'narrator' 
          ? voices.narrator 
          : segment.gender === 'female' 
            ? voices.female 
            : voices.male;
        
        const audio = await generateSpeech({
          text: segment.text,
          voice,
          language,
        });
        audioBuffers.push(audio);
      }
      
      // Concatenate and upload
      const combined = Buffer.concat(audioBuffers);
      const key = `audio/${bookId}/chapter_${i}.mp3`;
      const audioUrl = await uploadAudio(key, combined);
      
      const duration = estimateDuration(combined.length);
      totalDuration += duration;
      
      // Save chapter
      await supabase.from('chapters').insert({
        book_id: bookId,
        chapter_index: i,
        title: chapter.title,
        audio_url: audioUrl,
        duration,
      });
    }
    
    // Phase 4: Finalize
    await updateJobStatus(jobId, 'processing', 95, 'finalizing');
    
    await supabase
      .from('books')
      .update({
        status: 'ready',
        total_duration: totalDuration,
        hours_used: totalDuration / 3600,
      })
      .eq('id', bookId);
    
    await updateJobStatus(jobId, 'completed', 100, null);
    
  } catch (error) {
    await updateJobStatus(jobId, 'failed', 0, null, (error as Error).message);
    throw error;
  }
}

async function updateJobStatus(
  jobId: string,
  status: string,
  progress: number,
  phase: string | null,
  error: string | null = null
): Promise<void> {
  await supabase
    .from('generation_jobs')
    .update({
      status,
      progress,
      current_phase: phase,
      error,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}
```

### 4.3 Week 8: Gutenberg Integration

**Day 1-2: Gutendex Service**
```typescript
// services/gutendex.ts
import axios from 'axios';

const GUTENDEX_BASE = 'https://gutendex.com';

interface GutendexBook {
  id: number;
  title: string;
  authors: Array<{ name: string }>;
  languages: string[];
  formats: Record<string, string>;
  download_count: number;
}

interface GutendexResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutendexBook[];
}

export async function searchGutenberg(
  query: string,
  language?: string
): Promise<GutendexResponse> {
  const params = new URLSearchParams({ search: query });
  if (language) params.append('languages', language);
  
  const { data } = await axios.get<GutendexResponse>(
    `${GUTENDEX_BASE}/books?${params}`
  );
  return data;
}

export async function getPopularBooks(
  language: string,
  page = 1
): Promise<GutendexResponse> {
  const { data } = await axios.get<GutendexResponse>(
    `${GUTENDEX_BASE}/books?languages=${language}&page=${page}&sort=popular`
  );
  return data;
}

export async function fetchBookContent(book: GutendexBook): Promise<string> {
  // Prefer plain text
  const textUrl = book.formats['text/plain; charset=utf-8'] 
    || book.formats['text/plain'];
  
  if (!textUrl) {
    throw new Error('No text format available');
  }
  
  const { data } = await axios.get<string>(textUrl);
  return stripGutenbergHeader(data);
}

// Remove Project Gutenberg legal headers/footers
function stripGutenbergHeader(text: string): string {
  const startMarkers = [
    '*** START OF THE PROJECT GUTENBERG',
    '***START OF THE PROJECT GUTENBERG',
    '*END*THE SMALL PRINT',
  ];
  
  const endMarkers = [
    '*** END OF THE PROJECT GUTENBERG',
    '***END OF THE PROJECT GUTENBERG',
    'End of the Project Gutenberg',
    'End of Project Gutenberg',
  ];
  
  let content = text;
  
  // Find and remove header
  for (const marker of startMarkers) {
    const idx = content.indexOf(marker);
    if (idx !== -1) {
      const lineEnd = content.indexOf('\n', idx);
      content = content.substring(lineEnd + 1);
      break;
    }
  }
  
  // Find and remove footer
  for (const marker of endMarkers) {
    const idx = content.indexOf(marker);
    if (idx !== -1) {
      content = content.substring(0, idx);
      break;
    }
  }
  
  return content.trim();
}
```

**Day 3: Title Localization**
```typescript
// services/titleLocalizer.ts

// Curated mappings for top ~200 classics
const TITLE_MAPPINGS: Record<string, Record<string, string>> = {
  'Pride and Prejudice': {
    sk: 'Pýcha a predsudok',
    cs: 'Pýcha a předsudek',
    de: 'Stolz und Vorurteil',
    es: 'Orgullo y prejuicio',
  },
  'The Great Gatsby': {
    sk: 'Veľký Gatsby',
    cs: 'Velký Gatsby',
    de: 'Der große Gatsby',
    es: 'El gran Gatsby',
  },
  // ... 200+ more titles
};

// Wikipedia API fallback
async function getWikipediaTitle(
  englishTitle: string,
  targetLang: string
): Promise<string | null> {
  try {
    // First, get the Wikipedia page for the English title
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(englishTitle)}&prop=langlinks&lllang=${targetLang}&format=json&origin=*`;
    
    const { data } = await axios.get(searchUrl);
    const pages = data.query?.pages;
    
    if (!pages) return null;
    
    const page = Object.values(pages)[0] as any;
    return page?.langlinks?.[0]?.['*'] || null;
  } catch {
    return null;
  }
}

export async function localizeTitle(
  originalTitle: string,
  targetLanguage: string
): Promise<{ title: string; source: 'curated' | 'wikipedia' | 'translated' }> {
  // 1. Check curated mappings
  const curated = TITLE_MAPPINGS[originalTitle]?.[targetLanguage];
  if (curated) {
    return { title: curated, source: 'curated' };
  }
  
  // 2. Try Wikipedia
  const wikiTitle = await getWikipediaTitle(originalTitle, targetLanguage);
  if (wikiTitle) {
    return { title: wikiTitle, source: 'wikipedia' };
  }
  
  // 3. Fallback: Keep original (or translate via LLM in future)
  return { title: originalTitle, source: 'translated' };
}
```

**Day 4-5: Classic Generation Endpoint**
```typescript
// routes/classics.ts
router.post('/generate', authMiddleware, async (req, res) => {
  const { gutenbergId, targetLanguage } = req.body;
  const idempotencyKey = req.headers['idempotency-key'] as string;
  
  // Check idempotency
  const existingJob = await supabase
    .from('generation_jobs')
    .select()
    .eq('idempotency_key', idempotencyKey)
    .single();
  
  if (existingJob.data) {
    return res.json({
      jobId: existingJob.data.id,
      bookId: existingJob.data.book_id,
    });
  }
  
  // Fetch book info from Gutendex
  const bookInfo = await getGutenbergBook(gutenbergId);
  
  // Localize title
  const localizedTitle = await localizeTitle(bookInfo.title, targetLanguage);
  
  // Estimate hours
  const content = await fetchBookContent(bookInfo);
  const estimatedHours = estimateGenerationHours(content);
  
  // Check user hours
  const user = await getUser(req.userId);
  const availableHours = user.subscription_hours_remaining + user.hours_balance;
  
  if (availableHours < estimatedHours) {
    return res.status(402).json({
      error: 'insufficient_hours',
      required: estimatedHours,
      available: availableHours,
    });
  }
  
  // Create book record
  const { data: book } = await supabase
    .from('books')
    .insert({
      user_id: req.userId,
      title: localizedTitle.title,
      author: bookInfo.authors[0]?.name,
      source_type: 'gutenberg',
      gutenberg_id: gutenbergId,
      original_language: bookInfo.languages[0],
      output_language: targetLanguage,
      status: 'generating',
    })
    .select()
    .single();
  
  // Create job
  const { data: job } = await supabase
    .from('generation_jobs')
    .insert({
      book_id: book.id,
      user_id: req.userId,
      idempotency_key: idempotencyKey,
    })
    .select()
    .single();
  
  // Queue generation (async)
  queueGeneration({
    jobId: job.id,
    bookId: book.id,
    userId: req.userId,
    content,
    language: targetLanguage,
  });
  
  res.json({
    jobId: job.id,
    bookId: book.id,
  });
});
```

### 4.4 Week 9: Polish & Deploy

**Day 1-2: Error Handling & Validation**
- [ ] Zod schemas for all inputs
- [ ] Consistent error responses
- [ ] Rate limiting
- [ ] Request logging

**Day 3: Testing**
- [ ] Unit tests for services
- [ ] Integration tests for API
- [ ] Load testing

**Day 4-5: Deployment**
```yaml
# fly.toml
app = "voicelibri-api"

[env]
  NODE_ENV = "production"

[http_service]
  internal_port = 3001
  force_https = true

[[services.ports]]
  handlers = ["http"]
  port = 80

[[services.ports]]
  handlers = ["tls", "http"]
  port = 443
```

---

## 5. Phase 4: React Native Core (Weeks 10-12)

### 5.1 Week 10: Project Setup & Clone

**Day 1-2: Create Expo Project**
```bash
npx create-expo-app@latest voicelibri-app --template tabs
cd voicelibri-app

# Core dependencies
npx expo install expo-router
npm install zustand @tanstack/react-query axios
npm install i18next react-i18next

# UI
npm install nativewind tailwindcss
npx expo install react-native-reanimated react-native-gesture-handler

# Storage
npm install react-native-mmkv

# Configure EAS
eas build:configure
```

**Day 3: Configure NativeWind**
```javascript
// babel.config.js
module.exports = function(api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: ['react-native-reanimated/plugin'],
  };
};

// tailwind.config.js (copy from PWA)
// nativewind.d.ts
/// <reference types="nativewind/types" />
```

**Day 4-5: Clone PWA Screens**
- Copy component logic, adjust for React Native
- Replace HTML elements with RN components
- Same Tailwind classes via NativeWind

### 5.2 Week 11: Native Features

**Day 1-2: Audio Player**
```typescript
// services/audioPlayer.ts
import AudioPro from 'react-native-audio-pro';

class AudioPlayerService {
  private currentBookId: string | null = null;
  
  async initialize(): Promise<void> {
    await AudioPro.setup({
      capabilities: [
        'play', 'pause', 'stop', 'seekTo',
        'skipToNext', 'skipToPrevious',
        'setSpeed', 'setSleep',
      ],
    });
  }
  
  async loadTrack(chapter: {
    id: string;
    title: string;
    audioUrl: string;
    bookTitle: string;
    artwork?: string;
  }): Promise<void> {
    await AudioPro.load({
      url: chapter.audioUrl,
      title: chapter.title,
      artist: chapter.bookTitle,
      artwork: chapter.artwork,
    });
  }
  
  async play(): Promise<void> {
    await AudioPro.play();
  }
  
  async pause(): Promise<void> {
    await AudioPro.pause();
  }
  
  async seekTo(position: number): Promise<void> {
    await AudioPro.seekTo(position);
  }
  
  async setSpeed(rate: number): Promise<void> {
    await AudioPro.setSpeed(rate);
  }
  
  onProgress(callback: (position: number, duration: number) => void): void {
    AudioPro.addEventListener('progress', (data) => {
      callback(data.position, data.duration);
    });
  }
  
  onStateChange(callback: (state: string) => void): void {
    AudioPro.addEventListener('state', (data) => {
      callback(data.state);
    });
  }
}

export const audioPlayer = new AudioPlayerService();
```

**Day 3-4: Offline Storage (WatermelonDB)**
```typescript
// database/schema.ts
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'books',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'author', type: 'string', isOptional: true },
        { name: 'cover_url', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'total_duration', type: 'number' },
        { name: 'synced_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'chapters',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'book_id', type: 'string', isIndexed: true },
        { name: 'chapter_index', type: 'number' },
        { name: 'title', type: 'string', isOptional: true },
        { name: 'audio_url', type: 'string' },
        { name: 'local_path', type: 'string', isOptional: true },
        { name: 'duration', type: 'number' },
        { name: 'is_downloaded', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: 'playback_positions',
      columns: [
        { name: 'book_id', type: 'string', isIndexed: true },
        { name: 'chapter_index', type: 'number' },
        { name: 'position', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced', type: 'boolean' },
      ],
    }),
  ],
});
```

**Day 5: Download Manager**
```typescript
// services/downloadManager.ts
import * as FileSystem from 'expo-file-system';
import { database } from '../database';

class DownloadManager {
  private activeDownloads: Map<string, FileSystem.DownloadResumable> = new Map();
  
  async downloadChapter(
    chapterId: string,
    audioUrl: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const localPath = `${FileSystem.documentDirectory}audio/${chapterId}.mp3`;
    
    // Ensure directory exists
    await FileSystem.makeDirectoryAsync(
      `${FileSystem.documentDirectory}audio/`,
      { intermediates: true }
    );
    
    const download = FileSystem.createDownloadResumable(
      audioUrl,
      localPath,
      {},
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / 
          downloadProgress.totalBytesExpectedToWrite;
        onProgress?.(progress);
      }
    );
    
    this.activeDownloads.set(chapterId, download);
    
    try {
      const result = await download.downloadAsync();
      
      // Update database
      await database.write(async () => {
        const chapter = await database.get('chapters')
          .query(Q.where('server_id', chapterId))
          .fetch();
        
        if (chapter[0]) {
          await chapter[0].update((c) => {
            c.localPath = localPath;
            c.isDownloaded = true;
          });
        }
      });
      
      return localPath;
    } finally {
      this.activeDownloads.delete(chapterId);
    }
  }
  
  async downloadBook(bookId: string, onProgress?: (progress: number) => void): Promise<void> {
    const chapters = await database.get('chapters')
      .query(Q.where('book_id', bookId))
      .fetch();
    
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      if (!chapter.isDownloaded) {
        await this.downloadChapter(
          chapter.serverId,
          chapter.audioUrl,
          (chapterProgress) => {
            const overall = (i + chapterProgress) / chapters.length;
            onProgress?.(overall);
          }
        );
      }
    }
  }
  
  async deleteBookDownloads(bookId: string): Promise<void> {
    const chapters = await database.get('chapters')
      .query(Q.where('book_id', bookId))
      .fetch();
    
    await database.write(async () => {
      for (const chapter of chapters) {
        if (chapter.localPath) {
          await FileSystem.deleteAsync(chapter.localPath, { idempotent: true });
          await chapter.update((c) => {
            c.localPath = null;
            c.isDownloaded = false;
          });
        }
      }
    });
  }
}

export const downloadManager = new DownloadManager();
```

### 5.3 Week 12: RevenueCat Integration

**Day 1-2: RevenueCat Setup**
```typescript
// services/purchases.ts
import Purchases, {
  PurchasesPackage,
  CustomerInfo,
} from 'react-native-purchases';

// Initialize (call in app startup)
export async function initializePurchases(userId: string): Promise<void> {
  await Purchases.configure({
    apiKey: Platform.select({
      ios: process.env.REVENUECAT_IOS_KEY!,
      android: process.env.REVENUECAT_ANDROID_KEY!,
    })!,
  });
  
  await Purchases.logIn(userId);
}

// Get available packages
export async function getOfferings(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

// Purchase subscription
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

// Purchase consumable hours
export async function purchaseHours(
  packageId: string
): Promise<CustomerInfo> {
  const offerings = await Purchases.getOfferings();
  const pkg = offerings.all['hours']?.availablePackages.find(
    (p) => p.identifier === packageId
  );
  
  if (!pkg) throw new Error('Package not found');
  
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

// Check subscription status
export async function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

// Restore purchases
export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}
```

**Day 3: Subscription Screen**
```tsx
// screens/SubscriptionScreen.tsx
import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { getOfferings, purchasePackage, getCustomerInfo } from '../services/purchases';
import { PurchasesPackage } from 'react-native-purchases';

export function SubscriptionScreen() {
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    loadOfferings();
  }, []);

  async function loadOfferings() {
    try {
      const pkgs = await getOfferings();
      setPackages(pkgs);
    } finally {
      setLoading(false);
    }
  }

  async function handlePurchase(pkg: PurchasesPackage) {
    setPurchasing(true);
    try {
      await purchasePackage(pkg);
      // Sync with backend
      await syncSubscriptionStatus();
    } catch (error) {
      // Handle error
    } finally {
      setPurchasing(false);
    }
  }

  if (loading) {
    return <ActivityIndicator />;
  }

  return (
    <View className="flex-1 bg-background-base p-4">
      <Text className="text-2xl font-bold text-white mb-6">
        Choose Your Plan
      </Text>
      
      {packages.map((pkg) => (
        <TouchableOpacity
          key={pkg.identifier}
          onPress={() => handlePurchase(pkg)}
          disabled={purchasing}
          className="bg-background-elevated rounded-2xl p-4 mb-3"
        >
          <Text className="text-white font-semibold text-lg">
            {pkg.product.title}
          </Text>
          <Text className="text-zinc-400 mt-1">
            {pkg.product.description}
          </Text>
          <Text className="text-violet-500 font-bold text-xl mt-2">
            {pkg.product.priceString}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
```

**Day 4-5: Backend Webhook**
```typescript
// routes/webhooks.ts
import { verifyRevenueCatSignature } from '../utils/revenuecat';

router.post('/revenuecat', async (req, res) => {
  // Verify webhook signature
  if (!verifyRevenueCatSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const { event } = req.body;
  const userId = event.app_user_id;
  
  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
      await updateSubscription(userId, {
        plan: event.product_id.includes('premium') ? 'premium' : 'standard',
        hoursRemaining: event.product_id.includes('premium') ? 50 : 20,
        expiresAt: new Date(event.expiration_at_ms),
      });
      break;
      
    case 'CANCELLATION':
    case 'EXPIRATION':
      await updateSubscription(userId, {
        plan: 'free',
        hoursRemaining: 0,
        expiresAt: null,
      });
      break;
      
    case 'NON_RENEWING_PURCHASE':
      // Consumable hours purchase
      const hours = getHoursFromProductId(event.product_id);
      await addHoursBalance(userId, hours);
      break;
  }
  
  res.json({ received: true });
});
```

---

## 6. Phase 5: Polish & Launch (Weeks 13-14)

### 6.1 Week 13: Testing & QA

**Day 1-2: Unit Tests**
```typescript
// __tests__/hooks/usePlayer.test.ts
import { renderHook, act } from '@testing-library/react-hooks';
import { usePlayer } from '../../src/hooks/usePlayer';

describe('usePlayer', () => {
  it('should initialize with idle state', () => {
    const { result } = renderHook(() => usePlayer());
    expect(result.current.playbackState).toBe('idle');
  });
  
  it('should load book and set state to loading', async () => {
    const { result } = renderHook(() => usePlayer());
    
    await act(async () => {
      await result.current.loadBook('book-123');
    });
    
    expect(result.current.currentBook).toBeDefined();
  });
});
```

**Day 3: E2E Tests**
```typescript
// e2e/library.test.ts
describe('Library Screen', () => {
  beforeAll(async () => {
    await device.launchApp();
  });
  
  it('should display empty state for new user', async () => {
    await expect(element(by.text('No audiobooks yet'))).toBeVisible();
  });
  
  it('should navigate to Free Classics', async () => {
    await element(by.text('Browse Free Classics')).tap();
    await expect(element(by.text('Free Classics'))).toBeVisible();
  });
});
```

**Day 4-5: Manual Testing Matrix**

| Feature | iOS | Android | PWA |
|---------|-----|---------|-----|
| Login/Register | ☐ | ☐ | ☐ |
| Social Auth | ☐ | ☐ | N/A |
| Library Grid | ☐ | ☐ | ☐ |
| Audio Playback | ☐ | ☐ | ☐ |
| Background Audio | ☐ | ☐ | N/A |
| Lock Screen Controls | ☐ | ☐ | N/A |
| File Upload | ☐ | ☐ | ☐ |
| Generation Flow | ☐ | ☐ | ☐ |
| Free Classics | ☐ | ☐ | ☐ |
| Subscription Purchase | ☐ | ☐ | N/A |
| Offline Playback | ☐ | ☐ | N/A |
| i18n (5 langs) | ☐ | ☐ | ☐ |
| Sleep Timer | ☐ | ☐ | ☐ |
| Speed Control | ☐ | ☐ | ☐ |

### 6.2 Week 14: Store Submission

**Day 1: App Store Assets**
```
Required:
- App Icon 1024x1024 (no alpha)
- Screenshots 6.7" (1290x2796)
- Screenshots 6.5" (1284x2778)
- Screenshots 5.5" (1242x2208) - optional
- iPad screenshots - optional
- Preview video (15-30s) - recommended
```

**Day 2: App Store Listing**
```
Title: VoiceLibri - AI Audiobooks
Subtitle: Dramatized voices for any book

Description:
Transform any ebook into a professional audiobook with AI-powered multi-voice dramatization.

• MULTI-VOICE NARRATION - Different voices for each character
• FREE CLASSICS - 77,000+ public domain books
• UPLOAD YOUR BOOKS - TXT, EPUB, PDF support
• 5 LANGUAGES - Listen in English, Slovak, Czech, German, or Spanish
• OFFLINE LISTENING - Download for anywhere

Keywords: audiobook,ai,tts,ebook,dramatized,narrator,voice

Categories: Books, Entertainment
```

**Day 3: Google Play Listing**
- Similar content to App Store
- Content rating questionnaire
- Data safety form

**Day 4: Submit for Review**
- iOS: ~24-48 hours
- Android: ~2-7 days

**Day 5: Launch Monitoring**
- Crash reporting (Sentry)
- Analytics (Mixpanel/Amplitude)
- Error monitoring
- User feedback

---

## 7. Essential Commands Reference

```bash
# PWA Development
cd voicelibri-pwa
npm run dev          # Start dev server
npm run build        # Production build
npm run preview      # Preview production build

# React Native Development
cd voicelibri-app
npx expo start       # Start Metro bundler
npx expo run:ios     # Run on iOS simulator
npx expo run:android # Run on Android emulator

# EAS Build
eas build --platform ios --profile development
eas build --platform android --profile development
eas build --platform all --profile production

# EAS Submit
eas submit --platform ios
eas submit --platform android

# Backend
cd voicelibri-backend
npm run dev          # Start with tsx watch
npm run build        # Compile TypeScript
npm start            # Run production

# Database
npx supabase db push     # Apply migrations
npx supabase db reset    # Reset database

# Testing
npm test             # Run unit tests
npm run test:e2e     # Run E2E tests
npm run test:coverage # Coverage report
```

---

## 8. Environment Variables Checklist

### PWA (.env)
```
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### React Native (app.config.js)
```javascript
export default {
  extra: {
    apiUrl: process.env.API_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    revenueCatIosKey: process.env.REVENUECAT_IOS_KEY,
    revenueCatAndroidKey: process.env.REVENUECAT_ANDROID_KEY,
  },
};
```

### Backend (.env)
```
NODE_ENV=development
PORT=3001

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Gemini TTS
GEMINI_API_KEY=

# Cloudflare R2
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_URL=

# RevenueCat
REVENUECAT_WEBHOOK_SECRET=
```

---

## 9. Quick Reference: Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| PWA First | ✅ | Faster iteration, instant preview |
| React Native | Expo SDK 53+ | Dev builds for native modules |
| UI Framework | NativeWind | Same Tailwind classes as PWA |
| Audio Player | react-native-audio-pro | Background, lock screen controls |
| Offline DB | WatermelonDB | Fast, reactive, sync-friendly |
| Payments | RevenueCat | Abstracts both stores |
| Payment Methods | App Store IAP + Google Play Billing ONLY | No Stripe, no web payments |
| TTS | Google Gemini | Multi-voice, high quality |
| Storage | Cloudflare R2 | S3-compatible, cost-effective |
| Backend | Express on Fly.io | Simple, scalable |
| Database | Supabase Postgres | Auth included, RLS |

---

*End of Part 5 - Development Manual Complete*

---

## Manual Index

| Part | Title | Content |
|------|-------|---------|
| 1 | Architecture & Stack | Tech decisions, folder structure, core types |
| 2 | API Contract & Backend | All endpoints, services, database schema |
| 3 | Mobile Implementation | React/RN setup, stores, hooks, screens |
| 4 | Design System | Colors, typography, components, animations |
| 5 | Development Phases | Week-by-week tasks, testing, deployment |
