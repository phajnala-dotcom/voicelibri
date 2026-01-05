/**
 * Character Registry - Per-Chapter Character Extraction with Alias Support
 * 
 * Universal approach for both translated and non-translated books:
 * - Extracts characters per-chapter (after translation if applicable)
 * - Detects aliases (same character, different names)
 * - Maintains cumulative registry with locked voice assignments
 * - Provides flat character→voice mapping for dramatization
 */

import { GoogleAuth } from 'google-auth-library';
import { GeminiConfig } from './llmCharacterAnalyzer.js';
import { selectVoiceForCharacter, GeminiVoice } from './geminiVoices.js';

/**
 * Character with alias support
 */
export interface RegisteredCharacter {
  /** Unique ID for this character */
  id: string;
  
  /** Primary name (first encountered) */
  primaryName: string;
  
  /** All names/aliases for this character */
  aliases: string[];
  
  /** Assigned voice (LOCKED after first assignment) */
  voice: string;
  
  /** Gender for voice selection */
  gender: 'male' | 'female' | 'neutral' | 'unknown';
  
  /** Cumulative personality traits */
  traits: string[];
  
  /** Chapter where first encountered */
  firstSeenChapter: number;
}

/**
 * Character extraction result from LLM (per chapter)
 */
export interface ChapterCharacterInfo {
  /** Name as it appears in this chapter */
  name: string;
  
  /** If this is same character as existing one (alias detection) */
  sameAs?: string;
  
  /** Gender */
  gender: 'male' | 'female' | 'neutral' | 'unknown';
  
  /** Traits observed in this chapter */
  traits: string[];
}

/**
 * LLM extraction response structure
 */
export interface ExtractionResult {
  characters: ChapterCharacterInfo[];
}

/**
 * Character Registry class
 * Maintains cumulative character state across chapters
 */
export class CharacterRegistry {
  private characters: Map<string, RegisteredCharacter> = new Map();
  private nameToId: Map<string, string> = new Map(); // Fast lookup: any name/alias → character ID
  private nextId: number = 1;
  
  private projectId: string;
  private location: string;
  private model: string = 'gemini-2.5-flash';
  private auth: GoogleAuth;
  private endpoint: string;
  
  // Narrator voice (excluded from character assignments)
  private narratorVoice: string = 'Enceladus';
  private usedVoices: Set<string> = new Set();
  
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
   * Set narrator voice (to exclude from character assignments)
   */
  setNarratorVoice(narratorVoice: string): void {
    this.narratorVoice = narratorVoice;
    this.usedVoices.add(narratorVoice);
    console.log(`[CharacterRegistry] Narrator voice "${narratorVoice}" excluded from character assignments`);
  }
  
  /**
   * Call Gemini API for character extraction
   */
  private async callGemini(prompt: string): Promise<string> {
    const client = await this.auth.getClient();
    const token = await client.getAccessToken();

    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        topP: 0.95,
      },
    };

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
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error('No text in Gemini response');
    }

    return text.trim();
  }
  
  /**
   * Extract characters from a chapter
   * Updates registry with new characters and aliases
   * 
   * @param chapterText - Chapter text (translated if applicable)
   * @param chapterNum - Chapter number (1-based)
   * @returns Updated character list for this chapter
   */
  async extractFromChapter(chapterText: string, chapterNum: number): Promise<RegisteredCharacter[]> {
    // Build known characters list for the prompt
    const knownCharsList = this.getKnownCharactersForPrompt();
    
    const prompt = `You are analyzing a book chapter for character identification.

${knownCharsList ? `KNOWN CHARACTERS (already have voices assigned - check if any names refer to these):
${knownCharsList}

` : ''}CHAPTER TEXT:
${chapterText.substring(0, 30000)}

Extract ALL characters who speak dialogue in this chapter. Return JSON only:
{
  "characters": [
    {
      "name": "exact name as written",
      "sameAs": "known character name if this is same person (optional)",
      "gender": "male|female|neutral|unknown",
      "traits": ["trait1", "trait2"]
    }
  ]
}

RULES:
1. Include ONLY characters who speak dialogue (have quoted speech)
2. Use the EXACT name as it appears in the text
3. If a character is clearly the SAME PERSON as a known character but using a different name:
   - Set "sameAs" to the known character's primary name
   - Examples: "Mrs. Westenra" might be sameAs "old woman" if context shows they're the same person
4. For NEW characters not matching any known character: omit "sameAs" field
5. Always include descriptive references as names if they speak (e.g., "old woman", "the driver")
6. Do NOT include NARRATOR - that is handled separately

Return ONLY valid JSON, no markdown or explanation.`;

    try {
      const response = await this.callGemini(prompt);
      
      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(`   ⚠️ Chapter ${chapterNum}: No valid JSON in extraction response`);
        return this.getAllCharacters();
      }
      
      const result: ExtractionResult = JSON.parse(jsonMatch[0]);
      
      // Process each character
      for (const charInfo of result.characters) {
        this.processCharacter(charInfo, chapterNum);
      }
      
      const newChars = result.characters.filter(c => !c.sameAs).length;
      const aliases = result.characters.filter(c => c.sameAs).length;
      
      if (newChars > 0 || aliases > 0) {
        console.log(`   📋 Chapter ${chapterNum}: ${newChars} new characters, ${aliases} aliases detected`);
      }
      
      return this.getAllCharacters();
      
    } catch (error) {
      console.error(`   ⚠️ Chapter ${chapterNum} extraction failed:`, error);
      return this.getAllCharacters();
    }
  }
  
  /**
   * Process a single character from extraction
   */
  private processCharacter(charInfo: ChapterCharacterInfo, chapterNum: number): void {
    const normalizedName = charInfo.name.trim();
    
    // Check if this name is already known
    if (this.nameToId.has(normalizedName)) {
      // Already registered (either as primary or alias)
      const existingId = this.nameToId.get(normalizedName)!;
      const existing = this.characters.get(existingId)!;
      
      // Merge traits
      for (const trait of charInfo.traits) {
        if (!existing.traits.includes(trait)) {
          existing.traits.push(trait);
        }
      }
      return;
    }
    
    // Check if this is an alias of a known character
    if (charInfo.sameAs) {
      const normalizedSameAs = charInfo.sameAs.trim();
      const existingId = this.nameToId.get(normalizedSameAs);
      
      if (existingId) {
        const existing = this.characters.get(existingId)!;
        
        // Add as alias
        if (!existing.aliases.includes(normalizedName)) {
          existing.aliases.push(normalizedName);
          this.nameToId.set(normalizedName, existingId);
          console.log(`   🔗 Alias: "${normalizedName}" → "${existing.primaryName}"`);
        }
        
        // Merge traits
        for (const trait of charInfo.traits) {
          if (!existing.traits.includes(trait)) {
            existing.traits.push(trait);
          }
        }
        return;
      }
      // sameAs target not found - treat as new character
    }
    
    // New character - assign voice using selectVoiceForCharacter
    const id = `char_${this.nextId++}`;
    
    // Map gender for voice selection
    const voiceGender = charInfo.gender === 'unknown' ? 'neutral' : charInfo.gender;
    
    const selectedVoice = selectVoiceForCharacter(
      normalizedName,
      voiceGender as 'male' | 'female' | 'neutral',
      charInfo.traits,
      Array.from(this.usedVoices)
    );
    
    const voice = selectedVoice.name;
    this.usedVoices.add(voice);
    
    const newChar: RegisteredCharacter = {
      id,
      primaryName: normalizedName,
      aliases: [normalizedName], // Primary name is also in aliases for easy lookup
      voice,
      gender: charInfo.gender,
      traits: charInfo.traits,
      firstSeenChapter: chapterNum,
    };
    
    this.characters.set(id, newChar);
    this.nameToId.set(normalizedName, id);
    
    console.log(`   👤 New: "${normalizedName}" (${charInfo.gender}) → ${voice}`);
  }
  
  /**
   * Get known characters formatted for prompt
   */
  private getKnownCharactersForPrompt(): string {
    if (this.characters.size === 0) {
      return '';
    }
    
    const lines: string[] = [];
    for (const char of this.characters.values()) {
      const aliases = char.aliases.length > 1 
        ? ` (also: ${char.aliases.filter(a => a !== char.primaryName).join(', ')})`
        : '';
      lines.push(`- ${char.primaryName}${aliases}: ${char.gender}, ${char.traits.join(', ')}`);
    }
    return lines.join('\n');
  }
  
  /**
   * Get all registered characters
   */
  getAllCharacters(): RegisteredCharacter[] {
    return Array.from(this.characters.values());
  }
  
  /**
   * Get flat voice map for dramatization
   * Maps ALL names/aliases to their assigned voice
   */
  getVoiceMap(): Record<string, string> {
    const voiceMap: Record<string, string> = {};
    
    for (const char of this.characters.values()) {
      for (const alias of char.aliases) {
        voiceMap[alias] = char.voice;
      }
    }
    
    return voiceMap;
  }
  
  /**
   * Get voice map formatted for dramatization prompt
   * Each line: "name1, name2, alias → Voice"
   */
  getVoiceMapForPrompt(narratorVoice: string): string {
    const lines: string[] = [`- NARRATOR → ${narratorVoice}`];
    
    for (const char of this.characters.values()) {
      const names = char.aliases.join(', ');
      lines.push(`- ${names} → ${char.voice}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Look up voice for any character name (including aliases)
   */
  getVoiceForName(name: string): string | undefined {
    const id = this.nameToId.get(name.trim());
    if (!id) return undefined;
    return this.characters.get(id)?.voice;
  }
  
  /**
   * Get all known character names (primary + aliases)
   */
  getAllNames(): string[] {
    return Array.from(this.nameToId.keys());
  }
  
  /**
   * Clear registry (for new book)
   */
  clear(): void {
    this.characters.clear();
    this.nameToId.clear();
    this.usedVoices.clear();
    if (this.narratorVoice) {
      this.usedVoices.add(this.narratorVoice);
    }
    this.nextId = 1;
  }
  
  /**
   * Get character count
   */
  get size(): number {
    return this.characters.size;
  }
}
