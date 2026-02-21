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
import type { SceneAnalysis, BookInfo } from './types.js';

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
1. Determine the ambient environment, time of day, weather, mood, and intensity.
2. Write ENGLISH search queries that describe the ambient soundscape of the chapter's setting.
   - These queries will be used to search an English-language sound effects catalog.
   - Write each query as a natural English description of what the scene SOUNDS like.
   - Focus on: room tone, environmental ambience, weather sounds, nature sounds, urban/rural atmosphere, mechanical sounds, crowd noise, silence.
   - Be specific and concrete: "quiet suburban living room with distant traffic" is better than "indoor scene".
   - Write 3-8 search queries, each 1-2 sentences, covering different sound aspects of the scene.
3. Identify short, discrete SOUND EFFECTS (SFX) that occur as one-shot events in the chapter.
   - SFX are short sounds (1-10 seconds): door slamming, footsteps, glass breaking, clock ticking, owl hooting, etc.
   - Write 0-4 English search queries describing specific SFX heard in the scene.
   - Only include SFX if the text clearly describes specific sound-producing actions or events.

Book genre: ${bookInfo.genre}
Book tone: ${bookInfo.tone}
Book period: ${bookInfo.period}

Chapter text:
---
${chapterText}
---

Respond with a JSON object (no markdown, no code fences) with these exact fields:
{
  "environment": "primary setting (e.g. 'dense forest', 'medieval castle interior', 'busy city street', 'quiet bedroom')",
  "timeOfDay": "time of day (e.g. 'night', 'dawn', 'midday', 'dusk', 'unknown')",
  "weather": "weather if relevant (e.g. 'rain', 'storm', 'snow', 'clear', 'none')",
  "moods": ["array", "of", "mood", "descriptors"],
  "soundElements": ["specific", "sounds", "mentioned", "in", "the", "text"],
  "intensity": 0.5,
  "searchSnippets": ["English search query describing ambient sound of the scene", "another English search query"],
  "sfxQueries": ["English search query describing a specific short sound effect", "another SFX query"]
}

ALL fields must be in ENGLISH regardless of the chapter text language.
- environment: the dominant physical setting (in English)
- timeOfDay: when the scene takes place
- weather: relevant weather or "none"
- moods: 2-4 mood words in English (e.g. "tense", "peaceful", "eerie", "melancholic")
- soundElements: 3-6 specific sounds mentioned or implied, in English (e.g. "crackling fire", "horse hooves", "wind")
- intensity: 0.0 (very quiet/calm) to 1.0 (very loud/intense)
- searchSnippets: array of 3-8 ENGLISH search queries describing what the scene sounds like. These are used to find matching ambient recordings. Be specific: include the environment type, key sounds, and atmosphere. Example: "Interior room tone from a quiet suburban house with distant traffic and muffled television sounds".
- sfxQueries: array of 0-4 ENGLISH search queries for short one-shot sound effects. These match against SFX catalog items like door sounds, footsteps, mechanical clicks, animal calls. Example: "owl hooting at night in the distance". Use empty array [] if no clear SFX events in the text.`;

  const responseText = await callGemini(prompt);

  try {
    const parsed = JSON.parse(responseText);

    // Ensure searchSnippets is a non-empty string array
    let snippets: string[] = [];
    if (Array.isArray(parsed.searchSnippets)) {
      snippets = parsed.searchSnippets
        .filter((s: unknown) => typeof s === 'string' && s.trim().length > 0)
        .map((s: string) => s.trim());
    }
    // Fallback: if LLM returned old searchQuery format, use it as a single snippet
    if (snippets.length === 0 && typeof parsed.searchQuery === 'string' && parsed.searchQuery.trim()) {
      snippets = [parsed.searchQuery.trim()];
    }
    // Last resort: use soundElements joined
    if (snippets.length === 0 && Array.isArray(parsed.soundElements) && parsed.soundElements.length > 0) {
      snippets = [parsed.soundElements.join(', ')];
    }

    // Parse SFX queries
    let sfxQueries: string[] = [];
    if (Array.isArray(parsed.sfxQueries)) {
      sfxQueries = parsed.sfxQueries
        .filter((s: unknown) => typeof s === 'string' && s.trim().length > 0)
        .map((s: string) => s.trim());
    }

    return {
      chapterIndex,
      environment: parsed.environment || 'unknown',
      timeOfDay: parsed.timeOfDay || 'unknown',
      weather: parsed.weather || 'none',
      moods: Array.isArray(parsed.moods) ? parsed.moods : [],
      soundElements: Array.isArray(parsed.soundElements) ? parsed.soundElements : [],
      intensity: typeof parsed.intensity === 'number' ? Math.max(0, Math.min(1, parsed.intensity)) : 0.5,
      searchSnippets: snippets,
      sfxQueries,
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
      console.log(`  ✓ ${scene.environment} | ${scene.timeOfDay} | ${scene.weather} | intensity=${scene.intensity}`);
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

  // Limit to 5 sound elements
  const elements = soundElements.slice(0, 5);

  // Build English search queries from detected elements
  const searchSnippets = elements.length > 0
    ? [`${environment} ambient with ${elements.join(', ')}`]
    : [`${bookInfo.genre} ${bookInfo.tone} ambient background`];

  return {
    chapterIndex,
    environment,
    timeOfDay: lower.includes('night') || lower.includes('midnight') ? 'night' : 'unknown',
    weather: lower.includes('rain') ? 'rain' : lower.includes('storm') ? 'storm' : 'none',
    moods: [bookInfo.tone || 'neutral'],
    soundElements: elements,
    intensity: 0.5,
    searchSnippets,
    sfxQueries: [], // No SFX in fallback mode
  };
}
