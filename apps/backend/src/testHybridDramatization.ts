/**
 * Test Hybrid Dramatization
 * 
 * Validates cost optimization and accuracy
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { dramatizeBookHybrid, dramatizeFirstChapterHybrid } from './hybridDramatizer.js';
import { GeminiConfig } from './llmCharacterAnalyzer.js';
import { config as dotenvConfig } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log('🧪 Testing Hybrid Dramatization Pipeline\n');
  
  // Load environment variables
  dotenvConfig({ path: resolve(__dirname, '../.env') });
  
  const geminiConfig: GeminiConfig = {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'calmbridge-2',
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
  };
  
  // Load sample book
  const bookPath = resolve(__dirname, '../assets/sample_text.txt');
  console.log(`📖 Loading book: ${bookPath}`);
  
  const bookText = readFileSync(bookPath, 'utf-8');
  console.log(`✅ Loaded: ${bookText.length} characters\n`);
  
  // Simple chapter split (by double newlines)
  const chapters = bookText.split(/\n\n\n+/).filter(c => c.trim().length > 100);
  console.log(`📚 Split into ${chapters.length} chapters\n`);
  
  // Test 1: Fast-start first chapter
  console.log('='.repeat(60));
  console.log('TEST 1: Fast-Start First Chapter');
  console.log('='.repeat(60) + '\n');
  
  const startTime1 = Date.now();
  const firstChapterResult = await dramatizeFirstChapterHybrid(
    bookText,
    chapters[0],
    geminiConfig,
    0.85 // Confidence threshold
  );
  const time1 = ((Date.now() - startTime1) / 1000).toFixed(1);
  
  console.log('\n📊 FIRST CHAPTER RESULTS:');
  console.log(`⏱️ Time: ${time1}s`);
  console.log(`🎯 Method: ${firstChapterResult.method}`);
  console.log(`📈 Confidence: ${(firstChapterResult.confidence * 100).toFixed(1)}%`);
  console.log(`💰 Cost: $${firstChapterResult.cost.toFixed(4)}`);
  console.log(`👥 Characters: ${firstChapterResult.characters.length}`);
  
  // Show sample of tagged text
  const preview = firstChapterResult.taggedText.substring(0, 500);
  console.log(`\n📝 Tagged Text Preview:`);
  console.log(preview + '...\n');
  
  // Test 2: Full book hybrid dramatization
  console.log('='.repeat(60));
  console.log('TEST 2: Full Book Hybrid Dramatization');
  console.log('='.repeat(60) + '\n');
  
  const startTime2 = Date.now();
  const fullBookResult = await dramatizeBookHybrid(
    bookText,
    chapters,
    geminiConfig,
    0.85 // Confidence threshold
  );
  const time2 = ((Date.now() - startTime2) / 1000).toFixed(1);
  
  console.log('\n📊 FULL BOOK RESULTS:');
  console.log(`⏱️ Total time: ${time2}s`);
  console.log(`📚 Chapters: ${fullBookResult.taggedChapters.length}`);
  console.log(`👥 Characters: ${fullBookResult.characters.length}`);
  console.log(`💰 Total cost: $${fullBookResult.totalCost.toFixed(4)}`);
  
  // Cost comparison
  const unoptimizedCost = 0.32; // From previous calculations
  const savings = ((unoptimizedCost - fullBookResult.totalCost) / unoptimizedCost * 100);
  const targetCost = 0.07;
  const targetMet = fullBookResult.totalCost <= targetCost;
  
  console.log('\n💰 COST ANALYSIS:');
  console.log(`  Unoptimized (LLM everything): $${unoptimizedCost.toFixed(4)}`);
  console.log(`  Hybrid optimized:             $${fullBookResult.totalCost.toFixed(4)}`);
  console.log(`  Savings:                      ${savings.toFixed(1)}%`);
  console.log(`  Target cost:                  $${targetCost.toFixed(4)}`);
  console.log(`  Target met:                   ${targetMet ? '✅ YES' : '❌ NO'}`);
  
  // Per-chapter breakdown
  console.log('\n📊 PER-CHAPTER BREAKDOWN:');
  console.log('  Ch# | Method        | Confidence | Cost      ');
  console.log('  ----|---------------|------------|----------');
  
  for (const chapter of fullBookResult.taggedChapters) {
    const chNum = chapter.chapterNumber.toString().padStart(3);
    const method = chapter.method.padEnd(13);
    const conf = (chapter.confidence * 100).toFixed(1).padStart(4);
    const cost = chapter.cost === 0 ? '$0.0000' : `$${chapter.cost.toFixed(4)}`;
    
    console.log(`  ${chNum} | ${method} | ${conf}%     | ${cost}`);
  }
  
  // Quality metrics
  const avgConfidence = fullBookResult.taggedChapters.reduce((sum, c) => sum + c.confidence, 0) / fullBookResult.taggedChapters.length;
  const minConfidence = Math.min(...fullBookResult.taggedChapters.map(c => c.confidence));
  
  console.log('\n📈 QUALITY METRICS:');
  console.log(`  Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
  console.log(`  Minimum confidence: ${(minConfidence * 100).toFixed(1)}%`);
  console.log(`  Target (97-99%):    ${avgConfidence >= 0.97 ? '✅ MET' : '⚠️ BELOW'}`);
  
  console.log('\n✅ Test complete!\n');
}

main().catch(console.error);
