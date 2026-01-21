# Soundscape Module – Full Project Plan (No‑Code)

## 0) Status
Yes, feasible. This document is a complete, implementation‑ready plan using decisions from this chat.

## 1) Objectives
- Add **ambient soundscapes** and **music intros** that elevate perceived quality.
- **Zero added time to first listen** (async mixing; intro optional/fallback).
- **No new LLM pass**; reuse existing dramatization outputs and book info.
- Modular, toggleable, production‑ready, premium‑grade.

## 2) Constraints (Hard)
- No additional LLM pass (only expand existing prompts if needed).
- No added latency to first listen.
- Async processing, fail‑open to standard audio.
- Modular feature flags (ambient/music on/off).

## 3) User Experience Sequences
### 3.1 Book Intro (optional, cached)
1. Theme music fade‑in.
2. Music lowers.
3. Narrator reads: Book title, Author, “This audiobook was brought to you by VoiceLibri”.
4. Music rises briefly → lowers.
5. Narrator reads: “Chapter 1”, Chapter title.
6. Music rises briefly → fade‑out.
7. Main narration begins.

### 3.2 Chapter Intro (template‑based)
1. Theme music fade‑in.
2. Music lowers.
3. Narrator reads: “Chapter {n}”, Chapter title.
4. Music rises slightly → fade‑out.
5. Chapter narration starts.

### 3.3 Ambient Section (per chapter/section)
1. Fade‑in ambient track.
2. Lower volume after 3–5s.
3. Narration starts.
4. Narration ends.
5. Fade‑out 2s after end.

## 4) Zero‑Latency Strategy
- Start playback with **current subchunk** pipeline.
- Generate **intro + ambient mix asynchronously** after chapter consolidation.
- If intro ready first: play it; else **skip intro** and start narration.
- Cache intros and mixed chapters for future plays.

## 5) Architecture Overview
### 5.1 Data Assets
- Store SFX/music in **GCS** (self‑hosted curated library).
- Maintain `catalog.json` with metadata (tags, mood, intensity, loudness).

### 5.2 Sound Directives
Sound directives are generated from existing text structures, **no new LLM pass**.
Example schema:
```
{ soundId, startChunk, endChunk, volumeDb, fadeInMs, fadeOutMs }
```

### 5.3 Audio Engine
- **FFmpeg** CLI for mixing, fades, normalization, concat.
- Use sidechain/ducking to keep narration clear.

## 6) Components & Files (No‑Code Implementation Map)
### Backend
- `soundLibrary.ts`
  - `loadSoundLibraryCatalog()` – load & cache catalog
  - `selectMusicTheme(bookInfo)` – choose theme track
  - `selectAmbientTracks(sceneTags)` – choose ambient

- `soundDirectiveGenerator.ts`
  - `buildSoundDirectives(chapterText, bookInfo)` – keyword‑based tags

- `musicIntroBuilder.ts`
  - `buildBookIntroSequence(bookTitle, author, chapterTitle, themeTrack)`
  - `buildChapterIntroSequence(chapterTitle, themeTrack)`

- `audioMixer.ts`
  - `mixAmbientWithNarration(speechWavPath, ambientWavPath, outputPath, options)`
  - `concatIntroWithChapter(introWavPath, chapterWavPath, outputPath)`
  - `normalizeLoudness(wavPath)`

- Integration points:
  - `tempChunkManager.ts`: after chapter consolidation, enqueue mix
  - `index.ts`: serve mixed chapter when ready, fallback otherwise

### Frontend (PWA)
- Settings toggles: Soundscape / Music Intro / Ambient
- UI indicators: “Enhanced audio available”

## 7) Asset Strategy
### 7.1 Library Sources
- Prefer **CC0** or **commercial‑friendly** assets.
- Avoid **CC‑BY‑NC**.

### 7.2 Metadata
Each asset includes:
- `id, type, genre[], mood[], intensity (0–1), recommendedVolumeDb, loopable, durationSec, loudnessLUFS`

### 7.3 Curation Workflow (Batch)
1. Acquire assets.
2. Normalize loudness.
3. Auto‑tag (offline) + manual QA for top assets.
4. Upload to GCS + update catalog.

## 8) Intro Template (Hardcoded)
Yes, a **single template** with placeholders is recommended.
- `"Chapter {n}"`, `"{title}"` are dynamic.
- Same timing and fades for all content.

## 9) Performance & Costs
- Mixing is offline, asynchronous.
- Cached outputs avoid repeated work.
- GCS storage cost is predictable.

## 10) Risks & Mitigations
- **Licensing uncertainty:** use CC0 or enterprise license.
- **Audio distraction:** default low volume + ducking.
- **Latency:** intro optional, fallback to narration.

## 11) Acceptance Criteria (MVP)
- Playback starts immediately (no regression).
- Mixed chapters available asynchronously.
- User can toggle soundscape layers.
- Intro template works for all chapters.

## 12) Milestones
1. Curated library + catalog schema
2. Directive generation
3. Intro builder
4. FFmpeg mixing orchestration
5. UI toggles + fallback logic

## 13) Next Decisions Needed
- Licensing path (Epidemic vs CC0/CC‑BY library).
- Size of initial library (recommended: 50–150 assets).
- Default toggles for premium tiers.
