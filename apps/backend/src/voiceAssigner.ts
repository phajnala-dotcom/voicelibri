/**
 * Voice Assigner - Character to Voice Mapping
 * 
 * Automatically assigns unique Gemini TTS voices to characters based on:
 * - Gender matching
 * - Pitch preferences (age, authority)
 * - Character traits
 * 
 * Part of Dramatized TTS implementation (PoC Phase)
 */

import { selectVoiceForCharacter, GeminiVoice } from './geminiVoices.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Character profile from LLM analysis
 */
export interface Character {
  name: string;
  gender: 'male' | 'female' | 'neutral';
  traits: string[];
  dialogueExamples?: string[];
  ageRange?: string;  // 'child', 'young adult', 'adult', 'elderly'
  dialogueCount?: number;  // For sorting by importance
}

/**
 * Voice mapping: Character name -> Gemini voice name
 * Special key: "NARRATOR" -> "USER_SELECTED" (runtime placeholder)
 */
export interface VoiceMap {
  [characterName: string]: string;
}

/**
 * Assign unique Gemini voices to all characters
 * 
 * Algorithm:
 * 1. NARRATOR always gets "USER_SELECTED" placeholder
 * 2. For each character, select best matching voice based on:
 *    - Gender match (priority)
 *    - Pitch match (age inference)
 *    - Trait characteristics
 * 3. Ensure each character gets a UNIQUE voice (no duplicates)
 * 4. Exclude narrator's voice from character assignments (if provided)
 * 
 * @param characters - Array of character profiles from LLM analysis
 * @param narratorVoiceName - Optional narrator voice to exclude from character assignments
 * @returns VoiceMap object with character -> voice mappings
 */
export function assignVoices(characters: Character[], narratorVoiceName?: string): VoiceMap {
  const voiceMap: VoiceMap = {};
  
  const usedVoices = new Set<string>();
  
  // Exclude narrator's voice from character assignments
  if (narratorVoiceName && narratorVoiceName !== 'USER_SELECTED') {
    usedVoices.add(narratorVoiceName);
    console.log(`[VoiceAssigner] Narrator voice "${narratorVoiceName}" excluded from character assignments`);
  }
  
  // Sort characters by dialogue count (main characters first)
  const sortedCharacters = [...characters].sort((a, b) => {
    const aDialogue = a.dialogueCount || a.dialogueExamples?.length || 0;
    const bDialogue = b.dialogueCount || b.dialogueExamples?.length || 0;
    return bDialogue - aDialogue;
  });
  
  for (const char of sortedCharacters) {
    const voice = selectVoiceForCharacter(
      char.name,
      char.gender,
      char.traits,
      Array.from(usedVoices),
      char.ageRange  // Pass age range for pitch selection
    );
    
    voiceMap[char.name] = voice.name;
    usedVoices.add(voice.name);
    
    console.log(`[VoiceAssigner] ${char.name} (${char.gender}, age:${char.ageRange || 'unknown'}, ${char.traits.join(', ')}) -> ${voice.name} (${voice.pitch} pitch, ${voice.characteristic})`);
  }
  
  return voiceMap;
}

/**
 * Save voice map to JSON file
 * 
 * Output format:
 * {
 *   "NARRATOR": "USER_SELECTED",
 *   "RAGOWSKI": "Schedar",
 *   "LILI": "Vindemiatrix"
 * }
 * 
 * @param voiceMap - Voice mapping object
 * @param outputPath - Absolute path to output JSON file
 */
export async function saveVoiceMap(voiceMap: VoiceMap, outputPath: string): Promise<void> {
  try {
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write JSON with pretty formatting
    await fs.writeFile(
      outputPath,
      JSON.stringify(voiceMap, null, 2),
      'utf-8'
    );
    
    console.log(`[VoiceAssigner] Voice map saved to: ${outputPath}`);
    console.log(`[VoiceAssigner] Total characters: ${Object.keys(voiceMap).length - 1} (+ NARRATOR)`);
  } catch (error) {
    console.error('[VoiceAssigner] Failed to save voice map:', error);
    throw error;
  }
}

/**
 * Load voice map from JSON file
 * 
 * @param inputPath - Absolute path to voice map JSON file
 * @returns VoiceMap object
 */
export async function loadVoiceMap(inputPath: string): Promise<VoiceMap> {
  try {
    const content = await fs.readFile(inputPath, 'utf-8');
    const voiceMap: VoiceMap = JSON.parse(content);
    
    console.log(`[VoiceAssigner] Voice map loaded from: ${inputPath}`);
    console.log(`[VoiceAssigner] Characters found: ${Object.keys(voiceMap).join(', ')}`);
    
    return voiceMap;
  } catch (error) {
    console.error('[VoiceAssigner] Failed to load voice map:', error);
    throw error;
  }
}

/**
 * Validate voice map
 * 
 * Checks:
 * - NARRATOR exists
 * - All character names are UPPERCASE
 * - No duplicate voice assignments (except USER_SELECTED)
 * 
 * @param voiceMap - Voice mapping object
 * @returns true if valid, throws error otherwise
 */
export function validateVoiceMap(voiceMap: VoiceMap): boolean {
  // Check NARRATOR exists
  if (!voiceMap.NARRATOR) {
    throw new Error('Voice map must contain NARRATOR');
  }
  
  // Check character names are uppercase
  for (const charName of Object.keys(voiceMap)) {
    if (charName !== charName.toUpperCase()) {
      throw new Error(`Character name must be uppercase: ${charName}`);
    }
  }
  
  // Check for duplicate voice assignments
  const voiceUsage = new Map<string, string[]>();
  for (const [charName, voiceName] of Object.entries(voiceMap)) {
    if (voiceName === 'USER_SELECTED') continue; // Skip placeholder
    
    if (!voiceUsage.has(voiceName)) {
      voiceUsage.set(voiceName, []);
    }
    voiceUsage.get(voiceName)!.push(charName);
  }
  
  // Report duplicates
  for (const [voiceName, characters] of voiceUsage.entries()) {
    if (characters.length > 1) {
      throw new Error(`Voice ${voiceName} assigned to multiple characters: ${characters.join(', ')}`);
    }
  }
  
  console.log('[VoiceAssigner] Voice map validation passed ✓');
  return true;
}
