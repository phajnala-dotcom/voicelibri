# VoiceLibri — Consultation Mirror

Systém pre AI-asistované architektonické konzultácie cez **Gemini Live** (hlasové, po slovensky) priamo z mobilu.

## Čo to robí

1. **Generuje kontextový snapshot** — jeden veľký `.md` súbor (~35 kľúčových zdrojových súborov)
2. **Nahrá na Google Drive** — kde ho Gemini Live automaticky vidí
3. **Umožňuje hlasové konzultácie** — na mobile cez Gemini app (slovensky)
4. **Konvertuje výstupy na GitHub Issues** — štruktúrované návrhy → issues via `gh` CLI

## Rýchly štart

### Prerekvizity

| Nástroj | Účel | Inštalácia |
|---------|------|------------|
| PowerShell 5.1+ | Skripty | Predinštalovaný na Windows |
| Git | Branch/commit info | `winget install Git.Git` |
| rclone | Google Drive sync | `winget install Rclone.Rclone` |
| gh CLI | GitHub Issues | `winget install GitHub.cli` |

### Prvé spustenie

```powershell
# 1. Nakonfiguruj rclone pre Google Drive (iba raz)
rclone config
# → New remote → Name: gdrive → Type: Google Drive → Follow OAuth flow

# 2. Vygeneruj kontextový snapshot
cd mirror
.\Generate-Context.ps1

# 3. Nahraj na Google Drive
.\Sync-Drive.ps1

# Alebo všetko naraz:
.\Sync-Mirror.ps1
```

### Použitie na mobile

1. Otvor **Gemini** app na mobile
2. Začni **Live** session (hlasový režim)
3. Povedz: *"Otvor súbor VOICELIBRI_CONTEXT.md z Drive"*
4. Prečítaj úvodnú inštrukciu z `GEMINI_INSTRUCTION_SK.md`
5. Konzultuj architektúru, navrhy, problémy...
6. Na záver si nechaj vygenerovať štruktúrovaný výstup

### Konverzia na GitHub Issues

```powershell
# Ulož výstup konzultácie podľa šablóny do mirror/discussions/
# Potom:
.\Create-Issues.ps1 -DryRun                    # Náhľad
.\Create-Issues.ps1                              # Vytvor issues
.\Create-Issues.ps1 -InputFile "discussions/2025-01-15_arch.md"  # Konkrétny súbor
```

## Štruktúra

```
mirror/
├── Generate-Context.ps1          # Generátor kontextového snapshotu
├── Sync-Drive.ps1                # Upload na Google Drive (rclone)
├── Sync-Mirror.ps1               # Master orchestrátor (generate + sync)
├── Create-Issues.ps1             # Konzultácia → GitHub Issues
├── GEMINI_INSTRUCTION_SK.md      # Slovenská inštrukcia pre Gemini Live
├── README.md                     # Tento súbor
├── templates/
│   └── DISCUSSION_OUTPUT_TEMPLATE.md  # Šablóna výstupu konzultácie
├── output/                       # (gitignored) Generované súbory
│   ├── VOICELIBRI_CONTEXT.md
│   └── GEMINI_INSTRUCTION_SK.md
├── discussions/                  # (gitignored) Výstupy konzultácií
│   └── YYYY-MM-DD_topic.md
└── videos/                       # (gitignored) Screen recordings z mobilnej app
    └── YYYY-MM-DD_scenario.mov    # alebo .mp4, .webm, etc.
```

## Video konzultácia (pripravené pre budúcnosť)

Okrem textového kontextu systém podporuje aj **video nahrávky** z používania
aplikácie, ktoré Gemini dokáže analyzovať.

### Workflow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Mobile app  │────▶│  Screen      │────▶│  Google      │
│  (VoiceLibri)│     │  Recording   │     │  Drive       │
└──────────────┘     │  + Audio     │     │  /videos/    │
                     └──────────────┘     └──────┬───────┘
                                                 │
                                                 ▼
                     ┌──────────────┐     ┌──────────────┐
                     │  GitHub      │◀────│  Gemini Live │
                     │  Issues      │     │  (video +    │
                     └──────────────┘     │   context)   │
                                          └──────────────┘
```

### Ako nahrávať

1. **Na iPhone/Android:** Zapni natívny screen recording (MOV na iPhone, MP4 na Android — oba fungujú)
2. **Komentuj** nahlas čo robíš a čo očakávaš (audio ide do nahrávky)
3. **Zameraj sa** na jeden scenár per video (5-15 min, max 1 hodina)
4. **Ulož** do `mirror/videos/` alebo priamo na Google Drive

> Gemini podporuje: MOV, MP4, WebM, AVI, MPEG, WMV, FLV, 3GPP.
> **Žiadna konverzia nie je potrebná** — iPhone MOV/HEVC funguje priamo.

### Odporúčané scenáre

| Scenár | Popis |
|--------|-------|
| Generovanie audiobooku | Upload → dramatizácia → TTS → výsledok |
| Prehrávanie | Player UI, controls, chapters, quality |
| Knižnica | Browsing, search, detail |
| Error states | Čo sa stane pri chybách, offline, timeout |

### Použitie v konzultácii

```powershell
# Nahraj videá na Drive (manuálne alebo cez sync)
.\Sync-Mirror.ps1           # Nahrá aj /videos/ ak existuje

# V Gemini Live session:
# "Pozri si video z môjho Drive v VoiceLibri/consultation-mirror/videos/"
```

Gemini analyzuje video a dokáže identifikovať UX problémy, workflow
neefektívnosti, chybové stavy, a navrhnúť konkrétne zlepšenia
s odkazmi na časové značky.

> **Poznámka:** Videá nie sú commitované do gitu (gitignored).
> Ukladajú sa lokálne alebo priamo na Google Drive.

---

## Skripty — detaily

### Generate-Context.ps1

Generuje `VOICELIBRI_CONTEXT.md` z ~35 kľúčových súborov:
- 18 backend súborov (index.ts, ttsClient.ts, bookChunker.ts, ...)
- 13 mobile súborov (routes, stores, services, ...)
- 4 konfiguračné súbory (package.json, tsconfig.json, ...)
- 2 dokumentačné súbory (architecture, API docs)

Každý súbor obsahuje hlavičku s cestou a počtom riadkov. Celý snapshot má anti-halucination grounding blok s verifikačným session key.

**Parametre:**
- `-OutputPath` — cesta k výstupnému súboru (default: `output/VOICELIBRI_CONTEXT.md`)

### Sync-Mirror.ps1

Master orchestrátor s 3 krokmi:
1. Spustí `Generate-Context.ps1`
2. Skopíruje inštrukciu a šablónu do `output/`
3. Nahrá `output/` na Google Drive

**Parametre:**
- `-GenerateOnly` — len vygeneruj, nenahrávaj na Drive
- `-SkipDrive` — preskočí Drive upload

### Create-Issues.ps1

Parsuje štruktúrované `.md` súbory z `discussions/` a vytvára GitHub Issues.

Každá sekcia `### Návrh` sa stane samostatným issue s:
- Titulkom s prefixom typu (`[feat]`, `[fix]`, `[refactor]`, ...)
- Telom s popisom, krokmi (ako checkboxy), súbormi, rizikami
- Labels podľa šablóny

**Parametre:**
- `-InputFile` — konkrétny súbor (inak spracuje všetky v `discussions/`)
- `-DryRun` — len zobrazí, nevytvára
- `-Repo` — GitHub repo (default: `phajnala-dotcom/voicelibri`)

## Workflow

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Codebase   │────▶│  Generate-   │────▶│  Google      │
│  (~35 files)│     │  Context.ps1 │     │  Drive       │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                                                ▼
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  GitHub     │◀────│  Create-     │◀────│  Gemini Live │
│  Issues     │     │  Issues.ps1  │     │  (mobile)    │
└─────────────┘     └──────────────┘     └──────────────┘
```

## Doplnkový nástroj: NotebookLM

Pre hlbšiu textovú analýzu s citáciami:
1. Otvor [NotebookLM](https://notebooklm.google.com)
2. Nahraj `VOICELIBRI_CONTEXT.md` ako zdroj
3. Pýtaj sa textovo — odpovede budú grounded s inline citáciami

NotebookLM je vhodný na:
- Detailnú analýzu kódu s odkazmi na konkrétne miesta
- Porovnávanie patterns naprieč súbormi
- Verifikáciu návrhov oproti existujúcemu kódu
