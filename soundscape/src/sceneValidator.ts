/**
 * Soundscape Module — Scene Validator
 *
 * Lightweight validation and auto-correction for deterministic SceneAnalysis.
 * Since the pipeline is fully deterministic (no LLM), validation mainly
 * handles edge cases and enforces minimums.
 *
 * Auto-corrects rather than rejects — fixes are deterministic and predictable.
 */

import type { SceneAnalysis, SceneSegment, SfxEvent } from './types.js';

// ========================================
// Types
// ========================================

export interface ValidationResult {
  /** Whether the scene passed validation without corrections */
  valid: boolean;
  /** Human-readable list of corrections applied */
  corrections: string[];
  /** Corrected scene (same as input if valid) */
  scene: SceneAnalysis;
}

// ========================================
// Public API
// ========================================

/**
 * Validate and auto-correct a SceneAnalysis.
 * Since the pipeline is deterministic, this is a lightweight sanity check.
 *
 * @param scene - SceneAnalysis to validate
 * @param chapterTextLength - Total character length of the chapter text
 * @param minSegments - Minimum number of segments expected
 * @param minSfxCount - Minimum SFX count (logged as note, not forced)
 * @returns ValidationResult with corrected scene
 */
export function validateScene(
  scene: SceneAnalysis,
  chapterTextLength: number,
  minSegments: number,
  minSfxCount: number,
): ValidationResult {
  const corrections: string[] = [];

  // Deep clone to avoid mutating input
  const corrected: SceneAnalysis = {
    ...scene,
    sceneSegments: scene.sceneSegments.map((s) => ({ ...s, searchSnippets: [...s.searchSnippets], moods: [...s.moods] })),
    sfxEvents: scene.sfxEvents.map((e) => ({ ...e })),
    moods: [...scene.moods],
    soundElements: [...scene.soundElements],
  };

  // ── Rule 1: Minimum segment count ──
  if (corrected.sceneSegments.length < minSegments && chapterTextLength > 2000) {
    // Add segments at equal intervals
    const existing = corrected.sceneSegments;
    const needed = minSegments - existing.length;
    for (let i = 0; i < needed; i++) {
      const charIndex = Math.round(((existing.length + i) / (existing.length + needed)) * chapterTextLength);
      existing.push({
        charIndex,
        environment: 'unknown',
        searchSnippets: [],
        moods: [],
      });
    }
    corrections.push(`Added ${needed} segments to meet minimum of ${minSegments}`);
  }

  // Sort segments by charIndex first — Rule 1 may have appended segments
  // out of order, and strict ordering enforcement (Rule 3) needs a sorted base
  corrected.sceneSegments.sort((a, b) => a.charIndex - b.charIndex);

  // ── Rule 2: First segment charIndex must be 0 ──
  if (corrected.sceneSegments.length > 0 && corrected.sceneSegments[0].charIndex !== 0) {
    corrections.push(`Forced first segment charIndex from ${corrected.sceneSegments[0].charIndex} to 0`);
    corrected.sceneSegments[0].charIndex = 0;
  }

  // ── Rule 3: All charIndex values strictly increasing and within bounds ──
  for (let i = 0; i < corrected.sceneSegments.length; i++) {
    const seg = corrected.sceneSegments[i];

    // Clamp to valid range
    if (seg.charIndex < 0) {
      corrections.push(`Clamped segment ${i} charIndex from ${seg.charIndex} to 0`);
      seg.charIndex = 0;
    }
    if (seg.charIndex >= chapterTextLength && chapterTextLength > 0) {
      const clamped = chapterTextLength - 1;
      corrections.push(`Clamped segment ${i} charIndex from ${seg.charIndex} to ${clamped}`);
      seg.charIndex = clamped;
    }

    // Ensure strictly increasing (for i > 0)
    if (i > 0 && seg.charIndex <= corrected.sceneSegments[i - 1].charIndex) {
      const newIndex = corrected.sceneSegments[i - 1].charIndex + 1;
      corrections.push(`Adjusted segment ${i} charIndex from ${seg.charIndex} to ${newIndex} (strict ordering)`);
      seg.charIndex = newIndex;
    }
  }

  // ── Rule 4: Deduplicate SFX at same charIndex (within ±200 chars) ──
  if (corrected.sfxEvents.length > 1) {
    // Sort by charIndex first
    corrected.sfxEvents.sort((a, b) => a.charIndex - b.charIndex);

    const deduped: SfxEvent[] = [corrected.sfxEvents[0]];
    for (let i = 1; i < corrected.sfxEvents.length; i++) {
      const prev = deduped[deduped.length - 1];
      const curr = corrected.sfxEvents[i];

      if (Math.abs(curr.charIndex - prev.charIndex) < 200) {
        // Duplicate — keep the one that's already in deduped (first wins)
        corrections.push(`Deduped SFX at charIndex ${curr.charIndex} (too close to ${prev.charIndex})`);
      } else {
        deduped.push(curr);
      }
    }

    if (deduped.length !== corrected.sfxEvents.length) {
      corrected.sfxEvents = deduped;
    }
  }

  // ── Rule 5: Clamp SFX charIndex values to valid range ──
  for (const evt of corrected.sfxEvents) {
    if (evt.charIndex < 0) {
      corrections.push(`Clamped SFX charIndex from ${evt.charIndex} to 0`);
      evt.charIndex = 0;
    }
    if (evt.charIndex >= chapterTextLength && chapterTextLength > 0) {
      const clamped = chapterTextLength - 1;
      corrections.push(`Clamped SFX charIndex from ${evt.charIndex} to ${clamped}`);
      evt.charIndex = clamped;
    }
  }

  // ── Rule 6: Log note if SFX count below minimum ──
  if (corrected.sfxEvents.length < minSfxCount) {
    corrections.push(`SFX count ${corrected.sfxEvents.length} below minimum ${minSfxCount} (kept as-is — threshold already retried)`);
  }

  return {
    valid: corrections.length === 0,
    corrections,
    scene: corrected,
  };
}
