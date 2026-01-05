/**
 * Chapter Translator - Translates ebook chapters to target language
 * 
 * Uses Gemini 2.5 Flash for high-quality literary translation
 * Preserves character names exactly as specified
 */

import { GoogleAuth } from 'google-auth-library';
import { GeminiConfig } from './llmCharacterAnalyzer.js';

/**
 * Translation result interface
 */
export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  characterNamesPreserved: string[];
}

/**
 * Language display names for logging
 */
const LANGUAGE_NAMES: Record<string, string> = {
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  'sk-SK': 'Slovak',
  'cs-CZ': 'Czech',
  'ru-RU': 'Russian',
  'de-DE': 'German',
  'pl-PL': 'Polish',
  'hr-HR': 'Croatian',
};

/**
 * Get display name for language code
 */
export function getLanguageDisplayName(langCode: string): string {
  return LANGUAGE_NAMES[langCode] || langCode;
}

/**
 * Chapter Translator class using Gemini API
 */
export class ChapterTranslator {
  private projectId: string;
  private location: string;
  private model: string = 'gemini-2.5-flash';
  private auth: GoogleAuth;
  private endpoint: string;

  constructor(config: GeminiConfig) {
    this.projectId = config.projectId;
    this.location = config.location || 'us-central1';
    this.model = config.model || 'gemini-2.5-flash';
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}:generateContent`;
  }

  /**
   * Call Gemini API with retry logic
   */
  private async callGemini(prompt: string, maxRetries: number = 2): Promise<string> {
    const client = await this.auth.getClient();
    const token = await client.getAccessToken();

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3, // Lower temp for more consistent translations
        maxOutputTokens: 65536, // Large enough for chapter translations
        topP: 0.95,
      },
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>;
            };
          }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
          throw new Error('No text in Gemini response');
        }

        return text.trim();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.warn(`Translation API retry ${attempt + 1}/${maxRetries} after ${delay}ms:`, lastError.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Translation failed after retries');
  }

  /**
   * Translate a chapter to target language
   * LLM auto-detects the source language
   * 
   * NOTE: With per-chapter character extraction, we no longer need to preserve
   * character names during translation. Names will be extracted from the 
   * translated text and properly associated via alias detection.
   * 
   * @param chapterText - Original chapter text
   * @param targetLanguage - Target language code (e.g., 'en-US', 'de-DE')
   * @returns Translation result with translated text
   */
  async translateChapter(
    chapterText: string,
    targetLanguage: string
  ): Promise<TranslationResult> {
    const targetLangName = getLanguageDisplayName(targetLanguage);
    
    console.log(`🌍 Translating chapter to ${targetLangName}...`);
    console.log(`   Source: auto-detected by LLM`);
    console.log(`   Text length: ${chapterText.length} chars`);

    const prompt = `You are a professional literary translator specializing in fiction.

TASK: Translate the following text to ${targetLangName}.

CRITICAL RULES:
1. Translate ALL text naturally, including character names and references.
   - "Stará paní" → "old woman" (natural English)
   - "pan Hawkins" → "Mr. Hawkins" (appropriate honorific)

2. Preserve dialogue formatting:
   - Keep quotation marks style consistent
   - Maintain paragraph breaks
   - Keep dialogue attribution natural in target language

3. Preserve the original tone, style, and literary quality of the text.

4. Return ONLY the translated text - no explanations, notes, or metadata.

TEXT TO TRANSLATE:
${chapterText}`;

    const startTime = Date.now();
    const translatedText = await this.callGemini(prompt);
    const elapsed = Date.now() - startTime;

    console.log(`   ✅ Translation complete in ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`   Output length: ${translatedText.length} chars`);

    return {
      translatedText,
      sourceLanguage: 'auto-detected',
      targetLanguage,
      characterNamesPreserved: [], // No longer needed with per-chapter extraction
    };
  }
}

/**
 * Check if translation is needed
 * Simply checks if a target language is specified
 * LLM will auto-detect the source language
 * 
 * @param targetLanguage - User-selected target language (or null/undefined)
 * @returns true if translation should be performed
 */
export function needsTranslation(targetLanguage: string | null | undefined): boolean {
  return !!targetLanguage;
}
