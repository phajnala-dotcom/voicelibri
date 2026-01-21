# Showcase Explorer Plan (Curated Samples + One‑Click Generation)

## Goal
Create a “Showcase” section in Explore with curated public‑domain ebooks that play short pre‑generated samples and allow one‑click full generation using a preset config.

## Scope
- PWA only (apps/pwa-v2)
- Backend config support (apps/backend)
- Reuse existing generation pipeline; no architecture changes

## Data Model
Create a JSON registry of curated showcase items.

**File:** `apps/backend/assets/showcase_catalog.json`
```json
[
  {
    "id": "stopar_sample",
    "title": "Stopárov průvodce galaxii",
    "author": "Douglas Adams",
    "sourceFile": "Adams_Douglas_Noel_Stoparuv_pruvodce_3_Zivot_ves.epub",
    "sampleAudioPath": "showcase/stopar_sample.wav",
    "sampleDurationSec": 45,
    "description": "Witty sci‑fi comedy with multi‑voice dramatization",
    "preset": {
      "narratorVoice": "Aoede",
      "voiceTone": "ironic, witty",
      "characterOverrides": {
        "FORDPREFECT": "Orus",
        "ARTHUR": "Zubenelgenubi"
      }
    }
  }
]
```

## Backend Changes
1. **Static sample hosting**
   - Store sample WAV files in `apps/backend/assets/showcase/`.
   - Serve via Express static path or add endpoint:
     - `GET /api/showcase` → returns JSON catalog (with URLs)
     - `GET /api/showcase/:id/sample` → stream WAV

2. **Preset apply endpoint**
   - `POST /api/showcase/:id/generate`
   - Loads preset config and calls existing `selectBook` path with overrides.

3. **Validation**
   - Verify `sourceFile` exists in assets.
   - Validate preset voices exist in `geminiVoices`.

## Frontend (PWA) Changes
1. **Explore screen**
   - Add “Showcase” carousel section at top.
   - Cards show title/author, play sample, and “Generate full book”.

2. **Sample playback**
   - Use existing audio player (simple HTML5 audio) with cached blob.
   - No auto‑download; stream sample.

3. **Generation CTA**
   - Call `POST /api/showcase/:id/generate`.
   - On success, update library + start progressive playback (existing flow).

## Sample Creation Workflow
- Curate 30–60s best dialogue passage.
- Run dramatization with hand‑tuned directives.
- Export WAV and store in `assets/showcase/`.
- Add entry in `showcase_catalog.json`.

## Metrics
- Sample play rate
- Sample→Generate conversion rate
- Average time to first playback

## Risks / Notes
- Ensure samples are public‑domain or licensed.
- Avoid storing full audiobooks; only short samples.
- Keep catalog small (8–12 items) for performance.

## Implementation Steps (Order)
1. Add backend catalog + static sample hosting.
2. Add `/api/showcase` endpoint.
3. Add `/api/showcase/:id/generate` preset apply endpoint.
4. Build PWA Showcase UI and sample playback.
5. Add analytics hooks.
