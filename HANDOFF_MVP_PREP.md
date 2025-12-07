# Handoff: E-book Reader POC 2.1 -> MVP Phase

## 1. Project Goal

To create a web-based e-book reader that provides a high-quality, natural-sounding audiobook experience using advanced Text-to-Speech (TTS) technology. The application should be able to load a book, split it into manageable text chunks, and play them back sequentially with a persistent player UI.

## 2. Current Status (End of POC 2.1)

The project has successfully completed the "Proof of Concept 2.1" phase. The core functionality is in place and working reliably.

- **Critical Latency Resolved**: TTS generation latency, which was over 4 minutes per chunk, has been reduced to **5-6 seconds** by switching to the `gemini-2.5-flash-tts` model.
- **Intelligent Text Chunking**: The text is now split into chunks that respect sentence boundaries. The logic ensures a minimum chunk size for efficiency while preventing awkward mid-sentence breaks, creating a much smoother listening experience.
- **Advanced Narration Prompt**: A sophisticated prompt has been engineered to guide the TTS model, instructing it to perform like a professional voice artist. It differentiates between narrative text and character dialogue, assigning different vocal characteristics and maintaining consistency.
- **Stable Git Foundation**: All POC work has been merged into the `main` branch. Current development is on the `poc-2.1` branch.

**Last Commit on `poc-2.1`**: `b34a32e445c8f04c17eecaf6a5dccce85aaed054` - *POC 2.1: Final voice artist prompt - professional theatrical narration with character voices*

## 3. Technical Stack

- **Monorepo**: Managed with `npm` workspaces.
- **Frontend**: React, Vite, TypeScript.
- **Backend**: Node.js, Express, `tsx` for live-reloading.
- **TTS Provider**: Google Cloud Vertex AI.
- **TTS API Endpoint**: `https://aiplatform.googleapis.com/v1beta1/projects/calmbridge-2/locations/us-central1/publishers/google/models/gemini-2.5-flash-tts:generateContent`

## 4. Key Code Components

### `apps/backend/src/ttsClient.ts`
- **Role**: Manages all communication with the Vertex AI TTS API.
- **Key Logic**: It constructs the request body, including the crucial narrator prompt, and sends the text to be synthesized.
- **Current Narrator Prompt**:
  ```
  Read as a top voice artist in emotionally expressive yet calm, natural tone. Detect dialogue and use lower pitch / firm timbre for males, higher pitch / soft timbre for females and children. Identify each character's personality and match their voice consistently.
  ```

### `apps/backend/src/bookChunker.ts`
- **Role**: Splits the full text of the book into coherent, manageable chunks.
- **Key Logic**: The `chunkBookText` function implements a sentence-boundary-aware algorithm. It builds a chunk until it reaches a minimum size (200 bytes), then continues to the next sentence-ending punctuation mark (`.`, `!`, `?`, `…`) before finalizing the chunk. This ensures narrative flow is maintained.

### `apps/frontend/src/components/BookPlayer.tsx`
- **Role**: The primary user interface for the audiobook player.
- **Key Logic**: This component manages all frontend state, including playback position, audio caching, pre-fetching subsequent chunks, and user controls (play/pause, timeline scrubbing, speed control). It also handles saving and loading playback position to `localStorage`.

## 5. Next Steps: MVP Phase

The primary goal for the MVP is to build upon the stable POC foundation and develop a more robust, user-friendly, and feature-rich application. The immediate prompt for the next session will be:

**"Start the MVP phase. The first task is to refactor the backend to improve its structure and scalability. Create a dedicated router for book-related endpoints and move the business logic out of the main `server.ts` file into service modules."**
