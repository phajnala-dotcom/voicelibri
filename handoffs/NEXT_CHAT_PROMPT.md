# Fresh Chat Prompt - Mobile App Issues

## Repo: phajnala-dotcom/voicelibri (branch: main)

## Context
VoiceLibri is an AI-powered audiobook generation app. React Native mobile app (`apps/mobile/`) with Express backend (`apps/backend/`). 

---

## ⚠️ ISSUES TO FIX (3 items)

### Issue 1: Generated Audiobook Opens Book Page Instead of Player

**Problem:**
When user clicks on a newly generated audiobook in the Library tab, it opens the book details page (with "Create Audiobook" button) instead of the audio player.

**Expected:**
Generated audiobooks with downloaded chapters should open directly in the player and start playback.

**Root Cause Analysis:**
1. `BookList.tsx` has logic to detect generated audiobooks and play directly (lines 55-94)
2. The condition checks `isGenerated` flag AND `getDownloadedChapters(book.id)` 
3. However, something is failing - either:
   - The `isGenerated` flag is not set when book is added to store
   - The `getDownloadedChapters()` returns empty array despite files existing
   - The `book.id` doesn't match the audiobook folder name

**Files to Investigate:**
- [apps/mobile/src/components/ui/BookList.tsx](apps/mobile/src/components/ui/BookList.tsx) - `handleBookPress()` function (lines 55-94)
- [apps/mobile/src/services/audioStorageService.ts](apps/mobile/src/services/audioStorageService.ts) - `getDownloadedChapters()` function
- [apps/mobile/src/stores/bookStore.ts](apps/mobile/src/stores/bookStore.ts) - check if `isGenerated: true` is set when adding book
- [apps/mobile/src/components/ui/CreateAudiobookSheet.tsx](apps/mobile/src/components/ui/CreateAudiobookSheet.tsx) - lines ~330-380 where book is added to store after generation

**Debug Steps:**
1. Add console.log in `BookList.handleBookPress()` to see what `isGenerated` and `getDownloadedChapters()` return
2. Check if book ID format matches between store and storage service
3. Verify `addBook()` is called with `isGenerated: true` after successful generation

---

### Issue 2: Document Picker Shows Unsupported Files

**Problem:**
When user selects "Add from device" to upload an ebook, the document picker shows ALL files including audio, video, and images - which are not supported.

**Expected:**
Document picker should ONLY show files with supported extensions:
- Ebooks: `.epub`, `.mobi`, `.azw`, `.azw3`, `.kf8`
- Documents: `.docx`, `.doc`, `.odt`, `.rtf`, `.pdf`, `.pages`, `.wps`
- Text: `.txt`, `.md`, `.markdown`, `.html`, `.htm`

**Current Implementation:**
`CreateAudiobookSheet.tsx` (lines 192-214) defines `SUPPORTED_MIME_TYPES` array, but:
1. iOS ignores MIME type filtering and shows all files in browse mode
2. Fallback validation (lines 241-253) shows error AFTER user selects, not prevents selection

**Solution Needed:**
Per official [expo-document-picker docs](https://docs.expo.dev/versions/latest/sdk/document-picker/), iOS file filtering with MIME types is limited. Need to:
1. Keep MIME type filtering for Android
2. For iOS, rely on post-selection validation but improve UX by showing supported formats BEFORE user picks
3. Consider showing a format hint/guide in the sheet UI before user taps "Select file"

**Files to Modify:**
- [apps/mobile/src/components/ui/CreateAudiobookSheet.tsx](apps/mobile/src/components/ui/CreateAudiobookSheet.tsx)

---

### Issue 3: Error Message Shows Incomplete Format List

**Problem:**
When user selects an unsupported file, error message shows truncated format list:
```
Supported formats:
• Ebooks: EPUB, MOBI, AZW
• Documents: DOCX, DOC, ODT, RTF, PDF
• Text: TXT, MD, HTML
```

**Expected:**
Since the full list of supported formats is long (15+ types), instead of showing all in the error message, show a more user-friendly message like:
```
"Unsupported file type: .mp3

VoiceLibri converts text-based files (ebooks and documents) to audiobooks. 
Audio, video, and image files cannot be processed.

Tap 'Supported Formats' to see the full list."
```
Or use a collapsible/expandable section.

**Files to Modify:**
- [apps/mobile/src/components/ui/CreateAudiobookSheet.tsx](apps/mobile/src/components/ui/CreateAudiobookSheet.tsx) - error message on lines 241-253 and 256-259

---

## Tech Stack Reference

- **Framework:** React Native with Expo SDK 54
- **Navigation:** expo-router (file-based)
- **State:** Zustand with AsyncStorage persistence
- **UI:** Custom components in `apps/mobile/src/components/ui/`
- **File handling:** expo-file-system, expo-document-picker

## Development Commands

```powershell
# Start mobile app with tunnel
cd c:\Users\hajna\ebook-reader\apps\mobile; npx expo start --tunnel --clear

# Start backend (required for audiobook generation)
cd c:\Users\hajna\ebook-reader; npm run dev:backend
```

## Testing Checklist

After fixes:
1. [ ] Load a TXT file from device → Generate completes → Click book in Library → Player opens and plays
2. [ ] Open document picker → Only text-based files visible (or clear message about what's supported)
3. [ ] Select an MP3 file (if visible) → Error message is clear and concise without listing all 15 formats
