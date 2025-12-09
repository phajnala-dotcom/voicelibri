/**
 * Test Dramatized Processor
 * 
 * Tests the main dramatization orchestrator
 */

import { processDramatizedText } from './dramatizedProcessor.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testProcessor() {
  console.log('=== Dramatized Processor Test ===\n');
  
  try {
    const taggedTextPath = path.join(__dirname, '../assets/dramatized_output/sample_text_tagged.txt');
    
    const result = await processDramatizedText(taggedTextPath);
    
    console.log('\n=== Results ===');
    console.log(`Voice Map Path: ${result.voiceMapPath}`);
    console.log(`Characters: ${result.characterCount}`);
    console.log(`Success: ${result.success}`);
    console.log('\nVoice Assignments:');
    for (const [char, voice] of Object.entries(result.voiceMap)) {
      console.log(`  ${char.padEnd(15)} -> ${voice}`);
    }
    
    console.log('\n✅ Processor test passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testProcessor();
