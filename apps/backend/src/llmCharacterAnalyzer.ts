/**
 * LLM Character Analyzer - Parallel Pipeline Implementation
 * 
 * Integrates Gemini 2.5 Flash for sophisticated character analysis and dramatization
 * 
 * Features:
 * - TWO-PHASE character extraction for fast startup:
 *   Phase 1 (BLOCKING): First 3 chapters → full character DB → assign voices → LOCK
 *   Phase 2 (PARALLEL): Background enrichment from remaining chapters
 * - Progressive chapter-by-chapter dialogue tagging
 * - Intelligent voice-to-character matching
 * - Caching for instant replay
 */

import { GoogleAuth } from 'google-auth-library';
import { cleanText, CleaningConfig } from './textCleaner.js';
import { Chapter } from './bookChunker.js';

/**
 * Convert a character name to valid TTS speaker alias
 * Rules per Gemini TTS official docs:
 * - ALL CAPS
 * - Alphanumeric only (A-Z, 0-9)
 * - No spaces, underscores, hyphens, dots, diacritics, emojis
 * - Multi-word names concatenated (e.g., "Joseph Ragowski" → "JOSEPHRAGOWSKI")
 */
export function toTTSSpeakerAlias(name: string): string {
  // Normalize diacritics (á→a, č→c, etc.)
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Remove all non-alphanumeric characters and convert to uppercase
  return normalized.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Result from initial character analysis (Phase 1)
 */
export interface InitialAnalysisResult {
  characters: CharacterProfile[];
  analyzedChapters: number;
  totalCharsAnalyzed: number;
  analysisTimeMs: number;
}

/**
 * Result from character enrichment (Phase 2)
 */
export interface EnrichmentResult {
  newCharacters: CharacterProfile[];
  enrichedCharacters: CharacterProfile[];  // Existing chars with updated info
  chapterIndex: number;
}

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
  
  /** Alternative names/aliases for this character
   * Used for consistent voice assignment across name variations
   * Examples: ["Mrs. Westenra", "old woman", "the widow"]
   */
  aliases?: string[];
  
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
  model?: string; // Default: LLM_MODEL env var or 'gemini-2.5-flash'
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
  private model: string = process.env.LLM_MODEL_CHARACTER || 'gemini-2.5-flash'; // Latest flash model
  private auth: GoogleAuth;
  private endpoint: string;
  
  constructor(config: GeminiConfig) {
    this.projectId = config.projectId;
    this.location = config.location || 'us-central1';
    this.model = config.model || process.env.LLM_MODEL_CHARACTER || 'gemini-2.5-flash';
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
        maxOutputTokens: 32768, // Increased to prevent JSON truncation for books with many characters
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
        
        const data: any = await response.json();
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
2. Minimum 1 dialogue line to qualify as a character (even a single line counts!)
3. Include ALL speaking characters - there is no maximum limit
4. Always include NARRATOR as first character
5. Use character names exactly as they appear in dialogue attributions (e.g., "said John", "poznamenala Lili")
6. Look for names after dialogue in attribution phrases like: "zvolal", "poznamenala", "řekl", "zavrčel"
7. Order characters by importance (most dialogue first)

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
      
      // Try to parse JSON, with recovery for truncated output
      let characters: CharacterProfile[];
      try {
        characters = JSON.parse(jsonText);
      } catch (parseError) {
        console.warn('  ⚠️ JSON parse failed, attempting recovery...');
        
        // Try to recover from truncated JSON
        // Find the last complete object before truncation
        const lastCompleteObjectEnd = jsonText.lastIndexOf('},');
        if (lastCompleteObjectEnd > 0) {
          const recovered = jsonText.substring(0, lastCompleteObjectEnd + 1) + ']';
          console.log(`  🔧 Attempting recovery with truncated JSON at position ${lastCompleteObjectEnd}`);
          try {
            characters = JSON.parse(recovered);
            console.log(`  ✅ Recovery successful! Found ${characters.length} characters`);
          } catch (recoveryError) {
            // Try simpler recovery - just find valid JSON array start/end
            const firstBracket = jsonText.indexOf('[');
            const lastValidEnd = jsonText.lastIndexOf('}]');
            if (firstBracket >= 0 && lastValidEnd > firstBracket) {
              const simpleRecovery = jsonText.substring(firstBracket, lastValidEnd + 2);
              characters = JSON.parse(simpleRecovery);
              console.log(`  ✅ Simple recovery successful! Found ${characters.length} characters`);
            } else {
              throw recoveryError;
            }
          }
        } else {
          // Can't recover - re-throw original error
          throw parseError;
        }
      }
      
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
   * Tag a single chapter with voice tags using Gemini TTS format
   */
  async tagChapterWithVoices(chapterText: string, characters: CharacterProfile[]): Promise<string> {
    console.log(`  🏷️  Tagging chapter (${(chapterText.length / 1000).toFixed(1)}k chars)...`);
    
    // Convert character names to valid TTS aliases (ALLCAPS, alphanumeric only)
    const characterAliases = characters
      .map(c => {
        const alias = toTTSSpeakerAlias(c.name);
        return `- ${alias} (original: ${c.name}, ${c.gender})`;
      })
      .join('\n');
    
    const prompt = `You are tagging text for Gemini TTS multi-speaker synthesis. Format: SPEAKER: text on same line.

  SPEAKER ALIASES (use EXACTLY as shown):
  ${characterAliases}

  CRITICAL RULES - DIALOGUE VS NARRATOR:
  1. CHARACTER voice = ONLY the quoted speech itself (text inside „..." or "..." quotes)
  2. NARRATOR voice = EVERYTHING ELSE including:
     - Scene descriptions and actions
     - Dialogue ATTRIBUTION phrases ("said", "began", "whispered", "replied", "zvolal", "řekla")
     - Text AFTER the quote describing how it was said
     - Parenthetical or descriptive text before/after a quote
  3. ALWAYS SPLIT when a sentence has dialogue AND attribution - NEVER combine them!
  4. NEVER repeat quoted text in NARRATOR lines. The quote must appear only once, as the character.
  5. Consecutive narration sentences must be grouped into a single NARRATOR line unless interrupted by dialogue.

  SPEAKER ALIAS FORMAT:
  - ALL CAPS, alphanumeric only (A-Z, 0-9)
  - NO spaces, underscores, or diacritics
  - Use aliases from list above EXACTLY

  OUTPUT: Each line = SPEAKER: text (one speaker per line)

  EXAMPLES - English:

  EXAMPLE 1 - Quote with attribution and parenthesis:
  INPUT: Mrs. Dursley had a perfectly nice, ordinary day. Over dinner, she told her husband about the neighbour's wife's problems with her daughter, and about Dudley learning a new word ("I won't!").
  CORRECT OUTPUT:
  NARRATOR: Mrs. Dursley had a perfectly nice, ordinary day. Over dinner, she told her husband about the neighbour's wife's problems with her daughter, and about Dudley learning a new word (
  DUDLEY: "I won't!"
  NARRATOR: ).

  EXAMPLE 2 - Quote with attribution MUST be split:
  INPUT: "Well," began the second presenter, "I don't know about that."
  CORRECT OUTPUT:
  THESECONDPRESENTER: "Well,"
  NARRATOR: began the second presenter,
  THESECONDPRESENTER: "I don't know about that."

  EXAMPLE 3 - Attribution before quote:
  INPUT: John said, "Hello there!"
  CORRECT OUTPUT:
  NARRATOR: John said,
  JOHN: "Hello there!"

  EXAMPLE 4 - Description with speaker name:
  INPUT: "Look at this," the presenter smiled.
  CORRECT OUTPUT:
  THEPRESENTER: "Look at this,"
  NARRATOR: the presenter smiled.

  EXAMPLE 5 - Grouping consecutive narration:
  INPUT: Mr. Dursley sat frozen in his armchair. Shooting stars? Owls flying by day? Mysterious people in cloaks? And they were whispering about the Potters...
  Mrs. Dursley came into the living room with two cups of tea. There was nothing for it. 
  CORRECT OUTPUT:
  NARRATOR: Mr. Dursley sat frozen in his armchair. Shooting stars all? Owls flying by day? Mysterious people in cloaks? And they were whispering about the Potters... Mrs. Dursley came into the living room with two cups of tea. There was nothing for it.

  EXAMPLES - Czech:

  EXAMPLE 6 - Attribution AFTER quote:
  INPUT: „Jen se podívejte," zvolal, zatímco si prohlížel mágů.
  OUTPUT:
  JOSEPHRAGOWSKI: „Jen se podívejte,"
  NARRATOR: zvolal, zatímco si prohlížel mágů.

  EXAMPLE 7 - Multiple quotes:
  INPUT: „První věta," řekl John. „Druhá věta!"
  OUTPUT:
  JOHN: „První věta,"
  NARRATOR: řekl John.
  JOHN: „Druhá věta!"

  Now tag this chapter. Output ONLY SPEAKER: text lines. CRITICAL: Split dialogue from attribution - character voice gets ONLY quoted text, NARRATOR gets attribution.

  ${chapterText}`;
    
    try {
      const taggedText = await this.callGemini(prompt);
      
      // Clean up response (remove markdown if present)
      let cleaned = taggedText.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```[a-z]*\s*/, '').replace(/\s*```$/, '');
      }
      
      // Debug: Log first 500 chars of tagged text to verify tagging
      console.log(`  📝 Tagged output preview: ${cleaned.substring(0, 500)}...`);
      console.log(`  ✅ Chapter tagged`);
      return cleaned;
    } catch (error) {
      console.error('  ❌ Chapter tagging failed:', error);
      // Fallback: Return original text with NARRATOR prefix
      return `NARRATOR: ${chapterText}`;
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

  /**
   * Refine dialogue detection
   * NOT NEEDED in current implementation (Phase 2 feature)
   */
  async refineDialogueDetection(text: string): Promise<Array<{
    type: 'dialogue' | 'narrator' | 'internal_monologue';
    speaker: string;
    text: string;
    confidence: number;
  }>> {
    throw new Error('refineDialogueDetection not implemented yet (Phase 2 feature)');
  }

  /**
   * TWO-PHASE CHARACTER EXTRACTION - Phase 1 (BLOCKING)
   * 
   * Analyzes first N chapters to build initial character DB.
   * This is BLOCKING because voice assignment requires character info.
   * 
   * @param chapters - All book chapters
   * @param numChapters - Number of chapters to analyze (default: 3)
   * @returns Initial analysis result with characters for voice assignment
   */
  async analyzeInitialChapters(
    chapters: Chapter[],
    numChapters: number = 3
  ): Promise<InitialAnalysisResult> {
    const startTime = Date.now();
    const chaptersToAnalyze = chapters.slice(0, Math.min(numChapters, chapters.length));
    
    // Combine chapter texts
    const combinedText = chaptersToAnalyze.map(ch => ch.text).join('\n\n---CHAPTER BREAK---\n\n');
    const totalChars = combinedText.length;
    
    console.log(`🔍 Phase 1: Analyzing first ${chaptersToAnalyze.length} chapters (${(totalChars / 1000).toFixed(0)}k chars)...`);
    
    // Clean text first
    const cleanedResult = cleanText(combinedText, {
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
    
    const prompt = `You are an expert literary analyst. Analyze the FIRST ${chaptersToAnalyze.length} CHAPTERS of this book and extract information about ALL characters who speak dialogue.

IMPORTANT RULES:
1. Include ONLY characters who speak dialogue (have quoted speech)
2. Minimum 1 dialogue line to qualify as a character
3. Include ALL speaking characters found in these chapters
4. Always include NARRATOR as first character
5. Use character names exactly as they appear in dialogue attributions
6. Order characters by importance (most dialogue first)

For each character, provide:
- name: Exact name from book (or "NARRATOR" for narration)
- gender: "male", "female", or "neutral"
- traits: Array of 2-4 personality traits from context (e.g., ["calm", "mature", "wise"])
- ageRange: "child", "young adult", "adult", or "elderly"
- role: "protagonist", "antagonist", "supporting", or "minor"
- dialogueCount: Approximate number of dialogue lines in these chapters

Return ONLY a valid JSON array with NO additional text or markdown:
[{"name": "NARRATOR", "gender": "neutral", "traits": [...], ...}, ...]

First ${chaptersToAnalyze.length} chapters:
${cleanedText.substring(0, 200000)}`;
    
    try {
      const response = await this.callGemini(prompt);
      const characters = this.parseCharacterResponse(response);
      
      const analysisTime = Date.now() - startTime;
      console.log(`  ✅ Phase 1 complete: ${characters.length} characters in ${analysisTime}ms`);
      console.log(`     Characters: ${characters.map(c => c.name).join(', ')}`);
      
      return {
        characters,
        analyzedChapters: chaptersToAnalyze.length,
        totalCharsAnalyzed: totalChars,
        analysisTimeMs: analysisTime,
      };
    } catch (error) {
      console.error('❌ Phase 1 character analysis failed:', error);
      
      return {
        characters: [{
          name: 'NARRATOR',
          gender: 'neutral',
          traits: ['clear', 'neutral'],
          ageRange: 'adult',
          role: 'supporting',
          dialogueCount: 0,
        }],
        analyzedChapters: chaptersToAnalyze.length,
        totalCharsAnalyzed: totalChars,
        analysisTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * TWO-PHASE CHARACTER EXTRACTION - Phase 2 (PARALLEL)
   * 
   * Enriches character DB from additional chapters.
   * Runs in PARALLEL with TTS generation.
   * 
   * NEW characters get added with voice assignment.
   * EXISTING characters get enriched (traits, age, role) but voice stays LOCKED.
   * 
   * @param chapterText - Text of chapter to analyze
   * @param chapterIndex - Index of the chapter
   * @param existingCharacters - Current character DB
   * @returns New and enriched characters
   */
  async enrichFromChapter(
    chapterText: string,
    chapterIndex: number,
    existingCharacters: CharacterProfile[]
  ): Promise<EnrichmentResult> {
    console.log(`  🔄 Phase 2: Enriching from chapter ${chapterIndex + 1} (${(chapterText.length / 1000).toFixed(1)}k chars)...`);
    
    const existingNames = existingCharacters.map(c => c.name.toUpperCase());
    
    const prompt = `You are an expert literary analyst. Analyze this chapter and:
1. Identify any NEW speaking characters not in the existing list
2. Find additional information about EXISTING characters

EXISTING CHARACTERS (already known):
${existingCharacters.map(c => `- ${c.name} (${c.gender}, ${c.ageRange || 'unknown age'}, ${c.role || 'unknown role'})`).join('\n')}

For NEW characters found, provide full profile:
- name, gender, traits, ageRange, role, dialogueCount

For EXISTING characters with NEW information, provide updates:
- Only include if you found NEW traits, age clarification, or role information
- Include the character name and only the NEW/updated fields

Return JSON with two arrays:
{
  "newCharacters": [{"name": "...", "gender": "...", "traits": [...], "ageRange": "...", "role": "...", "dialogueCount": N}],
  "enrichments": [{"name": "EXISTING_NAME", "newTraits": [...], "ageRange": "...", "role": "..."}]
}

Chapter text:
${chapterText.substring(0, 100000)}`;
    
    try {
      const response = await this.callGemini(prompt);
      
      // Parse response
      let jsonText = response.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```json?\s*/, '').replace(/\s*```$/, '');
      }
      
      const result = JSON.parse(jsonText);
      const newCharacters: CharacterProfile[] = result.newCharacters || [];
      const enrichedCharacters: CharacterProfile[] = [];
      
      // Apply enrichments to existing characters
      for (const enrichment of (result.enrichments || [])) {
        const existing = existingCharacters.find(
          c => c.name.toUpperCase() === enrichment.name?.toUpperCase()
        );
        if (existing) {
          const enriched = { ...existing };
          
          // Merge new traits
          if (enrichment.newTraits?.length > 0) {
            enriched.traits = [...new Set([...existing.traits, ...enrichment.newTraits])];
          }
          
          // Update age if not set or more specific
          if (enrichment.ageRange && !existing.ageRange) {
            enriched.ageRange = enrichment.ageRange;
          }
          
          // Update role if more important
          const roleOrder = ['protagonist', 'antagonist', 'supporting', 'minor'];
          if (enrichment.role && roleOrder.indexOf(enrichment.role) < roleOrder.indexOf(existing.role || 'minor')) {
            enriched.role = enrichment.role;
          }
          
          enrichedCharacters.push(enriched);
        }
      }
      
      if (newCharacters.length > 0 || enrichedCharacters.length > 0) {
        console.log(`     ✅ Found ${newCharacters.length} new, enriched ${enrichedCharacters.length} existing`);
      }
      
      return {
        newCharacters,
        enrichedCharacters,
        chapterIndex,
      };
    } catch (error) {
      console.error(`  ⚠️ Phase 2 enrichment failed for chapter ${chapterIndex + 1}:`, error);
      return {
        newCharacters: [],
        enrichedCharacters: [],
        chapterIndex,
      };
    }
  }

  /**
   * Helper to parse character JSON response with recovery
   */
  private parseCharacterResponse(response: string): CharacterProfile[] {
    let jsonText = response.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```json?\s*/, '').replace(/\s*```$/, '');
    }
    
    try {
      return JSON.parse(jsonText);
    } catch (parseError) {
      console.warn('  ⚠️ JSON parse failed, attempting recovery...');
      
      // Try to recover from truncated JSON
      const lastCompleteObjectEnd = jsonText.lastIndexOf('},');
      if (lastCompleteObjectEnd > 0) {
        const recovered = jsonText.substring(0, lastCompleteObjectEnd + 1) + ']';
        try {
          const characters = JSON.parse(recovered);
          console.log(`  ✅ Recovery successful! Found ${characters.length} characters`);
          return characters;
        } catch (recoveryError) {
          // Try simpler recovery
          const firstBracket = jsonText.indexOf('[');
          const lastValidEnd = jsonText.lastIndexOf('}]');
          if (firstBracket >= 0 && lastValidEnd > firstBracket) {
            const simpleRecovery = jsonText.substring(firstBracket, lastValidEnd + 2);
            return JSON.parse(simpleRecovery);
          }
          throw recoveryError;
        }
      }
      throw parseError;
    }
  }
}

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
