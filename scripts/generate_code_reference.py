#!/usr/bin/env python3
"""
Generate VoiceLibri Code Reference file for Custom GPT knowledge base.
Concatenates key source files with headers, ordered by importance.
Run from workspace root: python scripts/generate_code_reference.py
"""

import os
import sys
import io

# Force UTF-8 output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

WORKSPACE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(WORKSPACE, 'docs', 'VoiceLibri_CodeReference_v1.txt')

# Files ordered by importance (most important first = gets context-stuffed first)
FILES = [
    # === BACKEND CORE (pipeline orchestration) ===
    ('apps/backend/src/index.ts', 'Backend API Server — hlavný Express server, všetky endpointy, background dramatizácia, TTS pipeline orchestrácia'),
    ('apps/backend/src/soundscapeCompat.ts', 'Soundscape Pipeline — Alt 4 architektúra, prepareEarlyAmbient, generateAmbientBed, applySoundscapeToChapter'),
    ('apps/backend/src/tempChunkManager.ts', 'Temp Chunk Manager — správa sub-chunkov, konsolidácia WAV→OGG, paralelná TTS generácia'),
    
    # === BACKEND DRAMATIZATION ===
    ('apps/backend/src/hybridDramatizer.ts', 'Hybrid Dramatizer — orchestrácia LLM dramatizácie'),
    ('apps/backend/src/hybridTagger.ts', 'Hybrid Tagger — detektor dialógov a [VOICE=] značiek'),
    ('apps/backend/src/llmCharacterAnalyzer.ts', 'LLM Character Analyzer — analýza postáv cez Gemini'),
    ('apps/backend/src/characterRegistry.ts', 'Character Registry — register postáv a hlasov'),
    ('apps/backend/src/voiceAssigner.ts', 'Voice Assigner — sémantické priraďovanie Gemini hlasov postavám'),
    
    # === BACKEND TTS & CHUNKING ===
    ('apps/backend/src/ttsClient.ts', 'TTS Client — Gemini TTS API volania'),
    ('apps/backend/src/twoSpeakerChunker.ts', 'Two-Speaker Chunker — rozdelenie textu na 2-speaker chunky (Gemini TTS limit)'),
    ('apps/backend/src/chapterChunker.ts', 'Chapter Chunker — kapitolové chunkovanie'),
    ('apps/backend/src/bookChunker.ts', 'Book Chunker — parsovanie EPUB/TXT, extrakcia kapitol, metadáta'),
    
    # === BACKEND SUPPORT ===
    ('apps/backend/src/geminiVoices.ts', 'Gemini Voices — databáza 30 hlasov s metadátami'),
    ('apps/backend/src/chapterTranslator.ts', 'Chapter Translator — preklad kapitol cez Gemini'),
    ('apps/backend/src/audiobookManager.ts', 'Audiobook Manager — správa knižnice, súborov, metadát'),
    ('apps/backend/src/audiobookWorker.ts', 'Audiobook Worker — background generácia'),
    ('apps/backend/src/audioUtils.ts', 'Audio Utils — WAV manipulácia, konkatenácia, silence'),
    ('apps/backend/src/costTracker.ts', 'Cost Tracker — sledovanie nákladov API volaní'),
    ('apps/backend/src/promptConfig.ts', 'Prompt Config — LLM prompt šablóny'),
    ('apps/backend/src/formatExtractors.ts', 'Format Extractors — EPUB, TXT, PDF, DOCX extraktory'),
    ('apps/backend/src/textCleaner.ts', 'Text Cleaner — čistenie textu'),
    
    # === SOUNDSCAPE MODULE ===
    ('soundscape/src/types.ts', 'Soundscape Types — SceneAnalysis, SceneSegment, SfxEvent, SoundAsset, SilenceGap'),
    ('soundscape/src/ambientLayer.ts', 'Ambient Layer — ffmpeg filter_complex generácia (ambient + SFX overlays)'),
    ('soundscape/src/llmDirector.ts', 'LLM Director — scénická analýza kapitol cez Gemini'),
    ('soundscape/src/assetResolver.ts', 'Asset Resolver — embedding search v katalógu 470+ zvukov'),
    ('soundscape/src/subchunkSoundscape.ts', 'Subchunk Soundscape — SFX placement do silence gaps'),
    ('soundscape/src/ffmpegRunner.ts', 'FFmpeg Runner — silence detection, audio duration'),
    ('soundscape/src/introGenerator.ts', 'Intro Generator — hudobné intro s voice-over'),
    ('soundscape/src/catalogLoader.ts', 'Catalog Loader — načítanie zvukového katalógu'),
    
    # === PWA FRONTEND ===
    ('apps/pwa-v2/src/hooks/useProgressiveAudioPlayback.ts', 'Progressive Audio Playback Hook — duálny prehrávač (voice + ambient), sub-chunk streaming'),
    ('apps/pwa-v2/src/stores/playerStore.ts', 'Player Store — Zustand state management pre prehrávač'),
    ('apps/pwa-v2/src/services/api.ts', 'API Service — backend API klient pre PWA'),
    ('apps/pwa-v2/src/screens/GenerateScreen.tsx', 'Generate Screen — vytvorenie novej audioknihy, spustenie generovania'),
    ('apps/pwa-v2/src/screens/LibraryScreen.tsx', 'Library Screen — zoznam audiokníh'),
    ('apps/pwa-v2/src/components/layout/AppShell.tsx', 'App Shell — layout wrapper, integrácia progressive playback hooku'),
]

def generate():
    parts = []
    
    # Header
    parts.append("=" * 80)
    parts.append("VOICELIBRI — CODE REFERENCE")
    parts.append("Verzia: v1 | Dátum: Marec 2026")
    parts.append("Účel: Knowledge base pre Custom GPT — kompletný zdrojový kód aplikácie")
    parts.append("=" * 80)
    parts.append("")
    
    # Summary chapter
    parts.append("SÚHRN")
    parts.append("-" * 40)
    parts.append("")
    parts.append("VoiceLibri je komerčná AI platforma na premenu e-kníh na dramatizované")
    parts.append("audioknihy s viacerými hlasmi. TypeScript monorepo s Express backendom,")
    parts.append("React PWA frontom a React Native mobilnou appkou.")
    parts.append("")
    parts.append("Kľúčové technológie:")
    parts.append("  - Backend: Express + TypeScript, Google Gemini (TTS + LLM)")
    parts.append("  - Frontend: React 18, Vite, TanStack Query, Zustand, Tailwind CSS")
    parts.append("  - Audio: WAV/OGG, multi-speaker TTS, ffmpeg soundscape pipeline")
    parts.append("  - Soundscape: Alt 4 architektúra — dvojfázový ambient (bed → full+SFX)")
    parts.append("")
    parts.append("Generačný pipeline (7 fáz):")
    parts.append("  1. Import e-knihy (EPUB/TXT) → extrakcia textu + metadáta")
    parts.append("  2. Preklad kapitol (Gemini 2.5 Flash)")
    parts.append("  3. Extrakcia postáv (LLM Character Analyzer)")
    parts.append("  4. Hybridná dramatizácia ([VOICE=CHARACTER] značky)")
    parts.append("  5. Two-Speaker chunking (max 2 hovoriaci, 4000 bytes per chunk)")
    parts.append("  6. TTS syntéza (Gemini TTS, paralelná generácia)")
    parts.append("  7. Konsolidácia WAV→OGG + soundscape (ambient + SFX + intro)")
    parts.append("")
    parts.append("Prehrávanie:")
    parts.append("  - Progressive mode: sub-chunk streaming počas generovania")
    parts.append("  - Chapter mode: konsolidované OGG kapitoly")
    parts.append("  - Duálny prehrávač: voice (master) + ambient (follower)")
    parts.append("")
    
    # File index
    parts.append("OBSAH SÚBOROV")
    parts.append("-" * 40)
    parts.append("")
    
    file_stats = []
    for filepath, desc in FILES:
        full = os.path.join(WORKSPACE, filepath.replace('/', os.sep))
        if os.path.exists(full):
            with open(full, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
            file_stats.append((filepath, desc, len(lines)))
            parts.append(f"  {filepath} ({len(lines)} riadkov)")
            parts.append(f"    → {desc}")
        else:
            parts.append(f"  {filepath} (CHÝBA)")
    
    total_lines = sum(s[2] for s in file_stats)
    parts.append("")
    parts.append(f"Celkom: {len(file_stats)} súborov, {total_lines:,} riadkov kódu")
    parts.append("")
    parts.append("")
    
    # File contents
    for filepath, desc, _ in file_stats:
        full = os.path.join(WORKSPACE, filepath.replace('/', os.sep))
        with open(full, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
        
        parts.append("=" * 80)
        parts.append(f"FILE: {filepath}")
        parts.append(f"POPIS: {desc}")
        parts.append("=" * 80)
        parts.append("")
        parts.append(content)
        parts.append("")
        parts.append("")
    
    # Footer
    parts.append("=" * 80)
    parts.append("KONIEC — VoiceLibri Code Reference v1")
    parts.append("=" * 80)
    
    output = '\n'.join(parts)
    
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        f.write(output)
    
    size_bytes = len(output.encode('utf-8'))
    est_tokens = size_bytes // 4  # rough estimate
    
    print(f"✅ Generated: {OUTPUT}")
    print(f"   Size: {size_bytes:,} bytes = {size_bytes // 1024:,} KB")
    print(f"   Estimated tokens: ~{est_tokens:,}")
    print(f"   Files: {len(file_stats)}")
    print(f"   Lines: {total_lines:,}")
    print(f"   Custom GPT limit: 2,000,000 tokens → {'OK ✅' if est_tokens < 2_000_000 else 'OVER LIMIT ❌'}")

if __name__ == '__main__':
    generate()
