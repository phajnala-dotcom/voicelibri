# Initial Prompt for New Chat Session

Copy and paste everything below this line into a new chat:

---

## Context

I'm working on an **ebook-to-audiobook TTS application** using:
- Backend: Node.js/Express with TypeScript
- Frontend: React/Vite
- TTS: Google Gemini TTS API (multi-voice)
- LLM: Gemini for dialogue dramatization

**Branch:** `feature/parallel-pipeline`

## Current State

The app can:
✅ Load EPUB/TXT books
✅ Detect characters and assign unique voices
✅ Dramatize text with LLM (parallel, 3 chapters at a time)
✅ Generate TTS audio sub-chunks
✅ Consolidate sub-chunks into chapter files
✅ Play audio with chapter-based UI

## CRITICAL BUGS (Fix First!)

### Bug 1: Skip-back to existing sub-chunks fails
- User plays chunks 0,1,2,3,4,5 then skips back to chunk 2
- Error appears, then retry causes RE-GENERATION instead of playing cached file, or audiobook file saved in its folder if not possible from cache
- **Root cause:** Global→local index conversion uses unreliable `CHAPTER_SUBCHUNKS` Map
- **Fix needed:** Eliminate global index, pass chapterIndex+subChunkIndex directly from frontend

### Bug 2: Audio generation blocks after skipping
- Background generation stops after ~6-10 sub-chunks
- Always happens after user skips forward/back
- **Root cause:** Generation lock deadlock in `generationInProgress` Map
- **Fix needed:** Add timeout to lock wait, ensure finally block clears lock

## Tasks for This Session

### 1. FIX THE TWO CRITICAL BUGS
Make skip-back work by fixing the index mapping issue. Fix generation blocking.

### 2. COMPREHENSIVE AUDIT (Proposal Only - Don't Implement Yet)
Analyze entire codebase and create `AUDIT_PROPOSALS.md` documenting:

- **Redundant/Legacy Code:** Dead code from previous iterations, duplicates, unused imports
- **Architecture Issues:** Unnecessary complexity, poor separation of concerns
- **Performance Bottlenecks:** Sync file I/O, redundant reads, memory leaks
- **State Management:** Global variables, race conditions, scattered state
- **Error Handling Gaps:** Unhandled rejections, missing try/catch
- **Code Organization:** 2000+ line files that need splitting
- **Pipeline Optimization:** Proposals for optimal 4-process parallel pipeline (see below)

For each finding: Current state → Problem → Proposed fix → Risk → Effort (S/M/L)

### The 4 Parallel Processes (Include Design in AUDIT_PROPOSALS.md)

```
PROCESS 1: CHARACTER EXTRACTION
    Scan book, detect characters, assign voices
    ↓ (feeds into)
PROCESS 2: DRAMATIZATION (LLM)
    Tag dialogue with character voices, parallel chapters
    ↓ (feeds into)
PROCESS 3: AUDIO GENERATION (TTS API)
    Includes: chunking → TTS calls → consolidation (internal steps)
    ↓ (feeds into)
PROCESS 4: PLAYBACK
    Uninterrupted, starts ASAP (within 5-10 seconds)
    Background processes continue while user listens
```

**Goal:** First audio plays within 5-10 seconds (ASAP), zero gaps during playback.

## Key Files

| File | Purpose |
|------|---------|
| `apps/backend/src/index.ts` (~2300 lines) | Main server, all endpoints |
| `apps/backend/src/tempChunkManager.ts` (~1600 lines) | Generation, caching, locks |
| `apps/backend/src/audiobookManager.ts` (~700 lines) | Folder structure, metadata |
| `apps/frontend/src/components/BookPlayer.tsx` (~1500 lines) | Playback UI |

## Important Handoff Document

Read: `handoffs/HANDOFF_CHAPTER_UI_ISSUES.md` - contains detailed analysis

## Core Principle

> **"Solve ROOT CAUSE by all means - don't add functions to counterfight other functions"**

When fixing issues, eliminate the source rather than adding workarounds.

## Quick Start

```powershell
# Clear and restart
taskkill /F /IM node.exe 2>$null
Remove-Item -Recurse -Force "c:\Users\hajna\ebook-reader\audiobooks" -ErrorAction SilentlyContinue
New-Item -ItemType Directory "c:\Users\hajna\ebook-reader\audiobooks" -Force

# Backend
cd c:\Users\hajna\ebook-reader\apps\backend; npx tsx src/index.ts

# Frontend (new terminal)
cd c:\Users\hajna\ebook-reader\apps\frontend; npm run dev
```

## Deliverables

1. ✅ Both critical bugs fixed and tested
2. ✅ `AUDIT_PROPOSALS.md` created (proposals only, no implementation) - includes pipeline optimization proposals

Start by reading the handoff document, then fix the bugs, then proceed to audit.
