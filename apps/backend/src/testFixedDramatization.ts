/**
 * Test script for fixed hybrid dramatization
 * 
 * Tests:
 * 1. Czech dialogue detection (sample_text.txt)
 * 2. Gender inference from context
 * 3. Voice collision prevention
 */

import fs from 'fs';
import path from 'path';
import { hasDialogue, countDialogues, inferGender } from './hybridTagger.js';

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

console.log('🧪 TESTING FIXED DRAMATIZATION');
console.log('================================\n');

// Test 1: Czech dialogue detection
console.log('Test 1: Czech Dialogue Detection');
console.log('---------------------------------');

const sampleTextPath = path.join(ASSETS_DIR, 'sample_text.txt');
const sampleText = fs.readFileSync(sampleTextPath, 'utf-8');

const hasDialogueResult = hasDialogue(sampleText);
const dialogueCount = countDialogues(sampleText);

console.log(`File: sample_text.txt`);
console.log(`Has dialogue: ${hasDialogueResult ? '✅ YES' : '❌ NO'}`);
console.log(`Dialogue count: ${dialogueCount}`);

if (!hasDialogueResult) {
  console.log('❌ FAILED: Dialogue detection not working');
  console.log('\nSample text snippet:');
  console.log(sampleText.substring(0, 300));
} else {
  console.log('✅ PASSED: Dialogue detected correctly\n');
}

// Test 2: Gender inference
console.log('Test 2: Gender Inference');
console.log('------------------------');

// Extract context around character names
const ragowskiContext = sampleText.substring(0, 500);
const liliContext = sampleText.substring(300, 800);

const ragowskiGender = inferGender('RAGOWSKI', ragowskiContext);
const liliGender = inferGender('LILI', liliContext);

console.log(`RAGOWSKI: ${ragowskiGender} ${ragowskiGender === 'male' ? '✅' : '❌ (expected male)'}`);
console.log(`LILI: ${liliGender} ${liliGender === 'female' ? '✅' : '❌ (expected female)'}`);

// Show evidence from context
console.log('\nEvidence from context:');
const maleVerbs = ragowskiContext.match(/\b(řekl|zvolal|poznamenal|odpověděl|zavrčel)\b/gi) || [];
const femaleVerbs = liliContext.match(/\b(řekla|zvolala|poznamenala|odpověděla)\b/gi) || [];
console.log(`RAGOWSKI context has male verbs: ${maleVerbs.join(', ')}`);
console.log(`LILI context has female verbs: ${femaleVerbs.join(', ')}`);

// Test 3: Voice collision prevention
console.log('\n\nTest 3: Voice Collision Prevention');
console.log('-----------------------------------');

import { assignVoices } from './voiceAssigner.js';

const testCharacters = [
  { name: 'RAGOWSKI', gender: 'male' as const, traits: ['authoritative'] },
  { name: 'LILI', gender: 'female' as const, traits: ['confident'] }
];

// Test WITHOUT narrator voice (old behavior)
console.log('\nWithout narrator voice exclusion:');
const voiceMapOld = assignVoices(testCharacters);
console.log('Voice map:', voiceMapOld);

// Test WITH narrator voice (new behavior - should exclude 'Algieba' from character assignments)
console.log('\nWith narrator voice = "Algieba" (should be excluded):');
const voiceMapNew = assignVoices(testCharacters, 'Algieba');
console.log('Voice map:', voiceMapNew);

// Verify no character got 'Algieba'
const hasCollision = Object.values(voiceMapNew).some((voice, i) => 
  voice === 'Algieba' && Object.keys(voiceMapNew)[i] !== 'NARRATOR'
);

if (hasCollision) {
  console.log('❌ FAILED: Character received narrator voice');
} else {
  console.log('✅ PASSED: No character received narrator voice\n');
}

// Test 4: Gender-matched voices
console.log('Test 4: Gender-Matched Voices');
console.log('------------------------------');

const ragowskiVoice = voiceMapNew.RAGOWSKI;
const liliVoice = voiceMapNew.LILI;

import { getVoiceByName } from './geminiVoices.js';

const ragowskiVoiceInfo = getVoiceByName(ragowskiVoice);
const liliVoiceInfo = getVoiceByName(liliVoice);

console.log(`RAGOWSKI -> ${ragowskiVoice} (${ragowskiVoiceInfo?.gender}) ${ragowskiVoiceInfo?.gender === 'male' ? '✅' : '❌ expected male'}`);
console.log(`LILI -> ${liliVoice} (${liliVoiceInfo?.gender}) ${liliVoiceInfo?.gender === 'female' ? '✅' : '❌ expected female'}`);

console.log('\n================================');
console.log('✅ ALL TESTS COMPLETE');
