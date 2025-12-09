/**
 * Dialogue Parser for Dramatized E-Book Reading
 * 
 * Phase 1 - PoC Implementation
 * Deterministic rule-based dialogue and character detection
 * No LLM used in this phase
 */

export interface DialogueSegment {
  type: 'narrator' | 'dialogue';
  speaker: string; // 'NARRATOR', 'JOHN', 'MARY', 'UNKNOWN_1', etc.
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
  geminiVoice?: string; // For future Phase 2
}

/**
 * Detects dialogues in text using deterministic heuristics
 * 
 * Detection patterns:
 * 1. Standard quotes: "..."
 * 2. Czech quotes: „..."
 * 3. Em-dash dialogues: — ...
 * 4. Attribution patterns: John said, "..." / "..." said John / "..." John replied
 * 
 * @param text - Input text to analyze
 * @returns Array of dialogue segments with speaker attribution
 */
export function detectDialogues(text: string): DialogueSegment[] {
  const segments: DialogueSegment[] = [];
  let unknownSpeakerCounter = 1;
  let lastSpeaker = 'NARRATOR';
  
  // Split into paragraphs (separated by newlines)
  const paragraphs = text.split('\n').filter(p => p.trim().length > 0);
  
  let currentIndex = 0;
  
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    
    // Strategy: Extract ALL quoted text first, then process narrator parts
    const dialogueMatches: Array<{
      dialogue: string;
      speaker: string;
      index: number;
      length: number;
    }> = [];
    
    // Find all Czech quotes „..." with attribution
    const czechQuoteRegex = /[„"]([^""]+)[""]\s*[,.]?\s*(zvolal|zvolala|poznamenal|poznamenala|řekl|řekla|odpověděl|odpověděla|prohlásil|prohlásila|dodal|dodala|podotkl|podotkla)(\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+(\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)*))?/g;
    
    let match;
    while ((match = czechQuoteRegex.exec(trimmed)) !== null) {
      const dialogue = match[1].trim();
      const speaker = match[4] ? match[4].toUpperCase() : lastSpeaker;
      
      dialogueMatches.push({
        dialogue,
        speaker,
        index: match.index,
        length: match[0].length,
      });
      
      if (match[4]) {
        lastSpeaker = speaker;
      }
    }
    
    // Find standalone Czech quotes without attribution
    const standaloneQuoteRegex = /[„"]([^""]+)[""]/g;
    let standaloneMatch;
    while ((standaloneMatch = standaloneQuoteRegex.exec(trimmed)) !== null) {
      // Check if this match is not already captured
      const alreadyCaptured = dialogueMatches.some(
        dm => dm.index <= standaloneMatch!.index && 
              dm.index + dm.length >= standaloneMatch!.index + standaloneMatch![0].length
      );
      
      if (!alreadyCaptured) {
        dialogueMatches.push({
          dialogue: standaloneMatch[1].trim(),
          speaker: lastSpeaker,
          index: standaloneMatch.index,
          length: standaloneMatch[0].length,
        });
      }
    }
    
    // Sort dialogue matches by index
    dialogueMatches.sort((a, b) => a.index - b.index);
    
    // Now extract narrator parts (text between dialogues)
    let lastEnd = 0;
    
    for (const dm of dialogueMatches) {
      // Add narrator segment before this dialogue (if any)
      if (dm.index > lastEnd) {
        const narratorText = trimmed.substring(lastEnd, dm.index).trim();
        if (narratorText.length > 0) {
          // Remove attribution verbs from narrator text
          const cleanedNarrator = narratorText
            .replace(/\s+(zvolal|zvolala|poznamenal|poznamenala|řekl|řekla|odpověděl|odpověděla|prohlásil|prohlásila|dodal|dodala|podotkl|podotkla)(\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)?[,.]?\s*$/i, '')
            .trim();
          
          if (cleanedNarrator.length > 0) {
            segments.push({
              type: 'narrator',
              speaker: 'NARRATOR',
              text: cleanedNarrator,
              startIndex: currentIndex + lastEnd,
              endIndex: currentIndex + dm.index,
            });
          }
        }
      }
      
      // Add dialogue segment
      segments.push({
        type: 'dialogue',
        speaker: dm.speaker,
        text: dm.dialogue,
        startIndex: currentIndex + dm.index,
        endIndex: currentIndex + dm.index + dm.length,
      });
      
      lastEnd = dm.index + dm.length;
    }
    
    // Add remaining narrator text after last dialogue (if any)
    if (lastEnd < trimmed.length) {
      const remainingText = trimmed.substring(lastEnd).trim();
      if (remainingText.length > 0) {
        segments.push({
          type: 'narrator',
          speaker: 'NARRATOR',
          text: remainingText,
          startIndex: currentIndex + lastEnd,
          endIndex: currentIndex + trimmed.length,
        });
      }
    }
    
    // If no dialogues found, entire paragraph is narrator
    if (dialogueMatches.length === 0 && trimmed.length > 0) {
      segments.push({
        type: 'narrator',
        speaker: 'NARRATOR',
        text: trimmed,
        startIndex: currentIndex,
        endIndex: currentIndex + trimmed.length,
      });
    }
    
    currentIndex += paragraph.length + 1; // +1 for newline
  }
  
  return segments;
}

/**
 * Identifies unique characters from dialogue segments
 * 
 * @param segments - Dialogue segments from detectDialogues()
 * @returns Map of character names to their info
 */
export function identifyCharacters(segments: DialogueSegment[]): Map<string, CharacterInfo> {
  const characters = new Map<string, CharacterInfo>();
  
  for (const segment of segments) {
    const speaker = segment.speaker;
    
    if (!characters.has(speaker)) {
      // Infer gender from name heuristics (Czech language)
      let gender: 'male' | 'female' | 'neutral' = 'neutral';
      
      if (speaker === 'NARRATOR' || speaker.startsWith('UNKNOWN_')) {
        gender = 'neutral';
      } else {
        // Czech female names often end with: -a, -e, -ie
        // Male names: consonants or -ek, -ík, etc.
        const lowerName = speaker.toLowerCase();
        
        if (lowerName.endsWith('a') || lowerName.endsWith('e') || lowerName.endsWith('ie')) {
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
 * Inserts voice tags around each dialogue/narrator segment
 * 
 * Format: [VOICE=CHARACTER_NAME]\ntext\n[/VOICE]
 * 
 * IMPORTANT: These tags MUST be removed before sending to TTS API!
 * They are for text markup only, not to be read aloud.
 * 
 * @param segments - Dialogue segments with speaker attribution
 * @returns Text with inserted voice tags
 */
export function insertVoiceTags(segments: DialogueSegment[]): string {
  const taggedParts: string[] = [];
  
  for (const segment of segments) {
    const voiceTag = `[VOICE=${segment.speaker}]`;
    const closeTag = `[/VOICE]`;
    
    taggedParts.push(`${voiceTag}\n${segment.text}\n${closeTag}`);
  }
  
  return taggedParts.join('\n\n');
}

/**
 * Removes voice tags from text for TTS synthesis
 * 
 * CRITICAL: TTS must never receive voice tags in text.
 * Voice selection is passed via API parameters only.
 * 
 * @param taggedText - Text with [VOICE=...] and [/VOICE] tags
 * @returns Plain text without tags
 */
export function removeVoiceTags(taggedText: string): string {
  // Remove opening tags: [VOICE=NAME]
  let plainText = taggedText.replace(/\[VOICE=[^\]]+\]/g, '');
  
  // Remove closing tags: [/VOICE]
  plainText = plainText.replace(/\[\/VOICE\]/g, '');
  
  // Clean up extra whitespace
  plainText = plainText.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
  plainText = plainText.trim();
  
  return plainText;
}

/**
 * Extracts voice segments from tagged text
 * 
 * Useful for multi-voice TTS (Phase 3, optional)
 * Returns array of { voice, text } pairs
 * 
 * @param taggedText - Text with [VOICE=...] tags
 * @returns Array of voice segments
 */
export function extractVoiceSegments(taggedText: string): Array<{ voice: string; text: string }> {
  const segments: Array<{ voice: string; text: string }> = [];
  
  // Regex to match [VOICE=NAME]...text...[/VOICE]
  const voicePattern = /\[VOICE=([^\]]+)\]\s*([\s\S]*?)\s*\[\/VOICE\]/g;
  
  let match;
  while ((match = voicePattern.exec(taggedText)) !== null) {
    const voice = match[1];
    const text = match[2].trim();
    
    if (text.length > 0) {
      segments.push({ voice, text });
    }
  }
  
  return segments;
}

/**
 * Generates PoC voice map from character list
 * 
 * Simple gender-based mapping for Phase 1
 * Phase 2 will use LLM for sophisticated voice assignment
 * 
 * @param characters - Map of characters from identifyCharacters()
 * @returns Voice map in JSON-serializable format
 */
export function generatePoCVoiceMap(
  characters: Map<string, CharacterInfo>
): Record<string, VoiceProfile> {
  const voiceMap: Record<string, VoiceProfile> = {};
  
  for (const [name, info] of characters.entries()) {
    voiceMap[name] = {
      gender: info.gender,
      // Phase 2: Will add geminiVoice assignment based on character traits
    };
  }
  
  return voiceMap;
}

/**
 * Full pipeline: Parse text → Detect dialogues → Insert tags → Generate voice map
 * 
 * @param inputText - Raw text to process
 * @returns Object with tagged text, segments, characters, and voice map
 */
export function processDramatizedText(inputText: string) {
  console.log('🎭 Starting dramatized text processing...');
  
  // Step 1: Detect dialogues
  const segments = detectDialogues(inputText);
  console.log(`✓ Detected ${segments.length} segments`);
  
  // Step 2: Identify characters
  const characters = identifyCharacters(segments);
  console.log(`✓ Identified ${characters.size} unique characters/speakers`);
  
  // Step 3: Insert voice tags
  const taggedText = insertVoiceTags(segments);
  console.log(`✓ Inserted voice tags (${taggedText.length} chars)`);
  
  // Step 4: Generate voice map
  const voiceMap = generatePoCVoiceMap(characters);
  console.log(`✓ Generated PoC voice map`);
  
  return {
    taggedText,
    segments,
    characters,
    voiceMap,
  };
}
