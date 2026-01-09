/**
 * Dramatized Processor - Main Orchestrator
 * 
 * Coordinates the entire dramatization pipeline:
 * 1. Load tagged text
 * 2. Extract character list
 * 3. Assign voices to characters
 * 4. Save voice map
 * 
 * Part of Dramatized TTS implementation (PoC Phase)
 */

import fs from 'fs/promises';
import path from 'path';
import { assignVoices, saveVoiceMap, Character, VoiceMap } from './voiceAssigner.js';

/**
 * Process result containing all output paths
 */
export interface ProcessResult {
  voiceMapPath: string;
  voiceMap: VoiceMap;
  characterCount: number;
  success: boolean;
}

/**
 * Extract character names from tagged text
 * 
 * Scans for SPEAKER: format lines and collects unique speaker names
 * Excludes NARRATOR from character list
 * 
 * @param taggedText - Text with SPEAKER: format tags
 * @returns Set of unique character names (UPPERCASE)
 */
function extractCharacterNames(taggedText: string): Set<string> {
  const voiceTagRegex = /^([A-Z][A-Z0-9]*):\s/gm;
  const characters = new Set<string>();
  
  let match;
  while ((match = voiceTagRegex.exec(taggedText)) !== null) {
    const speaker = match[1].trim();
    if (speaker !== 'NARRATOR') {
      characters.add(speaker);
    }
  }
  
  return characters;
}

/**
 * Infer character gender from dialogue content
 * 
 * Simple heuristics:
 * - Male pronouns (he, him, his) -> male
 * - Female pronouns (she, her) -> female
 * - Default -> neutral
 * 
 * @param dialogue - Character's dialogue text
 * @returns Inferred gender
 */
function inferGender(dialogue: string): 'male' | 'female' | 'neutral' {
  const lower = dialogue.toLowerCase();
  
  const malePronouns = ['he ', 'him ', 'his '];
  const femalePronouns = ['she ', 'her '];
  
  const maleCount = malePronouns.reduce((sum, p) => sum + (lower.match(new RegExp(p, 'g'))?.length || 0), 0);
  const femaleCount = femalePronouns.reduce((sum, p) => sum + (lower.match(new RegExp(p, 'g'))?.length || 0), 0);
  
  if (maleCount > femaleCount) return 'male';
  if (femaleCount > maleCount) return 'female';
  return 'neutral';
}

/**
 * Build character profiles from character analysis JSON
 * 
 * If character_analysis.json exists, use it.
 * Otherwise, infer from tagged text (fallback).
 * 
 * @param characterAnalysisPath - Path to character_analysis.json
 * @param taggedText - Tagged text (for fallback)
 * @param characterNames - Set of character names from tags
 * @returns Array of character profiles
 */
async function buildCharacterProfiles(
  characterAnalysisPath: string,
  taggedText: string,
  characterNames: Set<string>
): Promise<Character[]> {
  try {
    // Try loading character analysis JSON
    const analysisContent = await fs.readFile(characterAnalysisPath, 'utf-8');
    const analysis = JSON.parse(analysisContent);
    
    console.log('[DramatizedProcessor] Loaded character analysis from JSON');
    return analysis.characters;
    
  } catch (error) {
    // Fallback: Infer from tagged text
    console.log('[DramatizedProcessor] character_analysis.json not found, inferring from tagged text');
    
    const characters: Character[] = [];
    for (const name of characterNames) {
      // Extract character's dialogue (new SPEAKER: format)
      const dialogueRegex = new RegExp(`^${name}:\\s*(.+)$`, 'gm');
      const dialogues: string[] = [];
      let match;
      while ((match = dialogueRegex.exec(taggedText)) !== null) {
        dialogues.push(match[1].trim());
      }
      
      const allDialogue = dialogues.join(' ');
      const gender = inferGender(allDialogue);
      
      characters.push({
        name,
        gender,
        traits: ['neutral'], // No traits available without LLM analysis
        dialogueExamples: dialogues.slice(0, 2)
      });
    }
    
    return characters;
  }
}

/**
 * Process dramatized text - Main orchestrator
 * 
 * Pipeline:
 * 1. Load tagged text from file
 * 2. Extract character names from voice tags
 * 3. Load/infer character profiles
 * 4. Assign voices to characters
 * 5. Save voice map to JSON
 * 
 * @param taggedTextPath - Path to tagged text file
 * @param characterAnalysisPath - Path to character_analysis.json (optional)
 * @param outputDir - Directory for output files
 * @returns ProcessResult with paths and metadata
 */
export async function processDramatizedText(
  taggedTextPath: string,
  characterAnalysisPath?: string,
  outputDir?: string
): Promise<ProcessResult> {
  console.log('[DramatizedProcessor] Starting dramatization pipeline...');
  console.log(`[DramatizedProcessor] Input: ${taggedTextPath}`);
  
  try {
    // 1. Load tagged text
    const taggedText = await fs.readFile(taggedTextPath, 'utf-8');
    console.log(`[DramatizedProcessor] Loaded tagged text (${taggedText.length} chars)`);
    
    // 2. Extract character names
    const characterNames = extractCharacterNames(taggedText);
    console.log(`[DramatizedProcessor] Found ${characterNames.size} characters: ${Array.from(characterNames).join(', ')}`);
    
    // 3. Build character profiles
    const defaultAnalysisPath = characterAnalysisPath || path.join(
      path.dirname(taggedTextPath),
      'character_analysis.json'
    );
    const characters = await buildCharacterProfiles(defaultAnalysisPath, taggedText, characterNames);
    
    // 4. Assign voices
    console.log('[DramatizedProcessor] Assigning voices...');
    const voiceMap = assignVoices(characters);
    
    // 5. Save voice map
    const defaultOutputDir = outputDir || path.dirname(taggedTextPath);
    const voiceMapPath = path.join(defaultOutputDir, 'voice_map_poc.json');
    await saveVoiceMap(voiceMap, voiceMapPath);
    
    console.log('[DramatizedProcessor] ✅ Dramatization pipeline complete!');
    
    return {
      voiceMapPath,
      voiceMap,
      characterCount: characters.length,
      success: true
    };
    
  } catch (error) {
    console.error('[DramatizedProcessor] ❌ Pipeline failed:', error);
    throw error;
  }
}
