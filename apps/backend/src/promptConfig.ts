/**
 * VoiceLibri - Prompt Control Room
 * 
 * SINGLE SOURCE OF TRUTH for all LLM and TTS prompts, temperatures, and configuration.
 * All prompts are organized by pipeline sequence:
 * 
 * 1. Book Info Extraction (genre, tone, setting)
 * 2. Character Extraction (per-chapter with speech styles)
 * 3. Translation (chapter translation to target language)
 * 4. Dramatization / Voice Tagging (adding [VOICE=X] markers)
 * 
 * USAGE: Import specific prompts/configs from this file instead of hardcoding them.
 * 
 * @module promptConfig
 */

// =============================================================================
// LLM MODEL CONFIGURATION
// =============================================================================

/**
 * Default LLM models for each pipeline stage
 * Can be overridden via environment variables
 */
export const LLM_MODELS = {
  /** Character extraction and analysis */
  CHARACTER: process.env.LLM_MODEL_CHARACTER || 'gemini-2.5-flash',
  /** Chapter translation */
  TRANSLATION: process.env.LLM_MODEL_TRANSLATION || 'gemini-2.5-flash',
  /** TTS audio generation */
  TTS: process.env.LLM_MODEL_TTS || 'gemini-2.5-flash-preview-tts',
};

// =============================================================================
// LLM TEMPERATURE SETTINGS
// =============================================================================

/**
 * Temperature settings by task type
 * Lower = more deterministic, Higher = more creative
 */
export const LLM_TEMPERATURES = {
  /** Character analysis - low for consistent extraction */
  CHARACTER_ANALYSIS: 0.1,
  /** Speech style generation - slightly higher for creative styles */
  SPEECH_STYLE: 0.2,
  /** Translation - balanced for quality translations */
  TRANSLATION: 0.3,
  /** Dialogue tagging - low for consistent formatting */
  TAGGING: 0.1,
};

/**
 * Other generation config parameters
 */
export const LLM_GENERATION_CONFIG = {
  /** Top-P sampling parameter */
  TOP_P: 0.95,
  /** Max tokens for character analysis */
  MAX_TOKENS_CHARACTER: 32768,
  /** Max tokens for translation (large for full chapters) */
  MAX_TOKENS_TRANSLATION: 65536,
  /** Max tokens for speech style extraction */
  MAX_TOKENS_SPEECH_STYLE: 8192,
};

// =============================================================================
// 1. BOOK INFO EXTRACTION PROMPTS
// =============================================================================

/**
 * Book info extraction prompt template
 * Extracts genre, tone, and setting for narrator TTS instruction
 * Used in: characterRegistry.ts (chapters 1-2 only)
 * 
 * @param needsBookInfo - Whether to include bookInfo in extraction
 * @returns Prompt section for bookInfo extraction
 */
export function getBookInfoExtractionPrompt(needsBookInfo: boolean): string {
  if (!needsBookInfo) return '';
  
  return `ALSO EXTRACT BOOK/DOCUMENT INFO - CRITICAL RULES:
- Total combined output MAX 10 WORDS across all three fields
- Be EXTREMELY concise - each word must add unique semantic value
- MUST AVOID OXYMORONS AND SYNONYMY, INCLUDING SEMANTICALLY EQUIVALENT FORMS ACROSS WORD CLASSES
- BAD example: genre "mystery" + tone "mysterious" = wasted word (mystery already implies mysterious)
- BAD example: tone "mundane, mysterious" = oxymoron (contradictory)
- GOOD example: genre "young adult fantasy" + tone "ominous, wondrous" + setting "1990s suburban britain"

Fields:
- genre: Primary genre (e.g., "gothic horror", "young adult fantasy")
- tone: Mood/atmosphere - NO words derivable from genre (e.g., "tense, melancholic")
- setting: Era and place only (e.g., "victorian london", "1990s suburban britain")

`;
}

// =============================================================================
// 2. CHARACTER EXTRACTION PROMPTS
// =============================================================================

/**
 * Per-chapter character extraction prompt
 * Extracts characters with LLM-selected voices and speech styles
 * Used in: characterRegistry.ts
 * 
 * @param voiceList - Formatted list of available Gemini TTS voices
 * @param assignedVoices - List of already assigned voices
 * @param knownCharsList - Previously extracted characters
 * @param chapterText - Chapter text to analyze (truncated to 30k chars)
 * @param needsBookInfo - Whether to include bookInfo extraction
 * @returns Complete prompt for character extraction
 */
export function getCharacterExtractionPrompt(
  voiceList: string,
  assignedVoices: string,
  knownCharsList: string,
  chapterText: string,
  needsBookInfo: boolean
): string {
  const bookInfoSection = getBookInfoExtractionPrompt(needsBookInfo);
  const bookInfoJson = needsBookInfo ? `
  "bookInfo": {
    "genre": "concise genre (few words)",
    "tone": "unique mood descriptors (few words)",
    "setting": "era and place (few words)"
  },` : '';

  return `You are an expert literary analyst and voice casting director for audiobook production.

AVAILABLE GEMINI TTS VOICES:
${voiceList}

${assignedVoices ? `${assignedVoices}

` : ''}${knownCharsList ? `KNOWN CHARACTERS (already cast - check if any names refer to these):
${knownCharsList}

` : ''}CHAPTER TEXT:
${chapterText.substring(0, 30000)}

TASK: Extract ALL characters who speak dialogue and cast them with the perfect voice.

For EACH character, analyze their:
- Age, personality, social class, nationality/accent, occupation, health/habits
- Craft a complete TTS voice direction as a natural sentence (MAX 12 WORDS)
- Select the BEST matching Gemini voice from the available list

${bookInfoSection}Return JSON only:
{${bookInfoJson}
  "characters": [
    {
      "name": "exact name as written",
      "sameAs": "known character name if same person (optional)",
      "gender": "male|female|neutral|unknown",
      "voiceName": "ExactGeminiVoiceName",
      "speechStyle": "Complete TTS direction as natural sentence (max 12 words)"
    }
  ]
}

RULES:
1. Include ONLY characters who speak dialogue (have quoted speech)
2. Use the EXACT name as it appears in the text
3. If a character is the SAME PERSON as a known character (different name/alias):
   - Set "sameAs" to the known character's primary name
   - Do NOT assign new voice/speechStyle (they inherit from the original)
4. For NEW characters: select voice matching gender, and craft unique speechStyle
5. speechStyle MUST be a complete, natural TTS direction sentence ready to use directly
   Examples: "Speak slowly with a gravelly, menacing Eastern European accent."
            "Say nervously with quick stammering and high pitch."
            "Read warmly with a gentle maternal tone and slight rural accent."
6. Do NOT include NARRATOR - that is handled separately
7. Voice selection: Match voice characteristics to character (e.g., elderly → low pitch, child → high pitch)
8. speechStyle is a direct TTS command - phrase it as natural spoken instruction

Return ONLY valid JSON, no markdown or explanation.`;
}

/**
 * Full book character analysis prompt (Phase 1 - first N chapters)
 * Used in: llmCharacterAnalyzer.ts for initial character DB
 */
export function getFullBookAnalysisPrompt(cleanedText: string, chapterCount: number): string {
  return `You are an expert literary analyst. Analyze the FIRST ${chapterCount} CHAPTERS of this book and extract information about ALL characters who speak dialogue.

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

First ${chapterCount} chapters:
${cleanedText.substring(0, 200000)}`;
}

/**
 * Chapter enrichment prompt (Phase 2 - parallel with TTS)
 * Used in: llmCharacterAnalyzer.ts for character DB enrichment
 */
export function getChapterEnrichmentPrompt(
  existingCharacters: string,
  chapterText: string
): string {
  return `You are an expert literary analyst. Analyze this chapter and:
1. Identify any NEW speaking characters not in the existing list
2. Find additional information about EXISTING characters

EXISTING CHARACTERS (already known):
${existingCharacters}

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
}

// =============================================================================
// 3. TRANSLATION PROMPTS
// =============================================================================

/**
 * Chapter translation prompt
 * Used in: chapterTranslator.ts
 * 
 * @param targetLangName - Display name of target language (e.g., "Czech")
 * @param chapterText - Text to translate
 * @returns Complete translation prompt
 */
export function getTranslationPrompt(targetLangName: string, chapterText: string): string {
  return `You are a professional literary translator.

TASK: Translate the following text to ${targetLangName}.

/*
CRITICAL RULES (COMMENTED FOR LITE MODEL TESTING - REVERT IF NEEDED):
1. Translate ALL text naturally, including character names and references.

2. Preserve dialogue formatting:
   - Keep quotation marks style consistent
   - Maintain paragraph breaks
   - Keep dialogue attribution natural in target language

3. Preserve the original tone, style, and literary quality of the text.

4. Return ONLY the translated text - no explanations, notes, or metadata.
*/

TEXT TO TRANSLATE:
${chapterText}`;
}

// =============================================================================
// 4. VOICE TAGGING / DRAMATIZATION PROMPTS
// =============================================================================

/**
 * Chapter voice tagging prompt for Gemini TTS format
 * Used in: llmCharacterAnalyzer.ts
 * 
 * @param characterAliases - Formatted list of character TTS aliases
 * @param chapterText - Chapter text to tag
 * @returns Complete tagging prompt
 */
export function getVoiceTaggingPrompt(characterAliases: string, chapterText: string): string {
  return `You are tagging text for Gemini TTS multi-speaker synthesis. Format: SPEAKER: text on same line.

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
}

// =============================================================================
// 5. NARRATOR INSTRUCTION TEMPLATE
// =============================================================================

/**
 * Narrator TTS instruction template
 * Format: "Narrate this audiobook as a top voice artist with immersive and expressive style, 
 *          perfectly capturing its genre and reality - {bookInfo lowercase, max 10 words}."
 * 
 * @param bookInfo - Book info object with genre, tone, setting
 * @returns Formatted narrator instruction string
 */
export function buildNarratorInstruction(bookInfo: {
  genre?: string;
  tone?: string;
  setting?: string;
} | null): string {
  // Build variable part from bookInfo (lowercase, MAX 10 WORDS total)
  let variablePart = 'atmospheric fiction in an evocative setting';
  
  if (bookInfo) {
    const { genre, tone, setting } = bookInfo;
    const parts = [genre, tone, setting].filter(Boolean);
    if (parts.length > 0) {
      // Combine, lowercase, and limit to 10 words
      variablePart = parts.join(', ').toLowerCase().split(/\s+/).slice(0, 10).join(' ');
    }
  }
  
  // Natural sentence format - bookInfo at the end for cleaner structure
  return `Narrate this audiobook as a top voice artist with immersive and expressive style, perfectly capturing its genre and reality - ${variablePart}.\n`;
}

// =============================================================================
// TTS CONFIGURATION
// =============================================================================

/**
 * TTS chunk size limits per Gemini API
 */
export const TTS_LIMITS = {
  /** Maximum bytes per TTS chunk */
  MAX_CHUNK_BYTES: 4000,
  /** Target chunk size for optimal performance */
  TARGET_CHUNK_BYTES: 3600,
  /** Minimum chunk size */
  MIN_CHUNK_BYTES: 200,
  /** Maximum speakers per chunk (Gemini TTS limit) */
  MAX_SPEAKERS_PER_CHUNK: 2,
};

/**
 * Default narrator voice
 */
export const DEFAULT_NARRATOR_VOICE = 'Enceladus';

/**
 * Silence gap between subchunks in milliseconds
 */
export const SUBCHUNK_SILENCE_GAP_MS = 500;
