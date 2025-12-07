# Ebook Reader POC 1.0

Aplikácia pre čítanie textov syntetizovaným hlasom pomocou Gemini 2.5 Flash TTS.

## Požiadavky

- Node.js 18+
- npm
- Google Cloud API key s prístupom k Text-to-Speech API

## Inštalácia

1. Nainštalujte závislosti:
```bash
npm install
```

2. Vytvorte `.env` súbor v `apps/backend/`:
```bash
cp .env.example apps/backend/.env
```

3. Nastavte váš `GOOGLE_API_KEY` v `apps/backend/.env`

## Spustenie

Spustite frontend aj backend súčasne:
```bash
npm run dev
```

Alebo samostatne:
```bash
npm run dev:backend
npm run dev:frontend
```

## Štruktúra

- `apps/frontend` - React + TypeScript + Vite
- `apps/backend` - Node.js + Express + TypeScript
- `apps/backend/assets/sample_text.txt` - Testovací text

## POC 1.0 Features

- Načítanie sample textu zo súboru
- Konverzia textu na audio cez Gemini 2.5 Flash TTS
- Streamovanie PCM audio
- Základný audio prehrávač
