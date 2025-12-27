# HANDOFF: Phase 3 - Audiobook Library & File-Based Generation (Phase 3B Optimized)

**Branch:** `feature/audiobook-library` (create from `main`)  
**Date:** 2025-12-13  
**Status:** 🆕 New feature - File-based audiobook generation and library management

---

## 🎯 OBJECTIVE

Transform the current **streaming-based TTS playback** into a **persistent file-based audiobook library system** where:
1. Audiobooks are generated incrementally and saved to disk (temp chunks → consolidated chapters)
2. Generation continues in background even if frontend closes (server-side worker)
3. Chapter structure is preserved (EPUB chapters or text-based detection)
4. Each chapter = 1 audio file (WAV format)
5. **Zero duplicate generation** - generate once, save to temp, play from temp, consolidate to chapter
6. Player uses saved files (instant playback, no regeneration)

---

## � CRITICAL: GEMINI TTS LIMITS

### **Hard Limits (Verified):**
```typescript
const GEMINI_TTS_HARD_LIMIT = 4000;  // bytes per TTS API request (absolute maximum)
const SAFE_CHUNK_TARGET = 2500;       // target bytes per chunk
const SAFE_CHUNK_MAX = 3500;          // max bytes per chunk (safety margin)
```

### **Why 3500 bytes (not 4000)?**
1. **Multi-voice safety:** A chunk may have multiple voice segments. Each segment is sent to TTS separately:
   ```
   [VOICE=NARRATOR]1200 bytes[/VOICE]
   [VOICE=CHARACTER1]1500 bytes[/VOICE]
   [VOICE=CHARACTER2]800 bytes[/VOICE]
   Total chunk: 3500 bytes ✅ (but each segment <4000 ✅)
   ```
2. **Encoding margin:** UTF-8 encoding differences can add bytes
3. **Safety buffer:** Prevents edge cases where segment boundaries push over limit

### **Generation Time Estimates:**
Based on observed performance (~2.8s for 200 bytes):
- **200 bytes:** ~3s generation, ~15s audio (5x buffer)
- **3500 bytes:** **~60s generation**, ~240s audio (4x buffer)

**First playback wait:** ~60 seconds (acceptable for audiobook - similar to Audible)  
**Subsequent chunks:** Instant (loaded from temp files in parallel)

### **Parallel Preload Strategy:**
```typescript
// Initial load: Generate chunks 0 & 1 in parallel
await Promise.all([
  generateAndSaveTempChunk(0, ...),  // ~60s
  generateAndSaveTempChunk(1, ...)   // ~60s (parallel)
]);

// While chunk 0 plays (4 min):
// → Generate chunks 2 & 3 in parallel (ready at 1 min mark)
// → Chunk 1 plays seamlessly (already cached)
```

**Result:** 60s initial wait, then zero gaps ✅

### **Chunking Rules (STRICT):**
✅ **Break at sentence boundaries** (don't split mid-sentence)  
✅ **Don't exceed 3500 bytes total per chunk**  
✅ **Don't split voice segments** (keep `[VOICE=X]...[/VOICE]` intact)  
✅ **Validate each voice segment ≤4000 bytes** before synthesis  
✅ **Break at chapter/subchapter boundaries** (chunks cannot span chapters)  

### **Voice Segment Validation (REQUIRED):**
```typescript
function validateVoiceSegment(segment: VoiceSegment): void {
  const bytes = Buffer.byteLength(segment.text, 'utf8');
  if (bytes > GEMINI_TTS_HARD_LIMIT) {
    throw new Error(
      `Voice segment for ${segment.speaker} exceeds 4000 bytes: ${bytes} bytes. ` +
      `This will cause TTS API failure. Split the text into smaller chunks.`
    );
  }
}

// Call before every TTS request
voiceSegments.forEach(validateVoiceSegment);
```

---

## �📊 CURRENT STATE (Main Branch)

### Working Features ✅
- **Multi-voice TTS:** 3 distinct speakers (Narrator, Ragowski, Lili) using Gemini voices
- **Voice tagging:** `[VOICE=SPEAKER]...[/VOICE]` markup system working
- **Parallel synthesis:** All voice segments in a chunk synthesize concurrently (~3s per chunk)
- **Streaming playback:** Chunks generated on-demand, cached in memory
- **Aggressive preloading:** Next chunk starts loading immediately (0% trigger, 1 chunk ahead)
- **EPUB support:** Can parse and play EPUB files (dracula.epub tested)
- **Dramatized sample:** `sample_text_tagged.txt` with 6 chunks, 3 speakers (Ragowski story)

### Architecture
```
Text File → Chunking (sentence-based, ~600 chars) → On-demand TTS → WAV stream → Player
                                                    ↓
                                            Memory cache (Map)
```

### Key Files
- **Backend:** `apps/backend/src/index.ts` (Express server, TTS endpoints)
- **Frontend:** `apps/frontend/src/components/BookPlayer.tsx` (streaming player)
- **Chunking:** `apps/backend/src/bookChunker.ts` (sentence-based chunker)
- **Dramatization:** `apps/backend/src/dramatizedChunkerSimple.ts` (voice tag parser)
- **Voice DB:** `apps/backend/src/geminiVoices.ts` (30 Gemini TTS voices)
- **Audio Utils:** `apps/backend/src/audioUtils.ts` (WAV concatenation, silence padding)
- **Sample:** `apps/backend/assets/dramatized_output/sample_text_tagged.txt`

### Current Endpoints
```typescript
GET  /api/books              // List available books in assets/
GET  /api/books/:filename    // Get book metadata (title, author, chunks, duration)
POST /api/tts/chunk          // Generate TTS for a chunk (multi-voice support)
     Body: { chunkIndex, voiceName, bookFile }
```

### Current Limitations
- No persistent storage of generated audio (only memory cache)
- No chapter structure preservation (just sentence-based chunks)
- No audiobook library/folder organization
- No background generation (only on-demand)
- No way to replay saved audiobooks without regeneration

---

## 🎯 PHASE 3 GOALS

### Primary Objectives
1. **Audiobook Library Folder Structure**
   ```
   audiobooks/
     ├── Dracula/
     │   ├── metadata.json
     │   ├── Chapter_01_Jonathan_Harker's_Journal.wav
     │   ├── Chapter_02_Jonathan_Harker's_Journal_Continued.wav
     │   └── ...
     └── Ragowski_Sample/
         ├── metadata.json
         └── Full_Story.wav
   ```

2. **Chapter Detection & Preservation**
   - **EPUB:** Use built-in chapter structure from TOC/spine
   - **Plain Text:** Detect chapter markers (`Chapter 1`, `I.`, `===`, etc.)
   - **Fallback:** If no chapters detected, treat entire book as single "chapter"

3. **Incremental Generation Pipeline (Phase 3B - Optimized)**
   ```
   Text → Chapter Detection → Chunk within chapters → TTS → Save temp → Play → Consolidate to chapter WAV
   ```
   
   **Key difference from Phase 3A (rejected):**
   - ❌ **Phase 3A:** Stream + Background generation = 2x token cost (WASTEFUL)
   - ✅ **Phase 3B:** Generate once → Save temp → Play from temp → Consolidate = 1x token cost

4. **Persistent Server-Side Worker**
   - Runs independently of frontend (continues even if user closes browser)
   - Saves generation state to disk
   - Resumes on server restart
   - Handles errors gracefully (retry logic)

5. **Playback System**
   - **New books:** Play from temp files as they generate (streaming experience, but cached)
   - **Saved books:** Play from consolidated chapter files (instant, no generation)
   - **Progress tracking:** Show generation progress in UI

---

## 🏗️ IMPLEMENTATION PLAN (Phase 3B - Optimized)

### **Core Architecture Change:**

```typescript
// OLD (Phase 3A - REJECTED due to duplicate generation):
User plays → Stream chunk → Background worker generates same chunk AGAIN

// NEW (Phase 3B - ACCEPTED):
User plays → Generate chunks 0 & 1 in parallel → Save to temp → Play chunk 0
           → While playing: generate chunks 2 & 3 in parallel
           → Later: consolidate temps to chapter files
```

**Key insights:** 
- 💾 **Disk is free, API calls are not** (fewer files = fewer potential errors)
- 🔄 **Parallel generation** (2 chunks at once, verified supported by Gemini API)
- 📦 **Temp files = resume capability** (survives browser/server restart)
- ✅ **Zero duplicate generation** (generate once, use forever)

---

## 🏗️ IMPLEMENTATION PLAN

### Step 1: Folder Structure & Metadata
**Files to create:**
- `apps/backend/src/audiobookManager.ts` - Library management functions
- `audiobooks/` folder in project root

**Functions needed:**
```typescript
interface AudiobookMetadata {
  title: string;
  author: string;
  language: string;
  totalChapters: number;
  chapters: Array<{
    index: number;
    title: string;
    filename: string; // e.g., "Chapter_01_Title.wav"
    duration: number;
    isGenerated: boolean;
  }>;
  generationStatus: 'not-started' | 'in-progress' | 'completed';
  lastUpdated: string; // ISO timestamp
}

// Create audiobook folder structure
function createAudiobookFolder(bookTitle: string): string;

// Save metadata.json
function saveAudiobookMetadata(bookTitle: string, metadata: AudiobookMetadata): void;

// Load metadata.json
function loadAudiobookMetadata(bookTitle: string): AudiobookMetadata | null;

// List all audiobooks in library
function listAudiobooks(): string[];
```

### Step 2: Chapter Detection
**File to modify:** `apps/backend/src/bookChunker.ts`

**New functions:**
```typescript
interface Chapter {
  index: number;
  title: string;
  startOffset: number; // Character position in full text
  endOffset: number;
  text: string;
}

// For EPUB files
function extractEpubChapters(epubPath: string): Promise<Chapter[]>;

// For plain text files (regex-based detection)
function detectTextChapters(text: string): Chapter[];

// Fallback: treat as single chapter
function createSingleChapter(text: string, bookTitle: string): Chapter[];
```

**Chapter detection patterns (plain text):**
```regex
/^Chapter\s+\d+/mi              // "Chapter 1"
/^Chapter\s+[IVXLCDM]+/mi       // "Chapter I"
/^\d+\.\s+[A-Z]/mi              // "1. Title"
/^[IVXLCDM]+\.\s+[A-Z]/mi       // "I. Title"
/^={3,}$/mi                     // "===" separator
/^PART\s+\d+/mi                 // "PART 1"
```

### Step 3: Chapter-Based Chunking (WITH GEMINI LIMITS)

**File to create:** `apps/backend/src/chapterChunker.ts`

**Chunking constraints:**
```typescript
const GEMINI_TTS_HARD_LIMIT = 4000;  // Gemini API absolute maximum
const SAFE_CHUNK_TARGET = 2500;      // Target size per chunk
const SAFE_CHUNK_MAX = 3500;         // Maximum size per chunk (safety margin)
```

**Logic:**
```typescript
function chunkChapter(chapter: Chapter, targetBytes: number = 2500, maxBytes: number = 3500): string[] {
  const chunks: string[] = [];
  const words = chapter.text.split(/\s+/).filter(w => w.length > 0);
  
  let currentChunk = '';
  
  for (const word of words) {
    const testChunk = currentChunk ? `${currentChunk} ${word}` : word;
    const byteLength = Buffer.byteLength(testChunk, 'utf8');
    
    // Once we reach target size, look for sentence ending
    if (byteLength >= targetBytes) {
      if (isSentenceEnding(word)) {
        // End chunk at sentence boundary
        chunks.push(testChunk);
        currentChunk = '';
        continue;
      }
      
      // Safety: if we exceed max size, break anyway
      if (byteLength >= maxBytes) {
        chunks.push(currentChunk);
        currentChunk = word; // Start new chunk with current word
        continue;
      }
    }
    
    currentChunk = testChunk;
  }
  
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

// For dramatized text with voice tags
function chunkDramatizedChapter(chapter: Chapter): string[] {
  const segments = extractVoiceSegments(chapter.text);
  const chunks: string[] = [];
  let currentChunkSegments: VoiceSegment[] = [];
  let currentByteCount = 0;
  
  for (const segment of segments) {
    // CRITICAL: Validate individual segment doesn't exceed 4000 bytes
    const segmentBytes = Buffer.byteLength(segment.text, 'utf8');
    if (segmentBytes > GEMINI_TTS_HARD_LIMIT) {
      throw new Error(
        `Voice segment for ${segment.speaker} exceeds 4000-byte Gemini TTS limit: ${segmentBytes} bytes. ` +
        `Split this voice segment into smaller parts.`
      );
    }
    
    // Check if adding this segment would exceed chunk limit
    if (currentByteCount > 0 && currentByteCount + segmentBytes > SAFE_CHUNK_MAX) {
      // Finalize current chunk
      chunks.push(buildChunkFromSegments(currentChunkSegments));
      currentChunkSegments = [segment];
      currentByteCount = segmentBytes;
    } else {
      currentChunkSegments.push(segment);
      currentByteCount += segmentBytes;
    }
  }
  
  if (currentChunkSegments.length > 0) {
    chunks.push(buildChunkFromSegments(currentChunkSegments));
  }
  
  return chunks;
}

function isSentenceEnding(word: string): boolean {
  return /[.!?…]$/.test(word.trim());
}
```

### Step 4: Temp File Generation & Consolidation (Phase 3B)

**File to create:** `apps/backend/src/tempChunkManager.ts`

**Folder structure:**
```
audiobooks/
  └── Dracula/
      ├── temp/
      │   ├── chunk_000.wav  # Generated on first play
      │   ├── chunk_001.wav  # Generated on demand
      │   └── ...
      ├── Chapter_01.wav     # Consolidated from temp chunks
      └── metadata.json
```

**Main function - Generate & Save to Temp:**
```typescript
async function generateAndSaveTempChunk(
  chunkIndex: number,
  chunkText: string,
  bookTitle: string,
  voiceMap: Map<string, string>
): Promise<{ audioBuffer: Buffer; tempFilePath: string }> {
  const tempDir = path.join('audiobooks', bookTitle, 'temp');
  const tempFile = path.join(tempDir, `chunk_${chunkIndex.toString().padStart(3, '0')}.wav`);
  
  // 1. Check if temp file already exists (resume capability)
  if (fs.existsSync(tempFile)) {
    console.log(`💾 Temp chunk ${chunkIndex} already exists, loading from disk`);
    return {
      audioBuffer: fs.readFileSync(tempFile),
      tempFilePath: tempFile
    };
  }
  
  // 2. Generate TTS audio (same logic as current implementation)
  const voiceSegments = extractVoiceSegments(chunkText);
  
  // CRITICAL: Validate each segment before synthesis
  voiceSegments.forEach(segment => {
    const segmentBytes = Buffer.byteLength(segment.text, 'utf8');
    if (segmentBytes > 4000) {
      throw new Error(
        `Voice segment for ${segment.speaker} exceeds 4000-byte limit: ${segmentBytes} bytes`
      );
    }
  });
  
  let audioBuffer: Buffer;
  
  if (voiceSegments.length > 0) {
    // Multi-voice: Parallel synthesis
    const audioBuffers = await Promise.all(
      voiceSegments.map(async (segment) => {
        const speakerVoice = voiceMap[segment.speaker] || 'Algieba';
        const segmentAudio = await synthesizeText(segment.text, speakerVoice);
        return addSilence(segmentAudio, 1000, 'end');
      })
    );
    audioBuffer = concatenateWavBuffers(audioBuffers);
  } else {
    // Single-voice
    audioBuffer = await synthesizeText(removeVoiceTags(chunkText), 'Algieba');
  }
  
  // 3. Save to temp file immediately
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(tempFile, audioBuffer);
  console.log(`✅ Saved temp chunk ${chunkIndex}: ${tempFile} (${audioBuffer.length} bytes)`);
  
  return { audioBuffer, tempFilePath: tempFile };
}
```

**Consolidation function:**
```typescript
async function consolidateChapterFromTemps(
  bookTitle: string,
  chapterIndex: number,
  chunkIndices: number[] // e.g., [0, 1, 2] for chunks 0-2
): Promise<string> {
  const tempDir = path.join('audiobooks', bookTitle, 'temp');
  const outputPath = path.join('audiobooks', bookTitle, `Chapter_${chapterIndex.toString().padStart(2, '0')}.wav`);
  
  // 1. Load all temp chunk files
  const chunkBuffers: Buffer[] = [];
  for (const chunkIndex of chunkIndices) {
    const tempFile = path.join(tempDir, `chunk_${chunkIndex.toString().padStart(3, '0')}.wav`);
    if (!fs.existsSync(tempFile)) {
      throw new Error(`Temp chunk ${chunkIndex} not found: ${tempFile}`);
    }
    chunkBuffers.push(fs.readFileSync(tempFile));
  }
  
  // 2. Concatenate into single WAV
  const chapterAudio = concatenateWavBuffers(chunkBuffers);
  
  // 3. Save consolidated chapter file
  fs.writeFileSync(outputPath, chapterAudio);
  console.log(`✅ Consolidated Chapter ${chapterIndex}: ${outputPath} (${chapterAudio.length} bytes)`);
  
  // 4. Delete temp chunks (cleanup)
  for (const chunkIndex of chunkIndices) {
    const tempFile = path.join(tempDir, `chunk_${chunkIndex.toString().padStart(3, '0')}.wav`);
    fs.unlinkSync(tempFile);
  }
  
  return outputPath;
}
```

### Step 5: Background Generation Worker
**File to create:** `apps/backend/src/audiobookWorker.ts`

**Logic:**
```typescript
class AudiobookGenerationWorker {
  private queue: Array<{ bookTitle: string; chapters: Chapter[] }> = [];
  private isProcessing = false;

  async addBook(bookTitle: string, chapters: Chapter[]) {
    this.queue.push({ bookTitle, chapters });
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private async processQueue() {
    this.isProcessing = true;
    while (this.queue.length > 0) {
      const { bookTitle, chapters } = this.queue.shift()!;
      await this.generateAudiobook(bookTitle, chapters);
    }
    this.isProcessing = false;
  }

  private async generateAudiobook(bookTitle: string, chapters: Chapter[]) {
    const metadata = loadAudiobookMetadata(bookTitle);
    
    for (const chapter of chapters) {
      // Skip if already generated
      if (metadata.chapters[chapter.index].isGenerated) continue;
      
      // Generate chapter audio
      const outputPath = path.join('audiobooks', bookTitle, `Chapter_${chapter.index.toString().padStart(2, '0')}.wav`);
      const { duration } = await generateChapterAudio(chapter, voiceMap, outputPath);
      
      // Update metadata
      metadata.chapters[chapter.index].isGenerated = true;
      metadata.chapters[chapter.index].duration = duration;
      saveAudiobookMetadata(bookTitle, metadata);
      
      console.log(`✅ Chapter ${chapter.index + 1}/${chapters.length} complete`);
    }
    
    metadata.generationStatus = 'completed';
    saveAudiobookMetadata(bookTitle, metadata);
  }
}

export const audiobookWorker = new AudiobookGenerationWorker();
```

### Step 6: Modified TTS Endpoint (Temp File Integration)

**File to modify:** `apps/backend/src/index.ts`

**KEY CHANGE:** Modify existing POST /api/tts/chunk to use temp files:

```typescript
app.post('/api/tts/chunk', async (req: Request, res: Response) => {
  const { chunkIndex, voiceName, bookFile } = req.body;
  
  // 1. Check if temp file exists (disk cache)
  const bookTitle = sanitizeBookTitle(bookFile);
  const tempFile = path.join('audiobooks', bookTitle, 'temp', `chunk_${chunkIndex.toString().padStart(3, '0')}.wav`);
  
  if (fs.existsSync(tempFile)) {
    console.log(`💾 Serving from temp file: chunk ${chunkIndex}`);
    return res.sendFile(path.resolve(tempFile));
  }
  
  // 2. Generate TTS and save to temp
  const chunkText = BOOK_CHUNKS[chunkIndex];
  const { audioBuffer } = await generateAndSaveTempChunk(
    chunkIndex,
    chunkText,
    bookTitle,
    voiceMap
  );
  
  // 3. Send to client
  res.setHeader('Content-Type', 'audio/wav');
  res.send(audioBuffer);
});
```

**New endpoints:**
```typescript
// Consolidate chapter from temp chunks
POST /api/audiobooks/consolidate-chapter
Body: { bookTitle: string, chapterIndex: number, chunkIndices: number[] }
Response: { success: boolean, chapterFile: string }

// Get generation progress
GET /api/audiobooks/:bookTitle/progress
Response: { 
  tempChunksGenerated: number,
  totalChunks: number, 
  chaptersConsolidated: number,
  totalChapters: number 
}
```

### Step 7: Frontend Integration
**File to modify:** `apps/frontend/src/components/BookPlayer.tsx`

**New features:**
- Detect if audiobook exists in library
- Show "Play Saved Audiobook" vs "Generate & Play"
- Display generation progress (poll metadata.json)
- Switch between streaming mode and file-based mode

**New component:** `apps/frontend/src/components/AudiobookLibrary.tsx`
- Grid view of saved audiobooks
- Click to play
- Show completion status

---

## 🧪 TESTING PLAN

### Test Case 1: Short Story (No Chapters)
**File:** `sample_text_tagged.txt` (Ragowski)  
**Expected:**
- Detected as single "chapter"
- Saved to `audiobooks/Ragowski_Sample/Full_Story.wav`
- Metadata shows 1 chapter, ~60-90 seconds duration

### Test Case 2: EPUB with Chapters
**File:** `dracula.epub`  
**Expected:**
- Parse EPUB structure → ~27 chapters
- Save to `audiobooks/Dracula/Chapter_01_...wav`, etc.
- Metadata shows 27 chapters, generation progress

### Test Case 3: Background Generation
**Flow:**
1. User selects `dracula.epub`
2. Backend starts generating Chapter 1
3. User starts playback (streaming mode) while Chapter 2+ generate in background
4. UI shows progress: "Generating audiobook: 3/27 chapters complete"
5. After completion, "Play Saved Audiobook" button appears

### Test Case 4: Replay Saved Audiobook
**Flow:**
1. Select "Dracula" from library
2. Load metadata.json
3. Play from saved WAV files (no TTS generation)
4. Should be instant playback (no loading delays)

---

## 📂 FILE STRUCTURE (After Implementation)

```
ebook-reader/
├── audiobooks/                              # NEW: Generated audiobooks library
│   ├── Dracula/
│   │   ├── metadata.json
│   │   ├── Chapter_01_Jonathan_Harker's_Journal.wav
│   │   ├── Chapter_02_...wav
│   │   └── ...
│   └── Ragowski_Sample/
│       ├── metadata.json
│       └── Full_Story.wav
├── apps/
│   ├── backend/
│   │   └── src/
│   │       ├── index.ts                     # MODIFY: Add audiobook endpoints
│   │       ├── audiobookManager.ts          # NEW: Library management
│   │       ├── chapterChunker.ts            # NEW: Chapter-aware chunking
│   │       ├── chapterAudioGenerator.ts     # NEW: Chapter audio generation
│   │       ├── audiobookWorker.ts           # NEW: Background generation
│   │       ├── bookChunker.ts               # MODIFY: Add chapter detection
│   │       └── ...existing files...
│   └── frontend/
│       └── src/
│           └── components/
│               ├── BookPlayer.tsx           # MODIFY: Hybrid streaming/file mode
│               ├── AudiobookLibrary.tsx     # NEW: Library browser component
│               └── ...existing files...
└── handoffs/
    └── HANDOFF_AUDIOBOOK_LIBRARY.md         # THIS FILE
```

---

## 🚨 CRITICAL CONSIDERATIONS

### 1. **Chunk-to-Chapter Boundary**
**Problem:** Current chunking is sentence-based and doesn't respect chapter boundaries.

**Solution:**
```typescript
// OLD (current)
function chunkBookText(fullText: string): string[] {
  // Chunks can span chapter boundaries
}

// NEW (chapter-aware)
function chunkBookByChapters(fullText: string): Map<number, string[]> {
  const chapters = detectTextChapters(fullText); // Step 1: detect chapters
  const chunksByChapter = new Map();
  
  for (const chapter of chapters) {
    const chunks = chunkChapter(chapter); // Step 2: chunk WITHIN chapter
    chunksByChapter.set(chapter.index, chunks);
  }
  
  return chunksByChapter;
}
```

### 2. **Duration Cap for Chapters**
**Current recommendation:** Do NOT split chapters initially.

**Reasoning:**
- Most audiobook players handle 30-60 min files fine
- Easier UX (1 chapter = 1 file)
- Can add splitting later if needed

**If splitting becomes necessary:**
```typescript
const MAX_CHAPTER_DURATION = 30 * 60; // 30 minutes in seconds

if (estimatedChapterDuration > MAX_CHAPTER_DURATION) {
  // Split into parts: Chapter_01_Part1.wav, Chapter_01_Part2.wav
}
```

### 3. **Disk Space Management**
**Issue:** WAV files are large (~1 MB per minute).

**Estimates:**
- Ragowski sample (6 chunks, ~90s): ~1.5 MB
- Dracula (27 chapters, ~12 hours): ~720 MB

**Mitigation:**
- Add disk space check before generation
- Allow user to delete saved audiobooks
- Consider MP3 conversion in future (Phase 4)

### 4. **Voice Consistency**
**Issue:** Voice assignment must be consistent across chapters.

**Solution:**
- Generate `voice_map.json` ONCE at book load (not per chapter)
- Store in audiobook folder: `audiobooks/Dracula/voice_map.json`
- Reuse for all chapters

### 5. **Streaming vs File-Based Playback**
**Hybrid approach:**
```typescript
// Check if audiobook exists and is complete
const metadata = await fetch(`/api/audiobooks/${bookTitle}`);

if (metadata.generationStatus === 'completed') {
  // Use file-based playback
  audioRef.current.src = `/api/audiobooks/${bookTitle}/chapters/0`;
} else {
  // Use streaming playback (current approach)
  audioRef.current.src = `/api/tts/chunk?chunkIndex=0&bookFile=${bookFile}`;
  
  // Kick off background generation
  await fetch('/api/audiobooks/generate', {
    method: 'POST',
    body: JSON.stringify({ bookFile, bookTitle })
  });
}
```

---

## 🔄 MIGRATION STRATEGY

### Phase 3A: File Generation (No Player Changes)
1. Implement audiobook folder structure
2. Implement chapter detection
3. Implement background generation
4. Test with Ragowski sample
5. **Player still uses streaming** (no changes yet)

### Phase 3B: Hybrid Playback
1. Modify player to detect saved audiobooks
2. Add file-based playback mode
3. Add UI for library browsing
4. Test with both streaming and file modes

### Phase 3C: Polish & Optimization
1. Add progress tracking UI
2. Add audiobook deletion
3. Add MP3 conversion (optional)
4. Performance testing

---

## 📋 DEVELOPMENT CHECKLIST

- [ ] Create `feature/audiobook-library` branch from `main`
- [ ] Create `audiobooks/` folder in project root
- [ ] Implement `audiobookManager.ts` (folder creation, metadata)
- [ ] Add chapter detection to `bookChunker.ts` (EPUB + plain text)
- [ ] Create `chapterChunker.ts` with **3500-byte max, sentence boundaries, chapter boundaries**
- [ ] Create `tempChunkManager.ts` (generate & save to temp, consolidation)
- [ ] Add **voice segment validation** (4000-byte hard limit check)
- [ ] Modify POST /api/tts/chunk to use temp files (disk cache)
- [ ] Create `audiobookWorker.ts` (persistent background generation)
- [ ] Test with `sample_text_tagged.txt` → should create single-file audiobook
- [ ] Test with `dracula.epub` → should create multi-chapter audiobook
- [ ] Verify **zero duplicate generation** (1x token cost, not 2x)
- [ ] Test server restart → worker resumes from temp files
- [ ] Test frontend close → backend continues generation
- [ ] Add progress tracking endpoints
- [ ] Frontend: detect temp files, play from disk
- [ ] Add chapter consolidation UI trigger
- [ ] Performance testing (disk space, generation speed)
- [ ] Documentation update

---

## 🎯 SUCCESS CRITERIA

### Must Have (MVP)
✅ **Audiobooks saved to `audiobooks/{title}/temp/` folder structure**  
✅ **Chapter detection working for EPUB files**  
✅ **Single-file audiobooks for non-chaptered content**  
✅ **Persistent background generation (continues even if frontend closes)**  
✅ **Temp file caching (zero duplicate TTS generation)**  
✅ **Parallel chunk generation (2 chunks at once, verified with Gemini API)**  
✅ **Metadata tracks generation progress**  
✅ **Can replay from temp files without regeneration**  
✅ **Chapter consolidation on completion**  
✅ **Voice segment validation (≤4000 bytes per segment)**  
✅ **Chunking respects 3500-byte max, sentence boundaries, chapter boundaries**  
✅ **60-second first-play wait acceptable** (standard for audiobook apps)  

### Nice to Have (Future)
⭐ Plain text chapter detection (regex-based)  
⭐ Chapter splitting for long chapters (>30 min)  
⭐ MP3 conversion for smaller file sizes  
⭐ Library browser UI with grid view  
⭐ Delete audiobook functionality  
⭐ Disk space management  

---

## 📊 KEY METRICS (Expected Improvements)

| Metric | Old (200 bytes) | New (3500 bytes) | Improvement |
|--------|-----------------|------------------|-------------|
| Chunks per book (Dracula) | ~2000 | ~115 | **17x fewer** |
| Files to manage | 2000 | 115 | **17x fewer** ✅ |
| Token cost | Same | Same | ⚠️ Cost = text length (not chunk count) |
| Error probability | Higher | **17x lower** | ✅ Fewer API calls |
| First chunk wait | ~3 sec | **~60 sec** | ⚠️ Slower initial load |
| Chunk duration | 10-15 sec | **3-4 min** | ✅ Better buffer time |
| Subsequent playback | Instant (cache) | Instant (temp file) | ✅ Same |
| Duplicate generation | None (memory cache) | **None (disk cache)** | ✅ |
| Chapter consolidation | Complex (2000 files) | **Simple (115 files)** | ✅ |

---

## 🤝 HANDOFF INSTRUCTIONS FOR NEXT LLM SESSION

### **1. Create new branch:**
```powershell
git checkout main
git pull origin main
git checkout -b feature/audiobook-library
```

### **2. Start with Step 1** (folder structure & metadata)
- Test folder creation first
- Test metadata saving/loading
- Don't touch player yet

### **3. Then Step 2-3** (chapter detection & chunking)
- Test chapter detection on dracula.epub
- Test chunking with 3500-byte limit
- **CRITICAL:** Add voice segment validation (≤4000 bytes)

### **4. Then Step 4** (temp file generation)
- Modify POST /api/tts/chunk to use temp files
- Test temp file creation
- Test resume from temp files

### **5. Test incrementally:**
- Generate 1 chunk → verify temp file created
- Play chunk → verify plays from temp file
- Restart server → verify temp file still exists
- Close frontend → verify backend continues generation

### **6. Key files to read first:**
- `apps/backend/src/index.ts` (current TTS logic - lines 360-450)
- `apps/backend/src/bookChunker.ts` (current chunking)
- `apps/backend/src/dramatizedChunkerSimple.ts` (voice tag parsing)
- `apps/backend/src/audioUtils.ts` (WAV concatenation)

### **7. Do NOT modify player initially** 
Keep streaming working while building temp file generation

### **8. User will test with:**
- `sample_text_tagged.txt` (short, no chapters, 3 speakers)
- `dracula.epub` (long, ~27 chapters, plain narrator voice)

### **9. Critical validations:**
- ✅ Each voice segment ≤4000 bytes (Gemini hard limit)
- ✅ Each chunk ≤3500 bytes total (safety margin)
- ✅ Chunks break at sentence boundaries
- ✅ Chunks don't span chapter boundaries
- ✅ No duplicate TTS generation (generate once, save to temp)
- ✅ Parallel generation works (2 chunks at once via Promise.all)
- ✅ 60-second first-play wait is acceptable UX

### **10. Performance expectations:**
- **First chunk:** ~60s wait (parallel generation of chunks 0 & 1)
- **Chunk 0 duration:** ~3-4 minutes of audio
- **Subsequent chunks:** Instant (from temp files)
- **Buffer time:** Chunks 2 & 3 ready at 60s mark (still 3 min of chunk 0 remaining)
- **Result:** Zero gaps after initial 60s wait ✅

---

**Good luck! 🚀**
