# 📚 EPUB Support - Quick Start Guide

## ✅ Čo bolo implementované

1. **EPUB Metadata Parser** - Extrahuje názov, autora, jazyk z EPUB súborov
2. **EPUB Text Extractor** - Vytiahne čistý text z HTML/XHTML kapitol
3. **Auto-detekcia formátu** - Automaticky detekuje EPUB vs TXT
4. **Zachovaná chunking logika** - Funguje rovnako pre všetky formáty

## 🧪 Ako otestovať

### Krok 1: Priprav EPUB súbor

**Odporúčané zdroje:**
- [Project Gutenberg](https://www.gutenberg.org/ebooks/) - Veľký výber, verejné dielo
- [Calibre Library](https://standardebooks.org/) - Kvalitné EPUB súbory
- Vlastná knižnica

**Pre testovanie jazyka:**
- Česká kniha: https://www.gutenberg.org/ebooks/author/24696 (Karel Čapek)
- Slovenská: vlastný EPUB ak máš

### Krok 2: Ulož EPUB do assets/

```powershell
# Z koreňa projektu
Copy-Item "C:\Downloads\alice.epub" "apps\backend\assets\"
```

Alebo proste skopíruj `.epub` súbor do `apps\backend\assets\` priečinku.

### Krok 3: Spusti backend

```powershell
cd apps\backend
npm run dev
```

**Očakávaný výstup:**
```
📚 Loading EPUB: alice.epub
✓ EPUB metadata extracted: "Alice's Adventures in Wonderland" by Lewis Carroll [en]
✓ EPUB text extracted: 154321 characters from 12 chapters
✓ Book loaded and chunked successfully
  Format: EPUB
  Title: Alice's Adventures in Wonderland
  Author: Lewis Carroll
  Language: en
  Total chunks: 771
```

### Krok 4: Spusti frontend a testuj

```powershell
# V novom terminály
cd apps\frontend
npm run dev
```

Potom otvor http://localhost:5173 a testuj:
- ✅ Názov a autor sa zobrazujú správne
- ✅ Jazykový badge je správny (en/cs/sk)
- ✅ Play button funguje
- ✅ Skip buttons fungujú (+30s, -30s)
- ✅ TTS hlasí text v správnom jazyku

## 🐛 Riešenie problémov

### "No suitable book file found"
- Uisti sa, že `.epub` súbor je v `apps/backend/assets/`
- Skontroluj príponu súboru (musí byť lowercase `.epub`)

### Metadata zobrazuje "Unknown"
- EPUB môže byť poškodený - skús iný
- Skontroluj konzolu pre chybové hlášky
- Niektoré staršie EPUB nemajú správne metadata

### TTS nehrá alebo zlý jazyk
- Skontroluj `language` v konzole backendu
- Niektoré EPUB nemajú správny jazyk v metadátach
- Vertex AI by mal automaticky detekovať jazyk z textu

## 📊 Testovací checklist

Po otestovaní vyplň výsledky v `HANDOFF_EPUB_SUPPORT.md`:

- [ ] EPUB sa načítal
- [ ] Metadata správne (názov, autor, jazyk)
- [ ] TTS prehrá prvý chunk
- [ ] Jazykový badge správny
- [ ] Skip buttons fungujú
- [ ] Žiadne chyby v konzole

## 🔜 Ďalšie kroky

Po úspešnom otestovaní EPUB:

1. **PDF podpora** - Podobná logika, iná knižnica
2. **MOBI podpora** - Amazon Kindle formát
3. **DOCX podpora** - Word dokumenty
4. **MD podpora** - Markdown súbory

---

**Potrebuješ pomoc?** Skontroluj `HANDOFF_EPUB_SUPPORT.md` pre detailnú dokumentáciu.
