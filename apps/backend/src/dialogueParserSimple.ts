/**
 * SIMPLIFIED Dialogue Parser for Phase 1 PoC
 * 
 * Focuses on core functionality:
 * - Extract ALL quoted text (Czech quotes „...")
 * - Identify speakers from attribution (Lili poznamenala, Ragowski zvolal)
 * - Split text into narrator/dialogue segments
 */

export interface DialogueSegment {
  type: 'narrator' | 'dialogue';
  speaker: string;
  text: string;
  startIndex: number;
  endIndex: number;
}

export interface CharacterInfo {
  name: string;
  gender: 'male' | 'female' | 'neutral';
  appearanceCount: number;
}

export interface VoiceProfile {
  gender: 'male' | 'female' | 'neutral';
}

/**
 * Detects ALL dialogues in text using simple regex
 */
export function detectDialogues(text: string): DialogueSegment[] {
  const segments: DialogueSegment[] = [];
  
  // Strategy: Find speaker names in text BEFORE quotes, then extract quotes
  
  // First pass: Find all quotes
  const quoteRegex = /[\u201E\u201C„"]([^\u201E\u201C""]+)[\u201E\u201C""]/g;
  const quotes: Array<{
    text: string;
    index: number;
    length: number;
  }> = [];
  
  let match;
  while ((match = quoteRegex.exec(text)) !== null) {
    quotes.push({
      text: match[1].trim(),
      index: match.index,
      length: match[0].length,
    });
  }
  
  // Second pass: For each quote, look backwards for speaker attribution
  const dialogues: Array<{
    text: string;
    speaker: string;
    index: number;
    length: number;
  }> = [];
  
  let lastKnownSpeaker = 'NARRATOR';
  
  for (const quote of quotes) {
    let speaker = lastKnownSpeaker;
    
    // Look at text BEFORE the quote (up to 100 chars back)
    const startSearch = Math.max(0, quote.index - 100);
    const beforeText = text.substring(startSearch, quote.index);
    
    // Pattern 1: verb + Name immediately before quote
    // Example: "poznamenala Lili Saffro. „..."
    const verbNamePattern = /(zvolal|zvolala|poznamenal|poznamenala|řekl|řekla|odpověděl|odpověděla|prohlásil|prohlásila|dodal|dodala|podotkl|podotkla)\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+(\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)*)[,.]?\s*$/;
    const verbNameMatch = beforeText.match(verbNamePattern);
    
    if (verbNameMatch) {
      speaker = verbNameMatch[2].toUpperCase();
      lastKnownSpeaker = speaker;
    } else {
      // Pattern 2: Name + action verb (not dialogue verb) before quote
      // Example: "Ragowski zavrčel... „..."
      const nameActionPattern = /([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)\s+([a-záčďéěíňóřšťúůýž]+)[^.!?]*[,.]?\s*$/;
      const nameActionMatch = beforeText.match(nameActionPattern);
      
      if (nameActionMatch) {
        speaker = nameActionMatch[1].toUpperCase();
        lastKnownSpeaker = speaker;
      }
    }
    
    dialogues.push({
      text: quote.text,
      speaker: speaker,
      index: quote.index,
      length: quote.length,
    });
  }
  
  // Third pass: Split text into narrator + dialogue segments
  let lastIndex = 0;
  
  for (const dialogue of dialogues) {
    // Add narrator part BEFORE this dialogue
    if (dialogue.index > lastIndex) {
      const narratorText = text.substring(lastIndex, dialogue.index).trim();
      if (narratorText.length > 0) {
        // Clean up narrator text - remove attribution at the end
        const cleanedNarrator = narratorText
          .replace(/\s+(zvolal|zvolala|poznamenal|poznamenala|řekl|řekla|odpověděl|odpověděla|prohlásil|prohlásila|dodal|dodala|podotkl|podotkla)(\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+(\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)*)?[,.]?\s*$/i, '')
          .trim();
        
        if (cleanedNarrator.length > 0 && cleanedNarrator !== '.') {
          segments.push({
            type: 'narrator',
            speaker: 'NARRATOR',
            text: cleanedNarrator,
            startIndex: lastIndex,
            endIndex: dialogue.index,
          });
        }
      }
    }
    
    // Add dialogue
    segments.push({
      type: 'dialogue',
      speaker: dialogue.speaker,
      text: dialogue.text,
      startIndex: dialogue.index,
      endIndex: dialogue.index + dialogue.length,
    });
    
    lastIndex = dialogue.index + dialogue.length;
  }
  
  // Add remaining narrator text
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex).trim();
    if (remainingText.length > 0) {
      segments.push({
        type: 'narrator',
        speaker: 'NARRATOR',
        text: remainingText,
        startIndex: lastIndex,
        endIndex: text.length,
      });
    }
  }
  
  return segments;
}

/**
 * Identifies characters from segments
 */
export function identifyCharacters(segments: DialogueSegment[]): Map<string, CharacterInfo> {
  const characters = new Map<string, CharacterInfo>();
  
  for (const segment of segments) {
    const speaker = segment.speaker;
    
    if (!characters.has(speaker)) {
      let gender: 'male' | 'female' | 'neutral' = 'neutral';
      
      if (speaker === 'NARRATOR') {
        gender = 'neutral';
      } else {
        // Czech name gender heuristics
        const lowerName = speaker.toLowerCase();
        
        // Female indicators: ends with -a, -e, -ie, -í
        // Common female names: Anna, Marie, Lucie, Jana, Lili, etc.
        if (lowerName.endsWith('a') || lowerName.endsWith('e') || 
            lowerName.endsWith('ie') || lowerName.endsWith('í') ||
            lowerName.includes('lili') || lowerName.includes('marie')) {
          gender = 'female';
        } else {
          gender = 'male';
        }
      }
      
      characters.set(speaker, {
        name: speaker,
        gender: gender,
        appearanceCount: 1,
      });
    } else {
      const char = characters.get(speaker)!;
      char.appearanceCount++;
    }
  }
  
  return characters;
}

/**
 * Inserts voice tags
 */
export function insertVoiceTags(segments: DialogueSegment[]): string {
  const parts: string[] = [];
  
  for (const segment of segments) {
    parts.push(`[VOICE=${segment.speaker}]`);
    parts.push(segment.text);
    parts.push(`[/VOICE]`);
  }
  
  return parts.join('\n');
}

/**
 * Removes voice tags for TTS
 */
export function removeVoiceTags(taggedText: string): string {
  return taggedText
    .replace(/\[VOICE=[^\]]+\]/g, '')
    .replace(/\[\/VOICE\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts voice segments
 */
export function extractVoiceSegments(taggedText: string): Array<{ voice: string; text: string }> {
  const segments: Array<{ voice: string; text: string }> = [];
  const voicePattern = /\[VOICE=([^\]]+)\]\s*([\s\S]*?)\s*\[\/VOICE\]/g;
  
  let match;
  while ((match = voicePattern.exec(taggedText)) !== null) {
    segments.push({
      voice: match[1],
      text: match[2].trim(),
    });
  }
  
  return segments;
}

/**
 * Generates voice map
 */
export function generatePoCVoiceMap(characters: Map<string, CharacterInfo>): Record<string, VoiceProfile> {
  const voiceMap: Record<string, VoiceProfile> = {};
  
  for (const [name, info] of characters.entries()) {
    voiceMap[name] = {
      gender: info.gender,
    };
  }
  
  return voiceMap;
}

/**
 * Full processing pipeline
 */
export function processDramatizedText(inputText: string) {
  console.log('🎭 Starting dramatized text processing (SIMPLE mode)...');
  
  const segments = detectDialogues(inputText);
  console.log(`✓ Detected ${segments.length} segments`);
  
  const characters = identifyCharacters(segments);
  console.log(`✓ Identified ${characters.size} unique characters`);
  
  const taggedText = insertVoiceTags(segments);
  console.log(`✓ Inserted voice tags`);
  
  const voiceMap = generatePoCVoiceMap(characters);
  console.log(`✓ Generated voice map`);
  
  return {
    taggedText,
    segments,
    characters,
    voiceMap,
  };
}
