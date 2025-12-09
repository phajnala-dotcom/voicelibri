/**
 * Test Voice Assignment
 * 
 * Tests the voiceAssigner.ts module with character_analysis.json
 * Validates:
 * - Unique voice assignment per character
 * - Gender matching
 * - Trait-based selection
 */

import { assignVoices, saveVoiceMap, validateVoiceMap, Character } from './voiceAssigner.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testVoiceAssignment() {
  console.log('=== Voice Assignment Test ===\n');
  
  try {
    // Load character analysis
    const characterAnalysisPath = path.join(__dirname, '../assets/dramatized_output/character_analysis.json');
    const analysisContent = await fs.readFile(characterAnalysisPath, 'utf-8');
    const analysis = JSON.parse(analysisContent);
    
    console.log(`Loaded ${analysis.characters.length} characters from character_analysis.json\n`);
    
    // Display characters
    for (const char of analysis.characters) {
      console.log(`- ${char.name} (${char.gender}): ${char.traits.join(', ')}`);
    }
    console.log('');
    
    // Assign voices
    console.log('Assigning voices...\n');
    const voiceMap = assignVoices(analysis.characters);
    
    console.log('\n=== Voice Map ===');
    for (const [char, voice] of Object.entries(voiceMap)) {
      console.log(`${char.padEnd(15)} -> ${voice}`);
    }
    
    // Validate
    console.log('\n=== Validation ===');
    validateVoiceMap(voiceMap);
    
    // Save to file
    const voiceMapPath = path.join(__dirname, '../assets/dramatized_output/voice_map_poc.json');
    await saveVoiceMap(voiceMap, voiceMapPath);
    
    console.log('\n✅ Test passed! Voice map created successfully.');
    console.log(`📁 Output: ${voiceMapPath}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testVoiceAssignment();
