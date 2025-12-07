# 📋 HANDOFF PRE POC 2.0 FRONTEND IMPLEMENTÁCIU

**Vytvorené:** 7. december 2025  
**Aktualizované:** 7. december 2025 (po optimalizácii chunking)  
**Projekt:** Slovak Ebook Reader s Gemini 2.5 Pro TTS  
**Lokácia:** `C:\Users\hajna\ebook-reader`  
**Git repository:** `phajnala-dotcom/ebook-reader-poc`  
**Git branch:** `poc-2.0`

---

## 🎯 AKTUÁLNY STAV PROJEKTU

### Backend POC 2.0: ✅ KOMPLETNÝ A FUNKČNÝ
- Monorepo štruktúra: npm workspaces (`apps/frontend`, `apps/backend`)
- Server endpoint: `http://localhost:3001`
- Kniha načítaná: **Émile Zola - Povídky** (2776 riadkov)
- **Chunky: 795 chunkov** po max **200 bytes** (optimalizované pre real-time TTS)
- Celkový počet slov: **23,305 slov**
- Odhadovaná dĺžka: **155 minút 22 sekúnd** (9322 sekúnd)
- **TTS generovanie: ~25 sekúnd** per chunk (testované a funkčné)

### Frontend POC 2.0: ❌ NEDOKONČENÝ
- Existuje len POC 1.0 verzia s basic Play/Pause
- Treba implementovať kompletný BookPlayer komponent

---

## 📁 ŠTRUKTÚRA PROJEKTU

```
C:\Users\hajna\ebook-reader/
├── package.json              # Root monorepo config
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts           ✅ Express server s chunking, caching, preloading
│   │   │   ├── ttsClient.ts       ✅ Vertex AI Gemini TTS (WAV conversion, Windows fix)
│   │   │   ├── bookChunker.ts     ✅ Chunking algoritmus (200 bytes, word boundaries)
│   │   │   └── bookChunker.test.ts ✅ Unit testy (10 testov, všetky PASS)
│   │   ├── assets/
│   │   │   └── sample_ebook.txt    ✅ Kniha pre POC 2.0 (2776 lines)
│   │   ├── .env                    ✅ Environment variables
│   │   ├── .gcsakey.json          ✅ Service account credentials
│   │   └── package.json           ✅ Dependencies + vitest
│   │
│   └── frontend/
│       ├── src/
│       │   ├── App.tsx            ⚠️ POC 1.0 verzia (treba upgradovať)
│       │   ├── main.tsx           ✅ Entry point
│       │   └── components/        ❌ Folder neexistuje (treba vytvoriť)
│       │       └── BookPlayer.tsx ❌ HLAVNÁ ÚLOHA - TREBA VYTVORIŤ
│       └── package.json           ✅ React, Vite dependencies
```

---

---

## ⚡ KRITICKÉ OPTIMALIZÁCIE (už implementované)

### Problém #1: Timeout pri TTS generovaní
**Pôvodný stav:**
- Chunk size: 3000 bytes
- Generovanie: 60+ sekúnd
- Výsledok: Časté timeouty, nefunkčné TTS

**Riešenie:**
- ✅ Chunk size znížený na **200 bytes**
- ✅ Generovanie: **~25 sekúnd** per chunk
- ✅ 795 chunkov namiesto 53
- ✅ Real-time TTS funguje stabilne

### Problém #2: Windows `/dev/null` chyba
**Pôvodný stav:**
- `ttsClient.ts` používal `/dev/null` (Linux path)
- Crash pri WAV konverzii: `Error: ENOENT: no such file or directory, open 'C:\dev\null'`

**Riešenie:**
- ✅ Platform detection: `process.platform === 'win32' ? 'nul' : '/dev/null'`
- ✅ WAV konverzia funguje na Windows

### Problém #3: sample_text.txt timeout
**Pôvodný stav:**
- 1223 znakov = príliš veľa
- Timeout aj po viac než 4 minútach

**Riešenie:**
- ✅ Odstránený `sample_text.txt` loading
- ✅ `/api/tts/read-sample` používa `BOOK_CHUNKS[0]`
- ✅ Konzu zjednodušenie kódu

---

## 🔧 BACKEND API - DOKUMENTÁCIA

**DÔLEŽITÉ UPOZORNENIE:**
- Backend už nepoužíva `sample_text.txt` (odstránený)
- Všetky endpointy používajú chunky z `sample_ebook.txt`
- Chunk size optimalizovaný na **200 bytes** pre rýchle TTS generovanie (~25s per chunk)

### 1. GET `/api/health`
**Účel:** Health check  
**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-07T03:45:12.345Z"
}
```

### 2. GET `/api/book/info`
**Účel:** Získať metadata knihy  
**Response:**
```json
{
  "totalChunks": 795,
  "totalWords": 23305,
  "estimatedDuration": 9322
}
```
- `totalChunks` - počet chunkov knihy (795 chunkov po ~200 bytes)
- `totalWords` - celkový počet slov
- `estimatedDuration` - odhadovaná dĺžka v **sekundách** (150 slov/minútu)

### 3. POST `/api/tts/chunk`
**Účel:** Získať audio pre konkrétny chunk (s cachingom a preloadingom)  
**Request body:**
```json
{
  "chunkIndex": 0
}
```
**Response:** WAV audio súbor (binary, Content-Type: audio/wav)
- **Caching:** Ak chunk už bol vygenerovaný, vráti sa z cache
- **Preloading:** Automaticky začne generovať chunk N+1 na pozadí

**Validácia:**
- `chunkIndex` musí byť číslo >= 0 a < totalChunks
- Inak vráti `400 Bad Request`

### 4. POST `/api/tts/read-sample` (Legacy POC 1.0)
**Účel:** Prehrať prvý chunk z knihy (pre POC 1.0 frontend kompatibilitu)  
**Response:** WAV audio súbor (prvý chunk, ~200 bytes textu, ~25s generovanie)

**POZNÁMKA:** Tento endpoint teraz používa `BOOK_CHUNKS[0]` namiesto `sample_text.txt`

---

## 🎯 POC 2.0 FRONTEND - USER REQUIREMENTS

### Hlavné funkcie:

#### 1. **Sequential Playback (Sekvenčné prehrávanie)**
- Prehrať chunk po chunku v poradí
- Automaticky prejsť na ďalší chunk po dokončení predchádzajúceho
- Uložiť pozíciu (chunk + čas v chunku) do `localStorage`
- Obnoviť pozíciu po refresh stránky

#### 2. **Playback Controls (Ovládanie prehrávania)**

**Hlavné tlačidlá:**
```
[◀◀ -5min] [◀ -30s] [▶/⏸ Play/Pause] [▶ +30s] [▶▶ +5min]
```

- **Play/Pause:** Štandardné prehrávanie/pauza
- **±30 sekúnd:** Obyčajný click → preskoč o 30s dopredu/dozadu
- **±5 minút:** 3-sekundové hold (long press) → preskoč o 5min dopredu/dozadu

**Speed Control (Rýchlosť):**
```
Speed: [1.0x ▼]
```
Dropdown s možnosťami: `0.75x | 0.9x | 1.0x | 1.25x | 1.5x`

#### 3. **Progress Bar (Progres celej knihy)**
```
[████████████░░░░░░░░░░░░] 45%

Chunk 12/53 | 5:23 / 155:22
```

- Progress bar reprezentuje **celú knihu**, nie len aktuálny chunk
- Zobrazenie: `Chunk X/Y | current time / total time`
- Current time = (completed chunks time) + (time in current chunk)
- Total time = estimatedDuration z `/api/book/info`

#### 4. **localStorage Persistence**
```typescript
interface PlaybackState {
  chunkIndex: number;      // Aktuálny chunk (0-based)
  timeInChunk: number;     // Pozícia v chunku v sekundách
}
```
**Storage key:** `'ebook-reader-position'`  
**Update frequency:** Každých 5 sekúnd počas playbacku

#### 5. **Preloading Strategy**
- Keď začne prehrávanie chunku N, okamžite začni loadovať chunk N+1 na pozadí
- Uložiť audio blobs do state/cache v komponente
- Užívateľ nevidí loading pri prechode na ďalší chunk

#### 6. **Error Handling**
- **Retry logic:** 3 pokusy s exponential backoff (1s, 2s, 4s)
- **Loading states:** 
  - "Generujem audio chunk X/Y..."
  - "Preloadujem ďalší chunk..."
- **Error UI:**
  - "Nepodarilo sa načítať audio. Skúsiť znova?"
  - Retry button

---

## 💻 IMPLEMENTAČNÝ PLÁN

### Phase 1: BookPlayer Component - Core State
**Súbor:** `apps/frontend/src/components/BookPlayer.tsx`

```typescript
interface BookInfo {
  totalChunks: number;
  totalWords: number;
  estimatedDuration: number; // v sekundách
}

interface PlaybackState {
  chunkIndex: number;
  timeInChunk: number;
}

const BookPlayer: React.FC = () => {
  const [bookInfo, setBookInfo] = useState<BookInfo | null>(null);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [audioBlobs, setAudioBlobs] = useState<Map<number, string>>(new Map());
  
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // ... implementation
};
```

**Úlohy:**
1. ✅ Vytvoriť komponent s TypeScript interfaces
2. ✅ Načítať book info z API pri mount: `GET /api/book/info`
3. ✅ Načítať saved position z localStorage
4. ✅ Setup `<audio>` element s ref

### Phase 2: Audio Playback Logic
```typescript
const playChunk = async (chunkIndex: number) => {
  try {
    setLoading(true);
    
    // Check cache first
    let audioBlobUrl = audioBlobs.get(chunkIndex);
    
    if (!audioBlobUrl) {
      // Fetch from API
      const response = await fetch('http://localhost:3001/api/tts/chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunkIndex }),
      });
      
      if (!response.ok) throw new Error('Failed to fetch chunk');
      
      const blob = await response.blob();
      audioBlobUrl = URL.createObjectURL(blob);
      
      // Cache it
      setAudioBlobs(prev => new Map(prev).set(chunkIndex, audioBlobUrl));
    }
    
    // Play audio
    if (audioRef.current) {
      audioRef.current.src = audioBlobUrl;
      audioRef.current.playbackRate = playbackSpeed;
      await audioRef.current.play();
      setIsPlaying(true);
    }
    
    // Preload next chunk
    preloadNextChunk(chunkIndex + 1);
    
  } catch (error) {
    console.error('Error playing chunk:', error);
    setError('Failed to load audio');
  } finally {
    setLoading(false);
  }
};

const preloadNextChunk = async (nextIndex: number) => {
  if (nextIndex >= bookInfo!.totalChunks) return;
  if (audioBlobs.has(nextIndex)) return; // Already cached
  
  // Fetch in background
  try {
    const response = await fetch('http://localhost:3001/api/tts/chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunkIndex: nextIndex }),
    });
    
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    setAudioBlobs(prev => new Map(prev).set(nextIndex, blobUrl));
  } catch (error) {
    console.warn('Preload failed for chunk', nextIndex, error);
  }
};
```

**Úlohy:**
3. ✅ Implementovať `playChunk(index)` funkciu
4. ✅ Implementovať `preloadNextChunk(index)` funkciu
5. ✅ Cache management s Map<number, string>
6. ✅ Error handling s retry logic

### Phase 3: Audio Event Handlers
```typescript
const handleAudioEnded = () => {
  // Auto-advance to next chunk
  if (currentChunkIndex < bookInfo!.totalChunks - 1) {
    setCurrentChunkIndex(prev => prev + 1);
    playChunk(currentChunkIndex + 1);
  } else {
    // Book finished
    setIsPlaying(false);
    setCurrentChunkIndex(0);
  }
};

const handleTimeUpdate = () => {
  // Save position to localStorage every 5 seconds
  const currentTime = audioRef.current?.currentTime || 0;
  
  // Save to localStorage
  savePosition({
    chunkIndex: currentChunkIndex,
    timeInChunk: currentTime,
  });
};

// Attach listeners
useEffect(() => {
  const audio = audioRef.current;
  if (!audio) return;
  
  audio.addEventListener('ended', handleAudioEnded);
  audio.addEventListener('timeupdate', handleTimeUpdate);
  
  return () => {
    audio.removeEventListener('ended', handleAudioEnded);
    audio.removeEventListener('timeupdate', handleTimeUpdate);
  };
}, [currentChunkIndex]);
```

**Úlohy:**
7. ✅ Implementovať `onended` event → auto-advance
8. ✅ Implementovať `ontimeupdate` → save position
9. ✅ localStorage save funkciu (throttle na 5s)

### Phase 4: UI Controls
```typescript
const skipSeconds = (seconds: number) => {
  if (!audioRef.current) return;
  audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + seconds);
};

const skipMinutes = (minutes: number) => {
  skipSeconds(minutes * 60);
};

// Long press detection
const useLongPress = (callback: () => void, ms = 3000) => {
  const [startLongPress, setStartLongPress] = useState(false);
  
  useEffect(() => {
    let timerId: NodeJS.Timeout;
    if (startLongPress) {
      timerId = setTimeout(callback, ms);
    }
    return () => clearTimeout(timerId);
  }, [startLongPress, callback, ms]);
  
  return {
    onMouseDown: () => setStartLongPress(true),
    onMouseUp: () => setStartLongPress(false),
    onMouseLeave: () => setStartLongPress(false),
    onTouchStart: () => setStartLongPress(true),
    onTouchEnd: () => setStartLongPress(false),
  };
};

// Usage
const backwardBigPress = useLongPress(() => skipMinutes(-5));
const forwardBigPress = useLongPress(() => skipMinutes(5));
```

**Úlohy:**
10. ✅ Play/Pause button
11. ✅ Skip ±30s buttons (onClick)
12. ✅ Skip ±5min buttons (long press 3s)
13. ✅ Speed dropdown s options: 0.75x, 0.9x, 1.0x, 1.25x, 1.5x
14. ✅ Speed change → update `audioRef.current.playbackRate`

### Phase 5: Progress Bar
```typescript
const calculateProgress = () => {
  if (!bookInfo) return 0;
  
  const currentTime = audioRef.current?.currentTime || 0;
  
  // Estimate time per chunk (avg)
  const avgChunkDuration = bookInfo.estimatedDuration / bookInfo.totalChunks;
  
  // Total time elapsed
  const totalElapsed = (currentChunkIndex * avgChunkDuration) + currentTime;
  
  // Progress percentage
  return (totalElapsed / bookInfo.estimatedDuration) * 100;
};

const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
```

**Úlohy:**
15. ✅ Progress bar celej knihy (nie per-chunk)
16. ✅ Zobrazenie: "Chunk X/Y | current/total time"
17. ✅ Update každú sekundu počas playbacku

### Phase 6: localStorage Integration
```typescript
const STORAGE_KEY = 'ebook-reader-position';

const savePosition = (state: PlaybackState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const loadPosition = (): PlaybackState | null => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  
  try {
    return JSON.parse(saved);
  } catch (error) {
    console.error('Failed to parse saved position:', error);
    return null;
  }
};

// On mount
useEffect(() => {
  const savedPos = loadPosition();
  if (savedPos) {
    setCurrentChunkIndex(savedPos.chunkIndex);
    // Will restore time after audio loads
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = savedPos.timeInChunk;
      }
    }, 100);
  }
}, []);
```

**Úlohy:**
18. ✅ Save position každých 5s počas playbacku
19. ✅ Load position pri mount
20. ✅ Restore chunk + time position

---

## 🎨 UI MOCKUP

```
╔════════════════════════════════════════════════════════╗
║  📚 Ebook Reader POC 2.0                              ║
║                                                        ║
║  Émile Zola - Povídky                                 ║
║                                                        ║
║  [████████████████████░░░░░░░░░] 67%                  ║
║                                                        ║
║  Chunk 35/53 | 104:23 / 155:22                        ║
║                                                        ║
║  [◀◀] [◀] [▶ PLAY] [▶] [▶▶]  Speed: [1.0x ▼]       ║
║   -5m  -30s         +30s +5m                          ║
║                                                        ║
║  🔊 [──────●────────────────] 3:45 / 5:12             ║
║  (progress aktuálneho chunku - native audio player)   ║
╚════════════════════════════════════════════════════════╝
```

---

## 🔐 ENVIRONMENT & CREDENTIALS

### `.env` súbor (apps/backend/.env)
```env
GOOGLE_API_KEY=AIzaSyDfy-qEhTtCkG--OMXmtAVbpCtFsxcmeS4
GOOGLE_APPLICATION_CREDENTIALS=.gcsakey.json
GOOGLE_CLOUD_PROJECT=calmbridge-2
GOOGLE_CLOUD_LOCATION=us-central1
```

### Service Account
- **Súbor:** `apps/backend/.gcsakey.json`
- **Project:** calmbridge-2
- **Location:** us-central1
- **Model:** Gemini 2.5 Pro TTS
- **Voice:** Algieba (emotional, human-like)

### Audio Format
- **Input:** PCM raw audio z Gemini TTS
- **Output:** WAV (24kHz, 16-bit, mono)
- **Browser:** `<audio>` element s Blob URLs

---

## 🚀 SPUSTENIE PROJEKTU

### Terminal 1 - Backend
```powershell
Set-Location C:\Users\hajna\ebook-reader\apps\backend
npm run dev
```
**Výstup:**
```
✓ Book loaded and chunked successfully
  Total chunks: 53
  Total words: 23305
  Estimated duration: 9322

🚀 Server running on http://localhost:3001
```

### Terminal 2 - Frontend
```powershell
Set-Location C:\Users\hajna\ebook-reader\apps\frontend
npm run dev
```
**Výstup:**
```
VITE v5.4.21  ready in 288 ms
➜  Local:   http://localhost:5173/
```

---

## 📦 DEPENDENCIES (už nainštalované)

### Backend
```json
{
  "dependencies": {
    "@google-cloud/vertexai": "^1.7.0",
    "google-auth-library": "^9.0.0",
    "wav": "^1.0.2",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.10.5",
    "@types/wav": "^1.0.2",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.0.4"
  }
}
```

### Frontend
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.8"
  }
}
```

---

## ✅ CHECKLIST PRE IMPLEMENTÁCIU

### Phase 1: Setup
- [ ] Vytvoriť `apps/frontend/src/components/` folder
- [ ] Vytvoriť `BookPlayer.tsx` s TypeScript interfaces
- [ ] Import BookPlayer do `App.tsx`

### Phase 2: Data Fetching
- [ ] Fetch book info z `/api/book/info` pri mount
- [ ] Error handling pre API calls
- [ ] Loading state počas fetch

### Phase 3: Core Playback
- [ ] Implementovať `playChunk(index)` funkciu
- [ ] Audio blob caching s Map
- [ ] Preloading next chunk strategy
- [ ] Auto-advance na ďalší chunk po skončení

### Phase 4: Controls
- [ ] Play/Pause button
- [ ] Skip ±30s buttons (click)
- [ ] Skip ±5min buttons (long press 3s)
- [ ] Speed dropdown (0.75x - 1.5x)

### Phase 5: Progress & Display
- [ ] Progress bar celej knihy
- [ ] "Chunk X/Y" display
- [ ] "current time / total time" display
- [ ] Real-time updates počas playbacku

### Phase 6: Persistence
- [ ] Save position do localStorage (každých 5s)
- [ ] Load position pri mount
- [ ] Restore chunk + time position

### Phase 7: Polish
- [ ] Retry logic (3 attempts, exponential backoff)
- [ ] Loading states ("Generujem audio...")
- [ ] Error UI s retry button
- [ ] Cleanup blob URLs pri unmount

---

## 🐛 ZNÁME ISSUES & RIEŠENIA

### Issue 1: CORS Error
**Príznaky:** `Access-Control-Allow-Origin` error v browseri  
**Riešenie:** Backend už má CORS enabled v `index.ts`:
```typescript
app.use(cors());
```

### Issue 2: Chunk Size Optimization ✅ VYRIEŠENÉ
**Príznaky:** Timeout pri TTS generovaní  
**Riešenie:** Chunk size znížený z 3000 na **200 bytes**
- Generovanie: ~25 sekúnd per chunk
- 795 chunkov namiesto 53
- Stabilné real-time TTS

### Issue 3: Windows WAV Conversion ✅ VYRIEŠENÉ
**Príznaky:** `Error: ENOENT: no such file or directory, open 'C:\dev\null'`  
**Riešenie:** Platform detection v `ttsClient.ts`:
```typescript
const nullDevice = process.platform === 'win32' ? 'nul' : '/dev/null';
```

### Issue 4: Audio nedokončí chunk
**Príznaky:** Audio sa zastaví uprostred chunku  
**Riešenie:** Skontrolovať `onended` event listener a auto-advance logiku v frontende

---

## 📝 TESTING CHECKLIST

Po implementácii otestovať:

1. [ ] **Basic Playback:** Play → Pause → Resume
2. [ ] **Auto-advance:** Chunk 1 → Chunk 2 automaticky
3. [ ] **Skip controls:** ±30s funguje, ±5min na long press
4. [ ] **Speed control:** Zmena rýchlosti funguje
5. [ ] **Progress bar:** Zobrazuje správny progress celej knihy
6. [ ] **Persistence:** Refresh stránky → obnoví pozíciu
7. [ ] **Preloading:** Prechod na ďalší chunk bez loading delay
8. [ ] **Error handling:** Timeout → retry → error UI
9. [ ] **Edge cases:** Posledný chunk → nepokračovať ďalej
10. [ ] **Mobile:** Touch controls fungujú (long press na mobile)

---

## 🎯 FIRST STEP V NOVOM CHATE

**Skopíruj tento príkaz do nového chatu:**

```
Začni implementáciu POC 2.0 Frontend pre Ebook Reader.

Backend už beží na http://localhost:3001 s týmito endpointmi:
- GET /api/book/info → { totalChunks: 795, totalWords: 23305, estimatedDuration: 9322 }
- POST /api/tts/chunk → { chunkIndex: number } → WAV audio

DÔLEŽITÉ INFO O BACKENDE:
- Chunk size: 200 bytes (optimalizované pre real-time TTS)
- TTS generovanie: ~25 sekúnd per chunk
- 795 chunkov celkom
- Windows kompatibilné (opravený /dev/null issue)

Úloha: Vytvor BookPlayer komponent v apps/frontend/src/components/BookPlayer.tsx

Požiadavky:
1. Sequential playback - chunk po chunku s auto-advance
2. Controls: Play/Pause, Skip ±30s (click), Skip ±5min (long press 3s)
3. Speed dropdown: 0.75x, 0.9x, 1.0x, 1.25x, 1.5x
4. Progress bar celej knihy (nie per-chunk)
5. Display: "Chunk X/Y | current time / total time"
6. localStorage: Save/restore position { chunkIndex, timeInChunk }
7. Preloading: Load chunk N+1 keď N začne hrať
8. Error handling: 3 retry attempts s exponential backoff
9. Loading states: "Generujem audio chunk X/Y..." (cca 25s)

Začni vytvorením BookPlayer.tsx s TypeScript interfaces a fetch book info z API.
```

---

## 📞 SUPPORT & RESOURCES

- **Backend logs:** Terminal kde beží `npm run dev --workspace=apps/backend`
- **Frontend logs:** Browser DevTools Console
- **API testing:** Simple Browser v VS Code na `http://localhost:3001/api/book/info`
- **Unit tests:** `npm run test --workspace=apps/backend` (všetky PASS)

---

**Tento handoff obsahuje 100% informácií potrebných na dokončenie POC 2.0 Frontend! 🚀**

**Autor:** GitHub Copilot  
**Dátum:** 7. december 2025  
**Version:** 1.0
