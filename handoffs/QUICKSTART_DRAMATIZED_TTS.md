# Quick Start: Dramatized TTS Implementation

**Pre nový Copilot chat** - Attachni tento súbor + `SPEC_DRAMATIZED_TTS.md`

---

## Context

**Vetva:** `feature/dramatized-tts-poc` (už vytvorená a pushnutá)

**Už hotové komponenty:**
- ✅ `apps/backend/src/geminiVoices.ts` - Databáza 30 Gemini hlasov + selektory
- ✅ `apps/backend/src/audioUtils.ts` - WAV concatenation utilities
- ✅ `handoffs/SPEC_DRAMATIZED_TTS.md` - Kompletná špecifikácia

**Začíname:** Fáza 1 - PoC (Manual LLM Processing)

---

## Recommended First Prompt

```
@SPEC_DRAMATIZED_TTS.md @apps/backend/assets/sample_text.txt

Použi Character Analysis Prompt a Dialogue Tagging Prompt zo SPEC 
(sekcia 4.1 a 4.2) na spracovanie sample_text.txt.

Vytvor:
1. Character analysis (JSON formát)
2. Tagged text s [VOICE=...] tagmi
3. Ulož ako apps/backend/assets/dramatized_output/sample_text_tagged.txt
```

**Vysvetlenie:** Toto je logický prvý krok podľa SPEC - Fáza 1, krok 3-4 (manuálny tagging pomocou LLM).

---

## Implementačná postupnosť (Po taggingu)

### Krok 1: Voice Assigner
```
@SPEC_DRAMATIZED_TTS.md 

Vytvor apps/backend/src/voiceAssigner.ts podľa sekcie 5.
Implementuj assignVoices() a saveVoiceMap().
```

### Krok 2: Dramatized Processor
```
@SPEC_DRAMATIZED_TTS.md 

Vytvor apps/backend/src/dramatizedProcessor.ts - main orchestrator 
pre spracovanie tagged textu (load → assign voices → save voice map).
```

### Krok 3: Dramatized Chunker
```
@SPEC_DRAMATIZED_TTS.md 

Vytvor apps/backend/src/dramatizedChunker.ts pre chunking s voice tagmi.
Preserve voice segments within chunks.
```

### Krok 4: API Endpoint
```
@SPEC_DRAMATIZED_TTS.md @apps/backend/src/index.ts

Vytvor endpoint POST /api/dramatize/process podľa sekcie 9 
(Implementation Checklist, Krok 4).
```

### Krok 5: Multi-Voice TTS
```
@SPEC_DRAMATIZED_TTS.md @apps/backend/src/index.ts

Uprav POST /api/tts/chunk pre multi-voice synthesis podľa sekcie 6.
Ak chunk obsahuje voice tagy → multi-voice, inak → single-voice fallback.
```

### Krok 6: Testing
```
@SPEC_DRAMATIZED_TTS.md 

Vytvor test script pre:
1. Voice assignment validation
2. Multi-voice TTS endpoint test
3. Audio playback verification

Podľa sekcie 8.1 (PoC Testing).
```

---

## Validation Checklist

Po implementácii otestuj:

- [ ] `sample_text_tagged.txt` existuje s korektými `[VOICE=...]` tagmi
- [ ] `voice_map_poc.json` obsahuje NARRATOR + všetky postavy
- [ ] Chunks v `dramatized_output/chunks/` majú preserved voice segments
- [ ] `/api/dramatize/process` endpoint funguje
- [ ] `/api/tts/chunk` detekuje voice tagy a volá multi-voice synthesis
- [ ] **User test**: Play chunk v UI → **hlasy sa menia podľa postáv**
- [ ] **Critical**: Voice tagy sa **NIKDY nečítajú nahlas**

---

## Dôležité poznámky

1. **Plain text input**: `sample_text.txt` je bez tagov - začni taggingom!
2. **Voice tagy formát**: `[VOICE=SPEAKER]\ntext\n[/VOICE]` (viď SPEC sekcia 7.1)
3. **Narrator voice**: "USER_SELECTED" je placeholder, runtime nahradí UI výberom
4. **No nesting**: Voice tagy sa nesmú vnárať do seba
5. **Tag removal**: Pred TTS vždy strip tagy - `removeVoiceTags()` existuje v index.ts

---

## File Locations Reference

```
apps/backend/
  src/
    geminiVoices.ts           # ✅ Existuje
    audioUtils.ts             # ✅ Existuje
    voiceAssigner.ts          # TODO: Krok 1
    dramatizedProcessor.ts    # TODO: Krok 2
    dramatizedChunker.ts      # TODO: Krok 3
    index.ts                  # TODO: Upraviť kroky 4-5
  
  assets/
    sample_text.txt           # ✅ Plain text input
    dramatized_output/
      sample_text_tagged.txt  # TODO: LLM tagging (prvý krok!)
      voice_map_poc.json      # TODO: voiceAssigner output
      chunks/
        chunk_NNN.txt         # TODO: chunker output
      chunks_metadata.json    # TODO: chunker metadata

handoffs/
  SPEC_DRAMATIZED_TTS.md      # ✅ Master specification
  QUICKSTART_DRAMATIZED_TTS.md # 👈 Tento súbor
```

---

## Quick Commands

### Check current branch
```powershell
git branch --show-current
# Should show: feature/dramatized-tts-poc
```

### Run backend
```powershell
cd apps/backend
npm run dev
```

### Test endpoint (after implementation)
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/dramatize/process" `
  -Method POST -ContentType "application/json" `
  -Body '{"taggedTextPath": "assets/dramatized_output/sample_text_tagged.txt"}' `
  | ConvertTo-Json -Depth 5
```

---

**Start here:** Tagging prompt vyššie → potom postupne kroky 1-6 → testing → hotovo! 🎭
