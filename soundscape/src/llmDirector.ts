/**
 * Soundscape Module — LLM Director
 *
 * Uses Gemini 2.5 Flash to analyze chapter text and produce
 * English search queries for embedding-based asset matching.
 *
 * The Director reads each chapter's full text (any language) and extracts:
 *   - Primary environment (forest, castle, city, etc.)
 *   - Time of day, weather, mood
 *   - Specific sound elements mentioned
 *   - English search queries describing the ambient soundscape
 *
 * These English queries are then embedded and cosine-compared against
 * the English asset description embeddings to find the best ambient match.
 * This approach is language-agnostic: books in any language produce
 * English search queries that match the English catalog.
 *
 * This runs once per book (batch all chapters) to minimize API calls.
 */

import { GoogleAuth } from 'google-auth-library';
import { SCENE_ANALYSIS_MODEL } from './config.js';
import type { SceneAnalysis, SceneSegment, BookInfo } from './types.js';

// ========================================
// Gemini API setup
// ========================================

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

function buildEndpoint(): string {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'calmbridge-2';
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${SCENE_ANALYSIS_MODEL}:generateContent`;
}

async function callGemini(prompt: string): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const requestBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      topP: 0.8,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(buildEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini scene analysis error (${response.status}): ${errorText.substring(0, 500)}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No text in Gemini scene analysis response');
  }

  return text;
}

/**
 * Analyze a single chapter's text to produce a SceneAnalysis.
 * Sends the FULL chapter text — Gemini 2.5 Flash supports 1M token context,
 * and chapters are typically well under 5K tokens.
 */
export async function analyzeChapterScene(
  chapterIndex: number,
  chapterText: string,
  bookInfo: BookInfo
): Promise<SceneAnalysis> {
  const prompt = `You are a sound designer for audiobooks. Read the chapter text below (which may be in ANY language) and:

1. Identify 1–6 distinct SCENE SEGMENTS where the ambient environment changes.
   - First segment always starts at charIndex 0.
   - Each subsequent segment marks where a new environment begins (e.g. moving from forest to castle).
   - If the whole chapter stays in one environment, output exactly 1 segment.
   - For each segment write ENGLISH search queries describing what that scene SOUNDS like.
     Be specific and concrete: "quiet forest at dusk with distant owl hooting" is better than "nature".
     Write 3–6 search queries per segment.

2. Identify short, discrete SOUND EFFECTS (SFX) that occur as one-shot events in the chapter.
   - SFX are short sounds (1–10 seconds): door slamming, footsteps, glass breaking, thunder, owl hooting, etc.
   - For each SFX event, find the CHARACTER INDEX (0-based) in the chapter text where that sound naturally occurs.
   - Include as many SFX events as the text naturally warrants.
     Only include events where the text CLEARLY describes a specific sound-producing action.
     No SFX is better than a poorly matched SFX.

3. Extract chapter-level metadata: time of day, weather, mood, sound elements, intensity.

Book genre: ${bookInfo.genre}
Book tone: ${bookInfo.tone}
Book period: ${bookInfo.period}

Chapter text (character count: ${chapterText.length}):
---
${chapterText}
---

Respond with a JSON object (no markdown, no code fences) with these exact fields:
{
  "timeOfDay": "time of day (e.g. 'night', 'dawn', 'midday', 'dusk', 'unknown')",
  "weather": "weather if relevant (e.g. 'rain', 'storm', 'snow', 'clear', 'none')",
  "moods": ["dominant", "mood", "descriptors", "for", "chapter"],
  "soundElements": ["specific", "sounds", "mentioned", "in", "the", "text"],
  "intensity": 0.5,
  "sceneSegments": [
    {
      "charIndex": 0,
      "environment": "primary setting in English (e.g. 'dense forest', 'medieval castle interior', 'busy city street')",
      "searchSnippets": ["English search query describing ambient sound of this scene", "another English query"],
      "moods": ["mood", "descriptors", "for", "this", "segment"]
    }
  ],
  "sfxEvents": [
    {
      "query": "English search query for SFX catalog (e.g. 'wooden door slamming shut')",
      "charIndex": 1234,
      "description": "brief description of the sound event"
    }
  ]
}

ALL fields must be in ENGLISH regardless of the chapter text language.
- timeOfDay: when the scene takes place
- weather: relevant weather or "none"
- moods: 2–4 mood words for the dominant chapter atmosphere
- soundElements: 3–6 specific sounds mentioned or implied in the text
- intensity: 0.0 (very quiet/calm) to 1.0 (very loud/intense)
- sceneSegments: 1–6 ordered scene objects. FIRST MUST HAVE charIndex=0.
    charIndex: 0-based character offset in the chapter text where this scene BEGINS. Must be strictly increasing.
    environment: dominant physical setting in English.
    searchSnippets: 3–6 ENGLISH queries describing what this environment SOUNDS like.
    moods: 2–3 mood words for this segment.
- sfxEvents: objects, each with:
    query: ENGLISH search query for the SFX catalog (short, concrete)
    charIndex: integer — 0-based character offset where this sound occurs. Must be >= 0 and <= ${chapterText.length}.
    description: short English description of why the sound occurs.
  Use empty array [] if no clear SFX events exist in the text.`;

  const responseText = await callGemini(prompt);

  try {
    const parsed = JSON.parse(responseText);
    const textLen = chapterText.length;

    // Parse sceneSegments
    let sceneSegments: SceneSegment[] = [];
    if (Array.isArray(parsed.sceneSegments) && parsed.sceneSegments.length > 0) {
      sceneSegments = parsed.sceneSegments
        .filter((s: unknown) =>
          s != null &&
          typeof (s as any).environment === 'string' &&
          Array.isArray((s as any).searchSnippets) &&
          (s as any).searchSnippets.length > 0
        )
        .map((s: any) => ({
          charIndex: typeof s.charIndex === 'number' ? Math.max(0, Math.min(Math.round(s.charIndex), textLen - 1)) : 0,
          environment: String(s.environment).trim() || 'unknown',
          searchSnippets: (s.searchSnippets as unknown[])
            .filter((q) => typeof q === 'string' && (q as string).trim().length > 0)
            .map((q) => (q as string).trim()),
          moods: Array.isArray(s.moods) ? s.moods.filter((m: unknown) => typeof m === 'string') : [],
        }));

      // Ensure charIndexes are strictly increasing; first must be 0
      if (sceneSegments.length > 0) {
        sceneSegments[0].charIndex = 0;
        for (let i = 1; i < sceneSegments.length; i++) {
          if (sceneSegments[i].charIndex <= sceneSegments[i - 1].charIndex) {
            sceneSegments[i].charIndex = sceneSegments[i - 1].charIndex + 1;
          }
        }
      }
    }

    // Fallback: if no sceneSegments, synthesise one from top-level fields
    if (sceneSegments.length === 0) {
      const snippets: string[] = [];
      if (Array.isArray(parsed.searchSnippets)) {
        snippets.push(...parsed.searchSnippets.filter((s: unknown) => typeof s === 'string' && (s as string).trim()));
      }
      if (snippets.length === 0 && Array.isArray(parsed.soundElements) && parsed.soundElements.length > 0) {
        snippets.push(parsed.soundElements.join(', '));
      }
      sceneSegments = [{
        charIndex: 0,
        environment: typeof parsed.environment === 'string' ? parsed.environment.trim() : 'unknown',
        searchSnippets: snippets.length > 0 ? snippets : [`${bookInfo.genre} ${bookInfo.tone} ambient background`],
        moods: Array.isArray(parsed.moods) ? parsed.moods : [],
      }];
    }

    // Parse sfxEvents
    let sfxEvents: import('./types.js').SfxEvent[] = [];
    if (Array.isArray(parsed.sfxEvents)) {
      sfxEvents = parsed.sfxEvents
        .filter((e: unknown) =>
          e != null &&
          typeof (e as any).query === 'string' && (e as any).query.trim().length > 0 &&
          typeof (e as any).charIndex === 'number'
        )
        .map((e: any) => ({
          query: String(e.query).trim(),
          charIndex: Math.max(0, Math.min(Math.round(e.charIndex), textLen - 1)),
          description: typeof e.description === 'string' ? e.description.trim() : e.query.trim(),
        }));
    }

    return {
      chapterIndex,
      timeOfDay: parsed.timeOfDay || 'unknown',
      weather: parsed.weather || 'none',
      moods: Array.isArray(parsed.moods) ? parsed.moods : [],
      soundElements: Array.isArray(parsed.soundElements) ? parsed.soundElements : [],
      intensity: typeof parsed.intensity === 'number' ? Math.max(0, Math.min(1, parsed.intensity)) : 0.5,
      sceneSegments,
      sfxEvents,
    };
  } catch (parseError) {
    console.warn(`⚠️ Failed to parse scene analysis for chapter ${chapterIndex}, using fallback`);
    return buildFallbackScene(chapterIndex, chapterText, bookInfo);
  }
}

/**
 * Analyze all chapters in batch. Processes sequentially to avoid rate limits,
 * but could be parallelized with a semaphore if needed.
 *
 * @param chapters - Array of { index, text } for each chapter
 * @param bookInfo - Book metadata for context
 * @param onProgress - Optional progress callback
 */
export async function analyzeAllChapters(
  chapters: Array<{ index: number; text: string }>,
  bookInfo: BookInfo,
  onProgress?: (current: number, total: number) => void
): Promise<SceneAnalysis[]> {
  const results: SceneAnalysis[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    if (onProgress) onProgress(i + 1, chapters.length);

    try {
      console.log(`🎬 Analyzing scene for chapter ${ch.index}...`);
      const scene = await analyzeChapterScene(ch.index, ch.text, bookInfo);
      results.push(scene);
      console.log(`  ✓ ${scene.sceneSegments[0]?.environment ?? 'unknown'} | ${scene.timeOfDay} | ${scene.weather} | intensity=${scene.intensity} | segments=${scene.sceneSegments.length}`);
    } catch (err) {
      console.warn(`⚠️ Scene analysis failed for chapter ${ch.index}, using fallback:`, err);
      results.push(buildFallbackScene(ch.index, ch.text, bookInfo));
    }

    // Small delay between chapters to be polite to the API
    if (i < chapters.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}

// ========================================
// Fallback (keyword-based)
// ========================================

/**
 * Build a SceneAnalysis from simple keyword matching.
 * Used when LLM fails or for testing without API calls.
 */
export function buildFallbackScene(
  chapterIndex: number,
  chapterText: string,
  bookInfo: BookInfo
): SceneAnalysis {
  console.warn(`⚠️ buildFallbackScene() activated for chapter ${chapterIndex} — LLM scene analysis failed, using keyword-based fallback`);
  const lower = chapterText.toLowerCase();
  const soundElements: string[] = [];
  let environment = 'interior';

  // Simple keyword detection
  const detections: Array<{ keyword: string; env: string; sound: string }> = [
    { keyword: 'forest', env: 'forest', sound: 'forest ambience' },
    { keyword: 'woods', env: 'forest', sound: 'forest ambience' },
    { keyword: 'rain', env: environment, sound: 'rain' },
    { keyword: 'thunder', env: environment, sound: 'thunder' },
    { keyword: 'storm', env: environment, sound: 'storm' },
    { keyword: 'ocean', env: 'ocean shore', sound: 'ocean waves' },
    { keyword: 'sea', env: 'coastal', sound: 'ocean waves' },
    { keyword: 'river', env: 'riverside', sound: 'flowing water' },
    { keyword: 'fire', env: environment, sound: 'crackling fire' },
    { keyword: 'horse', env: 'outdoors', sound: 'horse hooves' },
    { keyword: 'bird', env: 'outdoors', sound: 'birds' },
    { keyword: 'wind', env: 'outdoors', sound: 'wind' },
    { keyword: 'city', env: 'city', sound: 'city ambience' },
    { keyword: 'street', env: 'city street', sound: 'street sounds' },
    { keyword: 'castle', env: 'castle interior', sound: 'stone echoes' },
    { keyword: 'cave', env: 'cave', sound: 'cave dripping' },
    { keyword: 'night', env: environment, sound: 'night ambience' },
    { keyword: 'church', env: 'church', sound: 'church bells' },
  ];

  for (const d of detections) {
    if (lower.includes(d.keyword)) {
      environment = d.env;
      soundElements.push(d.sound);
    }
  }

  const elements = soundElements.slice(0, 5);
  const searchSnippets = elements.length > 0
    ? [`${environment} ambient with ${elements.join(', ')}`]
    : [`${bookInfo.genre} ${bookInfo.tone} ambient background`];

  const moods = [bookInfo.tone || 'neutral'];

  return {
    chapterIndex,
    timeOfDay: lower.includes('night') || lower.includes('midnight') ? 'night' : 'unknown',
    weather: lower.includes('rain') ? 'rain' : lower.includes('storm') ? 'storm' : 'none',
    moods,
    soundElements: elements,
    intensity: 0.5,
    sceneSegments: [{
      charIndex: 0,
      environment,
      searchSnippets,
      moods,
    }],
    sfxEvents: [], // No SFX events in fallback mode (no charIndex data available)
  };
}
