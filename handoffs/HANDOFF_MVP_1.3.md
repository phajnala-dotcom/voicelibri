# 🎯 E-Book Reader TTS - System Snapshot# 🎯 HANDOFF: E-Book Reader TTS Application



**Date:** December 8, 2025 | **Branch:** `mvp-1.3` | **Status:** ✅ Production Ready**Date:** December 8, 2025  

**Branch:** `mvp-1.3`  

---**Status:** ✅ PRODUCTION READY  

**Commit:** `108e458` (main), `d43b5b5` (mvp-1.3)

## 📋 CORE FUNCTIONALITY

---

**Web-based audiobook player** with Google Gemini TTS  

- Formats: TXT, EPUB (PDF planned)## 📋 APPLICATION OVERVIEW

- Languages: Czech TTS, Slovak UI

- 30 prebuilt voices (16 male, 14 female)**Purpose:** Web-based audiobook player using Google Gemini TTS API  

- Chunk-based playback (~500 words/chunk, ~25s generation)**Tech Stack:** TypeScript, React, Node.js, Express, Vertex AI  

**Formats:** TXT, EPUB  

---**Language:** Czech TTS, Slovak UI



## 🏗️ ARCHITECTURE---



### Tech Stack---

- **Backend:** Node.js, Express, TypeScript, Vertex AI SDK

- **Frontend:** React, TypeScript, Vite## 🏗️ SYSTEM ARCHITECTURE

- **TTS:** Gemini 2.5 Flash (`gemini-2.0-flash-exp`)

- **Audio:** 24kHz LINEAR16 PCM### Backend (`apps/backend/`)



### Key Files**Dependencies:**

```json

**Backend (`apps/backend/src/`):**{

- `index.ts` - Express server, API endpoints, TTS cache  "@google-cloud/vertexai": "^1.9.0",

- `ttsClient.ts` - Vertex AI Gemini TTS wrapper  "adm-zip": "0.5.16",

- `bookChunker.ts` - TXT/EPUB parser, chunking logic  "fast-xml-parser": "4.5.0",

  "express": "^4.21.2",

**Frontend (`apps/frontend/src/components/`):**  "cors": "^2.8.5"

- `BookPlayer.tsx` - Main player (1,345 lines)}

- `BookSelector.tsx` - Book dropdown (427 lines)```



---**Key Files:**



## 🔌 API ENDPOINTS#### `src/index.ts` (542 lines)

Express server with TTS and book management endpoints.

```

GET  /api/book/info              → BookInfo (title, author, chunks count)**API Endpoints:**

GET  /api/books                  → Array of available books- `GET /api/book/info` - Returns current book metadata

POST /api/book/select {filename} → Switch book, return metadata- `GET /api/books` - Lists all available books

GET  /api/tts/chunk?index=N&voiceName=X → Audio blob URL- `POST /api/book/select { filename }` - Switches active book

POST /api/tts/cache/clear        → Clear audio cache- `GET /api/tts/chunk?index=N&voiceName=X` - Returns audio blob URL

```- `POST /api/tts/cache/clear` - Clears TTS audio cache



---**TTS Cache:**

- In-memory Map: `chunkIndex:voiceName → audioBuffer`

## 🎙️ VOICE SYSTEM- Auto-clears on book switch

- Prevents regeneration of same chunk+voice

**30 Gemini Voices:**

- **Male (mužský):** 16 voices - Achird, Algenib, Algieba, Alnilam, Charon, Enceladus, Fenrir, Iapetus, Orus, Puck, Rasalgethi, Sadachbia, Sadaltager, Schedar, Umbriel, Zubenelgenubi#### `src/ttsClient.ts` (85 lines)

- **Female (ženský):** 14 voices - Achernar, Aoede, Autonoe, Callirrhoe, Despina, Erinome, Gacrux, Kore, Laomedeia, Leda, Pulcherrima, Sulafat, Vindemiatrix, ZephyrVertex AI Gemini TTS client wrapper.



**UI:** 2-level filtering (Gender → Voice Name)```typescript

- `-` shows all 30 voicesclass GeminiTTSClient {

- Gender selection filters voice list  async synthesizeText(text: string, voiceName: string = 'Algieba'): Promise<Buffer>

- Voice change applies to new chunks only  // Returns: 24kHz LINEAR16 PCM audio

  // Voice: Gemini 2.5 Flash/Pro prebuilt voices

**Storage:** `localStorage` key `ebook-reader-voice` = `{gender, voiceName}`  // Language: Czech (cs-CZ)

}

---```



## 💾 DATA PERSISTENCE**Configuration:**

- Project: `focus-chain-439416-v1`

**localStorage Keys:**- Location: `us-central1`

- `ebook-reader-position-${filename}` → `{chunkIndex, chunkTime, playbackSpeed}`- Model: `gemini-2.0-flash-exp`

- `ebook-reader-last-book` → Last selected book filename- Sample Rate: 24000 Hz

- `ebook-reader-voice` → `{gender, voiceName}`- Encoding: LINEAR16



**Backend Cache:**#### `src/bookChunker.ts` (552 lines)

- In-memory Map: `"${chunkIndex}:${voiceName}"` → audio BufferBook parsing and chunking logic.

- Cleared on book switch or manual `/api/tts/cache/clear`

**Supported Formats:**

---- **TXT**: Heuristic paragraph detection

- **EPUB**: OPF spine parsing, HTML stripping

## ✅ IMPLEMENTED FEATURES- **PDF**: Not yet implemented



- [x] TXT/EPUB parsing (metadata + text extraction)**Chunking Strategy:**

- [x] Chunk-based TTS generation- Target: ~500 words per chunk (TTS sweet spot)

- [x] 30 voice selection (gender filtering)- Method: Paragraph-aware splitting (preserves readability)

- [x] Play/pause, skip ±30s/5min (cross-chunk)- Metadata: Title, author, language (auto-detected), duration estimate

- [x] Speed control (0.75x - 1.5x)

- [x] Progress tracking (chunk + time position)**Key Functions:**

- [x] Per-book position persistence```typescript

- [x] Auto-resume last book on startupparseBookMetadata(filePath: string): BookInfo

- [x] Background preloading (next chunk)loadBook(filePath: string): string[]  // Returns chunks array

- [x] Audio caching (prevents regeneration)parseEpubMetadata(filePath: string): Metadata

- [x] Multi-book selector dropdownextractTextFromEpub(filePath: string): string

- [x] Error handling with retry```



---**EPUB Parsing:**

1. Extract `container.xml` → OPF path

## ⚙️ SETUP & RUN2. Parse OPF → Dublin Core metadata + spine order

3. Extract chapters from spine items

```bash4. Strip HTML tags → plain text

# Prerequisites5. Normalize entities (`, &, etc.)

- Node.js 18+

- Google Cloud service account JSON with Vertex AI enabled---



# Environment### Frontend (`apps/frontend/`)

echo 'GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json' > apps/backend/.env

**Dependencies:**

# Install & Start```json

npm install{

cd apps/backend && npm run dev  # Port 3001  "react": "^18.3.1",

cd apps/frontend && npm run dev # Port 5173  "react-dom": "^18.3.1",

  "typescript": "~5.6.2",

# Add Books  "vite": "^6.0.1"

# Place .txt or .epub files in apps/backend/assets/}

``````



---#### `src/components/BookPlayer.tsx` (1,345 lines)

Main audiobook player component.

## 🎯 CRITICAL CODE PATTERNS

**State Management:**

### Voice Config```typescript

```typescript// Book state

interface VoiceConfig {const [bookInfo, setBookInfo] = useState<BookInfo | null>(null)

  gender: 'mužský' | 'ženský';const [availableBooks, setAvailableBooks] = useState<BookListItem[]>([])

  voiceName: string;

}// Playback state

```const [currentChunkIndex, setCurrentChunkIndex] = useState(0)

const [isPlaying, setIsPlaying] = useState(false)

### TTS Requestconst [playbackSpeed, setPlaybackSpeed] = useState(1.0)

```typescript

// Backend: apps/backend/src/ttsClient.ts// Voice state

async synthesizeText(text: string, voiceName: string = 'Algieba'): Promise<Buffer>const [selectedGender, setSelectedGender] = useState<string | null>(null)

```const [selectedVoiceName, setSelectedVoiceName] = useState<string>('Algieba')



### Cache Key// Cache & loading

```typescriptconst [audioCache, setAudioCache] = useState<Map<number, CachedAudio>>(new Map())

const cacheKey = `${chunkIndex}:${voiceName}`;const [loadingChunk, setLoadingChunk] = useState<number | null>(null)

``````



### Book Switching**Voice Configuration:**

```typescript```typescript

// Clear audio, revoke blobs, save position, load new bookinterface VoiceConfig {

if (audioRef.current) {  gender: 'mužský' | 'ženský';

  audioRef.current.pause();  voiceName: string;

  audioRef.current.src = ''; // Critical: prevent old audio continuation}

}

audioCache.forEach(cached => URL.revokeObjectURL(cached.blobUrl));const VOICE_MATRIX: VoiceConfig[] = [

```  // 16 male voices

  { gender: 'mužský', voiceName: 'Achird' },

---  { gender: 'mužský', voiceName: 'Algenib' },

  // ... 14 more

## 🐛 KNOWN LIMITATIONS  

  // 14 female voices

- **Performance:** 25s TTS generation per chunk  { gender: 'ženský', voiceName: 'Achernar' },

- **Cache:** In-memory only (lost on restart)  { gender: 'ženský', voiceName: 'Aoede' },

- **EPUB:** Basic support (complex HTML may fail)  // ... 12 more

- **Mobile:** Desktop-optimized UI]

- **Concurrent Users:** Single-instance cache```



---**Playback Features:**

- ✅ Play/Pause with state management

## 🚀 NEXT PRIORITIES- ✅ Skip ±30s, ±5min (cross-chunk navigation)

- ✅ Speed control (0.75x - 1.5x)

1. PDF support completion- ✅ Progress bar with percentage

2. Redis/SQLite cache persistence- ✅ Chunk preloading (next chunk loads in background)

3. Mobile-responsive UI- ✅ Auto-advance to next chunk

4. Voice preview samples- ✅ Position persistence (per-book localStorage)

5. Bookmarks/annotations

**Voice Selection:**

---- 2-level filtering: Gender → Voice Name

- Gender filter: `-` (all 30), `mužský` (16), `ženský` (14)

## 📝 KEY DECISIONS- Direct voice selection auto-sets gender

- Saved to localStorage: `ebook-reader-voice`

**Why chunks?** TTS char limits + faster initial playback + granular caching  

**Why localStorage?** Simplicity, privacy, offline-capable  **Position Persistence:**

**Why in-memory cache?** Speed, no DB setup (acceptable for MVP)  ```typescript

**Why Gemini TTS?** Quality voices, multi-language, Vertex AI free tierlocalStorage.setItem(`ebook-reader-position-${filename}`, JSON.stringify({

  chunkIndex: number,

---  chunkTime: number,

  playbackSpeed: number

**Repository:** `phajnala-dotcom/ebook-reader-poc`  }))

**Google Cloud Project:** `focus-chain-439416-v1`  localStorage.setItem('ebook-reader-last-book', filename)

**Region:** `us-central1````


#### `src/components/BookSelector.tsx` (427 lines)
Dropdown book selection UI.

**Features:**
- Format icons: 📘 EPUB, 📄 TXT, 📕 PDF
- Language badges (auto-detected from metadata)
- Duration estimates
- Click-outside-to-close
- Material Design styling

**Book Switching:**
1. Stop current playback
2. Clear audio cache (revoke blob URLs)
3. Save current position
4. Load new book metadata
5. Restore saved position or start at chunk 0
6. Preload first chunk

---

## 🎙️ VOICE SYSTEM

### Available Voices (30 Total)

**Male Voices (16):**
Achird, Algenib, Algieba, Alnilam, Charon, Enceladus, Fenrir, Iapetus, Orus, Puck, Rasalgethi, Sadachbia, Sadaltager, Schedar, Umbriel, Zubenelgenubi

**Female Voices (14):**
Achernar, Aoede, Autonoe, Callirrhoe, Despina, Erinome, Gacrux, Kore, Laomedeia, Leda, Pulcherrima, Sulafat, Vindemiatrix, Zephyr

**Voice Selection UI:**
```tsx
<select value={selectedGender || ''} onChange={handleGenderChange}>
  <option value="">-</option>
  <option value="mužský">mužský</option>
  <option value="ženský">ženský</option>
</select>

<select value={selectedVoiceName} onChange={handleVoiceNameChange}>
  {getFilteredVoiceNames(selectedGender).map(voice => (
    <option key={voice} value={voice}>{voice}</option>
  ))}
</select>
```

**Filtering Logic:**
- `-` → Shows all 30 voices
- `mužský` → Filters to 16 male voices
- `ženský` → Filters to 14 female voices
- Selecting voice → Auto-updates gender

**Cache Integration:**
- Cache key: `${chunkIndex}:${voiceName}`
- Voice changes invalidate previous cache entries
- No cross-contamination between voices

---

## 📂 PROJECT STRUCTURE

```
ebook-reader/
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts          # Express server + API endpoints
│   │   │   ├── ttsClient.ts      # Gemini TTS client
│   │   │   └── bookChunker.ts    # Book parsing (TXT/EPUB)
│   │   ├── assets/
│   │   │   └── dracula.epub      # Test book (855KB, 35 chapters)
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── frontend/
│       ├── src/
│       │   ├── components/
│       │   │   ├── BookPlayer.tsx    # Main player (1,345 lines)
│       │   │   └── BookSelector.tsx  # Book dropdown (427 lines)
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── handoffs/
│   └── HANDOFF_MVP_1.3.md        # This file
├── package.json                   # Root workspace config
└── README.md
```

---

## � DEVELOPMENT SETUP

### Prerequisites
- Node.js 18+
- Google Cloud account with Vertex AI enabled
- Service account JSON key

### Environment Variables
```bash
# apps/backend/.env (not committed)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

### Installation
```bash
# Root directory
npm install

# Start backend (port 3001)
cd apps/backend
npm run dev

# Start frontend (port 5173)
cd apps/frontend
npm run dev
```

### Testing Books
Place `.txt` or `.epub` files in `apps/backend/assets/`

---

## 🎯 CURRENT FEATURES

### ✅ Implemented
- [x] Text-to-Speech (Gemini 2.5 Flash TTS)
- [x] TXT book parsing (heuristic paragraphs)
- [x] EPUB book parsing (OPF + spine + HTML stripping)
- [x] Multi-book support (dropdown selector)
- [x] Chunk-based playback (~500 words/chunk)
- [x] Voice selection (30 voices, gender filtering)
- [x] Playback controls (play/pause, skip ±30s/5min)
- [x] Speed control (0.75x - 1.5x)
- [x] Position persistence (per-book localStorage)
- [x] Auto-resume last book on startup
- [x] Progress tracking (chunk + time position)
- [x] Background preloading (next chunk)
- [x] Audio caching (prevents regeneration)
- [x] Error handling with retry logic

### ❌ Not Implemented
- [ ] PDF support
- [ ] Bookmarks/annotations
- [ ] Voice preview samples
- [ ] Offline mode/PWA
- [ ] Backend authentication
- [ ] Database persistence
- [ ] Cloud storage integration
- [ ] Mobile-specific UI

---

## 🐛 KNOWN ISSUES & LIMITATIONS

### Performance
- **TTS Generation:** ~25s per chunk (500 words)
- **Cache:** In-memory only (lost on server restart)
- **Concurrent Users:** Not optimized (single cache instance)

### Compatibility
- **Browsers:** Chrome/Edge recommended (Web Audio API)
- **Mobile:** Desktop-optimized UI
- **EPUB:** Basic support (complex HTML may break)

### Edge Cases
- **Large Books:** Memory usage grows with cache size
- **Network Errors:** Manual retry required
- **Empty Chapters:** May create zero-length chunks
- **Language Detection:** Fallback to 'cs' if unknown

---

## 🚀 DEPLOYMENT NOTES

### Production Checklist
- [ ] Set `GOOGLE_APPLICATION_CREDENTIALS` env var
- [ ] Configure CORS origins (`apps/backend/src/index.ts`)
- [ ] Add rate limiting to TTS endpoints
- [ ] Implement cache size limits
- [ ] Add request authentication
- [ ] Enable HTTPS
- [ ] Configure Cloud Run/App Engine
- [ ] Set up Cloud Storage for book assets
- [ ] Add monitoring/logging (Cloud Logging)

### Environment-Specific Config
```typescript
// apps/backend/src/index.ts
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://api.example.com'
  : 'http://localhost:3001';
```

---

## � USAGE EXAMPLES

### Adding a New Book
1. Place file in `apps/backend/assets/` (`.txt` or `.epub`)
2. Restart backend server
3. Refresh frontend
4. Book appears in dropdown selector

### Changing Voice
1. Select gender: `-`, `mužský`, or `ženský`
2. Select voice from filtered list
3. Voice applies to all future chunks
4. Existing cached chunks keep old voice

### Resuming Playback
1. Position auto-saves every 2 seconds
2. Reload page → Last book auto-selected
3. Playback resumes at saved chunk + time position

---

## � KEY APIs

### Backend Endpoints

#### `GET /api/book/info`
Returns current book metadata.
```typescript
{
  title: string,
  author: string,
  language: string,
  estimatedDuration: string,
  _internal: {
    totalChunks: number,
    filename: string
  }
}
```

#### `GET /api/books`
Lists all available books.
```typescript
{
  books: [
    {
      filename: string,
      format: 'txt' | 'epub' | 'pdf',
      title: string,
      author: string,
      language: string,
      duration: string
    }
  ],
  currentBook: string | null
}
```

#### `POST /api/book/select`
Switches active book.
```typescript
// Request
{ filename: string }

// Response
{ <BookInfo> }
```

#### `GET /api/tts/chunk?index=N&voiceName=X`
Returns audio chunk as blob URL.
```typescript
// Query params
{
  index: number,          // Chunk index (0-based)
  voiceName: string       // Voice name (e.g., 'Algieba')
}

// Response
{ blobUrl: string }       // Blob URL for <audio> element
```

---

## 🎓 ARCHITECTURE DECISIONS

### Why Chunk-Based?
- **TTS Limits:** Max ~5000 chars per request
- **UX:** Faster initial playback (no 10min wait)
- **Caching:** Granular cache invalidation
- **Navigation:** Jump to specific chunks

### Why In-Memory Cache?
- **Speed:** Instant chunk replay
- **Simplicity:** No database setup
- **Trade-off:** Lost on restart (acceptable for MVP)

### Why localStorage?
- **No Backend:** Simplifies architecture
- **Privacy:** User data stays local
- **Sync:** Works offline
- **Trade-off:** Per-browser storage

### Why Gemini TTS?
- **Quality:** Natural-sounding voices
- **Languages:** Multi-language support
- **Speed:** ~25s for 500 words (acceptable)
- **Cost:** Vertex AI free tier

---

## 💡 NEXT SESSION PRIORITIES

### High Priority
1. **PDF Support** - Complete bookChunker.ts PDF parser
2. **Cache Persistence** - Redis/SQLite for audio cache
3. **Mobile UI** - Responsive design adjustments
4. **Error Recovery** - Auto-retry on network failures

### Medium Priority
5. **Voice Preview** - 5s sample playback before selection
6. **Bookmarks** - Save specific positions with notes
7. **Library View** - Grid layout for book browsing
8. **Theme Toggle** - Dark/light mode

### Low Priority
9. **Authentication** - User accounts + cloud sync
10. **Sharing** - Export position/annotations
11. **Statistics** - Reading time tracking
12. **Playlist Mode** - Auto-advance to next book

---

## � REFERENCES

- [Gemini TTS Documentation](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts)
- [Vertex AI Node.js SDK](https://cloud.google.com/nodejs/docs/reference/vertexai/latest)
- [EPUB Specification](http://idpf.org/epub)
- [React Audio API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAudioElement)

---

**Last Updated:** December 8, 2025  
**Maintainer:** AI Assistant  
**Repository:** phajnala-dotcom/ebook-reader-poc
