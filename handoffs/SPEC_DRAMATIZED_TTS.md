# Špecifikácia: Dramatizované čítanie e-kníh (Multi-Voice TTS)

## 1. Prehľad funkcionality

**Cieľ**: Transformovať bežné e-knihy na dramatické audio s viacerými hlasmi, kde každá postava hovorí vlastným jedinečným hlasom.

**Hlavné požiadavky**:
- Rozprávač (narrator) = hlas vybraný užívateľom v UI
- Každá postava = automaticky priradený unikátny Gemini TTS hlas
- Voice tagy `[VOICE=SPEAKER_NAME]` slúžia len na markup - **NIKDY sa nesmú čítať nahlas**
- Podpora českého aj anglického textu
- Postupná implementácia: PoC (manuálny) → Produkcia (automatizovaný LLM)

## 2. Technická architektúra

### 2.1 Stack
- **Backend**: Node.js + Express + TypeScript
- **TTS Engine**: Google Cloud Vertex AI - Gemini 2.5 Flash
- **LLM Pre-Processing**: Claude (PoC) → Gemini 2.5 Flash (produkcia)
- **Audio Format**: WAV, 24kHz, LINEAR16 PCM, mono
- **Voice Database**: 30 predefinovaných Gemini hlasov s metadatami

### 2.2 Existujúce komponenty (znovupoužiteľné)
```
apps/backend/src/
  ├── geminiVoices.ts          # ✅ Databáza 30 hlasov + selektory
  ├── audioUtils.ts            # ✅ WAV concatenation utilities
  └── bookChunker.ts           # Existujúci chunker (pre plain text)
```

### 2.3 Nové komponenty (treba vytvoriť)
```
apps/backend/src/
  ├── dramatizedProcessor.ts   # Main orchestrator pre dramatizáciu
  ├── llmDialogueParser.ts     # LLM-based dialogue detection
  ├── voiceAssigner.ts         # Character → Voice mapping logic
  └── dramatizedChunker.ts     # Chunking s voice tags
```

## 3. Implementačné fázy

### Fáza 1: PoC (Manual LLM Processing)
**Účel**: Overiť workflow bez integrácie Gemini API pre LLM úlohy

**Proces**:
1. Užívateľ uploadne plain text súbor (napr. `sample_text.txt`)
2. Backend uloží súbor do `assets/`
3. **Manuálny krok**: Použiť Claude/ChatGPT na:
   - Analýzu postáv (meno, pohlavie, vlastnosti)
   - Detekciu dialógov a označenie speaker-ov
   - Pridanie `[VOICE=SPEAKER]` tagov
4. Výstup uložiť do `assets/dramatized_output/sample_text_tagged.txt`
5. Backend spracuje tagged text:
   - Načíta tagged súbor
   - Priradí hlasy postavám (`voiceAssigner.ts`)
   - Vygeneruje `voice_map_poc.json`
   - Chunking s voice tagmi
   - Multi-voice TTS synthesis

**Výstupy**:
- `dramatized_output/sample_text_tagged.txt` - Text s voice tagmi
- `dramatized_output/voice_map_poc.json` - Character → Gemini Voice mapping
- `dramatized_output/chunks/chunk_NNN.txt` - Chunked text s tagmi
- `dramatized_output/chunks_metadata.json` - Timing info

### Fáza 2: Produkcia (Automated LLM)
**Účel**: End-to-end automatizácia cez Gemini 2.5 Flash

**Proces**:
1. Užívateľ uploadne plain text súbor
2. Backend automaticky:
   - Pošle text do Gemini 2.5 Flash na character analysis
   - Pošle text do Gemini 2.5 Flash na dialogue tagging
   - Spojí výsledky a priradí hlasy
   - Vygeneruje chunks s voice tagmi
   - Multi-voice TTS synthesis
3. Frontend zobrazí progress bar

**Nové komponenty**:
- `llmDialogueParser.ts` - Gemini API integration
- Prompty pre character analysis + dialogue detection

## 4. LLM Prompty (Pre obe fázy)

### 4.1 Character Analysis Prompt
```
Analyzuj nasledujúci text a identifikuj všetky postavy, ktoré v ňom hovoria.

Pre každú postavu vrát JSON v tomto formáte:
{
  "characters": [
    {
      "name": "RAGOWSKI",
      "gender": "male",
      "traits": ["serious", "authoritative", "deep-voiced"],
      "dialogueExamples": ["Example quote 1", "Example quote 2"]
    }
  ]
}

Pravidlá:
- Mená postáv píš VEĽKÝMI PÍSMENAMI
- Všetko ostatné čo nie je dialóg je NARRATOR
- Gender: "male", "female", alebo "neutral"
- Traits: 1-3 výstižné vlastnosti (napr. young, energetic, gruff, melodious)

Text na analýzu:
---
{TEXT_CONTENT}
---
```

### 4.2 Dialogue Tagging Prompt
```
Označ všetky dialógy v texte pomocou [VOICE=SPEAKER] tagov.

Pravidlá:
1. Všetok text mimo dialógov = [VOICE=NARRATOR]
2. Dialógy postáv = [VOICE=CHARACTER_NAME] (meno VEĽKÝMI PÍSMENAMI)
3. Každý voice segment musí byť na samostatnom riadku
4. Format:
   [VOICE=SPEAKER]
   Text, ktorý hovorí táto postava.
   [/VOICE]

5. Nevkladaj voice tagy do seba (no nesting)
6. Zachovaj originálny text presne (len pridaj tagy)

Zoznam postáv:
{CHARACTER_LIST}

Text na označenie:
---
{TEXT_CONTENT}
---

Vráť označený text v plaintext formáte (nie JSON).
```

## 5. Voice Assignment Pravidlá

### 5.1 Algoritmus (`voiceAssigner.ts`)
```typescript
function assignVoices(characters: Character[]): VoiceMap {
  const voiceMap: VoiceMap = {
    NARRATOR: "USER_SELECTED" // Placeholder, bude nahradený v runtime
  };
  
  const usedVoices = new Set<string>();
  
  for (const char of characters) {
    const voice = selectVoiceForCharacter(
      char.name,
      char.gender,
      char.traits,
      Array.from(usedVoices)
    );
    
    voiceMap[char.name] = voice.name;
    usedVoices.add(voice.name);
  }
  
  return voiceMap;
}
```

### 5.2 Voice Selection Logic
- Priorita: Gender match > Pitch match > Characteristic match
- Mužské postavy: Preferuj low/medium pitch
- Ženské postavy: Preferuj medium/high pitch
- "Serious" trait → low pitch voices (Schedar, Algieba)
- "Energetic" trait → higher pitch voices (Vindemiatrix, Alioth)
- Každá postava musí mať **unikátny** hlas

## 6. Multi-Voice TTS Synthesis

### 6.1 Existujúci endpoint (upraviť)
**Endpoint**: `POST /api/tts/chunk`

**Súčasná logika**:
```typescript
// Single-voice synthesis
const audioBuffer = await synthesizeSpeech(text, selectedVoice);
```

**Nová logika** (už implementovaná v `index.ts`):
```typescript
// 1. Extract voice segments
const segments = extractVoiceSegments(chunkText);

if (segments.length > 0) {
  // 2. Load voice map
  const voiceMap = loadVoiceMap();
  
  // 3. Synthesize each segment
  const audioBuffers: Buffer[] = [];
  for (const seg of segments) {
    const voiceName = voiceMap[seg.speaker] || selectedVoice;
    const cleanText = seg.text; // Tags už odstránené extractom
    const audio = await synthesizeSpeech(cleanText, voiceName);
    audioBuffers.push(audio);
  }
  
  // 4. Concatenate
  const finalAudio = concatenateWavBuffers(audioBuffers);
  cache[cacheKey] = finalAudio;
} else {
  // Fallback: single voice
  const cleanText = removeVoiceTags(chunkText);
  const audioBuffer = await synthesizeSpeech(cleanText, selectedVoice);
}
```

### 6.2 Voice Segment Extraction
**Funkcia**: `extractVoiceSegments(text: string)`

**Input**:
```
[VOICE=NARRATOR]
Ragowski vstal od stola.
[/VOICE]
[VOICE=RAGOWSKI]
"Kde je Lili?" spýtal sa.
[/VOICE]
```

**Output**:
```typescript
[
  { speaker: "NARRATOR", text: "Ragowski vstal od stola." },
  { speaker: "RAGOWSKI", text: '"Kde je Lili?" spýtal sa.' }
]
```

### 6.3 Tag Removal (Failsafe)
**Funkcia**: `removeVoiceTags(text: string)`

**Účel**: Ak extraction zlyhá, odstráň všetky tagy pred TTS
```typescript
text.replace(/\[VOICE=.*?\]|\[\/VOICE\]/g, "").trim()
```

## 7. File Formats & Štruktúra

### 7.1 Tagged Text Format
**Súbor**: `dramatized_output/sample_text_tagged.txt`

**Príklad**:
```
[VOICE=NARRATOR]
Bola tmavá noc. Ragowski kráčal prázdnou ulicou, keď zaznel zvuk krokov.
[/VOICE]

[VOICE=RAGOWSKI]
"Kto tam?" zavolal ostro.
[/VOICE]

[VOICE=LILI]
"To som ja, Lili," odpovedala jemne.
[/VOICE]

[VOICE=NARRATOR]
Ragowski si vydýchol.
[/VOICE]
```

### 7.2 Voice Map Format
**Súbor**: `dramatized_output/voice_map_poc.json`

```json
{
  "NARRATOR": "USER_SELECTED",
  "RAGOWSKI": "Schedar",
  "LILI": "Vindemiatrix",
  "GUARD": "Algieba"
}
```

**Poznámky**:
- `USER_SELECTED` = placeholder, runtime substitution z UI
- Voice names = `geminiVoices.ts` keys

### 7.3 Chunk Format
**Súbor**: `dramatized_output/chunks/chunk_001.txt`

```
[VOICE=NARRATOR]
Bola tmavá noc. Ragowski kráčal prázdnou ulicou.
[/VOICE]
[VOICE=RAGOWSKI]
"Kto tam?" zavolal ostro.
[/VOICE]
```

**Metadata**: `dramatized_output/chunks_metadata.json`
```json
{
  "chunks": [
    {
      "id": "001",
      "characterCount": 145,
      "voiceSegments": 2,
      "estimatedDuration": 9.67,
      "speakers": ["NARRATOR", "RAGOWSKI"]
    }
  ]
}
```

## 8. Testing Postup

### 8.1 PoC Testing (Fáza 1)
1. **Príprava testovacích dát**:
   ```powershell
   # Skopíruj sample_text.txt
   cd apps/backend/assets
   cp sample_text.txt sample_input_poc.txt
   ```

2. **Manuálny LLM tagging** (Claude/ChatGPT):
   - Použiť Character Analysis Prompt na `sample_input_poc.txt`
   - Použiť Dialogue Tagging Prompt
   - Uložiť výsledok do `dramatized_output/sample_text_tagged.txt`

3. **Voice assignment test**:
   ```powershell
   # Vytvoriť test script
   node dist/testVoiceAssignment.js
   # Overí: Každá postava má unikátny hlas
   ```

4. **Multi-voice TTS test**:
   ```powershell
   # Spustiť backend
   npm run dev
   
   # V druhom terminále
   curl -X POST http://localhost:3001/api/dramatize/process
   # Skontroluje chunks + voice_map
   
   # Frontend test - play chunk
   # Poslúchať: Menia sa hlasy pri rôznych postavách?
   ```

5. **Validačné kritériá**:
   - ✅ Voice tagy sa **nečítajú nahlas**
   - ✅ Ragowski má iný hlas ako Lili
   - ✅ Narrator má hlas vybraný v UI
   - ✅ Prechody medzi hlasmi sú plynulé (bez clicks)

### 8.2 Production Testing (Fáza 2)
1. Upload plain text cez UI
2. Kliknúť "Dramatize Book"
3. Progress bar zobrazuje: Character analysis → Dialogue detection → Voice assignment → Chunking
4. Automaticky prepne do dramatized mode
5. Play test - overiť multi-voice playback

## 9. Implementation Checklist

### Fáza 1: PoC (Manual LLM)
- [ ] **Krok 1**: Vytvoriť `apps/backend/src/voiceAssigner.ts`
  - `assignVoices(characters)` funkcia
  - `saveVoiceMap(map, outputPath)` funkcia
  
- [ ] **Krok 2**: Vytvoriť `apps/backend/src/dramatizedProcessor.ts`
  - `processDramatizedText(taggedTextPath)` - main orchestrator
  - Načíta tagged text
  - Zavolá `voiceAssigner`
  - Uloží voice_map.json
  
- [ ] **Krok 3**: Vytvoriť `apps/backend/src/dramatizedChunker.ts`
  - `chunkTaggedText(taggedText, voiceMap)` - chunking s voice tagmi
  - Preserve voice segments within chunks
  - Generate chunks_metadata.json
  
- [ ] **Krok 4**: Vytvoriť endpoint `POST /api/dramatize/process`
  ```typescript
  // Input: { taggedTextPath: "assets/dramatized_output/sample_text_tagged.txt" }
  // Output: { voiceMapPath, chunksDir, metadata }
  ```
  
- [ ] **Krok 5**: Upraviť `POST /api/tts/chunk` (už hotové v index.ts)
  - Ak chunk obsahuje voice tagy → multi-voice synthesis
  - Inak → single-voice fallback
  
- [ ] **Krok 6**: Manuálne vytvorenie tagged súboru
  - Použiť Claude na sample_text.txt
  - Character Analysis Prompt
  - Dialogue Tagging Prompt
  - Uložiť `dramatized_output/sample_text_tagged.txt`
  
- [ ] **Krok 7**: Testing
  - Zavolať `/api/dramatize/process`
  - Overiť voice_map.json
  - Overiť chunks s tagmi
  - Play test v UI (poslúchať multi-voice)

### Fáza 2: Production (Automated LLM)
- [ ] **Krok 1**: Vytvoriť `apps/backend/src/llmDialogueParser.ts`
  - `analyzeCharacters(text)` - Gemini API call
  - `tagDialogues(text, characters)` - Gemini API call
  
- [ ] **Krok 2**: Upraviť endpoint `POST /api/dramatize/process`
  - Accept plain text input (not pre-tagged)
  - Call `analyzeCharacters()`
  - Call `tagDialogues()`
  - Rest of pipeline same as PoC
  
- [ ] **Krok 3**: Frontend integration
  - "Dramatize Book" button v UI
  - Progress bar (character analysis 25% → tagging 50% → chunking 75% → done 100%)
  - Auto-switch to dramatized mode
  
- [ ] **Krok 4**: Error handling
  - LLM API failures → fallback to single-voice
  - Invalid JSON responses → retry with stricter prompt
  - Rate limiting → queue system

## 10. Known Issues & Limitations

### Súčasný stav (pred PoC)
- ❌ `sample_text.txt` nemá voice tagy
- ❌ Multi-voice code path sa nikdy nespustil (lebo chýbajú tagy)
- ❌ Regex parser approach bol abandoned (príliš krehký)
- ✅ Multi-voice TTS endpoint logic je hotový (ale netestovaný)
- ✅ Voice database + audio utils sú ready

### Riziká
1. **LLM parsing accuracy**: Gemini môže zle identifikovať postavy v komplexných textoch
   - Mitigácia: Few-shot examples v prompte
   
2. **Voice tag stripping**: Ak failne extraction, fallback musí odstrániť všetky tagy
   - Mitigácia: `removeVoiceTags()` je already implemented
   
3. **Audio concatenation artifacts**: Clicks medzi segmentmi
   - Mitigácia: `addSilence()` v audioUtils.ts (50ms padding)

4. **Performance**: Multi-voice synthesis je ~2-3x pomalší než single-voice
   - Mitigácia: Background job queue (Fáza 2)

## 11. Success Metrics

### PoC Success Criteria
- [x] Voice database s 30 hlasmi hotový
- [ ] Manuálne tagged súbor vytvorený (Claude)
- [ ] Voice map generovaný automaticky
- [ ] Multi-voice TTS endpoint funguje
- [ ] **User test**: Poslúchať 3-5 chunks, všetky postavy majú rôzne hlasy
- [ ] Voice tagy sa **nikdy** nečítajú nahlas

### Production Success Criteria  
- [ ] Upload plain text → automatická dramatizácia (0 manuálnych krokov)
- [ ] Character detection >90% accuracy
- [ ] Dialogue tagging >95% accuracy
- [ ] Processing time <2 min pre 50 kB text
- [ ] Frontend progress bar funguje
- [ ] Error handling pre LLM failures

## 12. File Paths Summary

```
apps/backend/
  assets/
    sample_text.txt                    # Original plain text
    dramatized_output/
      sample_text_tagged.txt           # LLM-tagged text (PoC)
      voice_map_poc.json               # Character → Voice mapping
      chunks/
        chunk_001.txt                  # Chunked with voice tags
        chunk_002.txt
        ...
      chunks_metadata.json             # Timing + validation info
  
  src/
    geminiVoices.ts                    # ✅ Existujúce
    audioUtils.ts                      # ✅ Existujúce
    
    voiceAssigner.ts                   # TODO: Character → Voice logic
    dramatizedProcessor.ts             # TODO: Main orchestrator
    dramatizedChunker.ts               # TODO: Chunking s tags
    llmDialogueParser.ts               # TODO (Fáza 2): Gemini integration
    
    index.ts                           # Upraviť: Multi-voice endpoints
```

## 13. Next Steps (Immediate Action)

1. **Vytvoriť novú vetvu**:
   ```powershell
   git checkout -b feature/dramatized-tts-poc
   ```

2. **Implementovať Fáza 1 - Krok 1-3** (voiceAssigner, processor, chunker)

3. **Manuálne vytvorenie tagged súboru** pomocou Claude:
   - Copy `sample_text.txt` obsah
   - Použiť Character Analysis Prompt
   - Použiť Dialogue Tagging Prompt
   - Uložiť do `dramatized_output/sample_text_tagged.txt`

4. **Testing**: Spustiť `/api/dramatize/process` a overiť výstupy

5. **User acceptance test**: Play chunks v UI, poslúchať multi-voice

---

## Appendix A: Gemini Voice Database (Reference)

**Plný zoznam dostupných hlasov** (z `geminiVoices.ts`):

```typescript
// Male voices
Algieba   - male, low, deep
Altair    - male, medium, clear
Deneb     - male, low, resonant
Polaris   - male, medium, steady
Rigel     - male, low, powerful
Schedar   - male, low, serious
Sirius    - male, medium, bright
Spica     - male, medium, crisp
Vega      - male, medium, smooth
Canopus   - male, low, warm
Capella   - male, medium, rich
Regulus   - male, medium, strong
Aldebaran - male, low, gruff
Antares   - male, low, commanding
Fomalhaut - male, medium, authoritative

// Female voices
Alioth       - female, medium, energetic
Vindemiatrix - female, medium, crisp
Elnath       - female, high, gentle
Mimosa       - female, medium, melodious
Adhara       - female, medium, bright
Hadar        - female, medium, soft
Acrux        - female, medium, clear
Bellatrix    - female, high, youthful
Shaula       - female, medium, warm
Alnilam      - female, medium, smooth
Castor       - female, medium, calm
Pollux       - female, medium, friendly
Procyon      - female, high, cheerful
Achernar     - female, medium, elegant
Betelgeuse   - female, low, mature
```

**Voice Selection Tips**:
- **Serious characters**: Schedar, Algieba, Antares
- **Young characters**: Bellatrix, Procyon, Altair
- **Authority figures**: Fomalhaut, Antares, Achernar
- **Gentle characters**: Elnath, Hadar, Mimosa
- **Energetic characters**: Alioth, Sirius, Adhara

---

**Koniec špecifikácie** 🎭🎙️
