# Inštrukcia pre Gemini — Konzultácia k VoiceLibri

> Túto inštrukciu skopíruj a vlož na začiatok hlasovej konzultácie v Gemini Live.
> Optimalizovaná pre hlasovú interakciu v slovenčine.

---

## Úvodná inštrukcia (skopíruj celé)

```
Si môj technický konzultant pre projekt VoiceLibri. Na mojom Google Drive
v priečinku VoiceLibri/consultation-mirror nájdeš súbor VOICELIBRI_CONTEXT.md.
Prečítaj ho celý predtým, než začneš odpovedať.

DÔLEŽITÉ PRAVIDLÁ:

1. VERIFIKÁCIA: Povedz mi session key, ktorý je v tom súbore.
   Ak ho nevieš povedať, ZASTAV SA a povedz mi, že si súbor nenačítal.

2. GROUNDING: Odpovedaj VÝHRADNE na základe informácií v tom súbore.
   Ak sa ťa pýtam na niečo, čo tam nie je, povedz "toto nie je
   v aktuálnom kontextovom súbore".

3. HALUCINÁCIE: NIKDY nevymýšľaj funkcie, súbory, API alebo architektúru,
   ktoré nie sú v súbore opísané. Ak niečo nevieš, povedz to.

4. JAZYK: Hovoríme po slovensky. Technické termíny môžeš použiť
   v angličtine (názvy súborov, funkcií, API).

5. FORMÁT: Keďže komunikujeme hlasom, dávaj stručné a jasné odpovede.
   Nepopisuj kód riadok po riadku — sústreď sa na architektúru,
   vzťahy medzi komponentmi a návrhy riešení.

6. ROLA: Si senior software architekt. Tvoje odpovede majú byť:
   - Praktické a realizovateľné
   - Zamerané na produkčnú kvalitu
   - Rešpektujúce existujúce vzory v kóde
   - Orientované na riešenie, nie len popis problému

7. VÝSTUPY: Ak mi dáš návrh, ktorý chcem implementovať, vytvor
   na konci štruktúrovaný súhrn, ktorý použijem ako GitHub Issue.
   Formát: Názov, Popis, Priorita, Odhad náročnosti.

Začni tým, že potvrdíš session key a v dvoch vetách zhň aktuálny
stav projektu podľa kontextového súboru.
```

---

## Overenie funkčnosti

Po vložení inštrukcie by Gemini mal:

1. ✅ Povedať správny session key (napr. "VL-MIRROR-20260309-1430")
2. ✅ Zhrnúť aktuálny stav VoiceLibri v 2 vetách
3. ✅ Odmietnuť odpovedať na otázky mimo kontextu

Ak Gemini session key nevie, súbor sa nenačítal — treba:
- Overiť, či je súbor na Google Drive
- Skúsiť "Pozri na môj Google Drive do priečinka VoiceLibri"
- Prípadne nahrať súbor priamo do konverzácie

---

## Príklady otázok pre konzultáciu

### Architektúra
- "Vysvetli mi data flow od uploadu ebooku po vygenerovanie audia."
- "Aký je vzťah medzi bookChunker, chapterChunker a twoSpeakerChunker?"
- "Ako funguje dramatizačný pipeline?"

### Refaktoring
- "Index.ts má cez 3000 riadkov. Aký je najlepší plán na jeho rozdelenie?"
- "Navrhni lepšiu architektúru pre state management na backende."

### Nové funkcie
- "Ako by som mal implementovať autentifikáciu používateľov?"
- "Aký je najlepší prístup k deploymentu na Cloud Run?"

### Mobile
- "Čo treba urobiť, aby mobilná appka mala úplnú funkcionalitu backendu?"
- "Navrhni offline-first architektúru pre audiobook storage."

### Performance
- "Kde sú najväčšie bottlenecky v TTS pipeline?"
- "Ako optimalizovať paralelné generovanie chunkov?"

---

## Video konzultácia (nahrávaná práca s aplikáciou)

Okrem kontextového súboru ti môžem poskytnúť aj **video nahrávky**
z používania VoiceLibri aplikácie (screen recording + audio).

Videá sa nachádzajú na Google Drive v priečinku
`VoiceLibri/consultation-mirror/videos/`.

### Inštrukcia pre video session

```
Nahral som ti video z mojej práce s VoiceLibri aplikáciou.
Pozri si ho celé a potom mi povedz:

1. Čo presne sa deje vo videu — aký workflow sleduješ?
2. Aké UX problémy alebo neefektívnosti vidíš?
3. Kde dochádza k chybám alebo neočakávanému správaniu?
4. Čo by si navrhol zlepšiť?

Pri odpovedi odkazuj na konkrétne časové značky vo videu
(napr. "v 0:23 vidím, že...").
```

### Čo nahrávať

| Scenár | Čo sledovať |
|--------|------------|
| **Generovanie audiobooku** | Pipeline flow, progress UI, chybové stavy |
| **Prehrávanie audiobooku** | Player UX, loading, controls, transitions |
| **Prehliadanie knižnice** | Navigation, knihy list, detail view |
| **Upload ebooku** | File picker, spracovanie, error handling |
| **Nastavenia** | Voice selection, jazyk, konfigurácia |
| **Celkový workflow** | End-to-end: upload → generate → play |

### Formát videa

Gemini podporuje tieto formáty (podľa oficiálnej dokumentácie Google):

| Formát | MIME typ | Poznámka |
|--------|----------|----------|
| **MOV** | video/mov | iPhone natívny formát — funguje priamo |
| **MP4** | video/mp4 | Univerzálny |
| **WebM** | video/webm | Web formát |
| **AVI** | video/avi | Windows |
| **MPEG/MPG** | video/mpeg, video/mpg | Starší formát |
| **WMV** | video/wmv | Windows Media |
| **FLV** | video/x-flv | Flash |
| **3GPP** | video/3gpp | Mobilný |

- **iPhone 16 Pro:** Nahrávaj priamo, MOV/HEVC funguje bez konverzie
- **Max. dĺžka:** Do 1 hodiny (1M context modely), odporúčané 5-15 min pre detailnú analýzu
- **Max. veľkosť:** 2 GB (free) / 20 GB (paid)
- **Audio:** Zapni narátovanie — opisuj čo robíš a čo očakávaš
- **Rozlíšenie:** Min. 720p, ideálne 1080p

---

## Záver konzultácie

Na konci konzultácie povedz:

```
Zhrň všetky návrhy, ktoré sme dnes prebrali, do formátu GitHub Issues.
Pre každý návrh uveď: názov, popis, prioritu (P0-P3) a odhad
náročnosti (S/M/L/XL). Výstup formátuj ako Markdown zoznam.
```

Tento výstup potom ulož do `mirror/discussions/` a použi
`Create-Issues.ps1` na vytvorenie GitHub Issues.
