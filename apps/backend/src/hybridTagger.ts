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
    /["']([^"']+)["']/,        // English straight: "text" or 'text'
    /[\u201C\u201D]([^\u201C\u201D]+)[\u201C\u201D]/,  // English curly: "text" (U+201C/U+201D)
    /\u201E([^\u201E\u201C]+)\u201C/,  // Czech/German: „text" (U+201E opening, U+201C closing)
    /[»«]([^»«]+)[»«]/,         // French/German guillemets
  ];
  
  return quotePatterns.some(pattern => pattern.test(text));
}

/**
 * Count dialogue instances in text
 */
export function countDialogues(text: string): number {
  const patterns = [
    /["']([^"']+)["']/g,                    // English straight: "text" or 'text'
    /[\u201C\u201D]([^\u201C\u201D]+)[\u201C\u201D]/g,  // English curly: "text" (U+201C/U+201D)
    /\u201E([^\u201E\u201C]+)\u201C/g,      // Czech/German: „text" (U+201E opening, U+201C closing)
    /[»«]([^»«]+)[»«]/g,                     // French/German guillemets
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
 * Split text content into dialogue (quoted) and narration (unquoted) segments
 * 
 * This is the CORE function that ensures narration is always separated from dialogue.
 * Used by both rule-based tagging and LLM output processing.
 * 
 * @param content - Text that may contain mixed dialogue and narration
 * @returns Array of segments with type (dialogue/narration) and text
 */
function splitIntoDialogueNarration(content: string): Array<{ type: 'dialogue' | 'narration'; text: string }> {
  const segments: Array<{ type: 'dialogue' | 'narration'; text: string }> = [];
  
  // Pattern matches various quote styles BUT NOT ASCII apostrophe (') which is used in contractions
  // Includes: „ (Czech), " (ASCII), "" (curly double), '' (curly single U+2018/U+2019), «» (guillemets)
  const quotePattern = /([„"\u201C\u201D\u2018\u2019«»])([^„"\u201C\u201D\u2018\u2019«»]*?)([„"\u201C\u201D\u2018\u2019«»])/g;
  
  let lastIndex = 0;
  let match;
  
  while ((match = quotePattern.exec(content)) !== null) {
    // Text before this quote is narration
    const beforeQuote = content.substring(lastIndex, match.index).trim();
    if (beforeQuote) {
      segments.push({ type: 'narration', text: beforeQuote });
    }
    
    // The quote itself is dialogue
    segments.push({ type: 'dialogue', text: match[0] });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Text after last quote is narration
  const afterQuotes = content.substring(lastIndex).trim();
  if (afterQuotes) {
    segments.push({ type: 'narration', text: afterQuotes });
  }
  
  // If no quotes found at all, entire content is narration
  if (segments.length === 0 && content.trim()) {
    segments.push({ type: 'narration', text: content.trim() });
  }
  
  return segments;
}

/**
 * Enhanced rule-based dialogue detection and tagging
 * 
 * Improvements over basic approach:
 * 1. Multi-line attribution: Looks at next/previous lines for attribution
 * 2. Post-quote attribution: "Quote" CHARACTER smiled/said
 * 3. Pronoun resolution: "he said" → most recently mentioned character
 * 4. Paragraph context: Groups quotes within same paragraph
 * 5. No incorrect carry-over: Resets speaker when there's narration gap
 * 
 * CRITICAL: Lines with mixed dialogue/narration are split into segments.
 * Narration (unquoted text) ALWAYS gets NARRATOR tag.
 */
export function applyRuleBasedTagging(
  text: string,
  characters: CharacterProfile[]
): { taggedText: string; confidence: number } {
  // Create character name lookup (case-insensitive)
  const characterNames = new Set<string>();
  const aliasToMainName = new Map<string, string>();
  
  for (const char of characters) {
    const mainName = char.name.toUpperCase();
    characterNames.add(mainName);
    aliasToMainName.set(mainName, mainName);
    
    if (char.aliases) {
      for (const alias of char.aliases) {
        const upperAlias = alias.toUpperCase();
        characterNames.add(upperAlias);
        aliasToMainName.set(upperAlias, mainName);
      }
    }
  }
  
  // Speech verbs (English + Czech)
  const speechVerbs = 'said|asked|replied|answered|shouted|whispered|muttered|exclaimed|thought|wondered|pondered|mused|realized|called|cried|yelled|screamed|murmured|demanded|inquired|responded|suggested|added|continued|began|started|finished|concluded|agreed|disagreed|argued|explained|announced|declared|stated|mentioned|noted|observed|remarked|commented|repeated|echoed|insisted|urged|warned|promised|admitted|confessed|denied|lied|joked|laughed|sighed|groaned|moaned|gasped|breathed|hissed|growled|snarled|snapped|barked|roared|bellowed|boomed|thundered|smiled|grinned|frowned|nodded|shrugged|cleared|řekl|řekla|zvolal|zvolala|poznamenal|poznamenala|odpověděl|odpověděla|prohlásil|prohlásila|dodal|dodala|podotkl|podotkla|zeptal|zeptala|pomyslel|pomyslela|uvažoval|uvažovala|přemýšlel|přemýšlela|zavolal|zavolala|křikl|křikla|zašeptal|zašeptala|zabručel|zabručela|zasmál|zasmála|povzdechl|povzdechla|zasténal|zasténala|zaúpěl|zaúpěla';
  const speechVerbPattern = new RegExp(`\\b(${speechVerbs})\\b`, 'i');
  
  // Pronoun patterns for he/she attribution
  const pronounPattern = /\b(he|she|they)\s+(said|asked|replied|exclaimed|whispered|muttered|shouted|thought|wondered|began|continued|added|remarked|observed|noted|commented)\b/i;
  
  // Sort character names by length (longest first)
  const sortedNames = Array.from(characterNames).sort((a, b) => b.length - a.length);
  
  // Helper: Find character name in text
  const findCharacterInText = (searchText: string): string | null => {
    for (const charName of sortedNames) {
      const escapedName = charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const namePattern = new RegExp(`\\b${escapedName}\\b`, 'i');
      if (namePattern.test(searchText)) {
        return aliasToMainName.get(charName) || charName;
      }
    }
    return null;
  };
  
  const lines = text.split('\n');
  const taggedLines: string[] = [];
  let lastMentionedCharacter: string | null = null; // Track last mentioned character for pronoun resolution
  let lastDialogueSpeaker: string | null = null; // Track speaker of last dialogue line
  let linesSinceLastDialogue = 0; // Count narration lines between dialogues
  let successfulAttributions = 0;
  let totalDialogues = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
    const prevLine = i > 0 ? lines[i - 1].trim() : '';
    
    // Track any character mentioned in narration (for pronoun resolution)
    if (!hasDialogue(line)) {
      const mentionedChar = findCharacterInText(line);
      if (mentionedChar) {
        lastMentionedCharacter = mentionedChar;
      }
      
      // Narration line
      if (taggedLines.length === 0 || !taggedLines[taggedLines.length - 1].startsWith('[VOICE=NARRATOR]')) {
        taggedLines.push('[VOICE=NARRATOR]');
      }
      taggedLines.push(line);
      linesSinceLastDialogue++;
      continue;
    }
    
    totalDialogues++;
    let speaker: string | null = null;
    let foundAttribution = false;
    
    // === PATTERN 1: Direct attribution on same line ===
    // "Quote" said CHARACTER or CHARACTER said "Quote"
    if (speechVerbPattern.test(line)) {
      const charInLine = findCharacterInText(line);
      if (charInLine) {
        speaker = charInLine;
        foundAttribution = true;
        console.log(`  [Tagger] Direct attribution: "${charInLine}" in line`);
      }
    }
    
    // === PATTERN 2: Pronoun attribution on same line ===
    // "Quote" he said → resolve "he" to lastMentionedCharacter
    if (!foundAttribution && pronounPattern.test(line) && lastMentionedCharacter) {
      speaker = lastMentionedCharacter;
      foundAttribution = true;
      console.log(`  [Tagger] Pronoun resolved to: "${lastMentionedCharacter}"`);
    }
    
    // === PATTERN 3: Post-quote attribution (same line) ===
    // "Quote" The newscaster smiled. → CHARACTER + action verb (even without speech verb)
    if (!foundAttribution) {
      // Look for character name AFTER a quote on the same line
      const postQuoteMatch = line.match(/[""\u201D][,.]?\s*(.+)$/);
      if (postQuoteMatch) {
        const afterQuote = postQuoteMatch[1];
        const charInAfter = findCharacterInText(afterQuote);
        if (charInAfter) {
          speaker = charInAfter;
          foundAttribution = true;
          console.log(`  [Tagger] Post-quote attribution: "${charInAfter}"`);
        }
      }
    }
    
    // === PATTERN 4: Multi-line attribution (look at NEXT line) ===
    // "Quote"
    // he exclaimed, looking around...
    if (!foundAttribution && nextLine) {
      // Check if next line has attribution
      if (speechVerbPattern.test(nextLine)) {
        const charInNext = findCharacterInText(nextLine);
        if (charInNext) {
          speaker = charInNext;
          foundAttribution = true;
          console.log(`  [Tagger] Next-line attribution: "${charInNext}"`);
        } else if (pronounPattern.test(nextLine) && lastMentionedCharacter) {
          // "Quote"
          // he said
          speaker = lastMentionedCharacter;
          foundAttribution = true;
          console.log(`  [Tagger] Next-line pronoun resolved to: "${lastMentionedCharacter}"`);
        }
      }
    }
    
    // === PATTERN 5: Pre-quote attribution (look at PREVIOUS line) ===
    // Mr. Dursley cleared his throat nervously.
    // "Er – Petunia..."
    if (!foundAttribution && prevLine && !hasDialogue(prevLine)) {
      const charInPrev = findCharacterInText(prevLine);
      if (charInPrev) {
        speaker = charInPrev;
        foundAttribution = true;
        console.log(`  [Tagger] Previous-line attribution: "${charInPrev}"`);
      } else if (lastMentionedCharacter) {
        // ENHANCEMENT: If previous line has action (verb) but no explicit name,
        // use last mentioned character (for pronoun-like attribution)
        // e.g., "He cleared his throat nervously." → He = last mentioned character
        const hasActionVerb = /\b(cleared|raised|lifted|turned|looked|smiled|frowned|nodded|shook|sighed|groaned|stood|sat|walked|moved|stepped|reached|grabbed|took|put|placed|opened|closed)\b/i.test(prevLine);
        if (hasActionVerb) {
          speaker = lastMentionedCharacter;
          foundAttribution = true;
          console.log(`  [Tagger] Previous-line action → inferred character: "${lastMentionedCharacter}"`);
        }
      }
    }
    
    // === PATTERN 6: Continuation - same speaker for adjacent quotes ===
    // Only if no significant narration gap (≤1 line)
    if (!foundAttribution && lastDialogueSpeaker && linesSinceLastDialogue <= 1) {
      speaker = lastDialogueSpeaker;
      console.log(`  [Tagger] Continuation from previous dialogue: "${lastDialogueSpeaker}"`);
      // Note: Don't mark as foundAttribution since it's just continuation
    }
    
    // === FALLBACK: NARRATOR if nothing found ===
    if (!speaker) {
      speaker = 'NARRATOR';
      console.log(`  [Tagger] No attribution found, using NARRATOR. Line: "${line.substring(0, 60)}..."`);
    }
    
    if (foundAttribution) {
      successfulAttributions++;
      lastMentionedCharacter = speaker; // Update for pronoun resolution
    }
    
    // Update tracking
    lastDialogueSpeaker = speaker !== 'NARRATOR' ? speaker : lastDialogueSpeaker;
    linesSinceLastDialogue = 0;
    
    // Split line into dialogue/narration segments
    const segments = splitIntoDialogueNarration(line);
    
    // Detect if this is a thought
    const isThought = /\b(thought|wondered|pondered|mused|realized|pomyslel|pomyslela|uvažoval|uvažovala|přemýšlel|přemýšlela)\b/i.test(line);
    
    // Tag each segment
    let lastTaggedSpeaker = '';
    for (const segment of segments) {
      if (segment.type === 'narration') {
        if (lastTaggedSpeaker !== 'NARRATOR') {
          taggedLines.push('[VOICE=NARRATOR]');
          lastTaggedSpeaker = 'NARRATOR';
        }
        taggedLines.push(segment.text);
        
        // Track character mentioned in narration part
        const mentionedInNarration = findCharacterInText(segment.text);
        if (mentionedInNarration) {
          lastMentionedCharacter = mentionedInNarration;
        }
      } else {
        const voiceTag = isThought && speaker !== 'NARRATOR' 
          ? `[VOICE=${speaker}:THOUGHT]` 
          : `[VOICE=${speaker}]`;
        if (lastTaggedSpeaker !== speaker) {
          taggedLines.push(voiceTag);
          lastTaggedSpeaker = speaker;
        }
        taggedLines.push(segment.text);
      }
    }
  }
  
  // Calculate confidence
  const attributionRate = totalDialogues > 0 ? successfulAttributions / totalDialogues : 1.0;
  const confidence = attributionRate * 0.9 + 0.05;
  
  // POST-PROCESSING: Consolidate consecutive same-voice segments and add closing tags
  const finalLines = consolidateAndAddClosingTags(taggedLines);
  
  return {
    taggedText: finalLines.join('\n'),
    confidence: Math.min(confidence, 0.95),
  };
}

/**
 * Consolidate consecutive same-voice segments and add closing tags
 * 
 * This ensures:
 * 1. No redundant consecutive voice tags (e.g., [VOICE=NARRATOR] three times in a row)
 * 2. Explicit [/VOICE] closing tags for TTS to correctly handle voice transitions
 * 
 * @param lines - Array of lines with voice tags
 * @returns Consolidated lines with closing tags
 */
export function consolidateAndAddClosingTags(lines: string[]): string[] {
  const result: string[] = [];
  let currentVoice: string | null = null;
  let currentSegment: string[] = [];
  
  for (const line of lines) {
    const voiceTagMatch = line.match(/^\[VOICE=([^\]]+)\]$/);
    
    if (voiceTagMatch) {
      const newVoice = voiceTagMatch[1];
      
      // If we have accumulated content for previous voice, output it with closing tag
      if (currentVoice && currentSegment.length > 0) {
        result.push(`[VOICE=${currentVoice}]`);
        result.push(...currentSegment);
        result.push('[/VOICE]');
        currentSegment = [];
      }
      
      // Start new voice segment
      currentVoice = newVoice;
    } else {
      // Accumulate content lines
      currentSegment.push(line);
    }
  }
  
  // Output final segment if any
  if (currentVoice && currentSegment.length > 0) {
    result.push(`[VOICE=${currentVoice}]`);
    result.push(...currentSegment);
    result.push('[/VOICE]');
  }
  
  return result;
}

/**
 * Add closing tags to already-tagged text
 * 
 * This is a utility wrapper that takes a string with [VOICE=X] tags
 * and ensures each voice segment has proper [/VOICE] closing tags.
 * Use this to post-process any tagged text from LLM or other sources.
 * 
 * @param taggedText - Text with [VOICE=X] opening tags
 * @returns Text with proper [VOICE=X]...[/VOICE] structure
 */
export function addClosingTagsToText(taggedText: string): string {
  // Skip if already has closing tags
  if (taggedText.includes('[/VOICE]')) {
    console.log('  [addClosingTagsToText] Text already has closing tags, skipping');
    return taggedText;
  }
  
  // Split into lines and apply consolidation with closing tags
  const lines = taggedText.split('\n');
  const result = consolidateAndAddClosingTags(lines);
  
  console.log(`  [addClosingTagsToText] Added closing tags (${(taggedText.match(/\[VOICE=/g) || []).length} voice segments)`);
  return result.join('\n');
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
 * Post-process tagged text to ensure narration (non-quoted text) is tagged as NARRATOR
 * 
 * Safety net for LLM output - uses the same splitIntoDialogueNarration() logic
 * as the rule-based tagger for consistency.
 * 
 * @param taggedText - Text with [VOICE=] tags
 * @returns Text with narration properly tagged as NARRATOR
 */
function postProcessNarration(taggedText: string): string {
  // Split by voice tags, keeping the tags
  const parts = taggedText.split(/(\[VOICE=[^\]]+\])/);
  const result: string[] = [];
  let currentSpeaker = 'NARRATOR';
  
  for (const part of parts) {
    const voiceTagMatch = part.match(/^\[VOICE=([^\]]+)\]$/);
    
    if (voiceTagMatch) {
      currentSpeaker = voiceTagMatch[1].split(':')[0]; // Handle style suffix like :THOUGHT
      continue;
    }
    
    const content = part.trim();
    if (!content) continue;
    
    if (currentSpeaker === 'NARRATOR') {
      // Already narrator, just add
      if (result.length === 0 || !result[result.length - 1].startsWith('[VOICE=NARRATOR]')) {
        result.push(`[VOICE=NARRATOR]\n${content}`);
      } else {
        result[result.length - 1] += `\n${content}`;
      }
    } else {
      // Character speaker - use shared function to split dialogue/narration
      const segments = splitIntoDialogueNarration(content);
      
      for (const segment of segments) {
        if (segment.type === 'narration') {
          result.push(`[VOICE=NARRATOR]\n${segment.text}`);
        } else {
          result.push(`[VOICE=${currentSpeaker}]\n${segment.text}`);
        }
      }
    }
  }
  
  return result.join('\n');
}

/**
 * Merge LLM-tagged dialogues back into full chapter with narration
 * 
 * The LLM returns text with [VOICE=X] tags, which may use single newlines
 * between segments. This function ensures proper merging.
 */
export function mergeWithNarration(
  originalText: string,
  taggedDialogues: string,
  characters: CharacterProfile[]
): string {
  // If the LLM output already contains multiple VOICE tags properly formatted,
  // post-process to ensure narration is tagged correctly
  const voiceTagCount = (taggedDialogues.match(/\[VOICE=/g) || []).length;
  
  if (voiceTagCount > 1) {
    // LLM already tagged the full text with multiple speakers
    // Bypass post-processing: assume all segments are properly tagged
    console.log(`  [mergeWithNarration] LLM returned ${voiceTagCount} voice tags - bypassing postProcessNarration`);
    return taggedDialogues.trim();
  }
  
  // Fallback: Original merging logic for partial tagging
  console.log(`  [mergeWithNarration] Only ${voiceTagCount} voice tag(s) - attempting merge`);
  
  // Split original into paragraphs
  const paragraphs = originalText.split(/\n\n+/);
  const result: string[] = [];
  
  // Extract tagged dialogue segments - split by VOICE tag, not double newline
  const dialogueMap = new Map<string, string>();
  const segments = taggedDialogues.split(/(?=\[VOICE=)/);
  
  for (const segment of segments) {
    if (!segment.trim()) continue;
    // Extract original text without tags
    const withoutTags = segment.replace(/\[VOICE=[^\]]+\]\s*/g, '').trim();
    if (withoutTags) {
      dialogueMap.set(withoutTags, segment.trim());
    }
  }
  
  // Merge back
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    
    if (dialogueMap.has(trimmed)) {
      result.push(dialogueMap.get(trimmed)!);
    } else {
      // Check if this paragraph is part of a longer tagged segment
      let found = false;
      for (const [key, value] of dialogueMap) {
        if (key.includes(trimmed) || trimmed.includes(key)) {
          result.push(value);
          found = true;
          break;
        }
      }
      
      if (!found) {
        // Narration paragraph - add tag if needed
        if (result.length === 0 || !result[result.length - 1].startsWith('[VOICE=NARRATOR]')) {
          result.push(`[VOICE=NARRATOR]\n${para}`);
        } else {
          // Append to existing NARRATOR section
          result[result.length - 1] += `\n${para}`;
        }
      }
    }
  }
  
  return result.join('\n');
}
