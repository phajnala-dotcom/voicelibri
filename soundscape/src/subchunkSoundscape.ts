/**
 * Soundscape Module — Subchunk Soundscape Mapper
 *
 * Steps 2.2 / 2.4 / 2.6 of the per-subchunk soundscape pipeline.
 *
 * Step 2.2 — Chunking Mapper
 *   Maps chapter-level `charIndex` values (from LLM Director SfxEvents) to
 *   per-subchunk `localCharIndex` values using proportional position mapping.
 *   No exact substring search: the subchunk plain-text character lengths are
 *   accumulated into a running offset and the chapter charIndex is rescaled
 *   proportionally onto that offset space.
 *
 * Step 2.4 — Sentence-Counting Timing Calculation
 *   Once the actual TTS duration of a subchunk is known (from ffprobe):
 *     1. Split subchunk text into sentences (punctuation boundaries).
 *     2. Map SFX charIndex → containing sentence → corresponding silence gap.
 *   TTS gaps correspond 1:1 to sentence boundaries, so this mapping is
 *   independent of speaking rate variation (unlike proportional char mapping).
 *
 * Step 2.6 — Subchunk Soundscape Orchestration
 *   Builds the per-subchunk SFX placement data used by generateSubchunkAmbientTrack()
 *   in ambientLayer.ts. After all subchunk ambient OGGs are written, a simple ffmpeg
 *   concat (no re-encode) assembles the chapter ambient track.
 */

import type { SfxEvent, SoundAsset, SilenceGap } from './types.js';

// ========================================
// Types
// ========================================

/**
 * Accumulated character-offset data for one TTS subchunk.
 * Built from the subchunk's segments' plain text (voice tags already stripped).
 */
export interface SubchunkSegmentInfo {
  /** Original subchunk index (0-based within chapter) */
  subchunkIndex: number;
  /** Plain text of all segments concatenated (voice tags stripped) */
  text: string;
  /** Character count of `text` */
  charCount: number;
  /** Cumulative character start offset in the total subchunk-text space */
  cumulativeCharStart: number;
}

/**
 * An SFX event that has been mapped to a specific subchunk.
 */
export interface MappedSfxEvent {
  /** Which subchunk this event belongs to */
  subchunkIndex: number;
  /**
   * Character offset within the subchunk's plain text (0-based).
   * Used together with the subchunk's actual TTS duration to compute offsetMs.
   */
  localCharIndex: number;
  /** Original SFX event (preserves query and description) */
  sfxEvent: SfxEvent;
}

/**
 * A fully-resolved SFX event ready for ffmpeg adelay placement.
 */
export interface PlacedSfxEvent {
  /** Millisecond offset within the subchunk ambient track */
  offsetMs: number;
  /** Resolved catalog asset to play at this offset */
  asset: SoundAsset;
  /** Human-readable description (for logging) */
  description: string;
}

// ========================================
// Step 2.2 — Chunking Mapper
// ========================================

/**
 * Build accumulated character-offset information for each TTS subchunk.
 *
 * The subchunk text is extracted by joining each subchunk's segments' plain
 * text with a single space separator (matching how the TwoSpeakerChunker
 * produces text after stripping voice tags).
 *
 * @param subChunks - Ordered array of subchunk objects (e.g. TwoSpeakerChunk[])
 *   Each item must expose `index: number` and
 *   `segments: Array<{ text: string }>`.
 * @returns Array of SubchunkSegmentInfo, one per subchunk, in order.
 */
export function buildSubchunkSegmentInfos(
  subChunks: Array<{ index: number; segments: Array<{ text: string }> }>
): SubchunkSegmentInfo[] {
  let cumulative = 0;
  return subChunks.map((sc) => {
    const text = sc.segments.map((s) => s.text).join(' ');
    const info: SubchunkSegmentInfo = {
      subchunkIndex: sc.index,
      text,
      charCount: text.length,
      cumulativeCharStart: cumulative,
    };
    cumulative += text.length;
    return info;
  });
}

/**
 * Map a list of chapter-level SfxEvents to their owning subchunks.
 *
 * The mapping uses proportional position:
 *   1. Compute total subchunk text length (sum of all subchunk charCounts).
 *   2. Normalise the LLM-produced charIndex against the chapter text length:
 *        normalised = event.charIndex / chapterTextLength
 *   3. Rescale onto the subchunk text space:
 *        targetOffset = normalised × totalSubchunkTextLength
 *   4. Find the subchunk whose cumulative range covers targetOffset.
 *   5. Compute localCharIndex = targetOffset − subchunk.cumulativeCharStart.
 *
 * This approach is intentionally approximate: the LLM produces charIndex as a
 * best guess, and a small positional error (~subchunk width) is imperceptible.
 *
 * @param sfxEvents  - SFX events from SceneAnalysis (chapter-level charIndex)
 * @param chapterTextLength - Length of the chapter text the LLM saw (for normalisation)
 * @param subchunkInfos - Built from buildSubchunkSegmentInfos()
 * @returns Array of MappedSfxEvent, one per input event (order preserved)
 */
export function mapSfxEventsToSubchunks(
  sfxEvents: SfxEvent[],
  chapterTextLength: number,
  subchunkInfos: SubchunkSegmentInfo[]
): MappedSfxEvent[] {
  if (sfxEvents.length === 0 || subchunkInfos.length === 0) return [];

  const totalSubchunkChars = subchunkInfos.reduce((sum, s) => sum + s.charCount, 0);

  return sfxEvents.map((event) => {
    const normalised = chapterTextLength > 0 ? event.charIndex / chapterTextLength : 0;
    const targetOffset = Math.round(normalised * totalSubchunkChars);

    // Walk subchunks to find the one containing targetOffset
    let owner = subchunkInfos[subchunkInfos.length - 1];
    for (const info of subchunkInfos) {
      if (targetOffset < info.cumulativeCharStart + info.charCount) {
        owner = info;
        break;
      }
    }

    const localCharIndex = Math.max(0, targetOffset - owner.cumulativeCharStart);

    return { sfxEvent: event, subchunkIndex: owner.subchunkIndex, localCharIndex };
  });
}

// ========================================
// Step 2.4 — Silence-Gap Timing Calculation
// ========================================

// Re-export SilenceGap from canonical location for existing consumers
export type { SilenceGap };

// ========================================
// Sentence boundary detection (language-agnostic)
// ========================================

/**
 * Find sentence end positions within a text (language-agnostic).
 * A sentence ends at [.!?] followed by whitespace, end-of-text,
 * or a closing quote + whitespace/end-of-text.
 *
 * Handles ellipsis (consecutive dots) by skipping them.
 * Handles quoted dialogue with closing-quote-after-punctuation patterns.
 *
 * Returns array of char offsets where each sentence ends (exclusive),
 * sorted ascending. Used by sentence-counting gap assignment:
 * each end position marks where TTS would insert a pause,
 * corresponding to a detected silence gap.
 */
function findSentenceBoundaries(text: string): number[] {
  const ends: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;

    // Skip ellipsis: consecutive dots
    if (ch === '.' && ((i > 0 && text[i - 1] === '.') || text[i + 1] === '.')) continue;

    // Check for closing quote after punctuation
    const next = text[i + 1];
    const isClosingQuote =
      next === '"' || next === "'" ||
      next === '\u201D' || next === '\u00BB' || next === '\u00AB';
    const checkIdx = isClosingQuote ? i + 2 : i + 1;

    // Must be followed by whitespace or end-of-text
    if (checkIdx < text.length && !/\s/.test(text[checkIdx])) continue;

    ends.push(isClosingQuote ? i + 2 : i + 1);
  }
  return ends;
}

/**
 * Map a local character index within a subchunk to the midpoint of the
 * silence gap that follows the sentence containing that character.
 *
 * Sentence-counting algorithm (replaces proportional char mapping):
 *   1. Split the subchunk text into sentences using punctuation boundaries.
 *   2. Determine which sentence the localCharIndex falls into.
 *   3. TTS silence gaps correspond to pauses between spoken sentences:
 *      gap[i] is the pause after sentence[i].
 *   4. Return gap[sentenceIndex].midpointMs.
 *   5. If the event falls in the last sentence (no gap follows) → null.
 *
 * This is much more accurate than proportional mapping because TTS
 * speaking rate varies across sentences (descriptive prose is slower,
 * action/dialogue is faster). Sentence-counting maps content position
 * to structural pauses regardless of speaking rate.
 *
 * @param localCharIndex  - Position within the subchunk's plain text
 * @param subchunkText    - Full plain text of the subchunk (for sentence detection)
 * @param silenceGaps     - Detected silence gaps for this subchunk (ordered by time)
 * @returns Millisecond offset for ffmpeg `adelay`, or null if no suitable gap
 */
export function calculateSfxOffsetFromGaps(
  localCharIndex: number,
  subchunkText: string,
  silenceGaps: SilenceGap[]
): number | null {
  if (silenceGaps.length === 0) return null;

  const sentenceEnds = findSentenceBoundaries(subchunkText);
  const N = silenceGaps.length;

  if (sentenceEnds.length === 0) {
    // No sentence boundaries detected — entire text is one "sentence".
    // Place at the first gap as a reasonable fallback.
    return silenceGaps[0].midpointMs;
  }

  // Determine which sentence the localCharIndex falls into.
  // Sentence 0: chars [0, sentenceEnds[0])
  // Sentence 1: chars [sentenceEnds[0], sentenceEnds[1])
  // ...
  // Sentence K: chars [sentenceEnds[K-1], ...)
  let sentenceIndex = sentenceEnds.length; // default: after all boundaries
  for (let i = 0; i < sentenceEnds.length; i++) {
    if (localCharIndex < sentenceEnds[i]) {
      sentenceIndex = i;
      break;
    }
  }

  // Gap[i] follows sentence[i]. If sentenceIndex >= N (gap count), no gap follows.
  if (sentenceIndex >= N) return null;

  return silenceGaps[sentenceIndex].midpointMs;
}

// ========================================
// Step 2.6 — Group mapped events by subchunk
// ========================================

/**
 * Build a per-subchunk lookup from the flat list of MappedSfxEvent objects.
 *
 * @param mappedEvents - Output of mapSfxEventsToSubchunks()
 * @returns Map: subchunkIndex → array of MappedSfxEvent
 */
export function groupMappedEventsBySubchunk(
  mappedEvents: MappedSfxEvent[]
): Map<number, MappedSfxEvent[]> {
  const map = new Map<number, MappedSfxEvent[]>();
  for (const ev of mappedEvents) {
    const existing = map.get(ev.subchunkIndex);
    if (existing) {
      existing.push(ev);
    } else {
      map.set(ev.subchunkIndex, [ev]);
    }
  }
  return map;
}

/**
 * Build the PlacedSfxEvent list for a single subchunk.
 *
 * Applies all SFX constraints:
 *   1. Gap-based placement via `calculateSfxOffsetFromGaps()` — if no suitable gap, skip.
 *   2. No-layering: if two events map to the same silence gap, keep only the highest-score one.
 *   3. No-boundary-crossing: if `offsetMs + sfxDurationMs > subchunkDurationMs`, skip.
 *   4. No-ambient-crossfade-overlap: if the gap’s midpoint is within ±500ms of any ambient
 *      scene-change offset, skip the SFX.
 *
 * @param mappedEvents          - Events mapped to this subchunk
 * @param resolvedAssets        - Map: sfxEvent.query → { asset, score } (from resolver)
 * @param subchunkText          - Full plain text of the subchunk (for sentence-counting timing)
 * @param subchunkDurationMs    - Actual TTS duration of this subchunk in ms
 * @param silenceGaps           - Detected silence gaps for this subchunk
 * @param ambientChangeOffsets  - ms offsets where ambient scene changes happen (for exclusion)
 * @param sfxDurations          - Map: asset.filePath → durationMs (pre-fetched; 0 = unknown)
 */
export function buildPlacedSfxEvents(
  mappedEvents: MappedSfxEvent[],
  resolvedAssets: Map<string, { asset: SoundAsset; score: number }>,
  subchunkText: string,
  subchunkDurationMs: number,
  silenceGaps: SilenceGap[],
  ambientChangeOffsets: number[],
  sfxDurations: Map<string, number>
): PlacedSfxEvent[] {
  if (mappedEvents.length === 0 || silenceGaps.length === 0) return [];

  const AMBIENT_CROSSFADE_EXCLUSION_MS = 500;

  // Phase 1: compute candidate placements
  interface Candidate {
    gapIndex: number;
    offsetMs: number;
    asset: SoundAsset;
    score: number;
    description: string;
  }
  const candidates: Candidate[] = [];

  for (const mapped of mappedEvents) {
    const resolved = resolvedAssets.get(mapped.sfxEvent.query);
    if (!resolved?.asset) continue;

    const offsetMs = calculateSfxOffsetFromGaps(
      mapped.localCharIndex,
      subchunkText,
      silenceGaps
    );
    if (offsetMs === null) continue; // No suitable gap — skip

    // Find which gap index this maps to
    const gapIndex = silenceGaps.findIndex((g) => g.midpointMs === offsetMs);

    candidates.push({
      gapIndex,
      offsetMs,
      asset: resolved.asset,
      score: resolved.score,
      description: mapped.sfxEvent.description,
    });
  }

  // Phase 2: de-duplication — per gap, keep only the highest-score candidate
  const bestPerGap = new Map<number, Candidate>();
  for (const c of candidates) {
    const existing = bestPerGap.get(c.gapIndex);
    if (!existing || c.score > existing.score) {
      bestPerGap.set(c.gapIndex, c);
    }
  }

  // Phase 3: apply remaining constraints and build output
  const placed: PlacedSfxEvent[] = [];

  for (const c of bestPerGap.values()) {
    // Constraint: no boundary crossing
    const sfxDurationMs = sfxDurations.get(c.asset.filePath) ?? 0;
    if (sfxDurationMs > 0 && c.offsetMs + sfxDurationMs > subchunkDurationMs) continue;

    // Constraint: no overlap with ambient crossfade
    const overlapsAmbientChange = ambientChangeOffsets.some(
      (changeMs) => Math.abs(c.offsetMs - changeMs) <= AMBIENT_CROSSFADE_EXCLUSION_MS
    );
    if (overlapsAmbientChange) continue;

    placed.push({
      offsetMs: c.offsetMs,
      asset: c.asset,
      description: c.description,
    });
  }

  // Sort by offsetMs for deterministic ffmpeg filter construction
  placed.sort((a, b) => a.offsetMs - b.offsetMs);

  // Q2: 2-second minimum spacing filter — drop events within 2000ms of previous kept event
  const MIN_SFX_SPACING_MS = 2000;
  const spaced: PlacedSfxEvent[] = [];
  for (const ev of placed) {
    if (spaced.length === 0 || ev.offsetMs - spaced[spaced.length - 1].offsetMs >= MIN_SFX_SPACING_MS) {
      spaced.push(ev);
    }
  }

  return spaced;
}
