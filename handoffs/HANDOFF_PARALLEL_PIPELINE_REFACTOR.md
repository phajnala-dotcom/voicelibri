# HANDOFF: Parallel Pipeline Refactoring

**Branch:** `feature/parallel-pipeline`

## 4 PARALLEL PROCESSES

| # | Process | Parallelization Strategy |
|---|---------|-------------------------|
| 1 | **Character Extraction** | First 3 chapters full analysis → background enrichment |
| 2 | **Dramatization** | Chapter-by-chapter, uses character DB |
| 3 | **TTS Generation** | 2-3 sub-chunks in parallel |
| 4 | **Playback** | Start as first sub-chunk is ready |

## CHARACTER EXTRACTION STRATEGY

**Critical**: Full character description (gender, age, personality traits) is REQUIRED for voice selection. This will be even more important with future voice description improvements and SSML tags.

**Two-Phase Approach**:
```
PHASE 1 - First 3 Chapters (~10k chars) - BLOCKING
├── Extract FULL character descriptions:
│   ├── Name
│   ├── Gender (required for voice selection)
│   ├── Age (affects voice pitch/tone selection)
│   └── Personality traits (affects voice style selection)
├── Assign voices based on character→voice matching
└── LOCK voice assignments (no mid-book changes)

PHASE 2 - Remaining Chapters - PARALLEL with TTS
├── Process chapter-by-chapter in background
├── NEW characters: add to DB with full description, assign voice
├── EXISTING characters: ENRICH/UPDATE if new info found
│   ├── Age revealed later → add to character
│   ├── New personality traits → append
│   └── Role clarification → update
├── Voices stay LOCKED (even if character description improves)
└── Richer character DB benefits dramatization quality
```

## FUTURE: Voice Matching Improvements
- Richer voice descriptions (emotion range, accent, style)
- Better character→voice scoring algorithm
- SSML tags for fine-grained control (pitch, rate, emphasis)

## SUB-CHUNK RULES (✅ VERIFIED)
- Max 2 speakers per sub-chunk (including NARRATOR)
- Whole sentences only (fallback: whole words)
- Target: 3300 bytes (700 byte allowance)
- Hard limit: 4000 bytes

## ARCHITECTURE CHANGE
```
CURRENT:
Chapter → Chunks → Sub-chunks (runtime) → chunk.wav → chapter.wav

TARGET:
Chapter → Sub-chunks → subchunk_XXX_YYY.wav → chapter.wav
```

## KEY FILES
- `twoSpeakerChunker.ts` - sub-chunk splitting ✅
- `tempChunkManager.ts` - TTS orchestration
- `llmCharacterAnalyzer.ts` - character extraction (needs two-phase)
- `voiceAssigner.ts` - character→voice matching (future: improve scoring)
- `index.ts` - BOOK_CHUNKS (to remove)

## PIPELINE FLOW
```
[Book Load]
    ↓
[Phase 1: Analyze First 3 Chapters] ──→ [Full Character DB] ──→ [Assign Voices] ──→ LOCK
    ↓
[Dramatize Ch.1] → [TTS 2-3 sub-chunks parallel] → [Play ASAP] → [Save]
    ↓ (parallel)
[Phase 2: Enrich from Ch.4+] ←── adds new chars, enriches existing
    ↓
[Dramatize Ch.2] → [TTS 2-3 sub-chunks parallel] → [Play] → [Save]
    ...
```

---

## NEW CHAT PROMPT

Copy this to start the new chat:

```
I'm refactoring the ebook-reader-poc TTS pipeline for parallelization.

Branch: feature/parallel-pipeline
Handoff: handoffs/HANDOFF_PARALLEL_PIPELINE_REFACTOR.md

KEY GOALS:
1. Character extraction: First 3 chapters FULL analysis (name, gender, age, traits) - BLOCKING
   Then background enrichment for remaining chapters
2. Dramatization: Chapter-by-chapter, parallel with enrichment
3. TTS: 2-3 sub-chunks in parallel
4. Playback: Start ASAP when first sub-chunk ready
5. Remove chunk layer - work with sub-chunks directly

CHARACTER→VOICE MATCHING IS CRITICAL:
- Full character description needed for voice selection
- Future: richer voice descriptions, SSML tags
- Voices LOCKED after initial assignment (no mid-book changes)

SUB-CHUNK RULES:
- Max 2 speakers (including NARRATOR)
- Whole sentences only
- Target 3300 bytes, hard limit 4000 bytes

Start by reading the handoff file and analyzing the current implementation.
```
