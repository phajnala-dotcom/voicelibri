/**
 * Soundscape Module — LLM Director
 *
 * Uses Gemini 2.0 Flash to analyze chapter text and produce
 * SceneAnalysis objects for ambient asset matching.
 *
 * The Director reads each chapter's text and determines:
 *   - Primary environment (forest, castle, city, etc.)
 *   - Time of day, weather, mood
 *   - Specific sound elements mentioned
 *   - A natural language searchQuery for embedding search
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

// ========================================
// Scene analysis
// ========================================

/** Maximum text length to send per chapter (characters) */
const MAX_CHAPTER_TEXT = 8000;

/**
 * Truncate chapter text to a reasonable size for scene analysis.
 * Takes the beginning and end (most scene-representative parts).
 */
function truncateForAnalysis(text: string): string {
  if (text.length <= MAX_CHAPTER_TEXT) return text;

  const halfLen = Math.floor(MAX_CHAPTER_TEXT / 2);
  const start = text.substring(0, halfLen);
  const end = text.substring(text.length - halfLen);
  return `${start}\n\n[...middle of chapter omitted...]\n\n${end}`;
}

/**
 * Analyze a single chapter's text to produce a SceneAnalysis.
 */
export async function analyzeChapterScene(
  chapterIndex: number,
  chapterText: string,
  bookInfo: BookInfo
): Promise<SceneAnalysis> {
  const truncated = truncateForAnalysis(chapterText);

  const prompt = `You are a sound designer for audiobooks. Analyze this chapter text and determine what ambient sounds and atmosphere would enhance the listening experience.

Book genre: ${bookInfo.genre}
Book tone: ${bookInfo.tone}
Book period: ${bookInfo.period}

Chapter text:
---
${truncated}
---

Respond with a JSON object (no markdown, no code fences) with these exact fields:
{
  "environment": "primary setting (e.g. 'dense forest', 'medieval castle interior', 'busy city street', 'quiet bedroom')",
  "timeOfDay": "time of day (e.g. 'night', 'dawn', 'midday', 'dusk', 'unknown')",
  "weather": "weather if relevant (e.g. 'rain', 'storm', 'snow', 'clear', 'none')",
  "moods": ["array", "of", "mood", "descriptors"],
  "soundElements": ["specific", "sounds", "mentioned", "in", "the", "text"],
  "intensity": 0.5,
  "searchQuery": "a natural language query for finding the best ambient sound effect, e.g. 'forest with birds and distant stream at dawn'"
}

- environment: the dominant physical setting
- timeOfDay: when the scene takes place
- weather: relevant weather or "none"
- moods: 2-4 mood words (e.g. "tense", "peaceful", "eerie", "melancholic")
- soundElements: 3-6 specific sounds mentioned or implied (e.g. "crackling fire", "horse hooves", "wind")
- intensity: 0.0 (very quiet/calm) to 1.0 (very loud/intense)
- searchQuery: 1-2 sentence natural language description of ideal ambient sound`;

  const responseText = await callGemini(prompt);

  try {
    const parsed = JSON.parse(responseText);
    return {
      chapterIndex,
      environment: parsed.environment || 'unknown',
      timeOfDay: parsed.timeOfDay || 'unknown',
      weather: parsed.weather || 'none',
      moods: Array.isArray(parsed.moods) ? parsed.moods : [],
      soundElements: Array.isArray(parsed.soundElements) ? parsed.soundElements : [],
      intensity: typeof parsed.intensity === 'number' ? Math.max(0, Math.min(1, parsed.intensity)) : 0.5,
      searchQuery: parsed.searchQuery || `${parsed.environment} ambient sound`,
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

  // Build search query from what we found
  const searchQuery = elements.length > 0
    ? `${environment} with ${elements.join(' and ')}`
    : `${bookInfo.genre} ${bookInfo.tone} ambient background`;

  return {
    chapterIndex,
    environment,
    timeOfDay: lower.includes('night') || lower.includes('midnight') ? 'night' : 'unknown',
    weather: lower.includes('rain') ? 'rain' : lower.includes('storm') ? 'storm' : 'none',
    moods: [bookInfo.tone || 'neutral'],
    soundElements: elements,
    intensity: 0.5,
    searchQuery,
  };
}
