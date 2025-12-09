/**
 * Test multi-voice TTS integration
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractVoiceSegments } from './dialogueParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testMultiVoice() {
  console.log('\n🎙️  Testing Multi-Voice TTS Integration\n');
  
  const assetsDir = path.join(__dirname, '..', 'assets', 'dramatized_output');
  
  // Load voice map
  const voiceMapPath = path.join(assetsDir, 'voice_map_poc.json');
  const voiceMap = JSON.parse(fs.readFileSync(voiceMapPath, 'utf-8'));
  
  console.log('📋 Voice Map:');
  for (const [character, info] of Object.entries(voiceMap)) {
    console.log(`  ${character}: ${(info as any).geminiVoice} (${(info as any).gender})`);
  }
  
  // Load first chunk
  const chunk1Path = path.join(assetsDir, 'chunk_001.txt');
  if (!fs.existsSync(chunk1Path)) {
    console.error('✗ chunk_001.txt not found');
    return;
  }
  
  const chunkText = fs.readFileSync(chunk1Path, 'utf-8');
  console.log(`\n📄 Chunk 1 length: ${chunkText.length} characters`);
  
  // Extract voice segments
  const segments = extractVoiceSegments(chunkText);
  console.log(`\n🎭 Found ${segments.length} voice segments:`);
  
  segments.forEach((seg, i) => {
    const voice = voiceMap[seg.voice as keyof typeof voiceMap];
    const geminiVoice = voice ? (voice as any).geminiVoice : 'UNKNOWN';
    const preview = seg.text.substring(0, 60);
    console.log(`  ${i + 1}. [${seg.voice}] → ${geminiVoice}`);
    console.log(`      "${preview}${seg.text.length > 60 ? '...' : ''}"`);
  });
  
  console.log(`\n✅ Multi-voice integration ready!`);
  console.log(`\n📝 To test with real TTS:`);
  console.log(`  1. Start backend: npm run dev`);
  console.log(`  2. Load dramatized book chunks into BOOK_CHUNKS`);
  console.log(`  3. Call POST /api/tts/chunk with chunkIndex=0`);
  console.log(`  4. Listen to multi-voice audio output`);
}

testMultiVoice().catch(err => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
