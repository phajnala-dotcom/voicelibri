# Soundscape Module (Top-Level)

Standalone module skeleton for ambient soundscapes + music intros.

## Contents
- src/types.ts – shared types
- src/soundLibrary.ts – catalog load + selection
- src/soundDirectiveGenerator.ts – directive builder
- src/musicIntroBuilder.ts – intro timeline builder
- src/audioMixer.ts – FFmpeg orchestration (stub)
- src/ffmpegRunner.ts – FFmpeg process runner
- src/config.ts – module config
- src/catalogLoader.ts – load local catalog JSON
- src/credits.ts – credits formatter
- src/index.ts – module exports
- assets/manifest.json – curated download list (fill URLs)
- assets/catalog.json – generated catalog
- scripts/harvest_catalog.ts – download + build catalog
- assets/credits_template.txt – attribution template for CC-BY

## Status
Scaffolding + intro templates + directive generator + local catalog tooling.
Not yet integrated into apps/backend.
