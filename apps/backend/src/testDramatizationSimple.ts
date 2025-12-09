/**
 * Test script - SIMPLE version
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processDramatizedText } from './dialogueParserSimple.js';
import { chunkDramatizedText, DEFAULT_CHUNKING_CONFIG, validateChunks, generateChunksMetadata } from './dramatizedChunker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testDramatization() {
  console.log('\n🎭 Testing SIMPLE Dramatization Processing\n');
  
  const assetsDir = path.join(__dirname, '..', 'assets');
  const sampleTextPath = path.join(assetsDir, 'sample_text.txt');
  
  const inputText = fs.readFileSync(sampleTextPath, 'utf-8');
  console.log(`✓ Read sample_text.txt (${inputText.length} characters)\n`);
  
  const { taggedText, segments, characters, voiceMap } = processDramatizedText(inputText);
  
  console.log('\n📝 Detected Segments:');
  segments.slice(0, 10).forEach((seg, i) => {
    const preview = seg.text.substring(0, 60);
    console.log(`  ${i + 1}. [${seg.type}] ${seg.speaker}: "${preview}${seg.text.length > 60 ? '...' : ''}"`);
  });
  if (segments.length > 10) {
    console.log(`  ... and ${segments.length - 10} more`);
  }
  
  console.log('\n👥 Detected Characters:');
  for (const [name, info] of characters.entries()) {
    console.log(`  ${name}: ${info.gender}, appearances: ${info.appearanceCount}`);
  }
  
  const chunks = chunkDramatizedText(segments, taggedText, DEFAULT_CHUNKING_CONFIG);
  console.log(`\n📦 Created ${chunks.length} chunks`);
  
  const validation = validateChunks(chunks, DEFAULT_CHUNKING_CONFIG);
  console.log(`\n✅ Validation: ${validation.valid ? 'PASSED' : 'HAS WARNINGS'}`);
  
  const metadata = generateChunksMetadata(chunks);
  console.log(`\n📊 Summary:`);
  console.log(`  Words: ${metadata.totalWords}`);
  console.log(`  Duration: ${Math.floor(metadata.estimatedAudioDuration / 60)}min ${Math.floor(metadata.estimatedAudioDuration % 60)}s`);
  console.log(`  Voices: ${metadata.uniqueVoices.join(', ')}`);
  
  const outputDir = path.join(assetsDir, 'dramatized_output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(path.join(outputDir, 'sample_text_tagged.txt'), taggedText, 'utf-8');
  
  chunks.forEach((chunk, i) => {
    const fileName = `chunk_${String(i + 1).padStart(3, '0')}.txt`;
    fs.writeFileSync(path.join(outputDir, fileName), chunk.text, 'utf-8');
  });
  
  fs.writeFileSync(
    path.join(outputDir, 'voice_map_poc.json'),
    JSON.stringify(voiceMap, null, 2),
    'utf-8'
  );
  
  const fullMetadata = {
    ...metadata,
    chunks: chunks.map(c => ({
      index: c.index,
      characterCount: c.characterCount,
      wordCount: c.wordCount,
      estimatedAudioSeconds: c.estimatedAudioSeconds,
      voicesUsed: c.voicesUsed,
    })),
    validation,
    config: DEFAULT_CHUNKING_CONFIG,
  };
  fs.writeFileSync(
    path.join(outputDir, 'chunks_metadata.json'),
    JSON.stringify(fullMetadata, null, 2),
    'utf-8'
  );
  
  console.log('\n💾 All files saved to dramatized_output/');
  console.log('\n✅ SIMPLE Dramatization test complete!\n');
}

testDramatization().catch(err => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
