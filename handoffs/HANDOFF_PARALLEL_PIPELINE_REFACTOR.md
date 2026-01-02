# HANDOFF: Parallel Pipeline Refactoring

**Branch:** `feature/parallel-pipeline`
**Status:** ✅ IMPLEMENTED

## COMPLETED CHANGES

### 1. Chunk Layer ELIMINATED ✅

**Old Flow (REMOVED):**
```
Chapter → Chunks (~5k) → Sub-chunks (runtime) → chunk_XXX.wav → chapter.wav
```

**New Flow (IMPLEMENTED):**
```
Chapter → Sub-chunks → subchunk_CCC_SSS.wav → chapter.wav
```

**Files Changed:**
- `index.ts` - REMOVED: `BOOK_CHUNKS`, `CHUNK_INFOS` globals
- `index.ts` - ADDED: `CHAPTER_SUBCHUNKS`, `CHAPTER_DRAMATIZED`, `TOTAL_SUBCHUNKS`
- `tempChunkManager.ts` - ADDED: `generateSubChunk()`, `generateSubChunksParallel()`, `consolidateChapterFromSubChunks()`
- `audiobookManager.ts` - ADDED: `getSubChunkPath()`, `countChapterSubChunks()`, `listChapterSubChunks()`
- `parallelPipelineManager.ts` - NEW FILE: Pipeline orchestration

### 2. Two-Phase Character Extraction ✅

**File:** `llmCharacterAnalyzer.ts`

**New Methods:**
- `analyzeInitialChapters(chapters, numChapters=3)` - Phase 1 BLOCKING
- `enrichFromChapter(chapterText, chapterIndex, existingCharacters)` - Phase 2 PARALLEL

**Flow:**
```
PHASE 1 (BLOCKING):
├── Analyze first 3 chapters
├── Extract FULL character descriptions (name, gender, age, traits, role)
├── Assign voices → LOCK
└── Ready for TTS

PHASE 2 (PARALLEL with TTS):
├── Enrich from remaining chapters
├── NEW characters → add to DB + assign voice
├── EXISTING characters → update traits/age/role (voice stays LOCKED)
```

### 3. Sub-chunk Naming Convention ✅

**Old:** `chunk_XXX.wav` (global index)
**New:** `subchunk_CCC_SSS.wav` (chapter_subchunk)

Example: `subchunk_001_023.wav` = Chapter 2, Sub-chunk 24

### 4. TTS Parallelism ✅

- `generateSubChunksParallel()` - generates sub-chunks with configurable parallelism
- Default: 2 parallel TTS calls (can be increased based on Gemini quota)
- Processes chapters sequentially, sub-chunks in parallel

### 5. Playback Rule ✅

Start playback when first sub-chunk is ready IF > 1500 chars (~300 words, ~2 min audio)

## KEY FILES (UPDATED)

| File | Changes |
|------|---------|
| `llmCharacterAnalyzer.ts` | Added `analyzeInitialChapters()`, `enrichFromChapter()` |
| `parallelPipelineManager.ts` | **NEW** - Pipeline state management |
| `tempChunkManager.ts` | Added sub-chunk generation functions |
| `audiobookManager.ts` | Added sub-chunk path/counting functions |
| `index.ts` | Removed chunk layer, using sub-chunks directly |
| `twoSpeakerChunker.ts` | No changes needed (already correct) |

## SUB-CHUNK RULES (UNCHANGED)
- Max 2 speakers per sub-chunk (including NARRATOR)
- Whole sentences only (fallback: whole words)
- Target: 3300 bytes, Hard limit: 4000 bytes

## FUTURE: Voice Matching Improvements
- Richer voice descriptions (emotion range, accent, style)
- Better character→voice scoring algorithm
- SSML tags for fine-grained control (pitch, rate, emphasis)

## PIPELINE FLOW (FINAL)
```
[Book Load]
    ↓
[Phase 1: Analyze First 3 Chapters] ──→ [Full Character DB] ──→ [Assign Voices] ──→ LOCK
    ↓
[Split Ch.1 → Sub-chunks]
    ↓
[TTS 2 sub-chunks parallel] → [Play when ready (>1500 chars)] → [Save subchunk_001_XXX.wav]
    ↓ (parallel)
[Phase 2: Enrich from Ch.4+] ←── adds new chars, enriches existing
    ↓
[Consolidate Ch.1 → 01_Title.wav]
    ↓
[Continue Ch.2, Ch.3, ...]
```

---

## TESTING

Run TypeScript check:
```bash
cd apps/backend
npx tsc --noEmit
```

## NEXT STEPS

1. Test with actual book file
2. Verify sub-chunk files are created correctly
3. Test playback from sub-chunk files
4. Test consolidation to chapter files
5. Consider adding progress tracking to frontendCHARACTER→VOICE MATCHING IS CRITICAL:
- Full character description needed for voice selection
- Future: richer voice descriptions, SSML tags
- Voices LOCKED after initial assignment (no mid-book changes)

SUB-CHUNK RULES:
- Max 2 speakers (including NARRATOR)
- Whole sentences only
- Target 3300 bytes, hard limit 4000 bytes

Start by reading the handoff file and analyzing the current implementation.
```
