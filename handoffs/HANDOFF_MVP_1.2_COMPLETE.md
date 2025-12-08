# 🎯 HANDOFF: MVP 1.2 - EPUB Support & Multi-Book Management

**Date:** December 8, 2025  
**Branch:** `main` (merged from `mvp-1.2`)  
**Status:** ✅ COMPLETED & DEPLOYED  
**Commit:** `86368b6` (main), `be54f6b` (mvp-1.2)

---

## 📋 QUICK SUMMARY

### ✅ Core Features (MVP 1.0 - 1.2)
- **Text-to-Speech**: Vertex AI Gemini 2.5 Flash TTS, Czech language support
- **Playback Controls**: Play/pause, skip ±30s/5min, cross-chunk navigation
- **Metadata Extraction**: Title, author, language (auto-detect), duration estimate
- **Formats**: TXT (heuristic parser), EPUB (OPF + spine + HTML stripping)
- **Position Persistence**: Per-book localStorage with last selected book restoration

### 🆕 This Session (MVP 1.2 Extension)

#### 1. ✅ EPUB Support
- **Dependencies**: `adm-zip@0.5.16`, `fast-xml-parser@4.5.0`
- **Metadata Parser**: Extracts from OPF container.xml (Dublin Core)
  - Title, Author, Language from `<dc:*>` tags
  - Fallback: "Unknown Title" / "Unknown Author"
- **Text Extractor**: 
  - Reads spine order from OPF manifest
  - Strips HTML/XHTML from chapters → plain text
  - HTML entity decoding, newline normalization
- **Testing**: `dracula.epub` (855KB, 35 chapters, 125k words)

#### 2. ✅ Book Selector UI
- **Component**: `BookSelector.tsx` (427 lines, Material Design)
- **Features**:
  - Dropdown with format icons (📘 EPUB, 📕 PDF, 📄 TXT)
  - Language/duration badges
  - Click-outside-to-close
  - Smooth animations
- **API Integration**: 
  - `GET /api/books` - Lists available books
  - `POST /api/book/select` - Switches active book

#### 3. ✅ Per-Book Position Storage
- **localStorage Keys**: `ebook-reader-position-${filename}`
- **Last Book**: `ebook-reader-last-book` (loads on startup)
- **Book Switching Fix**: 
  - Clear audio source (`audioRef.current.src = ''`)
  - Revoke blob URLs (`URL.revokeObjectURL()`)
  - Preload new book's chunk (`await playChunk()`)
- **Bug Fixed**: Audio no longer continues from previous book after selection

---

## 🏗️ KEY ARCHITECTURE CHANGES

### Backend

#### `src/bookChunker.ts` (276 lines → 552 lines)
**New Functions:**
- `parseEpubMetadata(filePath)` - OPF container parser
- `extractTextFromEpub(filePath)` - Spine-based chapter extractor
- `stripHtml(html)` - HTML tag & entity cleaner
- `parseBookMetadata()` - Format dispatcher (txt/epub/pdf)

#### `src/index.ts` (291 lines → 542 lines)
**New Endpoints:**
- `GET /api/books` - Returns `{ books: BookListItem[] }`
- `POST /api/book/select { filename }` - Switches book, returns metadata

**Initialization Change:**
- ❌ Old: Auto-loads first book at startup
- ✅ New: Lazy loading - no book until selected

### Frontend

#### `components/BookSelector.tsx` (NEW - 427 lines)
**Props:**
```typescript
interface BookSelectorProps {
  onBookSelected: (bookInfo: BookInfo) => void;
  currentBook?: string;
}
```

#### `components/BookPlayer.tsx` (357 lines → 530 lines)
**New Functions:**
- `getPositionKey(filename)` - Generates unique localStorage key
- `savePositionToStorage(state, filename)` - Per-book position save
- `loadPositionFromStorage(filename)` - Per-book position restore
- `handleBookSelected(bookInfo)` - Switches book with audio cleanup

**Critical Fix:**
```typescript
// Stop playback immediately
if (audioRef.current) {
  audioRef.current.pause();
  audioRef.current.src = ''; // ← Clear audio source
}

// Clear cache completely
audioCache.forEach(({ blobUrl }) => {
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl); // ← Free memory
  }
});
setAudioCache(new Map());

// Preload correct chunk for new book
await playChunk(savedPos?.chunkIndex || 0); // ← Load new audio
```

---

## 🏗️ TECHNICAL ARCHITECTURE (CONDENSED)

### Data Flow
```
User selects book → POST /api/book/select
  ↓
Backend: loadBookFile(filename)
  → Detect format (.epub/.txt/.pdf)
  → Parse metadata (OPF or heuristic)
  → Extract text + chunk
  → Return { title, author, language, duration, chunks }
  ↓
Frontend: handleBookSelected()
  → Stop audio + clear cache
  → Update UI metadata
  → Load saved position from localStorage
  → Preload chunk 0 (or saved chunk)
```

### EPUB Processing Pipeline
```
1. AdmZip extracts .epub → ZIP entries
2. Read META-INF/container.xml → Find OPF path
3. Parse OPF (fast-xml-parser):
   - <metadata> → title/author/language
   - <manifest> → id-to-href mapping
   - <spine> → ordered chapter ids
4. Extract each chapter:
   - Decode href (URL encoded paths)
   - Read HTML/XHTML content
   - Strip tags: <p> → text, <br> → \n
   - Decode entities: &quot; → "
```

---

## 📦 DEPENDENCIES

### Production
- **Backend**: `adm-zip@0.5.16`, `fast-xml-parser@4.5.0`, `franc@6.2.0`, `express@4.21.1`
- **Frontend**: `react@18.3.1`, `typescript@5.6.2`, `vite@6.0.1`

### Vertex AI
- **Model**: `gemini-2.5-flash-tts`
- **Voice**: `Algieba` (emotional, human-like)
- **Language**: Auto-detected from text (no hardcoding)

---

## 🧪 TESTING

### Test Files (apps/backend/assets/)
- `dracula.epub` - 927KB, 35 chapters, 124k words, ~14min
- `sample_ebook.txt` - Povídky by Émile Zola, 591 chunks, ~2:35
- `sample_text.txt` - Short test file, 4 chunks, ~1min

### Verified Scenarios
✅ Switch from EPUB → TXT → back to EPUB (position restored)  
✅ Audio stops immediately on book change  
✅ Blob URLs revoked properly (no memory leaks)  
✅ Per-book localStorage keys work correctly  
✅ Last selected book loads on app startup  

---

## 🚀 NEXT STEPS (For New Session)

### Priority 1: PDF Support
- Install `pdf-parse` library
- Implement `parsePdfMetadata()` and `extractTextFromPdf()`
- Test with various PDF ebooks

### Priority 2: Book Upload
- Add file upload UI (drag & drop)
- Backend endpoint: `POST /api/books/upload`
- Move files to `assets/` folder
- Refresh book list

### Priority 3: Cover Images
- Extract cover from EPUB (`<meta name="cover">`)
- Display in BookSelector dropdown
- Fallback to format-based placeholder icons

### Priority 4: Enhanced Features
- Reading statistics (pages read, time spent)
- Bookmarks / highlights
- Variable playback speed (0.5x - 2x)
- Export position to JSON (cross-device sync)

---

## 📝 FINAL NOTES

### Git State
```
* 86368b6 (HEAD -> main, origin/main) Merge mvp-1.2: EPUB support and book selector
|\
| * be54f6b (origin/mvp-1.2, mvp-1.2) feat: EPUB support with book selector and position persistence
|/
* 5868fcb Previous MVP 1.2 work
```

### Session Continuity
✅ **Môžeš pokračovať v tomto chate** - architektúra je stabilná, všetky featury sú funkčné.

Ak chceš nový chat, tento handoff obsahuje všetko potrebné na rýchly onboarding (základy zhrnuté, detaily dostupné v HANDOFF_EPUB_SUPPORT.md a HANDOFF_EPUB_SELECTOR_COMPLETE.md).
- [x] Merged to `main`
- [x] Pushed to remote
- [x] Handoff document created

---

## 💬 FINAL NOTES

**User Feedback:**
- "super - ok" after testing -30s fix
- Accepted +5min timing issue (not fixing)
- Requested this handoff for next session

**Code Quality:**
- TypeScript strict mode passing
- Only cosmetic warnings (inline CSS styles)
- No runtime errors in current implementation

**Recommendation:**
Start a **new chat** for next development phase. This handoff provides complete context for continuation.

---

**End of Handoff**  
*Ready for next session: EPUB/PDF parser or playback enhancements*
