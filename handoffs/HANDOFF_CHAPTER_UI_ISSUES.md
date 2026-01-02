# Handoff: Chapter-Based UI - Critical Bugs & Comprehensive Audit

**Date:** January 1, 2026  
**Branch:** `feature/parallel-pipeline`  
**Status:** CRITICAL BUGS + AUDIT NEEDED

---

## 🎯 Session Goals (In Priority Order)

### 1. FIX CRITICAL BUGS (Blocking)
Two bugs break core playback functionality - must fix first.

### 2. COMPREHENSIVE AUDIT (Proposal Only)
Analyze entire codebase and propose improvements - DO NOT implement yet, just document findings.
Includes pipeline optimization proposals for the 4 parallel processes.

---

## 🔴 CRITICAL BUG #1: Skip-Back Fails to Find Existing Files

### Symptoms
- User plays sub-chunks 0, 1, 2, 3, 4, 5...
- User skips back to sub-chunk 2
- Error: "Failed to load audio chunk 2: no supported source"
- Clicking "Retry" triggers regeneration instead of serving cached file

### Root Cause
The **global-to-local index conversion** uses `CHAPTER_SUBCHUNKS` Map which is unreliable during on-demand dramatization:

```typescript
// In /api/tts/chunk endpoint (index.ts ~line 1375)
for (const [chapIdx, subChunks] of CHAPTER_SUBCHUNKS.entries()) {
  if (localSubChunkIndex < subChunks.length) {
    chapterIndex = chapIdx;
    break;
  }
  localSubChunkIndex -= subChunks.length;
}
```

**Problem:** Map is populated async during dramatization, entries may be out of order or incomplete.

### Recommended Fix
**Eliminate global index entirely.** Frontend should pass `chapterIndex` + `subChunkIndex` directly:

```typescript
// Frontend request:
POST /api/tts/chunk { chapterIndex: 2, subChunkIndex: 3, voiceName: "Enceladus" }

// No conversion needed - direct file lookup
```

---

## 🔴 CRITICAL BUG #2: Generation Blocks After Skip

### Symptoms
- Generation starts: sub-chunks 0, 1, 2, 3...
- User skips (forward or back)
- Background generation stops completely
- Only ~6-10 sub-chunks generated, then frozen

### Root Cause
Generation lock deadlock in `tempChunkManager.ts`:

```typescript
const generationInProgress: Map<string, Promise<SubChunkResult>> = new Map();

if (generationInProgress.has(lockKey)) {
  return generationInProgress.get(lockKey)!;  // Waits forever if Promise never resolves
}
```

### Recommended Fix
1. Add timeout to lock wait (120s max)
2. Ensure `finally` block ALWAYS clears lock
3. Add error handling in background generation loop - don't let single failure stop everything

---

## 📋 COMPREHENSIVE AUDIT REQUEST

Analyze the entire codebase and produce a **proposal document** with:

### A. Redundant/Legacy Code Identification
- Dead code from previous iterations (POC 1.0, 1.5, etc.)
- Duplicate functions doing similar things
- Unused imports, variables, types
- Comments referencing old behavior
- Multiple caching layers that conflict

### B. Architecture Simplification Opportunities
- Current: Complex global↔local index mapping
- Proposed: Direct chapter:subChunk addressing
- Identify other unnecessary complexity

### C. Performance Bottlenecks
- Synchronous file operations that could be async
- Redundant file reads (read metadata multiple times)
- Memory leaks (Maps that grow forever)
- Unnecessary data copying

### D. State Management Issues
- Global variables that should be scoped
- State spread across multiple locations (memory, files, frontend)
- Race conditions in parallel operations

### E. Error Handling Gaps
- Unhandled promise rejections
- Missing try/catch blocks
- Errors that silently fail

### F. Code Organization
- Single 2000+ line files that should be split
- Functions that do too many things
- Unclear responsibilities between modules

**OUTPUT:** Create `AUDIT_PROPOSALS.md` with findings organized by category, each with:
- Current state
- Problem
- Proposed fix
- Risk level
- Effort estimate (S/M/L)

---

## 🚀 OPTIMAL PIPELINE DESIGN

### Ultimate Goal
**Fastest possible uninterrupted playback** of a newly selected book:
1. User selects book
2. First audio chunk plays within 5-10 seconds
3. Background processing ensures next chunks always ready
4. Zero gaps/stutters during listening

### The 4 Parallel Processes

```
┌─────────────────────────────────────────────────────────────────┐
│                    PARALLEL PIPELINE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PROCESS 1: CHARACTER EXTRACTION                               │
│  ┌───────────────────────────────────────────┐                 │
│  │ Scan book → Detect characters → Assign voices │             │
│  └──────────────────────┬────────────────────┘                 │
│                         │                                       │
│                         ▼                                       │
│  PROCESS 2: DRAMATIZATION (LLM)                                │
│  ┌─────┐ ┌─────┐ ┌─────┐                                       │
│  │Ch 1 │ │Ch 2 │ │Ch 3 │  → Parallel: 3 chapters at a time    │
│  └──┬──┘ └──┬──┘ └──┬──┘                                       │
│     │       │       │                                           │
│     ▼       ▼       ▼                                           │
│  PROCESS 3: AUDIO GENERATION (TTS API)                         │
│  Internal steps: Chunking → TTS calls → Consolidation          │
│  ┌─────┐ ┌─────┐ ┌─────┐                                       │
│  │SC 1 │ │SC 2 │ │SC 3 │  → Parallel: 3 sub-chunks at a time  │
│  └──┬──┘ └──┬──┘ └──┬──┘                                       │
│     │       │       │                                           │
│     ▼       ▼       ▼                                           │
│  PROCESS 4: PLAYBACK                                           │
│  ┌───────────────────────────────────────────┐                 │
│  │ Starts ASAP │ Uninterrupted │ Background continues │        │
│  └───────────────────────────────────────────┘                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Prioritize Current Playback**
   - Whatever user is about to hear gets generated first
   - Background work yields to user requests

2. **Stay N Chunks Ahead**
   - Always maintain buffer of 3-5 ready sub-chunks ahead of playback
   - If buffer depletes, pause background work on distant chapters

3. **No Blocking Operations**
   - All file I/O should be async
   - Generation locks should have timeouts
   - Failures shouldn't cascade

4. **Clean State Management**
   - Single source of truth for playback position
   - Clear chapter/sub-chunk status tracking
   - No orphaned promises or stale maps

### Pipeline Proposals (Include in AUDIT_PROPOSALS.md)
Document proposals for:
- State machine for each process
- Inter-process communication
- Priority scheduling (playback always wins)
- Error recovery strategies
- Required data structures

---

## 📁 Key Files to Analyze

| File | Lines | Purpose | Complexity |
|------|-------|---------|------------|
| `apps/backend/src/index.ts` | ~2300 | Main server, endpoints | HIGH - needs split |
| `apps/backend/src/tempChunkManager.ts` | ~1600 | Generation, caching | HIGH - has bugs |
| `apps/backend/src/audiobookManager.ts` | ~700 | Folder/metadata | MEDIUM |
| `apps/backend/src/hybridDramatizer.ts` | ~500 | LLM integration | MEDIUM |
| `apps/frontend/src/components/BookPlayer.tsx` | ~1500 | UI, playback | HIGH |

---

## ✅ What Currently Works

- Book selection (EPUB, TXT)
- Character detection and voice assignment
- Parallel dramatization (3 chapters)
- Sub-chunk TTS generation
- Chapter consolidation
- Basic playback (no skipping)
- Position persistence to backend
- Voice selection UI

---

## ❌ What's Broken

- Skip forward/back (wrong file lookup)
- Background generation (blocks after skip)
- Time display accuracy (sometimes)

---

## 🎬 Suggested Session Flow

1. **Read this handoff completely**
2. **Fix Bug #1** - Change to chapter:subChunk addressing
3. **Fix Bug #2** - Add timeout and proper error handling to generation lock
4. **Test fixes** - Ensure playback with skipping works
5. **Perform Audit** - Create AUDIT_PROPOSALS.md (includes pipeline optimization)
6. **Review proposals** with user before implementing

---

## 🛠️ Quick Start Commands

```powershell
# Kill processes, clear cache
taskkill /F /IM node.exe; Remove-Item -Recurse -Force "c:\Users\hajna\ebook-reader\audiobooks"; New-Item -ItemType Directory "c:\Users\hajna\ebook-reader\audiobooks"

# Start backend
cd c:\Users\hajna\ebook-reader\apps\backend; npx tsx src/index.ts

# Start frontend (new terminal)
cd c:\Users\hajna\ebook-reader\apps\frontend; npm run dev

# TypeScript check
npx tsc --noEmit
```

---

## 📌 Core Principle

> **"Solve ROOT CAUSE by all means - don't add functions to counterfight other functions"**

When fixing issues, eliminate the source of the problem rather than adding workarounds that increase complexity.

---

## Architecture Overview

### Current Flow (Intended)
```
User selects book
    ↓
Backend loads book, creates metadata.json
    ↓
Frontend requests sub-chunks by GLOBAL index (0, 1, 2, ...)
    ↓
Backend converts global → chapter:local index
    ↓
Backend checks in priority order:
  1. Consolidated chapter file → extract sub-chunk
  2. Sub-chunk file in temp folder
  3. Legacy temp file
  4. File-scan fallback (new)
  5. Memory cache
  6. Generate new
    ↓
Audio served to frontend
```

### Key Files

| File | Purpose |
|------|---------|
| `apps/backend/src/index.ts` | TTS endpoint, book selection, consolidation |
| `apps/backend/src/tempChunkManager.ts` | Sub-chunk generation, file operations, generation lock |
| `apps/backend/src/audiobookManager.ts` | Folder structure, metadata management |
| `apps/frontend/src/components/BookPlayer.tsx` | Playback UI, position tracking |

---

## Bug #1: Skip-Back Fails to Find Existing Files

### Symptoms
- User plays sub-chunks 0, 1, 2, 3, 4, 5...
- User skips back to sub-chunk 2
- Error: "Failed to load audio chunk 2: no supported source"
- Clicking "Retry" triggers regeneration instead of serving cached file

### Root Cause Analysis

The **global-to-local index conversion** is unreliable:

```typescript
// In /api/tts/chunk endpoint (index.ts ~line 1375)
let chapterIndex = 0;
let localSubChunkIndex = chunkIndex;

// This loop uses CHAPTER_SUBCHUNKS which may be incomplete/stale
for (const [chapIdx, subChunks] of CHAPTER_SUBCHUNKS.entries()) {
  if (localSubChunkIndex < subChunks.length) {
    chapterIndex = chapIdx;
    break;
  }
  localSubChunkIndex -= subChunks.length;
}
```

**Problem:** `CHAPTER_SUBCHUNKS` is a Map populated during dramatization. When:
- Chapters process out of order (parallel dramatization)
- Dramatization is still in progress
- Map entries are inconsistent

...the conversion produces WRONG `chapterIndex` and `localSubChunkIndex`.

### Attempted Fix (Not Working)

Added `findSubChunkByGlobalIndex()` function that scans temp folder for files:

```typescript
// In tempChunkManager.ts
export function findSubChunkByGlobalIndex(
  bookTitle: string, 
  globalIndex: number,
  chapterSubChunkCounts: Map<number, number>
): { audio: Buffer; chapterIndex: number; subChunkIndex: number } | null
```

**Why it's not working:** The function builds a sorted list of all `subchunk_CCC_SSS.wav` files and returns the one at position `globalIndex`. But:
1. The file naming uses chapter:local indices, not global indices
2. If chapters have different sub-chunk counts, the mapping doesn't work

### Correct Fix Needed

**Option A: Store global index in filename**
```
subchunk_GLOBAL_CHAPTER_LOCAL.wav  (e.g., subchunk_005_002_003.wav)
```

**Option B: Build global→file mapping at book load time**
```typescript
// Map<globalIndex, { chapterIndex, localIndex }>
const GLOBAL_TO_LOCAL_MAP = new Map();
```

**Option C: Use chapter boundaries metadata**
```typescript
// When consolidated, boundaries.json contains sub-chunk info
// Use this to calculate correct offsets
```

---

## Bug #2: Generation Blocks After Skip

### Symptoms
- Generation starts fine: sub-chunks 0, 1, 2, 3...
- User skips (forward or back)
- Background generation stops
- Only ~6-10 sub-chunks generated total
- Chapter 1 consolidates, then nothing else progresses

### Root Cause Analysis

**Likely cause: Generation lock deadlock**

```typescript
// In tempChunkManager.ts
const generationInProgress: Map<string, Promise<SubChunkResult>> = new Map();

// When user request and background generation race for same chunk:
if (generationInProgress.has(lockKey)) {
  console.log(`⏳ Sub-chunk ${chapterIndex}:${subChunkIndex} generation in progress, waiting...`);
  return generationInProgress.get(lockKey)!;
}
```

If the Promise never resolves (due to error not being caught), all subsequent requests for that chunk wait forever.

**Other potential causes:**
1. Background generation loop exits early on error
2. Parallel generation slots never freed
3. Memory cache grows too large

### Evidence from Logs

```
📦 Chapter 3: generating 16/16 sub-chunks
🚀 Parallel generation: Chapter 3, 16 sub-chunks (parallelism: 3)
🎤 Generating sub-chunk 2:0 (NARRATOR)...
🎤 Generating sub-chunk 2:1 (NARRATOR)...
🎤 Generating sub-chunk 2:2 (NARRATOR, STARŠÍ_ŽENA)...
[... some complete ...]
⏳ Sub-chunk 2:0 generation in progress, waiting...
⏳ Sub-chunk 2:0 generation in progress, waiting...  // Repeated!
```

The "waiting" messages suggest multiple requests queued for same chunk.

### Correct Fix Needed

1. **Add timeout to generation lock:**
```typescript
const GENERATION_TIMEOUT = 120000; // 2 minutes
if (generationInProgress.has(lockKey)) {
  const existingPromise = generationInProgress.get(lockKey)!;
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Generation timeout')), GENERATION_TIMEOUT)
  );
  return Promise.race([existingPromise, timeoutPromise]);
}
```

2. **Ensure lock is always released:**
```typescript
try {
  // ... generation code
} finally {
  generationInProgress.delete(lockKey);  // MUST happen
}
```

3. **Add error handling in background generation loop:**
```typescript
// Don't let single chunk failure stop entire generation
try {
  await generateSubChunk(...)
} catch (error) {
  console.error(`Sub-chunk generation failed:`, error);
  continue;  // Move to next chunk
}
```

---

## What Works

✅ Book selection and metadata creation  
✅ Initial dramatization (parallel, 3 chapters at a time)  
✅ Sub-chunk generation (TTS API calls)  
✅ Chapter consolidation (merging sub-chunks)  
✅ Chapter display: "Kapitola 5 (3/32)" format  
✅ Position save to backend metadata.json  
✅ Position load from backend on book select  
✅ Voice selection and persistence  

---

## What's Broken

❌ **Skip-back playback** - Wrong file lookup  
❌ **Background generation** - Blocks after skip  
❌ **Forward skip** - Same issue as back  

---

## State Variables (Backend)

```typescript
// Global state in index.ts
BOOK_METADATA          // Current book metadata
BOOK_CHAPTERS          // Array of chapter objects
CHAPTER_SUBCHUNKS      // Map<chapterIndex, SubChunk[]> - UNRELIABLE
TOTAL_SUBCHUNKS        // Count of sub-chunks - UNRELIABLE during generation
isDramatizingInBackground  // Flag for background process

// In tempChunkManager.ts
generationInProgress   // Map<lockKey, Promise> - May have stale entries
audioCache            // Map<cacheKey, Buffer> - Memory cache
```

---

## File Structure

```
audiobooks/
  Dracula/
    metadata.json           # Book metadata, playback position
    temp/
      subchunk_000_000.wav  # Chapter 0, sub-chunk 0
      subchunk_001_000.wav  # Chapter 1, sub-chunk 0
      subchunk_002_000.wav  # Chapter 2, sub-chunk 0
      subchunk_002_001.wav  # Chapter 2, sub-chunk 1
      ...
    01_Kapitola_3.wav       # Consolidated chapter file
    01_boundaries.json      # Sub-chunk offsets in chapter file
    02_Kapitola_4.wav
    02_boundaries.json
```

---

## Recommended Next Steps

### Priority 1: Fix Skip-Back (File Lookup)

The global→local mapping is fundamentally broken. Options:

1. **Simplest:** Don't use global indices. Pass `chapterIndex` and `subChunkIndex` separately from frontend.

2. **Alternative:** Build reliable mapping at book load time:
```typescript
function buildGlobalToLocalMap(): Map<number, {chapter: number, local: number}> {
  const map = new Map();
  let globalIdx = 0;
  for (const [chapIdx, subChunks] of CHAPTER_SUBCHUNKS.entries()) {
    for (let local = 0; local < subChunks.length; local++) {
      map.set(globalIdx++, { chapter: chapIdx, local });
    }
  }
  return map;
}
```

But this requires CHAPTER_SUBCHUNKS to be complete before any playback.

### Priority 2: Fix Generation Lock

1. Add timeout to lock wait
2. Ensure finally block always clears lock
3. Add circuit breaker for repeated failures

### Priority 3: Simplify Architecture

Consider: Instead of complex global↔local mapping, use **chapter-based playback**:

```typescript
// Frontend requests:
POST /api/tts/chunk
{
  chapterIndex: 2,
  subChunkIndex: 3,
  voiceName: "Enceladus"
}

// No global index conversion needed
```

This requires frontend to track chapter/sub-chunk separately, but eliminates the mapping bug entirely.

---

## Testing Checklist

- [ ] Select book, play from beginning → Should work
- [ ] Let 5+ sub-chunks generate
- [ ] Skip back to sub-chunk 2 → **FAILS** (should play cached)
- [ ] Skip forward to sub-chunk 7 → **FAILS** (may block generation)
- [ ] Clear cache, restart, resume from saved position → Test position persistence

---

## Related Handoffs

- `HANDOFF_PARALLEL_PIPELINE_REFACTOR.md` - Pipeline architecture
- `HANDOFF_MVP_1.2_COMPLETE.md` - Earlier milestone
- `SPEC_DRAMATIZED_TTS.md` - Original specification

---

## Contact

This handoff documents the state as of January 1, 2026. The two critical bugs prevent normal audiobook listening. Fixing the global→local mapping should be the immediate priority.
