/**
 * Test TTS with dramatized chunks
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { removeVoiceTags, extractVoiceSegments } from './dialogueParserSimple.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testTTSIntegration() {
  console.log('\n🎙️ Testing TTS Integration with Dramatized Chunks\n');
  
  const outputDir = path.join(__dirname, '..', 'assets', 'dramatized_output');
  
  // Test chunk 001
  const chunk1Path = path.join(outputDir, 'chunk_001.txt');
  const chunk1Text = fs.readFileSync(chunk1Path, 'utf-8');
  
  console.log('📄 Chunk 001 (with voice tags):');
  console.log(chunk1Text);
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Extract voice segments
  const segments = extractVoiceSegments(chunk1Text);
  console.log(`🎭 Extracted ${segments.length} voice segments:\n`);
  
  segments.forEach((seg, i) => {
    console.log(`${i + 1}. [${seg.voice}]: "${seg.text.substring(0, 50)}${seg.text.length > 50 ? '...' : ''}"`);
  });
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Remove tags for TTS
  const plainText = removeVoiceTags(chunk1Text);
  console.log('📝 Plain text (for TTS, tags removed):');
  console.log(plainText);
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Show TTS strategy
  console.log('🎯 TTS Processing Strategy:\n');
  console.log('Option A - Single Voice (Current MVP):');
  console.log('  → Send plain text to TTS with user-selected voice');
  console.log('  → Simple, works with existing system');
  console.log('  → Voice tags ignored\n');
  
  console.log('Option B - Multi-Voice (Future):');
  console.log('  → Process each segment separately');
  segments.forEach((seg, i) => {
    const geminiVoice = seg.voice === 'RAGOWSKI' ? 'Algieba' : 
                        seg.voice === 'LILI' ? 'Zephyr' : 
                        'Puck'; // narrator
    console.log(`  ${i + 1}. synthesizeText("${seg.text.substring(0, 30)}...", "${geminiVoice}")`);
  });
  console.log('  → Concatenate audio buffers');
  console.log('  → Dramatic, multi-voice narration\n');
  
  console.log('✅ TTS integration test complete!\n');
}

testTTSIntegration().catch(err => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
