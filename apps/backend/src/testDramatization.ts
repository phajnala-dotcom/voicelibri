/**
 * Test script for dramatization processing
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processDramatizedText } from './dialogueParser.js';
import { chunkDramatizedText, DEFAULT_CHUNKING_CONFIG, validateChunks, generateChunksMetadata } from './dramatizedChunker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testDramatization() {
  console.log('\n🎭 Testing Dramatization Processing\n');
  
  // Read sample_text.txt
  const assetsDir = path.join(__dirname, '..', 'assets');
  const sampleTextPath = path.join(assetsDir, 'sample_text.txt');
  
  if (!fs.existsSync(sampleTextPath)) {
    console.error('✗ sample_text.txt not found at:', sampleTextPath);
    process.exit(1);
  }
  
  const inputText = fs.readFileSync(sampleTextPath, 'utf-8');
  console.log(`✓ Read sample_text.txt (${inputText.length} characters)\n`);
  
  // Process
  const { taggedText, segments, characters, voiceMap } = processDramatizedText(inputText);
  
  console.log('\n📊 Processing Results:');
  console.log(`  Segments: ${segments.length}`);
  console.log(`  Characters: ${characters.size}`);
  console.log(`  Tagged text length: ${taggedText.length} chars\n`);
  
  // Show segments
  console.log('📝 Detected Segments:');
  segments.forEach((seg, i) => {
    console.log(`  ${i + 1}. [${seg.type}] ${seg.speaker}: "${seg.text.substring(0, 50)}${seg.text.length > 50 ? '...' : ''}"`);
  });
  
  // Show characters
  console.log('\n👥 Detected Characters:');
  for (const [name, info] of characters.entries()) {
    console.log(`  ${name}: ${info.gender}, appearances: ${info.appearanceCount}`);
  }
  
  // Chunk
  const chunks = chunkDramatizedText(segments, taggedText, DEFAULT_CHUNKING_CONFIG);
  console.log(`\n📦 Created ${chunks.length} chunks`);
  
  // Validate
  const validation = validateChunks(chunks, DEFAULT_CHUNKING_CONFIG);
  console.log(`\n✅ Validation: ${validation.valid ? 'PASSED' : 'WARNINGS'}`);
  if (!validation.valid) {
    validation.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
  }
  
  // Metadata
  const metadata = generateChunksMetadata(chunks);
  console.log('\n📊 Metadata:');
  console.log(`  Total words: ${metadata.totalWords}`);
  console.log(`  Estimated duration: ${Math.floor(metadata.estimatedAudioDuration / 60)}min ${Math.floor(metadata.estimatedAudioDuration % 60)}s`);
  console.log(`  Unique voices: ${metadata.uniqueVoices.join(', ')}`);
  
  // Save outputs
  const outputDir = path.join(assetsDir, 'dramatized_output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 1. Tagged text
  fs.writeFileSync(path.join(outputDir, 'sample_text_tagged.txt'), taggedText, 'utf-8');
  console.log('\n💾 Saved: sample_text_tagged.txt');
  
  // 2. Chunks
  chunks.forEach((chunk, i) => {
    const fileName = `chunk_${String(i + 1).padStart(3, '0')}.txt`;
    fs.writeFileSync(path.join(outputDir, fileName), chunk.text, 'utf-8');
  });
  console.log(`💾 Saved: ${chunks.length} chunk files`);
  
  // 3. Voice map
  fs.writeFileSync(
    path.join(outputDir, 'voice_map_poc.json'),
    JSON.stringify(voiceMap, null, 2),
    'utf-8'
  );
  console.log('💾 Saved: voice_map_poc.json');
  
  // 4. Metadata
  const fullMetadata = {
    ...metadata,
    chunks: chunks.map(c => ({
      index: c.index,
      characterCount: c.characterCount,
      wordCount: c.wordCount,
      estimatedAudioSeconds: c.estimatedAudioSeconds,
      estimatedTtsSeconds: c.estimatedTtsSeconds,
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
  console.log('💾 Saved: chunks_metadata.json');
  
  console.log('\n✅ Dramatization test complete!\n');
}

testDramatization().catch(err => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
