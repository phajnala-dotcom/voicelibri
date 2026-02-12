/**
 * Character Registry - Per-Chapter Character Extraction with Role
 * 
 * Universal approach for both translated and non-translated books:
 * - Extracts characters per-chapter with LLM-selected voices and roles
 * - Detects aliases (same character, different names)
 * - Maintains cumulative registry with locked voice/role assignments
 * - Provides flat character→voice→role mapping for TTS
 * - Extracts book info for narrator TTS instruction (chapters 1-2, then locked)
 */

import { GoogleAuth } from 'google-auth-library';
import { GeminiConfig, toTTSSpeakerAlias } from './llmCharacterAnalyzer.js';
import { GEMINI_VOICES, getVoiceByName, getVoicesByGender } from './geminiVoices.js';
import { 
  LLM_MODELS, 
  LLM_TEMPERATURES, 
  LLM_GENERATION_CONFIG,
  getCharacterExtractionPrompt,
  buildNarratorInstruction as buildNarratorInstructionFromConfig,
  DEFAULT_NARRATOR_VOICE
} from './promptConfig.js';

function normalizeBookPeriod(raw?: string | null): BookPeriod {
  if (!raw) return 'undefined';
  const normalized = raw.toLowerCase().trim();
  if (!normalized) return 'undefined';

  const directMap: Record<string, BookPeriod> = {
    prehistory: 'prehistory',
    prehistoric: 'prehistory',
    antiquity: 'antiquity',
    ancient: 'antiquity',
    classical: 'antiquity',
    'middle ages': 'middle ages',
    medieval: 'middle ages',
    'modern age': 'modern age',
    modern: 'modern age',
    contemporary: 'contemporary',
    present: 'contemporary',
    current: 'contemporary',
    future: 'future',
    futuristic: 'future',
    'science fiction': 'future',
    scifi: 'future',
    'sci-fi': 'future',
    undefined: 'undefined',
    unknown: 'undefined',
  };

  if (directMap[normalized]) {
    return directMap[normalized];
  }

  return 'undefined';
}

/**
 * Book/document information for narrator TTS instruction
 * Extracted from chapter 1, refined in chapter 2, then LOCKED
 * Each field STRICTLY MAX 10 WORDS
 */
export type BookPeriod = 'prehistory' | 'antiquity' | 'middle ages' | 'modern age' | 'contemporary' | 'future' | 'undefined';

export interface BookInfo {
  /** Genre(s) with adjectives: dark fantasy, gothic horror, etc. (MAX 10 WORDS) */
  genre: string;
  
  /** Tone: atmospheric, suspenseful, humorous, dramatic, etc. (MAX 10 WORDS) */
  tone: string;

  /** Voice tone: EXACTLY two concise adjectives, "adj1, adj2" (MAX 10 WORDS) */
  voiceTone: string;

  /** Historical period/era (normalized) */
  period?: BookPeriod;
  
  /** Whether bookInfo is locked (after chapter 2) */
  locked?: boolean;
}

/**
 * Character with alias support and role
 */
export interface RegisteredCharacter {
  /** Unique ID for this character */
  id: string;
  
  /** Primary name (first encountered) */
  primaryName: string;
  
  /** TTS speaker alias (ALL CAPS, alphanumeric only) */
  ttsAlias: string;
  
  /** All names/aliases for this character */
  aliases: string[];
  
  /** Assigned Gemini voice name (LOCKED after first assignment) */
  voice: string;
  
  /** Role describing who they are (2-3 words, can evolve gradually) */
  role: string;
  
  /** History of role changes: [chapterNum, role][] */
  roleHistory: Array<[number, string]>;
  
  /** Gender */
  gender: 'male' | 'female' | 'neutral' | 'unknown';
  
  /** Chapter where first encountered */
  firstSeenChapter: number;
  
  /** Last chapter where this character appeared */
  lastSeenChapter: number;
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
  
  /** LLM-selected Gemini voice name */
  voiceName: string;
  
  /** Role describing who they are (2-3 words) */
  role: string;
}

/**
 * LLM extraction response structure
 */
export interface ExtractionResult {
  /** Book/document info (only on chapters 1-2) */
  bookInfo?: BookInfo;
  
  /** Characters found in this chapter */
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
  private model: string = LLM_MODELS.CHARACTER;
  private auth: GoogleAuth;
  private endpoint: string;
  
  // Narrator voice (excluded from character assignments)
  private narratorVoice: string = DEFAULT_NARRATOR_VOICE;
  private usedVoices: Set<string> = new Set();
  
  // Book info for narrator TTS instruction (locked after chapter 2)
  private bookInfo: BookInfo | null = null;
  
  // Pre-built narrator TTS instruction (built from bookInfo)
  private narratorInstruction: string | null = null;
  
  constructor(config: GeminiConfig) {
    this.projectId = config.projectId;
    this.location = config.location || 'us-central1';
    this.model = config.model || LLM_MODELS.CHARACTER;
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
        temperature: LLM_TEMPERATURES.SPEECH_STYLE,
        maxOutputTokens: LLM_GENERATION_CONFIG.MAX_TOKENS_SPEECH_STYLE,
        topP: LLM_GENERATION_CONFIG.TOP_P,
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
   * Build Gemini voice list for LLM prompt
   */
  private getVoiceListForPrompt(): string {
    const maleVoices = GEMINI_VOICES.filter(v => v.gender === 'male')
      .map(v => `${v.name} (${v.pitch} pitch, ${v.characteristic})`)
      .join(', ');
    const femaleVoices = GEMINI_VOICES.filter(v => v.gender === 'female')
      .map(v => `${v.name} (${v.pitch} pitch, ${v.characteristic})`)
      .join(', ');
    
    return `MALE VOICES: ${maleVoices}
FEMALE VOICES: ${femaleVoices}`;
  }
  
  /**
   * Build already-assigned voices list for LLM prompt
   */
  private getAssignedVoicesForPrompt(): string {
    if (this.usedVoices.size === 0) {
      return '';
    }
    
    const assignments: string[] = [];
    if (this.narratorVoice) {
      assignments.push(`${this.narratorVoice} (NARRATOR)`);
    }
    for (const char of this.characters.values()) {
      assignments.push(`${char.voice} (${char.primaryName})`);
    }
    
    return `ALREADY ASSIGNED (do NOT reuse): ${assignments.join(', ')}`;
  }
  
  /**
   * Extract characters from a chapter (content only, not sections)
   * Updates registry with new characters, aliases, and book info
   * 
   * IMPORTANT: Only call this for actual chapters (isFrontMatter === false)
   * Front matter sections (TOC, dedication, etc.) should be skipped
   * 
   * @param chapterText - Chapter text (translated if applicable)
   * @param chapterNum - Chapter number (1-based, content chapters only)
   * @param isFrontMatter - If true, skip character extraction (return current state)
   * @returns Updated character list for this chapter
   */
  async extractFromChapter(
    chapterText: string, 
    chapterNum: number,
    isFrontMatter: boolean = false
  ): Promise<RegisteredCharacter[]> {
    // Skip front matter sections - they don't contain character dialogue
    if (isFrontMatter) {
      console.log(`   ⏭️ Skipping section ${chapterNum} (front matter - no character extraction)`);
      return this.getAllCharacters();
    }
    
    // Build known characters list for the prompt
    const knownCharsList = this.getKnownCharactersForPrompt();
    const voiceList = this.getVoiceListForPrompt();
    const assignedVoices = this.getAssignedVoicesForPrompt();
    
    // Include bookInfo request for chapters 1-2 only (unless already locked)
    const needsBookInfo = chapterNum <= 2 && (!this.bookInfo || !this.bookInfo.locked);
    
    // Use centralized prompt from Control Room
    const prompt = getCharacterExtractionPrompt(
      voiceList,
      assignedVoices,
      knownCharsList,
      chapterText,
      needsBookInfo
    );

    try {
      const response = await this.callGemini(prompt);
      
      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(`   ⚠️ Chapter ${chapterNum}: No valid JSON in extraction response`);
        return this.getAllCharacters();
      }
      
      const result: ExtractionResult = JSON.parse(jsonMatch[0]);
      
      // Process bookInfo if present (chapters 1-2)
      if (result.bookInfo && !this.bookInfo?.locked) {
        const normalizedPeriod = normalizeBookPeriod(result.bookInfo.period);
        if (chapterNum === 1) {
          // First extraction
          this.bookInfo = { ...result.bookInfo, period: normalizedPeriod, locked: false };
          console.log(`   📚 Book info extracted: ${this.bookInfo.genre}, ${this.bookInfo.tone}`);
        } else if (chapterNum === 2) {
          // Refine and lock
          this.bookInfo = { ...result.bookInfo, period: normalizedPeriod, locked: true };
          this.buildNarratorInstruction();
          console.log(`   📚 Book info refined and LOCKED: ${this.bookInfo.genre}, ${this.bookInfo.tone}`);
        }
      }
      
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
   * Build narrator TTS instruction from bookInfo
   * Uses centralized template from Control Room
   */
  private buildNarratorInstruction(): void {
    this.narratorInstruction = buildNarratorInstructionFromConfig(this.bookInfo);
    console.log(`   🎭 Narrator instruction: ${this.narratorInstruction.trim()}`);
  }
  
  /**
  * Get narrator TTS instruction (speechStyle format - natural sentence with action verb)
   */
  getNarratorInstruction(): string {
    if (!this.narratorInstruction) {
      this.buildNarratorInstruction();
    }
    return this.narratorInstruction!;
  }
  
  /**
   * Get book info (if extracted)
   */
  getBookInfo(): BookInfo | null {
    return this.bookInfo;
  }
  
  /**
   * Validate voice name against Gemini voice list
   * Returns valid voice name or fallback based on gender
   */
  private validateVoiceName(voiceName: string, gender: 'male' | 'female' | 'neutral' | 'unknown'): string {
    // Check if voice exists
    const voice = getVoiceByName(voiceName);
    if (voice) {
      return voice.name;
    }
    
    // Fallback: pick random unused voice of matching gender
    console.warn(`   ⚠️ Invalid voice "${voiceName}", using fallback`);
    const genderFilter = gender === 'unknown' || gender === 'neutral' ? 'male' : gender;
    const genderVoices = getVoicesByGender(genderFilter);
    const available = genderVoices.filter(v => !this.usedVoices.has(v.name));
    
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)].name;
    }
    
    // All voices used, reuse any of matching gender
    return genderVoices[Math.floor(Math.random() * genderVoices.length)].name;
  }
  
  /**
  * Process a single character from extraction
  * Voice is LOCKED, but role can evolve gradually
   */
  private processCharacter(charInfo: ChapterCharacterInfo, chapterNum: number): void {
    const normalizedName = charInfo.name.trim();
    
    // Check if this name is already known
    if (this.nameToId.has(normalizedName)) {
      // Already registered - update role if different (evolution)
      const existingId = this.nameToId.get(normalizedName)!;
      const existing = this.characters.get(existingId)!;
      existing.lastSeenChapter = chapterNum;
      
      // Allow role evolution for character development (e.g., child → elderly)
      if (charInfo.role && charInfo.role !== existing.role) {
        const newRole = charInfo.role.toLowerCase().split(/\s+/).slice(0, 3).join(' '); // MAX 3 WORDS
        existing.roleHistory.push([chapterNum, newRole]);
        existing.role = newRole;
        console.log(`   🔄 Role evolved: "${existing.primaryName}" → "${newRole}"`);
      }
      return;
    }
    
    // Check if this is an alias of a known character
    if (charInfo.sameAs) {
      const normalizedSameAs = charInfo.sameAs.trim();
      const existingId = this.nameToId.get(normalizedSameAs);
      
      if (existingId) {
        const existing = this.characters.get(existingId)!;
        
        // Add as alias (inherits voice/role from original)
        if (!existing.aliases.includes(normalizedName)) {
          existing.aliases.push(normalizedName);
          this.nameToId.set(normalizedName, existingId);
          
          // Also add TTS alias for this name
          const ttsAlias = toTTSSpeakerAlias(normalizedName);
          if (!existing.aliases.includes(ttsAlias)) {
            existing.aliases.push(ttsAlias);
            this.nameToId.set(ttsAlias, existingId);
          }
          
          console.log(`   🔗 Alias: "${normalizedName}" → "${existing.primaryName}" (voice: ${existing.voice})`);
        }
        return;
      }
      // sameAs target not found - treat as new character
    }
    
    // New character - use LLM-selected voice (with validation) and role
    const id = `char_${this.nextId++}`;
    
    // Generate TTS alias (ALL CAPS, alphanumeric only)
    const ttsAlias = toTTSSpeakerAlias(normalizedName);
    
    // Validate and get voice
    const voice = this.validateVoiceName(charInfo.voiceName, charInfo.gender);
    this.usedVoices.add(voice);
    
    // Ensure role is MAX 3 WORDS
    const role = charInfo.role
      ? charInfo.role.toLowerCase().split(/\s+/).slice(0, 3).join(' ')
      : 'unknown person';
    
    const newChar: RegisteredCharacter = {
      id,
      primaryName: normalizedName,
      ttsAlias,
      aliases: [normalizedName, ttsAlias],
      voice,
      role,
      roleHistory: [[chapterNum, role]],
      gender: charInfo.gender,
      firstSeenChapter: chapterNum,
      lastSeenChapter: chapterNum,
    };
    
    this.characters.set(id, newChar);
    this.nameToId.set(normalizedName, id);
    this.nameToId.set(ttsAlias, id);
    
    console.log(`   👤 New: "${normalizedName}" (${charInfo.gender}) → ${voice} [${role}]`);
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
      lines.push(`- ${char.primaryName}${aliases}: ${char.gender}, voice=${char.voice}, role="${char.role}"`);
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
   * Look up role for any character name (including aliases)
   * Returns role text (2-3 words)
   */
  getSpeechStyleForName(name: string): string | undefined {
    const id = this.nameToId.get(name.trim());
    if (!id) return undefined;
    const role = this.characters.get(id)?.role;
    return role;
  }
  
  /**
   * Get raw role text for any character name
   */
  getRawSpeechStyleForName(name: string): string | undefined {
    const id = this.nameToId.get(name.trim());
    if (!id) return undefined;
    return this.characters.get(id)?.role;
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
    this.bookInfo = null;
    this.narratorInstruction = null;
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
  
  /**
   * Export registry state to JSON for review and debugging
   * Saved to audiobooks/{bookTitle}/character_registry.json
   */
  toJSON(): object {
    // Ensure narrator instruction is built before export
    if (!this.narratorInstruction) {
      this.buildNarratorInstruction();
    }
    
    return {
      exportedAt: new Date().toISOString(),
      bookInfo: this.bookInfo,
      narratorVoice: this.narratorVoice,
      narratorInstruction: this.narratorInstruction,
      characterCount: this.characters.size,
      characters: Array.from(this.characters.values()).map(char => ({
        id: char.id,
        primaryName: char.primaryName,
        aliases: char.aliases,
        voice: char.voice,
        gender: char.gender,
        role: char.role,
        roleHistory: char.roleHistory,
        firstSeenChapter: char.firstSeenChapter,
        lastSeenChapter: char.lastSeenChapter,
      })),
      voiceMap: this.getVoiceMap(),
    };
  }
  
  /**
   * Save registry to JSON file in audiobook folder
   * @param bookFolder - Path to audiobook folder
   */
  async saveToFile(bookFolder: string): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');
    
    const jsonPath = path.join(bookFolder, 'character_registry.json');
    const jsonContent = JSON.stringify(this.toJSON(), null, 2);
    
    await fs.promises.writeFile(jsonPath, jsonContent, 'utf8');
    console.log(`   📝 Character registry saved: ${jsonPath}`);
    
    return jsonPath;
  }
}
