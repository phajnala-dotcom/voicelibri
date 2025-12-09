# Manual Testing Guide - Dramatized TTS PoC

## 🎯 What We Built

**Phase 1 - PoC (Manual LLM Processing)** is **COMPLETE**!

### ✅ Completed Components:
1. **voiceAssigner.ts** - Character → Voice mapping
2. **dramatizedProcessor.ts** - Main orchestrator  
3. **dramatizedChunkerSimple.ts** - Chunking with voice tags
4. **API Endpoints** - `/api/dramatize/process` and enhanced `/api/tts/chunk`
5. **Sample Data** - Tagged text with RAGOWSKI (Schedar) and LILI (Sulafat)

---

## 🧪 How to Test

### Step 1: Start the Backend

```powershell
cd apps\backend
npm run dev
```

Expected output:
```
🚀 Server running on http://localhost:3001
```

### Step 2: Prepare Dramatized Book

The chunks are already created in:
```
apps\backend\assets\dramatized_output\chunks\
  - chunk_001.txt (NARRATOR)
  - chunk_002.txt (RAGOWSKI) 
  - chunk_003.txt (LILI)
  - chunk_004.txt (NARRATOR)
  - chunk_005.txt (RAGOWSKI)
  - chunk_006.txt (NARRATOR)
```

**Option A: Load chunks directly**
- You may need to manually select one of the chunk files as the "book"
- OR modify the backend to read from the chunks directory

**Option B: Use the sample_text_tagged.txt as the book**
- Copy `sample_text_tagged.txt` to the assets root
- Load it as a book
- The multi-voice endpoint will automatically detect the tags

### Step 3: Test Multi-Voice Playback

1. **Start the frontend** (if not already running)
2. **Load the book** (either chunks or tagged text)
3. **Play different chunks:**
   - Chunk 1 (NARRATOR) - should use your UI-selected voice
   - Chunk 2 (RAGOWSKI) - **should use Schedar** (male, low, serious)
   - Chunk 3 (LILI) - **should use Sulafat** (female, low, confident)

### Step 4: Validation Checklist

Listen carefully and check:

- [ ] **Voice tags are NOT read aloud** (CRITICAL!)
  - Should NOT hear: "Voice equals Ragowski"
  - Should only hear the actual text content

- [ ] **RAGOWSKI has a different voice than LILI**
  - Ragowski = Schedar (deeper, serious male voice)
  - Lili = Sulafat (confident female voice)

- [ ] **NARRATOR uses UI-selected voice**
  - Should match whatever voice you select in the UI

- [ ] **Voice transitions are smooth**
  - No clicks or pops between segments
  - No awkward pauses

---

## 🔧 Troubleshooting

### Issue: Voice tags are being read aloud

**Check:**
1. Is the endpoint detecting voice segments?
   - Look for console output: "Multi-voice chunk detected"
2. Is the `removeVoiceTags()` function being called in fallback mode?

**Fix:**
- The endpoint should automatically strip tags via `extractVoiceSegments()`
- If not working, check if chunks have proper `[VOICE=...]` format

### Issue: All chunks use the same voice

**Check:**
1. Does `voice_map_poc.json` exist?
   - Path: `apps/backend/assets/dramatized_output/voice_map_poc.json`
2. Is the endpoint loading the voice map?
   - Look for console: "Multi-voice chunk detected"

**Fix:**
- Run: `node dist/testVoiceAssignment.js` to regenerate voice map
- Verify voice_map_poc.json has different voices for each character

### Issue: Audio doesn't play

**Check:**
1. Is backend running?
2. Are there errors in the console?
3. Is the chunk index valid?

**Fix:**
- Check backend logs for synthesis errors
- Verify Gemini API credentials are set

---

## 📊 Expected Voice Assignments

Based on character analysis:

| Character | Voice     | Gender | Pitch | Characteristic |
|-----------|-----------|--------|-------|----------------|
| NARRATOR  | (UI)      | -      | -     | User-selected  |
| RAGOWSKI  | Schedar   | Male   | Low   | Serious        |
| LILI      | Sulafat   | Female | Low   | Confident      |

---

## 🎭 What to Listen For

### Chunk 2 - RAGOWSKI (Schedar voice):
> "Jen se na sebe podívejte," zvolal...

**Expected:** Deep, serious male voice

### Chunk 3 - LILI (Sulafat voice):
> "Ani ty nevypadáš bůhvíjak, Joe," poznamenala...

**Expected:** Confident female voice (different from Ragowski!)

### Success Criteria:
✅ Two clearly different voices  
✅ No tags read aloud  
✅ Smooth audio playback

---

## 📝 Next Steps After Testing

### If test PASSES ✅:
1. Document the results
2. Consider moving to **Phase 2** (Automated LLM with Gemini)
3. Expand to more complex texts

### If test FAILS ❌:
1. Note which validation failed
2. Check the troubleshooting section
3. Review backend console logs
4. Test individual components with test scripts

---

## 🛠️ Quick Commands Reference

```powershell
# Start backend
cd apps\backend
npm run dev

# Start frontend (in another terminal)
cd apps\frontend
npm run dev

# Test voice assignment
cd apps\backend
node dist/testVoiceAssignment.js

# Test processor
node dist/testDramatizedProcessor.js

# Test chunker
node dist/testDramatizedChunkerSimple.js

# View chunks
Get-ChildItem apps\backend\assets\dramatized_output\chunks\

# View voice map
Get-Content apps\backend\assets\dramatized_output\voice_map_poc.json
```

---

## 📁 Key Files Created

```
apps/backend/src/
  ├── voiceAssigner.ts              ✅ NEW - Voice mapping logic
  ├── dramatizedProcessor.ts         ✅ NEW - Main orchestrator
  ├── dramatizedChunkerSimple.ts     ✅ NEW - Chunking with tags
  └── index.ts                       ✅ MODIFIED - Multi-voice endpoint

apps/backend/assets/dramatized_output/
  ├── character_analysis.json        ✅ Character profiles
  ├── sample_text_tagged.txt         ✅ Text with voice tags
  ├── voice_map_poc.json             ✅ Character → Voice mapping
  ├── chunks_metadata.json           ✅ Chunk information
  └── chunks/
      ├── chunk_001.txt              ✅ Individual chunks
      ├── chunk_002.txt
      └── ...
```

---

**Ready to test!** 🚀

Start the server and listen for those voice changes! 🎧
