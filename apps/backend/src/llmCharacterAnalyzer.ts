/**
 * LLM Character Analyzer - Phase 2 Implementation
 * 
 * Integrates Gemini 2.5 Flash for sophisticated character analysis and dramatization
 * 
 * Features:
 * - Full book character extraction (1M token context)
 * - Progressive chapter-by-chapter dialogue tagging
 * - Intelligent voice-to-character matching
 * - Caching for instant replay
 */

import { GoogleAuth } from 'google-auth-library';
import { cleanText, CleaningConfig } from './textCleaner.js';

/**
 * Detailed character profile with personality traits
 * 
 * Phase 2: Extracted by LLM from full book context
 */
export interface CharacterProfile {
  /** Character's name as it appears in the book */
  name: string;
  
  /** Inferred biological gender */
  gender: 'male' | 'female' | 'neutral' | 'unknown';
  
  /** Personality and voice characteristics
   * Examples: ["calm", "mature", "deep voice", "energetic", "child-like"]
   * TODO Phase 2: Extract from LLM analysis
   */
  traits: string[];
  
  /** Suggested Gemini TTS voice name
   * TODO Phase 2: Smart matching based on traits + gender
   * Examples: "Algieba" (male, deep), "Zephyr" (female, young)
   */
  suggestedVoice?: string;
  
  /** Estimated age range
   * TODO Phase 2: Infer from context and descriptions
   * Examples: "child", "young adult", "adult", "elderly"
   */
  ageRange?: string;
  
  /** Character importance/role
   * TODO Phase 2: Determine from appearance frequency and plot significance
   * Examples: "protagonist", "antagonist", "supporting", "minor"
   */
  role?: string;
  
  /** Number of dialogue lines in book */
  dialogueCount?: number;
}

/**
 * Configuration for Gemini LLM client
 */
export interface GeminiConfig {
  projectId: string;
  location: string; // e.g., 'us-central1'
  model?: string; // Default: 'gemini-2.5-flash-002'
}

/**
 * LLM-based character analyzer interface
 */
export interface LlmCharacterAnalyzer {
  /**
   * Analyzes full book text to extract character profiles
   * 
   * TODO Phase 2 Implementation:
   * 1. Send full book text to Gemini 2.5 Flash
   * 2. Use structured prompt for character extraction:
   *    - Identify all speaking characters
   *    - Extract personality traits from dialogue and descriptions
   *    - Infer age, gender, role
   *    - Suggest appropriate voice characteristics
   * 3. Parse LLM response into CharacterProfile[]
   * 
   * Cost estimate: ~$0.10-0.50 per book (depending on length)
   * Time estimate: ~10-30s for full book analysis
   * 
   * @param text - Full book text (up to ~250k-1M tokens)
   * @returns Array of detailed character profiles
   */
  analyzeFullBook(text: string): Promise<CharacterProfile[]>;
  
  /**
   * Refines dialogue detection beyond PoC heuristics
   * 
   * TODO Phase 2 Implementation:
   * Use LLM to:
   * - Detect complex dialogue patterns (nested quotes, implied speech)
   * - Handle unconventional formatting (stream-of-consciousness, etc.)
   * - Attribute dialogues with ambiguous speakers
   * - Identify internal monologues vs. spoken dialogue
   * 
   * @param text - Text segment to analyze
   * @returns Refined dialogue segments with confident speaker attribution
   */
  refineDialogueDetection(text: string): Promise<Array<{
    type: 'dialogue' | 'narrator' | 'internal_monologue';
    speaker: string;
    text: string;
    confidence: number; // 0.0-1.0
  }>>;
  
  /**
   * Assigns optimal Gemini TTS voice based on character profile
   * 
   * TODO Phase 2 Implementation:
   * Smart matching algorithm:
   * 1. Gender → Filter voice list (male/female)
   * 2. Age range → Prefer age-appropriate voices
   * 3. Traits → Match voice characteristics:
   *    - "calm", "mature" → Deeper, slower voices
   *    - "energetic", "young" → Higher, faster voices
   *    - "authoritative" → Strong, clear voices
   * 4. Role → Assign distinctive voices to main characters
   * 
   * Voice examples:
   * - Male deep: Algieba, Alnilam, Rasalgethi
   * - Male energetic: Puck, Charon, Umbriel
   * - Female mature: Achernar, Sulafat, Vindemiatrix
   * - Female young: Zephyr, Aoede, Leda
   * 
   * @param profile - Character profile from analyzeFullBook()
   * @returns Gemini voice name (e.g., "Algieba")
   */
  assignOptimalVoice(profile: CharacterProfile): string;
  
  /**
   * Validates voice assignments for diversity and clarity
   * 
   * TODO Phase 2 Implementation:
   * Ensure:
   * - Main characters have distinctive voices
   * - No similar-sounding voices for characters in same scenes
   * - Narrator voice contrasts with character voices
   * - Gender-appropriate voices (unless intentionally subverted)
   * 
   * @param profiles - All character profiles with assigned voices
   * @returns Validation report with warnings and suggestions
   */
  validateVoiceAssignments(profiles: CharacterProfile[]): {
    valid: boolean;
    warnings: string[];
    suggestions: string[];
  };
}

/**
 * Gemini Character Analyzer - Full Implementation
 * 
 * Uses Vertex AI Gemini 2.5 Flash for character extraction and dialogue tagging
 */
export class GeminiCharacterAnalyzer implements LlmCharacterAnalyzer {
  private projectId: string;
  private location: string;
  private model: string = 'gemini-2.0-flash-exp'; // Latest flash model
  private auth: GoogleAuth;
  private endpoint: string;
  
  constructor(config: GeminiConfig) {
    this.projectId = config.projectId;
    this.location = config.location || 'us-central1';
    this.model = config.model || 'gemini-2.0-flash-exp';
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
    const accessToken = await client.getAccessToken();
    
    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }
    
    const requestBody = {
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.1, // Low temperature for consistent output
        maxOutputTokens: 8192,
        topP: 0.95,
      }
    };
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Gemini API error: ${response.status} - ${error}`);
        }
        
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
          throw new Error('No text in Gemini response');
        }
        
        return text;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
    
    throw new Error('Failed to call Gemini after retries');
  }
  
  /**
   * Analyzes full book text to extract character profiles
   */
  async analyzeFullBook(text: string): Promise<CharacterProfile[]> {
    console.log(`🔍 Analyzing book for characters (${(text.length / 1000).toFixed(0)}k chars)...`);
    
    // Clean text first
    const cleanedResult = cleanText(text, {
      removePageNumbers: true,
      removeTableOfContents: true,
      removeEditorialNotes: true,
      removePublisherInfo: true,
      removeHeadersFooters: true,
      preserveCopyright: true,
      preserveAuthor: true,
      aggressive: false,
    });
    
    const cleanedText = cleanedResult.cleanedText;
    console.log(`  Cleaned text: ${(cleanedResult.bytesRemoved / 1000).toFixed(0)}k removed`);
    
    const prompt = `You are an expert literary analyst. Analyze this book and extract information about ALL characters who speak dialogue.

IMPORTANT RULES:
1. Include ONLY characters who speak dialogue (have quoted speech)
2. Minimum 3 dialogue lines to qualify as a character
3. Maximum 10 characters total (prioritize main/important characters)
4. Always include NARRATOR as first character
5. Use character names exactly as they appear in the book

For each character, provide:
- name: Exact name from book (or "NARRATOR" for narration)
- gender: "male", "female", or "neutral"
- traits: Array of 2-4 personality traits from context (e.g., ["calm", "mature", "wise"])
- ageRange: "child", "young adult", "adult", or "elderly"
- role: "protagonist", "antagonist", "supporting", or "minor"
- dialogueCount: Approximate number of dialogue lines

Return ONLY a valid JSON array with NO additional text or markdown:
[{"name": "NARRATOR", "gender": "neutral", "traits": [...], ...}, ...]

Book text:
${cleanedText.substring(0, 250000)}`;
    
    try {
      const response = await this.callGemini(prompt);
      
      // Extract JSON from response (handle markdown code blocks)
      let jsonText = response.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```json?\s*/, '').replace(/\s*```$/, '');
      }
      
      const characters: CharacterProfile[] = JSON.parse(jsonText);
      
      console.log(`  ✅ Found ${characters.length} characters: ${characters.map(c => c.name).join(', ')}`);
      
      return characters;
    } catch (error) {
      console.error('❌ Character analysis failed:', error);
      
      // Fallback: Return just narrator
      return [{
        name: 'NARRATOR',
        gender: 'neutral',
        traits: ['clear', 'neutral'],
        ageRange: 'adult',
        role: 'supporting',
        dialogueCount: 0,
      }];
    }
  }
  
  /**
   * Tag a single chapter with voice tags
   */
  async tagChapterWithVoices(chapterText: string, characters: CharacterProfile[]): Promise<string> {
    console.log(`  🏷️  Tagging chapter (${(chapterText.length / 1000).toFixed(1)}k chars)...`);
    
    const characterList = characters
      .filter(c => c.name !== 'NARRATOR')
      .map(c => `- ${c.name} (${c.gender})`)
      .join('\n');
    
    const prompt = `You are tagging text for text-to-speech dramatization. Add [VOICE=CHARACTER] tags before each dialogue and narration segment.

CHARACTERS IN THIS BOOK:
${characterList}

RULES:
1. Use [VOICE=NARRATOR] for all narration (non-dialogue text)
2. Use [VOICE=CHARACTER_NAME] before each character's dialogue
3. Character names must match EXACTLY from the list above
4. Include ALL original text - do not remove or summarize anything
5. Split text into segments by speaker (narrator vs characters)
6. Use UPPERCASE for character names in tags

EXAMPLE INPUT:
The old man smiled. "Hello there," he said softly. She looked up. "Who are you?"

EXAMPLE OUTPUT:
[VOICE=NARRATOR]
The old man smiled.
[VOICE=OLD_MAN]
"Hello there," he said softly.
[VOICE=NARRATOR]
She looked up.
[VOICE=WOMAN]
"Who are you?"

Now tag this chapter text:

${chapterText}`;
    
    try {
      const taggedText = await this.callGemini(prompt);
      
      // Clean up response (remove markdown if present)
      let cleaned = taggedText.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```[a-z]*\s*/, '').replace(/\s*```$/, '');
      }
      
      console.log(`  ✅ Chapter tagged`);
      return cleaned;
    } catch (error) {
      console.error('  ❌ Chapter tagging failed:', error);
      // Fallback: Return original text with NARRATOR tag
      return `[VOICE=NARRATOR]\n${chapterText}`;
    }
  }
  
  /**
   * Assign optimal voice based on character profile
   * NOT NEEDED in current implementation - Voice assignment handled by separate module
   */
  assignOptimalVoice(profile: CharacterProfile): string {
    throw new Error('Use voice assignment module instead');
  }
  
  /**
   * Validate voice assignments
   * NOT NEEDED in current implementation
   */
  validateVoiceAssignments(profiles: CharacterProfile[]): {
    valid: boolean;
    warnings: string[];
    suggestions: string[];
  } {
    throw new Error('Use voice assignment module instead');
  }
}

/**
 * Example usage (for Phase 2 development):
 * 
 * ```typescript
 * const analyzer = new GeminiCharacterAnalyzer({
 *   projectId: 'your-project-id',
 *   location: 'us-central1',
 * });
 * 
 * const bookText = fs.readFileSync('book.txt', 'utf-8');
 * const characters = await analyzer.analyzeFullBook(bookText);
 * 
 * for (const character of characters) {
 *   const voice = analyzer.assignOptimalVoice(character);
 *   console.log(`${character.name}: ${voice} (${character.gender}, ${character.traits.join(', ')})`);
 * }
 * 
 * const validation = analyzer.validateVoiceAssignments(characters);
 * if (!validation.valid) {
 *   console.warn('Voice assignment warnings:', validation.warnings);
 * }
 * ```
 */

/**
 * Gemini Voice Reference (for Phase 2 voice assignment)
 * 
 * Male Voices (16):
 * - Deep/Mature: Algieba, Alnilam, Rasalgethi, Schedar
 * - Medium: Achird, Algenib, Charon, Iapetus, Orus, Sadachbia, Sadaltager
 * - Energetic/Young: Puck, Umbriel, Enceladus, Fenrir, Zubenelgenubi
 * 
 * Female Voices (14):
 * - Mature/Authoritative: Achernar, Sulafat, Vindemiatrix, Gacrux
 * - Medium: Autonoe, Callirrhoe, Despina, Erinome, Kore, Laomedeia
 * - Young/Energetic: Zephyr, Aoede, Leda, Pulcherrima
 * 
 * This classification is approximate and should be refined
 * through empirical testing in Phase 2.
 */
