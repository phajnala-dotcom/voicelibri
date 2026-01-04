# Handoff: Translation Support for Multilingual Audiobooks

**Date:** January 4, 2026  
**Branch:** `feature/translation-support`  
**Previous State:** All bugs fixed, dead code cleaned up, pipeline stable

---

## Feature Overview

Enable generation of audiobooks in a **different language than the source ebook**. For example:
- Czech ebook → English audiobook
- English ebook → German audiobook

---

## Architecture Design

### Current Pipeline (Unchanged for same-language)

```
INITIALIZATION (BLOCKING):
├── Load book → Parse chapters
├── Character extraction (first 50k chars)
└── Voice assignment → LOCK

BACKGROUND PROCESSING (per chapter, sequential):
┌─────────────────────────────────────────────────────┐
│ Chapter N:                                          │
│   1. Dramatize chapter (tagChapterHybrid)          │
│   2. Split into sub-chunks                         │
│   3. Generate TTS (3x parallel)                    │
│   4. Consolidate to chapter.wav                    │
└─────────────────────────────────────────────────────┘
```

### New Pipeline (When targetLanguage ≠ sourceLanguage)

```
INITIALIZATION (BLOCKING):
├── Load book → Parse chapters
├── Character extraction (first 50k chars) ← UNCHANGED (original language)
└── Voice assignment → LOCK ← UNCHANGED

BACKGROUND PROCESSING (per chapter, sequential):
┌─────────────────────────────────────────────────────┐
│ Chapter N:                                          │
│   0. ★ TRANSLATE chapter (NEW STEP) ★              │
│   1. Dramatize chapter (uses TRANSLATED text)      │
│   2. Split into sub-chunks                         │
│   3. Generate TTS (3x parallel)                    │
│   4. Consolidate to chapter.wav                    │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Tasks

### Task 1: Frontend - Language Selector

**File:** `apps/frontend/src/components/BookPlayer.tsx`

**Changes:**
1. Move playback speed selector to the **right** to make space
2. Add new dropdown selector:
   - Label: "Jazyk" (Language)
   - Same design style as existing dropdowns
   - Values:
     ```
     en-US (English US)
     en-GB (English UK)
     sk-SK (Slovak)
     cs-CZ (Czech)
     ru-RU (Russian)
     de-DE (German)
     pl-PL (Polish)
     hr-HR (Croatian)
     ```
3. Store selection in state
4. Pass `targetLanguage` to backend when loading book

**API Change:**
- `POST /api/load-book` now accepts optional `targetLanguage` parameter
- `GET /api/book-info` returns `{ ..., sourceLanguage, targetLanguage }`

---

### Task 2: Backend - Language Detection & Bypass Logic

**File:** `apps/backend/src/index.ts`

**Changes:**
1. Add `TARGET_LANGUAGE` global variable (set from frontend)
2. During book loading, detect source language (use existing detection or add simple heuristic)
3. **Bypass logic:**
   ```typescript
   const needsTranslation = TARGET_LANGUAGE && 
                            TARGET_LANGUAGE !== SOURCE_LANGUAGE;
   ```
4. Pass `needsTranslation` flag to background dramatization

---

### Task 3: Backend - Translation Function

**New File:** `apps/backend/src/chapterTranslator.ts`

**Purpose:** Translate a chapter while preserving character names

**Interface:**
```typescript
interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  characterNamesPreserved: string[];  // Names kept unchanged
}

async function translateChapter(
  chapterText: string,
  targetLanguage: string,
  characterNames: string[]  // From character extraction
): Promise<TranslationResult>
```

**Key Requirements:**
1. Use Gemini Flash for translation (same as dramatization)
2. **PRESERVE character names exactly** - pass list of names to keep unchanged
3. Preserve dialogue structure (quotes, attribution)
4. Preserve paragraph breaks
5. Return translated text that can be passed directly to dramatization

**Prompt Design:**
```
You are a professional literary translator.

Translate the following text from ${sourceLanguage} to ${targetLanguage}.

CRITICAL RULES:
1. PRESERVE these character names EXACTLY (do not translate them):
   ${characterNames.join(', ')}
2. Preserve all dialogue formatting (quotes, "said X", etc.)
3. Preserve paragraph structure
4. Maintain the literary style and tone
5. Keep proper nouns (place names) unless they have standard translations

TEXT TO TRANSLATE:
${chapterText}

Return ONLY the translated text, no explanations.
```

---

### Task 4: Backend - Pipeline Integration

**File:** `apps/backend/src/index.ts`

**Location:** Inside `startBackgroundDramatization()`, modify the chapter processing loop

**Current Code (line ~590-610):**
```typescript
const chapter = BOOK_CHAPTERS[chapterNum];

// Dramatize the chapter
const result = await tagChapterHybrid(
  chapter.text,
  characters,
  analyzer,
  chapterNum
);
```

**New Code:**
```typescript
const chapter = BOOK_CHAPTERS[chapterNum];
let textToDramatize = chapter.text;

// ★ TRANSLATION STEP (if needed) ★
if (needsTranslation) {
  console.log(`   🌐 Translating chapter ${chapterNum} to ${TARGET_LANGUAGE}...`);
  const translationResult = await translateChapter(
    chapter.text,
    TARGET_LANGUAGE,
    characters.map(c => c.name)
  );
  textToDramatize = translationResult.translatedText;
  console.log(`   ✅ Translation complete`);
}

// Dramatize the chapter (uses translated text if applicable)
const result = await tagChapterHybrid(
  textToDramatize,
  characters,
  analyzer,
  chapterNum
);
```

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `BookPlayer.tsx` | MODIFY | Add language selector dropdown |
| `index.ts` | MODIFY | Add TARGET_LANGUAGE, bypass logic, integrate translation |
| `chapterTranslator.ts` | **NEW** | Translation function with character name preservation |

---

## Testing Plan

### Test 1: Same Language (Bypass)
1. Load English book
2. Select "en-US" as target language
3. Verify: No translation calls, normal pipeline

### Test 2: Translation Active
1. Load Czech book (e.g., existing test file)
2. Select "en-US" as target language
3. Verify: 
   - Translation logs appear
   - Audio is in English
   - Character names preserved

### Test 3: Character Name Preservation
1. Load book with distinct character names
2. Translate to different language
3. Verify: Character names in audio match original

---

## Cost Estimate

- Translation: ~$0.01-0.02 per chapter (Gemini Flash)
- Full book: ~$0.20-0.50 additional cost for translation
- Same-language: $0 (bypassed)

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Translation quality | Use high-quality prompt, test with multiple languages |
| Character name corruption | Explicit preservation list in prompt |
| Long chapters exceed token limit | Gemini Flash handles 1M tokens - not a concern |
| API rate limits | Same limits as dramatization - handled |

---

## Gemini TTS Supported Languages (Reference)

The TTS model supports these output languages:
- en-US, en-GB (English)
- de-DE (German)
- es-US (Spanish)
- fr-FR (French)
- it-IT (Italian)
- ja-JP (Japanese)
- ko-KR (Korean)
- pt-BR (Portuguese)
- ru-RU (Russian)
- pl-PL (Polish)
- nl-NL (Dutch)
- And more...

**Note:** Slovak (sk-SK), Czech (cs-CZ), Croatian (hr-HR) are NOT natively supported by Gemini TTS. The translation to a supported language (e.g., English) is the solution.

---

## Quick Start Commands

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
