# Initial Prompt for New Chat Session

Copy and paste everything below this line into a new chat:

---

## Context

I'm working on an **ebook-to-audiobook TTS application** using:
- Backend: Node.js/Express with TypeScript
- Frontend: React/Vite
- TTS: Google Gemini TTS API (multi-voice)
- LLM: Gemini 2.5 Flash for dialogue dramatization and translation

**Branch:** `feature/translation-support`

## Current State (Stable - All Previous Bugs Fixed)

The app can:
✅ Load EPUB/TXT books
✅ Detect characters and assign unique voices  
✅ Dramatize text chapter-by-chapter with LLM
✅ Generate TTS audio (3x parallel sub-chunks per chapter)
✅ Consolidate sub-chunks into chapter files
✅ Play audio with chapter-based UI
✅ Dead code cleaned up (reduced codebase by ~2000 lines)

## NEW FEATURE: Translation Support

**Goal:** Generate audiobooks in a **different language** than the source ebook.

Example: Czech ebook → English audiobook

### Why This Is Needed
- Gemini TTS does NOT support Slovak, Czech, Croatian natively
- Translation to English/German/etc. enables audiobook generation for unsupported languages

---

## Implementation Tasks

### Task 1: Frontend - Language Selector

**File:** `apps/frontend/src/components/BookPlayer.tsx`

1. Move playback speed selector to the **right** to make space
2. Add new dropdown with same design style:
   - Label: "Jazyk"
   - Values: `en-US`, `en-GB`, `sk-SK`, `cs-CZ`, `ru-RU`, `de-DE`, `pl-PL`, `hr-HR`
3. Pass `targetLanguage` to backend via `POST /api/load-book`

---

### Task 2: Backend - Translation Function

**New File:** `apps/backend/src/chapterTranslator.ts`

```typescript
interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

async function translateChapter(
  chapterText: string,
  targetLanguage: string,
  characterNames: string[]  // MUST be preserved unchanged
): Promise<TranslationResult>
```

**Critical:** Character names must be preserved EXACTLY (passed as list to prompt).

**Prompt structure:**
```
You are a professional literary translator.
Translate from ${sourceLanguage} to ${targetLanguage}.

CRITICAL: Preserve these character names EXACTLY (do not translate):
${characterNames.join(', ')}

Preserve dialogue formatting and paragraph structure.
Return ONLY the translated text.

TEXT:
${chapterText}
```

---

### Task 3: Backend - Pipeline Integration

**File:** `apps/backend/src/index.ts`

**Location:** Inside `startBackgroundDramatization()` (~line 590)

**Current flow per chapter:**
```
1. Dramatize chapter
2. Split into sub-chunks
3. Generate TTS (3x parallel)
4. Consolidate
```

**New flow per chapter:**
```
0. ★ TRANSLATE chapter (if targetLanguage ≠ sourceLanguage) ★
1. Dramatize chapter (uses translated text)
2. Split into sub-chunks  
3. Generate TTS (3x parallel)
4. Consolidate
```

**Bypass logic:**
```typescript
const needsTranslation = TARGET_LANGUAGE && TARGET_LANGUAGE !== SOURCE_LANGUAGE;

if (needsTranslation) {
  const translated = await translateChapter(chapter.text, TARGET_LANGUAGE, characterNames);
  textToDramatize = translated.translatedText;
}
```

---

## Key Files

| File | Action | Purpose |
|------|--------|---------|
| `BookPlayer.tsx` | MODIFY | Add language selector dropdown |
| `index.ts` | MODIFY | Add bypass logic, integrate translation |
| `chapterTranslator.ts` | **NEW** | Translation function |

---

## Pipeline Visualization

```
INITIALIZATION (BLOCKING):
├── Load book → Parse chapters
├── Character extraction (first 50k chars) ← UNCHANGED
└── Voice assignment → LOCK ← UNCHANGED

BACKGROUND (per chapter, sequential):
┌─────────────────────────────────────────────────┐
│ Chapter N:                                      │
│   0. ★ TRANSLATE (if needed) ★ ← NEW           │
│   1. Dramatize (with translated text)          │
│   2. Split into sub-chunks                     │
│   3. TTS generation (3x parallel)              │
│   4. Consolidate to chapter.wav                │
└─────────────────────────────────────────────────┘
```

---

## Testing Plan

1. **Same language (bypass):** Load English book, select en-US → No translation, normal flow
2. **Translation active:** Load Czech book, select en-US → Translation logs, English audio
3. **Character names:** Verify names in audio match original (not translated)

---

## Quick Start

```powershell
# Clear and restart
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force "c:\Users\hajna\ebook-reader\audiobooks" -ErrorAction SilentlyContinue
New-Item -ItemType Directory "c:\Users\hajna\ebook-reader\audiobooks" -Force

# Backend
cd c:\Users\hajna\ebook-reader\apps\backend; npx tsx src/index.ts

# Frontend (new terminal)  
cd c:\Users\hajna\ebook-reader\apps\frontend; npm run dev
```

---

## Deliverables

1. [ ] Frontend: Language selector dropdown added
2. [ ] Backend: `chapterTranslator.ts` created with translateChapter()
3. [ ] Backend: Translation integrated into pipeline with bypass logic
4. [ ] Tested: Same-language bypass works
5. [ ] Tested: Translation to English produces English audio

---

## Core Principle

> **"Solve ROOT CAUSE by all means - don't add functions to counterfight other functions"**

Start by reading the handoff document, then implement in order: Frontend → Backend translation function → Pipeline integration → Test.
