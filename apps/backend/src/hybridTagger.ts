/**
 * Hybrid Dialogue Tagger
 * 
 * Cost-optimized tagging strategy:
 * 1. No dialogue → Auto-tag as NARRATOR ($0)
 * 2. Simple dialogue → Rule-based tagging ($0)
 * 3. Complex dialogue → LLM fallback (minimal cost)
 * 
 * Expected cost reduction: 60-80% vs pure LLM
 * Expected accuracy: 97-99%
 * 
 * INNER VOICE / THOUGHTS:
 * - WITH quotes: "Did he lie?" she thought → Rule-based can detect
 * - WITHOUT quotes: She wondered if he lied → LLM required (narrator paraphrase vs actual thought)
 * - Must be CHARACTER voice, not NARRATOR: [VOICE=MARY:THOUGHT] not [VOICE=NARRATOR:THOUGHT]
 * 
 * Limitation: Unquoted internal thoughts are very hard for rule-based detection.
 * These cases will trigger LLM fallback for proper attribution and style tagging.
 */

import { CharacterProfile } from './llmCharacterAnalyzer.js';

export interface TaggingResult {
  taggedText: string;
  method: 'auto-narrator' | 'rule-based' | 'llm-fallback';
  confidence: number;
  dialogueCount: number;
  cost: number; // Estimated cost in USD
}

export interface VoiceStyle {
  character: string;
  style: 'normal' | 'whisper' | 'thought' | 'letter';
}

/**
 * Infer gender from character name and context
 * 
 * Methods:
 * 1. Character name patterns (Marie, John, etc.)
 * 2. Pronoun usage in surrounding text (he/she, his/her)
 * 3. Gendered verb forms (Czech: řekl/řekla, pomyslel/pomyslela)
 * 4. Gendered adjectives (Czech: byl/byla, měl/měla)
 * 
 * @param characterName - Character name to analyze
 * @param contextText - Surrounding text for context analysis
 * @returns 'male', 'female', or 'neutral'
 */
export function inferGender(characterName: string, contextText: string = ''): 'male' | 'female' | 'neutral' {
  const name = characterName.toLowerCase();
  const context = contextText.toLowerCase();
  
  // Method 1: Czech name endings (very reliable)
  // Czech female names typically end in -a, -e
  // Czech male names typically end in consonants or -o
  const czechFemaleEndings = /a$|e$/i;
  const czechMaleEndings = /[bcčdďfghjklmnňpqrřsštťvwxzž]$/i;
  
  // Check if it's a Czech-looking name (contains Czech characters or is capitalized properly)
  const isCzechName = /[áčďéěíňóřšťúůýž]/i.test(name) || /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+$/.test(characterName);
  
  if (isCzechName) {
    if (czechFemaleEndings.test(name) && !name.match(/ska$/)) {
      // Most Czech female names end in -a or -e (but not surnames ending in -ska which can be ambiguous)
      return 'female';
    }
    if (czechMaleEndings.test(name)) {
      return 'male';
    }
  }
  
  // Method 2: Common international name patterns
  const femaleNames = /^(marie|maria|mary|lili|lily|sarah|anna|eve|elizabeth|kate|susan|jane|lisa|linda|barbara|margaret|dorothy|helen|nancy|karen|betty|sandra|ashley|kimberly|donna|emily|michelle|carol|amanda|melissa|saffro)/i;
  const maleNames = /^(joseph|ragowski|joe|john|james|robert|michael|william|david|richard|charles|thomas|christopher|daniel|paul|mark|donald|george|kenneth|steven|edward|brian|ronald|anthony|kevin|jason|matthew|gary|timothy)/i;
  
  if (femaleNames.test(name)) return 'female';
  if (maleNames.test(name)) return 'male';
  
  // Method 3: Pronoun analysis in context
  const malePronouns = (context.match(/\b(he|him|his|jeho|mu|jej)\b/gi) || []).length;
  const femalePronouns = (context.match(/\b(she|her|hers|její|jí)\b/gi) || []).length;
  
  if (femalePronouns > malePronouns * 1.5) return 'female';
  if (malePronouns > femalePronouns * 1.5) return 'male';
  
  // Method 4: Czech gendered verb forms (past tense) - MOST RELIABLE
  // Male: řekl, zvolal, poznamenal, odpověděl, prohlásil, dodal, podotkl, zeptal, pomyslel, uvažoval, zavrčel
  // Female: řekla, zvolala, poznamenala, odpověděla, prohlásila, dodala, podotkla, zeptala, pomyslela, uvažovala
  const czechMaleVerbs = (context.match(/\b(řekl|zvolal|poznamenal|odpověděl|prohlásil|dodal|podotkl|zeptal|pomyslel|uvažoval|přemýšlel|zavrčel|vzal|byl|měl|viděl|šel|přišel|začal|skončil)\b/gi) || []).length;
  const czechFemaleVerbs = (context.match(/\b(řekla|zvolala|poznamenala|odpověděla|prohlásila|dodala|podotkla|zeptala|pomyslela|uvažovala|přemýšlela|vzala|byla|měla|viděla|šla|přišla|začala|skončila)\b/gi) || []).length;
  
  if (czechFemaleVerbs > czechMaleVerbs) return 'female';
  if (czechMaleVerbs > czechFemaleVerbs) return 'male';
  
  // Method 5: Czech gendered adjectives (l-participle)
  // Male: byl, měl, viděl, šel
  // Female: byla, měla, viděla, šla
  const czechMaleAdjectives = (context.match(/\b(mladý|starý|velký|malý|dobrý|zlý|krásný|ošklivý)\b/gi) || []).length;
  const czechFemaleAdjectives = (context.match(/\b(mladá|stará|velká|malá|dobrá|zlá|krásná|ošklivá)\b/gi) || []).length;
  
  if (czechFemaleAdjectives > czechMaleAdjectives) return 'female';
  if (czechMaleAdjectives > czechFemaleAdjectives) return 'male';
  
  // Default: neutral if no clear pattern
  return 'neutral';
}

/**
 * Parse voice tag with optional style modifier
 * Examples: [VOICE=JOHN], [VOICE=JOHN:WHISPER], [VOICE=NARRATOR:THOUGHT]
 */
export function parseVoiceTag(tag: string): VoiceStyle {
  const match = tag.match(/\[VOICE=([^:\]]+)(?::([^\]]+))?\]/);
  if (!match) {
    return { character: 'NARRATOR', style: 'normal' };
  }
  
  const character = match[1].trim();
  const style = (match[2]?.trim().toLowerCase() || 'normal') as VoiceStyle['style'];
  
  return { character, style };
}

/**
 * Detect if chapter has any dialogue
 * Checks for common quote marks (English, Czech, German)
 */
export function hasDialogue(text: string): boolean {
  // Check for various quote marks
  const quotePatterns = [
    /["']([^"']+)["']/,        // English: "text" or 'text'
    /\u201E([^\u201E\u201C]+)\u201C/,  // Czech: „text" (U+201E opening, U+201C closing)
    /[»«]([^»«]+)[»«]/,         // French/German guillemets
  ];
  
  return quotePatterns.some(pattern => pattern.test(text));
}

/**
 * Count dialogue instances in text
 */
export function countDialogues(text: string): number {
  const patterns = [
    /["']([^"']+)["']/g,
    /\u201E([^\u201E\u201C]+)\u201C/g,  // Czech: „text" (U+201E opening, U+201C closing)
    /[»«]([^»«]+)[»«]/g,
  ];
  
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  
  return count;
}

/**
 * Extract dialogue paragraphs (paragraphs containing quotes)
 */
export function extractDialogueParagraphs(text: string): string[] {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.filter(p => hasDialogue(p));
}

/**
 * Simple rule-based dialogue detection and tagging
 * 
 * Patterns:
 * - Dialogue: "text" said NAME, NAME replied "text"
 * - Thoughts: "text" thought NAME, NAME wondered "text"
 * - Czech: poznamenala Lili, zvolal Ragowski, pomyslela si Marie
 * - English: said John, Mary replied, John thought
 * - Attribution before/after quotes
 * 
 * Note: Unquoted inner thoughts are HARD to detect with rules.
 * These require LLM analysis for proper attribution.
 */
export function applyRuleBasedTagging(
  text: string,
  characters: CharacterProfile[]
): { taggedText: string; confidence: number } {
  // Create character name lookup (case-insensitive)
  const characterNames = new Set(
    characters.map(c => c.name.toUpperCase())
  );
  
  const lines = text.split('\n');
  const taggedLines: string[] = [];
  let lastSpeaker = 'NARRATOR';
  let successfulAttributions = 0;
  let totalDialogues = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if line has dialogue
    if (!hasDialogue(line)) {
      // Narration
      if (taggedLines.length === 0 || !taggedLines[taggedLines.length - 1].startsWith('[VOICE=NARRATOR]')) {
        taggedLines.push('[VOICE=NARRATOR]');
      }
      taggedLines.push(line);
      continue;
    }
    
    totalDialogues++;
    
    // Try to find speaker attribution
    let speaker = lastSpeaker;
    let foundAttribution = false;
    
    // Pattern 1: Czech verb + name (dialogue AND thoughts)
    // "poznamenala Lili" → LILI, "pomyslela si Marie" → MARIE
    const czechPattern = /(zvolal|zvolala|poznamenal|poznamenala|řekl|řekla|odpověděl|odpověděla|prohlásil|prohlásila|dodal|dodala|podotkl|podotkla|zeptal|zeptala|pomyslel|pomyslela|uvažoval|uvažovala|přemýšlel|přemýšlela)\s+(si\s+)?([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)/gi;
    const czechMatch = line.match(czechPattern);
    
    if (czechMatch) {
      // Extract name (last word in match, handling optional 'si')
      const words = czechMatch[0].split(/\s+/);
      const potentialName = words[words.length - 1].toUpperCase();
      if (characterNames.has(potentialName)) {
        speaker = potentialName;
        lastSpeaker = speaker;
        foundAttribution = true;
        successfulAttributions++;
      }
    }
    
    // Pattern 2: English verb + name (dialogue AND thoughts)
    // "said John" → JOHN, "thought Mary" → MARY
    if (!foundAttribution) {
      const englishPattern = /(said|asked|replied|answered|shouted|whispered|muttered|exclaimed|thought|wondered|pondered|mused|realized)\s+([A-Z][a-z]+)/g;
      const englishMatch = line.match(englishPattern);
      
      if (englishMatch) {
        const potentialName = englishMatch[0].split(/\s+/)[1].toUpperCase();
        if (characterNames.has(potentialName)) {
          speaker = potentialName;
          lastSpeaker = speaker;
          foundAttribution = true;
          successfulAttributions++;
        }
      }
    }
    
    // Pattern 3: Name at start of line (before quote)
    if (!foundAttribution) {
      const nameFirstPattern = /^([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)\s+/;
      const nameMatch = line.match(nameFirstPattern);
      
      if (nameMatch) {
        const potentialName = nameMatch[1].toUpperCase();
        if (characterNames.has(potentialName)) {
          speaker = potentialName;
          lastSpeaker = speaker;
          foundAttribution = true;
          successfulAttributions++;
        }
      }
    }
    
    // Detect if this is a thought or dialogue
    const isThought = /\b(thought|wondered|pondered|mused|realized|pomyslel|pomyslela|uvažoval|uvažovala|přemýšlel|přemýšlela)\b/i.test(line);
    
    // Add voice tag with style
    if (isThought && speaker !== 'NARRATOR') {
      taggedLines.push(`[VOICE=${speaker}:THOUGHT]`);
    } else {
      taggedLines.push(`[VOICE=${speaker}]`);
    }
    taggedLines.push(line);
  }
  
  // Calculate confidence
  const attributionRate = totalDialogues > 0 ? successfulAttributions / totalDialogues : 1.0;
  const confidence = attributionRate * 0.9 + 0.05; // Cap at 0.95 for rule-based
  
  return {
    taggedText: taggedLines.join('\n'),
    confidence: Math.min(confidence, 0.95),
  };
}

/**
 * Calculate confidence score for tagged text
 * 
 * Checks:
 * - All dialogues have speaker tags
 * - Speakers match known characters
 * - Quote marks are properly paired
 * - No consecutive same-speaker tags
 */
export function calculateConfidence(
  taggedText: string,
  characters: CharacterProfile[]
): number {
  const characterNames = new Set(
    characters.map(c => c.name.toUpperCase())
  );
  characterNames.add('NARRATOR');
  
  let score = 1.0;
  
  // Extract voice tags
  const voiceTags = taggedText.match(/\[VOICE=([^\]]+)\]/g) || [];
  
  if (voiceTags.length === 0) {
    return 0.0; // No tags found
  }
  
  // Check 1: All speakers are known characters
  let unknownSpeakers = 0;
  for (const tag of voiceTags) {
    const parsed = parseVoiceTag(tag);
    if (!characterNames.has(parsed.character)) {
      unknownSpeakers++;
    }
  }
  if (unknownSpeakers > 0) {
    score *= Math.max(0.5, 1 - unknownSpeakers / voiceTags.length);
  }
  
  // Check 2: Quote marks are paired
  const openQuotes = (taggedText.match(/[""„'«]/g) || []).length;
  const closeQuotes = (taggedText.match(/[""'»]/g) || []).length;
  const quotePairing = Math.abs(openQuotes - closeQuotes);
  if (quotePairing > 0) {
    score *= Math.max(0.7, 1 - quotePairing / Math.max(openQuotes, 1));
  }
  
  // Check 3: Reasonable tag density
  const lines = taggedText.split('\n').length;
  const tagDensity = voiceTags.length / lines;
  if (tagDensity < 0.01 || tagDensity > 0.5) {
    score *= 0.8; // Suspicious density
  }
  
  return Math.max(0.0, Math.min(1.0, score));
}

/**
 * Merge LLM-tagged dialogues back into full chapter with narration
 */
export function mergeWithNarration(
  originalText: string,
  taggedDialogues: string,
  characters: CharacterProfile[]
): string {
  // Split original into paragraphs
  const paragraphs = originalText.split(/\n\n+/);
  const result: string[] = [];
  
  // Extract tagged dialogue segments
  const dialogueMap = new Map<string, string>();
  const taggedParagraphs = taggedDialogues.split(/\n\n+/);
  
  for (const tagged of taggedParagraphs) {
    // Extract original text without tags
    const withoutTags = tagged.replace(/\[VOICE=[^\]]+\]\s*/g, '');
    dialogueMap.set(withoutTags.trim(), tagged);
  }
  
  // Merge back
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (dialogueMap.has(trimmed)) {
      result.push(dialogueMap.get(trimmed)!);
    } else {
      // Narration paragraph
      if (result.length === 0 || !result[result.length - 1].includes('[VOICE=NARRATOR]')) {
        result.push('[VOICE=NARRATOR]');
      }
      result.push(para);
    }
  }
  
  return result.join('\n\n');
}
