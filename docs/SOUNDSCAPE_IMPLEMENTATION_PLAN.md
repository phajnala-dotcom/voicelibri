# Soundscape Module – Feasibility & Implementation Plan

## Feasibility Summary
- **Feasible:** Yes. Fits current backend pipeline and constraints (no extra LLM pass, async processing, modular toggles).
- **Key dependency:** Curated sound library + metadata.
- **Biggest risk:** Licensing/asset curation, not engineering.

## Estimated Development Time (2‑person team)
Assumes you (vibe coder) + Copilot agent, full‑time focus.
- **Phase 1 MVP (music intro + ambient mixing): 45–65 hours**
  - Backend services + FFmpeg orchestration + basic metadata + toggles.
- **Phase 1.1 polish (ducking, normalization presets, catalog tooling): 20–30 hours**
- **Total to first premium‑grade demo: 65–95 hours**

## Technical Implementation Plan (No Code)

### 1) Data & Assets
**Files**
- `apps/backend/assets/sound-library/` — local curated SFX/music assets
- `apps/backend/assets/sound-library/catalog.json` — metadata index

**Functions**
- `loadSoundLibraryCatalog()` (new, `soundLibrary.ts`): load and cache catalog
- `selectMusicTheme(bookInfo)` (new): pick theme by genre/tone
- `selectAmbientTracks(sceneTags)` (new): pick ambient by tags

### 2) Sound Directive Generator
**Files**
- `apps/backend/src/soundscape/soundDirectiveGenerator.ts`

**Functions**
- `buildSoundDirectives(chapterText, bookInfo)`:
  - keyword/tag extraction (no new LLM pass)
  - returns array of directives with `soundId`, `startChunk`, `endChunk`, `volumeDb`, `fadeInMs`, `fadeOutMs`

### 3) Music Intro/Outro Builder
**Files**
- `apps/backend/src/soundscape/musicIntroBuilder.ts`

**Functions**
- `buildBookIntroSequence(bookTitle, author, chapterTitle, themeTrack)`:
  - builds intro timeline (fade‑in, narration, fade‑out)
- `buildChapterIntroSequence(chapterTitle, themeTrack)`:
  - shorter intro timeline for each chapter

### 4) Audio Mixing Orchestrator (FFmpeg)
**Files**
- `apps/backend/src/soundscape/audioMixer.ts`

**Functions**
- `mixAmbientWithNarration(speechWavPath, ambientWavPath, outputPath, options)`:
  - low‑volume mix, optional ducking
- `concatIntroWithChapter(introWavPath, chapterWavPath, outputPath)`:
  - merge intro + main narration
- `normalizeLoudness(wavPath)`:
  - apply LUFS normalization preset

### 5) Pipeline Integration (Async, No Extra LLM)
**Files**
- `apps/backend/src/tempChunkManager.ts`
- `apps/backend/src/index.ts`

**Functions**
- `enqueueSoundscapeMix(chapterIndex, bookTitle)`:
  - run after chapter consolidation
- `applySoundscapeIfEnabled(chapterPath, bookInfo, toggles)`:
  - creates final mixed chapter file

### 6) Settings & Feature Flags
**Files**
- `apps/backend/src/config/soundscapeConfig.ts` (new)
- `apps/pwa-v2/src/stores/settingsStore.ts` (if present) or `playerStore.ts`

**Functions**
- `getSoundscapeToggles()`:
  - ambient on/off, music on/off
- `setSoundscapeToggles()`:
  - persisted user preferences

### 7) API Surface
**Files**
- `apps/backend/src/index.ts`

**Endpoints**
- `GET /api/soundscape/status`
- `POST /api/soundscape/toggles`

### 8) Optional: Scene Tagging (No extra LLM)
**Files**
- `apps/backend/src/soundscape/keywordTagger.ts`

**Functions**
- `extractSceneTags(text)`:
  - deterministic keyword map for ambient selection

## Notes on Epidemic Sound
- Since no public API, use **offline curated library** with metadata.
- Add a small admin script for ingesting & tagging assets.

## MVP Deliverables
- Ambient mix under narration (single ambient per chapter)
- Chapter intro music using book theme
- Global toggles for ambient/music
- Cached output files
