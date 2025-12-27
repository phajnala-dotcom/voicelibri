# LLM Dramatization Implementation - Handoff

## Context
Branch: `feature/llm-dramatization` (to be created from `main`)  
Goal: Implement automatic dramatization using Gemini 2.5 Flash LLM

## Architecture Decision: Option C → D (Hybrid + Cached)

### Phase 1: Quick Character Scan (15-20s)
```
User selects book → LLM scans full text → Extracts characters with traits/gender
→ Assigns voices globally → Saves voice map → Ready for audio generation
```

### Phase 2: Progressive Chapter Tagging (5-10s per chapter)
```
Tag Chapter 1 → Start audio generation (parallel)
Background: Tag Chapters 2, 3, 4... (stay 1-2 chapters ahead)
```

### Phase 3: Caching (Production)
```
Save: audiobooks/{book}/source_dramatized.txt
Next playback: Load cached, skip LLM (instant start)
```

**Result**: First audio in ~30s, subsequent plays instant

## Key Requirements

### 1. Intelligent Text Cleaning
**Must remove**:
- Page numbers
- Table of contents
- Editorial notes (footnotes, annotations)
- Publisher info
- Copyright notices (unless legally required)
- Headers/footers
- Chapter numbering artifacts

**Must preserve**:
- Legally required copyright statements
- Author attributions
- Essential footnotes (part of story)
- Chapter titles (for navigation)

### 2. LLM Configuration
```javascript
{
  model: "gemini-2.5-flash",
  temperature: 0.1,
  maxCharacters: 10,
  minDialogueLines: 3
}
```

### 3. Caching Strategy
- Store: `audiobooks/{book}/source_dramatized.txt`
- Store: Voice map in `metadata.json`
- Invalidate: On user voice override or LLM prompt version change

### 4. Integration Points

**Existing Files to Modify:**
- `apps/backend/src/index.ts` - Add LLM dramatization endpoint
- `apps/backend/src/llmCharacterAnalyzer.ts` - Implement actual LLM calls
- `apps/backend/src/audiobookManager.ts` - Add `isDramatized` to metadata
- `apps/backend/src/bookChunker.ts` - Add text cleaning functions

**New Files to Create:**
- `apps/backend/src/textCleaner.ts` - Non-content text elimination
- `apps/backend/src/geminiDramatizer.ts` - Main LLM orchestration

## Current Codebase Context

### Existing Infrastructure (already working):
- ✅ Chapter extraction: `extractEpubChapters()`, `detectTextChapters()`
- ✅ Chapter chunking: `chunkBookByChapters()` - max 3500 bytes, respects voice tags
- ✅ Voice tag parsing: `extractVoiceSegments()`, `[VOICE=CHARACTER]` format
- ✅ Multi-voice TTS: Parallel synthesis for dramatized chunks
- ✅ Audiobook storage: `audiobooks/{book}/` with metadata.json
- ✅ Consolidation: Automatic chapter file creation with temp cleanup

### Voice Tag Format (established):
```
[VOICE=NARRATOR]
The sun was setting over the hills.
[VOICE=JOHN]
"Where are we going?" he asked.
[VOICE=MARY]
"You'll see," she replied with a smile.
```

### Metadata Structure (extend this):
```json
{
  "title": "Book Title",
  "isDramatized": true,  // ADD THIS
  "voiceMap": {          // ADD THIS
    "NARRATOR": "Algieba",
    "JOHN": "Zubenelgenubi", 
    "MARY": "Zephyr"
  },
  "dramatizationVersion": "1.0",  // ADD THIS
  "sourceFile": "dracula.epub",
  "chapters": [...],
  "generationStatus": "in-progress"
}
```

## Implementation Steps

### Step 1: Text Cleaning Module
Create `textCleaner.ts`:
- Regex patterns for page numbers, TOC, editorial notes
- Legal content preservation rules
- EPUB-specific vs TXT-specific cleaning

### Step 2: LLM Integration
Implement in `llmCharacterAnalyzer.ts`:
- Connect to Vertex AI Gemini 2.5 Flash
- Character extraction prompt (full book)
- Chapter tagging prompt (per chapter)
- Structured JSON output parsing

### Step 3: Dramatization Orchestrator
Create `geminiDramatizer.ts`:
- Coordinate two-pass process
- Handle caching logic
- Background chapter tagging
- Progress tracking

### Step 4: API Endpoint
Add to `index.ts`:
```
POST /api/dramatize/auto
Body: { bookTitle, sourceFile }
Response: { status, voiceMap, estimatedTime }
```

### Step 5: Integration with Book Selection
Modify `/api/book/select`:
- Check for cached dramatization
- If new book + dramatization enabled → trigger LLM
- Load cached if available

## Testing Plan
1. Test with `sample_text.txt` (small, fast)
2. Test with `sample_ebook.txt` (~60k tokens)
3. Test with `dracula.epub` (full book, ~120k tokens)
4. Verify caching works
5. Test voice override + re-dramatization

## Open Questions / Decisions Needed
- [ ] Should user explicitly enable dramatization per book, or auto-detect and suggest?
- [ ] UI for showing dramatization progress (especially Phase 1 character scan)?
- [ ] Should we support editing characters/voices before audio generation?
- [ ] Fallback behavior if LLM fails (skip dramatization, or fail gracefully)?

## Dependencies Already Installed
- ✅ `@google-cloud/vertexai` (from package.json)
- ✅ Gemini TTS client (`ttsClient.ts`)
- ✅ Voice assigner (`voiceAssigner.ts`)

## Estimated Time
- Text cleaning: 2-3 hours
- LLM integration: 3-4 hours  
- Orchestration + caching: 2-3 hours
- API + integration: 2-3 hours
- Testing + refinement: 2-3 hours
**Total: 11-16 hours**

## Cost Estimate (per book)
- Character scan (120k input): $0.009
- Chapter tagging (30k output): $0.009
- **Total: ~$0.02 per book** (cached after first run)

---

**Decision: Continue in current chat recommended** - full context preserved, 940k tokens remaining, tight integration needs context.
