# ⚠️ MANDATORY DIRECTIVE - OFFICIAL DOCUMENTATION COMPLIANCE

**YOU MUST ACT STRICTLY ONLY AND ALL THE TIME EXACTLY ACCORDING TO OFFICIAL DOCUMENTATION OF GOOGLE, OPENAI AND ANY OTHER SERVICE, SYSTEM PROVIDER, OR PLATFORM WE USE CURRENTLY OR WILL USE IN FUTURE.**

**DO NOT INVENT YOUR OWN WAY FOR WHAT IS PRESCRIBED BY OFFICIAL DOCS.**

**FOR ACTING OUT OF SUCH OFFICIAL DOCUMENTATIONS, YOU MUST FIRST GET MY PRIOR EXPLICIT APPROVAL.**

---

# ⚠️ MANDATORY DIRECTIVE - SCOPE OF WORK

**DO NOT PERFORM TASKS THAT WERE NOT EXPLICITLY REQUESTED BY THE USER.**

**NEVER CHANGE UI DESIGN, LAYOUT, OR STYLING UNLESS SPECIFICALLY ASKED.**

**NEVER ADD NEW FEATURES, REFACTOR CODE, OR MODIFY ARCHITECTURE WITHOUT EXPLICIT USER REQUEST.**

**IF YOU THINK SOMETHING SHOULD BE IMPROVED, ASK FOR APPROVAL FIRST - DO NOT IMPLEMENT.**

---

# VoiceLibri - AI Coding Agent Instructions

## Project Overview
VoiceLibri is a **commercial-grade AI-powered multi-voice dramatized audiobook platform** that transforms ebooks into immersive audio experiences with distinct character voices. This is a **production-ready full-stack TypeScript monorepo** with Express backend and React PWA frontend.

**Quality Standards**: Enterprise-level codebase with unique proprietary know-how in LLM-powered audio dramatization. All implementations must meet commercial software standards: robust error handling, performance optimization, maintainable architecture, and production resilience.

## Architecture & Stack

### Workspace Structure
```
ebook-reader/ (npm workspaces root)
├── apps/backend/         # Express API server (main processing engine)  
├── apps/pwa-v2/          # React PWA (web frontend)
├── apps/mobile/          # React Native mobile app (iOS/Android)
├── audiobooks/           # Generated audiobook library (file-based storage)
├── handoffs/             # Session documentation & specs
└── docs/                 # Architecture & API documentation
```

### Core Technologies
- **Backend**: Express + TypeScript, Google Cloud Vertex AI (Gemini TTS), vitest for testing
- **Web Frontend**: React 18 + TypeScript, Vite, TanStack Query, Zustand, Tailwind CSS
- **Mobile Frontend**: React Native + TypeScript, Expo SDK 54, expo-router, TanStack Query, Zustand, AsyncStorage
- **Audio**: WAV format, multi-speaker synthesis via Google Gemini TTS
- **File Processing**: EPUB (adm-zip, fast-xml-parser), TXT, with plans for PDF/DOCX

### Development Workflow
```bash
# Root workspace commands
npm run dev           # Concurrent backend + PWA
npm run dev:backend   # Backend only (port 3001)
npm run dev:pwa       # PWA only (port 5180)
npm run build         # Production build both apps

# Mobile app (from apps/mobile/)
cd apps/mobile
npx expo start        # Start Expo dev server
npx expo start --tunnel  # For cross-network development
```

## Core Systems

### 1. Audio Generation Pipeline
The backend orchestrates a sophisticated dramatization pipeline:

**Key files**: `apps/backend/src/index.ts` (2500+ lines main server), `hybridDramatizer.ts`, `bookChunker.ts`

**Pipeline stages**:
1. **Book Processing**: EPUB/TXT → extracted text + metadata
2. **Dramatization**: LLM-based character analysis → dialogue tagging with `[VOICE=CHARACTER]` markers
3. **Chunking**: Smart text chunking (≤3600 bytes, ≤2 speakers per chunk for Gemini API compliance)
4. **TTS Synthesis**: Multi-speaker audio generation via Google Gemini TTS
5. **Assembly**: WAV concatenation with silence gaps

**Critical API constraints**:
- Gemini TTS limit: 2 speakers max per chunk, 4000 bytes max
- Chunks must never break mid-sentence
- Audio stored locally in `audiobooks/{title}/` directory structure

### 2. State Management Patterns
**Backend state**: In-memory maps + file-based persistence
```typescript
// Global state patterns found throughout codebase
const BOOK_CHUNKS = new Map<number, string>();
const CHAPTER_SUBCHUNKS = new Map<number, SubChunkResult[]>();
const BOOK_METADATA: BookMetadata | null = null;
```

**Frontend state**: Zustand + TanStack Query
```typescript
// Web (PWA) Store pattern: apps/pwa-v2/src/stores/
export const useAudioStore = create((set) => ({ /* local state */ }));
// Server state via TanStack Query in components

// Mobile Store pattern: apps/mobile/src/stores/
export const useSettingsStore = create(
  persist(
    (set) => ({ /* mobile state */ }),
    { name: 'voicelibri-settings', storage: createJSONStorage(() => AsyncStorage) }
  )
);
```

## Mobile App Architecture (apps/mobile/)

### Tech Stack
- **Expo SDK 54.0.31**: React 19.1.0, react-native 0.81.5
- **expo-router ~6.0.21**: File-based navigation with Stack/Tabs
- **TanStack Query**: Server state management (API integration)
- **Zustand 5.0.0**: Client state with AsyncStorage persistence
- **UI Libraries**: @gorhom/bottom-sheet, moti (animations), expo-blur

### Mobile-Only Configuration
**Critical**: This is a **mobile-only** app (iOS/Android). NO web support. Previous attempts to support web caused compatibility issues with packages like `@expo/vector-icons` and `react-native-reanimated` that use `import.meta.url` incompatible with Metro web bundler.

**Package.json considerations**:
- NO `react-dom`, `react-native-web`, `nativewind`, `tailwindcss`
- Use `expo install` for all dependencies to ensure SDK compatibility
- `react-native-reanimated@4.x` requires `react-native-worklets` as peer dependency

### File Structure
```
apps/mobile/
├── app/                          # expo-router file-based routes
│   ├── _layout.tsx              # Root layout with providers (Theme, Query, Gesture)
│   ├── index.tsx                # Entry redirect to /(tabs)
│   ├── (tabs)/                  # Tab navigator
│   │   ├── _layout.tsx          # Tab bar config
│   │   ├── index.tsx            # Explore screen
│   │   ├── library.tsx          # Library screen
│   │   └── settings.tsx         # Settings screen
│   ├── book/[id].tsx           # Book detail dynamic route
│   ├── genre/[slug].tsx        # Genre browse
│   └── player.tsx              # Modal audio player
├── src/
│   ├── components/ui/          # Reusable UI components
│   ├── stores/                 # Zustand stores with AsyncStorage
│   │   ├── settingsStore.ts
│   │   ├── bookStore.ts
│   │   └── playerStore.ts
│   ├── services/               # API integration
│   │   ├── api.ts              # Backend API client
│   │   └── storage.ts          # AsyncStorage wrapper
│   └── theme/                  # Theme system
│       ├── ThemeContext.tsx
│       └── index.ts
└── package.json
```

### Provider Setup Pattern
**Root Layout** (`app/_layout.tsx`):
```typescript
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            {/* Routes */}
          </Stack>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
```

**Required providers**:
1. `GestureHandlerRootView` - Enables gesture handling (bottom sheets, swipes)
2. `QueryClientProvider` - TanStack Query for API state
3. `ThemeProvider` - Custom theme context with dark/light mode

### Common Issues & Solutions

**Issue 1: "Cannot find module 'react-native-worklets/plugin'"**
- **Cause**: `react-native-reanimated@4.x` requires separate worklets package
- **Fix**: `npx expo install react-native-worklets`

**Issue 2: "No QueryClient set"**
- **Cause**: Missing `QueryClientProvider` in root layout
- **Fix**: Wrap app with provider as shown above

**Issue 3: Expo commands running from wrong directory**
- **Cause**: Terminal defaults to workspace root instead of apps/mobile
- **Fix**: Always `cd apps/mobile` before `npx expo start`

**Issue 4: Phone can't connect to dev server**
- **Cause**: Network issues, firewall, or Expo Go caching old IP
- **Fix**: Use `npx expo start --tunnel` for public URL

**Issue 5: Metro bundler errors with web-specific code**
- **Cause**: Accidentally imported web dependencies
- **Fix**: Remove all `react-dom`, `react-native-web` references; mobile-only architecture

### Storage Patterns
**Mobile uses AsyncStorage exclusively** (no localStorage/web fallbacks):
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

// Zustand persistence
const useStore = create(
  persist(
    (set) => ({ /* state */ }),
    { name: 'key', storage: createJSONStorage(() => AsyncStorage) }
  )
);
```

### API Integration
Mobile app connects to same backend as PWA (port 3001). API service in `apps/mobile/src/services/api.ts` mirrors PWA patterns but adapts for mobile context (fetch API, AsyncStorage for tokens, etc.).

### 3. File Processing Conventions
**Input formats**: Use `extractTextFromEpub()` for EPUB, direct `fs.readFileSync()` for TXT

**Book metadata extraction**:
```typescript
// Standard pattern in bookChunker.ts
const metadata = parseBookMetadata(filename, content);
// Returns: { title, author, language, chapterCount, estimatedDuration }
```

**Chapter detection**: EPUB uses OPF manifest spine order; TXT uses heuristic parsing (Chapter, KAPITOLA patterns)

## API Architecture

### Core Endpoints (backend/src/index.ts)
**Book selection & info**:
- `GET /api/books` - List available books in assets/
- `POST /api/book/select` - Initialize book processing pipeline  
- `GET /api/book/info` - Current book metadata + chunk counts

**Real-time audio generation**:
- `POST /api/tts/chunk` - Generate specific chunk audio (supports legacy chunkIndex OR chapterIndex+subChunkIndex)
- `GET /api/audiobooks/:title/subchunks/:chapter/:subchunk` - Stream audio during generation

**Library management**:
- `GET /api/audiobooks` - List generated audiobooks
- `POST /api/audiobooks/generate` - Background generation via `audiobookWorker.ts`

**Dramatization**:
- `POST /api/dramatize/auto` - LLM-powered character analysis + dialogue tagging

### Error Handling Patterns
```typescript
// Standard error response format throughout backend
res.status(400).json({
  error: 'ERROR_CODE',
  message: 'Human-readable description'
});
```

**TTS Pipeline Error Recovery**:
- **Gemini API failures**: Automatic retry with exponential backoff in `tempChunkManager.ts`
- **Chunk size violations**: Smart splitting at sentence/word boundaries when byte limits exceeded
- **Voice assignment failures**: Fallback to default narrator voice (`Algieba`) when character voices unavailable
- **File corruption**: Temp chunk validation before consolidation into final chapters
- **Memory exhaustion**: Clear chunk maps and restart processing from last successful checkpoint

**Critical Error Monitoring**:
```typescript
// Pattern used throughout pipeline
try {
  await generateAudio();
} catch (error) {
  console.error('✗ Pipeline Error:', error);
  // Log to file for debugging
  // Attempt graceful degradation
  // Notify client of fallback behavior
}
```

### Request Flow Example
1. Frontend calls `selectBook({ filename: 'dracula.epub', targetLanguage: 'cs' })`
2. Backend extracts EPUB → chunks text → triggers hybrid dramatization
3. Frontend polls `getGenerationStatus()` for progress
4. Audio requests use `getSubChunkAudioUrl()` for real-time playback

## Development Patterns

### File Organization
**Backend**: Single large `index.ts` (2500+ lines) + focused service modules
- `audiobookManager.ts` - File system operations
- `tempChunkManager.ts` - Chunk caching & generation
- `geminiVoices.ts` - Voice selection & mapping

**Frontend**: Feature-based structure in `apps/pwa-v2/src/`
- `screens/` - Route components  
- `services/api.ts` - Backend integration
- `stores/` - Zustand state management

**Mobile**: Expo router file-based structure in `apps/mobile/`
- `app/` - File-based routes (expo-router convention)
- `src/components/` - Reusable UI components
- `src/stores/` - Zustand with AsyncStorage persistence
- `src/services/` - API client and storage utilities

### Testing Patterns
**Backend**: Vitest in `*.test.ts` files
```typescript
// Example from bookChunker.test.ts
describe('Book chunking', () => {
  test('respects byte limits', async () => {
    // Test chunking logic
  });
});
```

**Manual Testing Workflow**: Primary testing approach for full pipeline validation
1. **Frontend Testing**: Navigate through PWA, test book selection, playback controls
2. **Sample Generation**: Generate short audiobooks from test files in `assets/` (e.g., `sample_ebook.txt`)
3. **Pipeline Verification**: Monitor console logs during book processing, dramatization, chunking
4. **Audio Quality Check**: Listen to generated WAV files to verify voice assignment, dialogue flow
5. **Edge Case Testing**: Test with various ebook formats, languages, chapter structures

**Frontend**: No automated test setup currently - manual testing preferred for audio quality validation

### Voice & Character Management
**Voice assignment**: `geminiVoices.ts` provides 30+ predefined voices with gender/style metadata
```typescript
const voice = selectVoiceByGender('female', 'calm');
// Returns appropriate Gemini TTS voice ID
```

**Character persistence**: Voice mappings stored in `voice_map.json` files alongside audiobooks

## Performance & Constraints

### Optimization Strategies
- **Parallel chunk generation**: Max 2 concurrent TTS requests (`audiobookWorker.ts`)
- **Temp file caching**: Generated chunks cached as WAV files to avoid regeneration
- **Smart consolidation**: Chapter assembly from cached chunks

### Performance Monitoring
**Pipeline Metrics**: Monitor these key indicators in console output and logs
```typescript
// Generation timing patterns in audiobookWorker.ts
console.log(`🎤 Generating chunk ${chunkIndex}... (${Date.now() - startTime}ms)`);
console.log(`✓ All chunks generated: ${generatedCount}/${chunks.length}`);
```

**Critical Performance Indicators**:
- **TTS request timing**: Normal 10-30s per chunk, >60s indicates API issues
- **Memory usage**: Monitor chunk maps size, clear when >100 active chunks
- **Queue status**: Check `audiobookWorker.getProgress()` for bottlenecks
- **File system**: Watch `audiobooks/` directory size and temp chunk cleanup
- **Parallel efficiency**: 2 concurrent requests should maintain ~50% faster generation

**Debugging Pipeline Issues**:
```bash
# Monitor generation progress
curl http://localhost:3001/api/audiobooks/worker/status
# Check specific book progress  
curl http://localhost:3001/api/audiobooks/BookTitle/progress
# Verify chunk caching
ls audiobooks/BookTitle/temp/
```

### Resource Limits
- **File size**: 50MB max for uploaded ebooks
- **Chunk size**: 200-3600 bytes (tuned for TTS performance)
- **Memory**: In-memory chunk maps for active books only

### Critical Gotchas
1. **Voice tags**: `[VOICE=CHARACTER]` markers must be stripped before TTS, never spoken
2. **Chapter boundaries**: Chunks cannot cross chapter boundaries
3. **Speaker limits**: Gemini TTS strictly enforces 2 speakers max per request
4. **File encoding**: Always use UTF-8, handle BOM markers in text files

## Current State & Next Steps

**Completed (MVP 1.2)**: 
- ✅ EPUB support, multi-book management, basic PWA UI
- ✅ React Native mobile app with Expo SDK 54 (iOS/Android)
- ✅ Mobile app working with tabs navigation, theme system, TanStack Query integration

**In Progress**: Advanced dramatization pipeline, library UI improvements, mobile-backend integration

**Planned**: PDF/DOCX support, mobile audiobook storage, payment integration

**Key handoff files**: Check `handoffs/` directory for detailed session context and implementation specs. `ActionPlan.txt` contains immediate priorities.

When implementing new features, prioritize the existing patterns over introducing new architectures. The codebase favors pragmatic, working solutions over perfect abstractions.

## Code Quality Standards

**Commercial Excellence**: This is a production commercial application with proprietary technology. All code must be:
- **Performance-optimized**: Handle large files, concurrent users, memory-efficient processing
- **Error-resilient**: Comprehensive error handling with graceful degradation  
- **Maintainable**: Clear abstractions, consistent patterns, well-documented APIs
- **Scalable**: Architecture supporting future enterprise features and load requirements

**Unique IP**: The multi-voice dramatization pipeline represents novel technology combining LLM dialogue analysis with TTS orchestration. Implementations should preserve and enhance this competitive advantage.