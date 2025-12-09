# HANDOFF: MVP2 - Seamless Playback & Full LLM Dramatization

**Branch:** `feature/dramatized-tts-mvp2`  
**Date:** 2025-12-10  
**Status:** 🟡 Performance optimizations implemented, but playback still has gaps

---

## 🎯 OBJECTIVE

Make multi-voice dramatized TTS playback **100% seamless** (zero gaps between chunks) and implement **automated LLM-based dramatization** (currently manual).

---

## ⚡ QUICK START

```bash
# Backend (port 3001)
cd apps/backend
npm run dev  # Auto-restarts on file changes

# Frontend (port 5173)
cd apps/frontend
npm run dev

# Test sample
http://localhost:5173 → Select "sample_text_tagged.txt"
```

**Clear cache for testing:** Browser: `Ctrl+Shift+R`

---

## 🏗️ ARCHITECTURE

### Multi-Voice TTS Flow
```
Text → [VOICE=SPEAKER]...[/VOICE] tags → Voice assignment → Parallel synthesis → Concatenation → WAV playback
```

### Key Files
- **Backend:** `apps/backend/src/index.ts` (multi-voice synthesis, POST /api/tts/chunk)
- **Frontend:** `apps/frontend/src/components/BookPlayer.tsx` (preloading, playback)
- **Voice DB:** `apps/backend/src/geminiVoices.ts` (30 Gemini voices)
- **Sample:** `apps/backend/assets/dramatized_output/sample_text_tagged.txt` (6 chunks, 3 speakers)

### Current Performance
- **Parallel synthesis:** All voice segments synthesize concurrently (was sequential)
- **Immediate preload:** Next chunk starts loading when current chunk starts playing
- **Fast path:** Cached chunks play instantly without loading states
- **Problem:** Still 1-3 second gaps between chunks 4→5, others

---

## 🔧 CURRENT OPTIMIZATIONS

### Backend (`index.ts`)
```typescript
// Parallel synthesis (Option B)
const audioBuffers = await Promise.all(
  voiceSegments.map(async (segment) => {
    const audio = await synthesizeText(segment.text, voiceForSpeaker);
    return addSilence(audio, 1000, 'end'); // 1s pause between speakers
  })
);
// Generation time: ~3s (was ~6s sequential)
```

### Frontend (`BookPlayer.tsx`)
```typescript
// FAST PATH: Instant playback for cached chunks
if (cachedAudio?.blobUrl) {
  audioRef.current.src = cachedAudio.blobUrl;
  await audioRef.current.play(); // No loading states
  return; // Skip slow path
}

// Immediate preload on chunk start
preloadNextChunk(chunkIndex + 1);

// 10% fallback trigger (if immediate preload fails)
if (currentTime / duration >= 0.1) {
  preloadNextChunk(nextIndex);
}
```

---

## 🚨 REMAINING ISSUES

### Issue #1: Gaps Still Present
**Symptoms:** 1-3s interruption between chunks (worse after short chunks)  
**Hypothesis:**
- Backend generation (3s) > chunk duration (chunk 4 = 3s) → not enough buffer time
- Possible network latency between preload trigger and backend response
- Browser audio element transition delay

**Diagnostic Logs:**
```javascript
// Frontend console
⚡ FAST PATH: Using cached audio, instant playback  // Should appear
🚀 Immediately preloading chunk X                    // Preload triggered

// Backend console  
✓ Parallel synthesis completed in 2847ms (2 segments) // Generation time
✓ Audio generated and cached: 518400 bytes (TOTAL TIME: 2847ms = 2.8s)
```

### Issue #2: Manual Dramatization
Currently requires **manual LLM prompting** (see `handoffs/QUICKSTART_DRAMATIZED_TTS.md`):
1. Extract characters with LLM
2. Manually tag text with `[VOICE=X]...[/VOICE]`
3. Run voice assignment

**Goal:** Automate with `llmCharacterAnalyzer.ts` (exists but unused)

---

## 💡 NEXT STEPS

### Priority 1: Fix Seamless Playback
**Options to try:**
1. **Prefetch strategy:** Load next 2-3 chunks ahead (not just next)
2. **Audio element preloading:** Use multiple audio elements, crossfade
3. **Reduce generation time:** Compress text, optimize chunk sizes
4. **Backend caching:** Pre-generate all chunks on book load
5. **Investigate:** Check actual network timing with DevTools Network tab

### Priority 2: Automate Dramatization

**Current:** Manual workflow (see `handoffs/QUICKSTART_DRAMATIZED_TTS.md`)
- Copy text → Claude → Character analysis → Manual tagging → Save

**Goal:** Automated API endpoint

**Implementation:**
1. Use `llmCharacterAnalyzer.ts` to extract characters (already exists!)
2. Create `apps/backend/src/llmDialogueTagger.ts` - Auto-tag with Gemini API
3. Create API endpoint: `POST /api/dramatize` (text → tagged text)
4. Frontend: Add "Dramatize" button before TTS

**LLM Prompts:** Already documented in `handoffs/SPEC_DRAMATIZED_TTS.md` sections 4.1-4.2

---

## 📊 TEST DATA

**Sample text:** Czech, 6 chunks, 3 speakers (NARRATOR, RAGOWSKI, LILI)  
**Voices:** Algieba (RAGOWSKI), Sulafat (LILI), USER_SELECTED (NARRATOR)  
**Chunk durations:** 1:~30s, 2:~25s, 3:~20s, 4:~3s ⚠️, 5:~22s, 6:~15s

**Critical test:** Chunk 4→5 transition (short→long, multi-voice)

---

## 🔍 DEBUGGING GUIDE

```bash
# Check what's running
Get-NetTCPConnection -LocalPort 3001,5173 -State Listen

# Kill backend
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess -Force

# Check generation times
# Backend logs show: "TOTAL TIME: XXXms = X.Xs"

# Monitor network
# Browser DevTools → Network → Filter "chunk" → Check timing waterfall
```

---

## 📁 REPOSITORY STATE

**Branch:** `feature/dramatized-tts-mvp2` (just created from main)  
**Previous work:** `feature/dramatized-tts-mvp` (merged to main)  
**Preserved:** `feature/dramatized-tts-poc` (working PoC before optimizations)

**Files to modify:**
- `apps/frontend/src/components/BookPlayer.tsx` (preloading logic)
- `apps/backend/src/index.ts` (caching, chunk generation)
- New: `apps/backend/src/dramatizationAPI.ts` (automation)

---

## ⚙️ TECH STACK

- **Backend:** Node.js, Express, TypeScript, tsx watch (auto-restart)
- **Frontend:** React, Vite
- **TTS:** Google Gemini 2.5 Flash (Vertex AI REST API)
- **Audio:** WAV 24kHz LINEAR16 mono (~48 KB/sec)
- **Rate limits:** None (Dynamic Shared Quota)

---

## 🎓 CONTEXT FOR LLM

**What works:**
✅ Multi-voice synthesis (3 distinct voices)  
✅ Voice tags not read aloud  
✅ Parallel synthesis (50% faster)  
✅ Immediate preload triggers  
✅ Fast path for cached chunks  

**What needs fixing:**
❌ Gaps between chunks (1-3s interruptions)  
❌ Manual dramatization workflow  

**Goal:** Smooth listening experience like Audible/Spotify audiobooks.

---

## 📞 QUICK REFERENCE

```typescript
// Voice segment extraction (backend)
extractVoiceSegments(text) → [{ speaker, text }]

// Parallel synthesis (backend)  
Promise.all(segments.map(s => synthesizeText(s.text, voice)))

// Cache check (frontend)
audioCache.get(chunkIndex) → { blobUrl: 'blob:http://...' }

// Preload (frontend)
preloadNextChunk(nextIndex) // Async fetch + cache

// Audio playback (frontend)
audioRef.current.src = blobUrl; await audioRef.current.play();
```

**Key metrics:**
- Generation time: ~3s per multi-voice chunk
- Chunk duration: 3-30s (avg ~20s)
- Cache size: ~8 MB for 6 chunks (WAV format)

---

**START HERE:** Open browser DevTools Network tab, play sample, measure actual fetch timing for chunks 4→5. Compare with generation logs.
