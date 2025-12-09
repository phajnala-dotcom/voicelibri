/**
 * Test Dramatized Chunker Simple
 * 
 * Tests chunking with voice tag preservation
 */

import { processTaggedTextFile } from './dramatizedChunkerSimple.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testChunker() {
  console.log('=== Dramatized Chunker Test ===\n');
  
  try {
    const taggedTextPath = path.join(__dirname, '../assets/dramatized_output/sample_text_tagged.txt');
    
    const result = await processTaggedTextFile(taggedTextPath);
    
    console.log('\n=== Results ===');
    console.log(`Total chunks: ${result.totalChunks}`);
    console.log(`\nChunk metadata:`);
    for (const meta of result.metadata) {
      console.log(`  Chunk ${meta.id}: ${meta.voiceSegments} segments, ${meta.characterCount} chars, ${meta.estimatedDuration}s`);
      console.log(`    Speakers: ${meta.speakers.join(', ')}`);
    }
    
    // Read and display first chunk
    const firstChunkPath = path.join(__dirname, '../assets/dramatized_output/chunks/chunk_001.txt');
    const firstChunk = await fs.readFile(firstChunkPath, 'utf-8');
    console.log(`\n=== First Chunk Content ===`);
    console.log(firstChunk.substring(0, 200) + '...');
    
    console.log('\n✅ Chunker test passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testChunker();
