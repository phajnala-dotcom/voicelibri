/**
 * Hybrid Dramatization Example
 * 
 * Shows how to use the new hybrid optimization pipeline
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { dramatizeFirstChapterHybrid } from './hybridDramatizer.js';
import { GeminiConfig } from './llmCharacterAnalyzer.js';
import { GeminiTTSClient } from './ttsClient.js';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log('🎭 Hybrid Dramatization Example\n');
  
  // Load environment
  dotenvConfig({ path: resolve(__dirname, '../.env') });
  
  const geminiConfig: GeminiConfig = {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'calmbridge-2',
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
  };
  
  // Load sample book
  const bookPath = resolve(__dirname, '../assets/sample_text.txt');
  const bookText = readFileSync(bookPath, 'utf-8');
  
  // Simple chapter split
  const chapters = bookText.split(/\n\n\n+/).filter(c => c.trim().length > 100);
  console.log(`📚 Loaded book: ${chapters.length} chapters, ${bookText.length} chars\n`);
  
  // Dramatize first chapter with hybrid approach
  console.log('⚡ STEP 1: Hybrid dramatization (fast-start)...\n');
  const result = await dramatizeFirstChapterHybrid(
    bookText,
    chapters[0],
    geminiConfig,
    0.85 // Confidence threshold
  );
  
  console.log('\n📊 RESULTS:');
  console.log(`  Method: ${result.method}`);
  console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`  Cost: $${result.cost.toFixed(4)}`);
  console.log(`  Characters: ${result.characters.length}`);
  
  // Show tagged text preview
  console.log('\n📝 Tagged Text Preview:');
  const lines = result.taggedText.split('\n').slice(0, 20);
  lines.forEach(line => console.log(`  ${line}`));
  
  // Parse voice tags and generate audio
  console.log('\n⚡ STEP 2: Generate audio with voice styles...\n');
  
  const ttsClient = new GeminiTTSClient({
    projectId: geminiConfig.projectId,
    location: geminiConfig.location,
  });
  
  // Extract segments with voice tags
  const segments = parseVoiceSegments(result.taggedText);
  console.log(`🎙️ Found ${segments.length} voice segments\n`);
  
  // Generate first 3 segments as example
  const audioBuffers: Buffer[] = [];
  
  for (let i = 0; i < Math.min(3, segments.length); i++) {
    const segment = segments[i];
    console.log(`\n🎤 Segment ${i + 1}: ${segment.character} [${segment.style}]`);
    console.log(`   Text: ${segment.text.substring(0, 60)}...`);
    
    // Find appropriate voice
    const voice = findVoiceForCharacter(segment.character, result.characters);
    console.log(`   Voice: ${voice}`);
    
    // Generate audio with style
    const audio = await ttsClient.synthesizeText(
      segment.text,
      voice,
      segment.style
    );
    
    audioBuffers.push(audio);
    console.log(`   ✅ Generated: ${audio.length} bytes`);
  }
  
  // Save sample audio
  if (audioBuffers.length > 0) {
    const combinedAudio = Buffer.concat(audioBuffers);
    const outputPath = resolve(__dirname, '../audiobooks/hybrid_sample.wav');
    writeFileSync(outputPath, combinedAudio);
    console.log(`\n💾 Saved sample audio: ${outputPath}`);
  }
  
  console.log('\n✅ Example complete!\n');
  
  // Show cost comparison
  console.log('💰 COST COMPARISON:');
  console.log(`  Pure LLM (old):      ~$0.32 per book`);
  console.log(`  Hybrid (new):        ~$${result.cost.toFixed(4)} for first chapter`);
  console.log(`  Estimated savings:   ~${((1 - result.cost / 0.32) * 100).toFixed(0)}%`);
  console.log('\n  Expected full book:  $0.05-0.07 (85% reduction) ✨');
}

/**
 * Parse voice segments from tagged text
 */
function parseVoiceSegments(taggedText: string): Array<{
  character: string;
  style: 'normal' | 'whisper' | 'thought' | 'letter';
  text: string;
}> {
  const segments: Array<{
    character: string;
    style: 'normal' | 'whisper' | 'thought' | 'letter';
    text: string;
  }> = [];
  
  const lines = taggedText.split('\n');
  let currentCharacter = 'NARRATOR';
  let currentStyle: 'normal' | 'whisper' | 'thought' | 'letter' = 'normal';
  let currentText: string[] = [];
  
  for (const line of lines) {
    // Check for voice tag
    const voiceMatch = line.match(/\[VOICE=([^:\]]+)(?::([^\]]+))?\]/);
    
    if (voiceMatch) {
      // Save previous segment
      if (currentText.length > 0) {
        segments.push({
          character: currentCharacter,
          style: currentStyle,
          text: currentText.join(' ').trim(),
        });
        currentText = [];
      }
      
      // Update current speaker
      currentCharacter = voiceMatch[1];
      currentStyle = (voiceMatch[2]?.toLowerCase() || 'normal') as any;
    } else if (line.trim()) {
      currentText.push(line.trim());
    }
  }
  
  // Save last segment
  if (currentText.length > 0) {
    segments.push({
      character: currentCharacter,
      style: currentStyle,
      text: currentText.join(' ').trim(),
    });
  }
  
  return segments;
}

/**
 * Find appropriate Gemini voice for character
 */
function findVoiceForCharacter(
  character: string,
  characters: Array<{ name: string; gender: string; suggestedVoice?: string }>
): string {
  // Find character profile
  const profile = characters.find(c => c.name === character);
  
  if (profile?.suggestedVoice) {
    return profile.suggestedVoice;
  }
  
  // Default voices by gender
  if (character === 'NARRATOR') {
    return 'Algieba'; // Neutral, clear male voice
  }
  
  if (profile?.gender === 'female') {
    return 'Zephyr'; // Clear female voice
  }
  
  return 'Puck'; // Clear male voice
}

main().catch(console.error);
