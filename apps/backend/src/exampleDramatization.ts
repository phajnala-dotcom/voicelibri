/**
 * Example Usage: LLM Dramatization System
 * 
 * This file demonstrates how to use the Gemini dramatization system.
 * 
 * BEFORE RUNNING:
 * 1. Set GOOGLE_APPLICATION_CREDENTIALS environment variable
 * 2. Set GOOGLE_CLOUD_PROJECT environment variable
 * 3. Ensure Vertex AI API is enabled in your GCP project
 * 
 * USAGE:
 * ```bash
 * npx tsx src/exampleDramatization.ts
 * ```
 */

import { GeminiDramatizer, DramatizationConfig } from './geminiDramatizer.js';
import { extractTextFromEpub } from './bookChunker.js';
import { detectTextChapters } from './bookChunker.js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Example: Dramatize a book
 */
async function exampleDramatizeBook() {
  console.log('🎭 LLM Dramatization Example\n');
  
  // Configuration
  const config: DramatizationConfig = {
    gemini: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id',
      location: 'us-central1',
      model: 'gemini-2.0-flash-exp', // Latest model
    },
    minDialogueLines: 3,
    maxCharacters: 10,
    enableCaching: true,
    aggressive: false, // Conservative text cleaning
  };
  
  // Create dramatizer
  const dramatizer = new GeminiDramatizer(config);
  
  // Example 1: Load a text file
  const bookPath = path.join(__dirname, '..', 'assets', 'sample_ebook.txt');
  const bookText = await fs.readFile(bookPath, 'utf-8');
  
  // Detect chapters
  const chapters = detectTextChapters(bookText);
  console.log(`📚 Loaded book: ${chapters.length} chapters\n`);
  
  // Check cache first
  const bookTitle = 'Sample Ebook'; // Or extract from metadata
  const cached = await dramatizer.checkCache(bookTitle);
  
  if (cached) {
    console.log('✅ Found cached dramatization!');
    console.log(`   Characters: ${cached.charactersFound}`);
    console.log(`   Chapters: ${cached.chaptersTagged}`);
    console.log(`   Timestamp: ${cached.timestamp}\n`);
    
    // Load from cache
    const result = await dramatizer.loadCache(bookTitle);
    if (result) {
      console.log('📦 Loaded from cache:');
      console.log(`   Characters: ${result.characters.map(c => c.name).join(', ')}`);
      console.log(`   Voice Map:`, result.voiceMap);
      console.log(`   Tagged chapters: ${result.taggedChapters.length}\n`);
      return;
    }
  }
  
  // Full dramatization (if not cached)
  console.log('🚀 Starting full dramatization...\n');
  
  const result = await dramatizer.dramatizeBook(
    bookText,
    chapters,
    bookTitle,
    'txt',
    (progress) => {
      console.log(`[${progress.phase}] ${progress.progress}% - ${progress.message}`);
    }
  );
  
  console.log('\n✅ Dramatization complete!');
  console.log(`   Time: ${(result.stats.totalTime / 1000).toFixed(1)}s`);
  console.log(`   Character scan: ${(result.stats.characterScanTime / 1000).toFixed(1)}s`);
  console.log(`   Chapter tagging: ${(result.stats.taggingTime / 1000).toFixed(1)}s`);
  console.log(`\n📝 Characters found: ${result.characters.length}`);
  
  result.characters.forEach(char => {
    console.log(`   - ${char.name} (${char.gender}): ${char.traits.join(', ')}`);
  });
  
  console.log(`\n🎤 Voice Map:`);
  Object.entries(result.voiceMap).forEach(([char, voice]) => {
    console.log(`   ${char} → ${voice}`);
  });
  
  console.log(`\n📁 Cache location: ${result.cacheLocation}`);
}

/**
 * Example: Fast start (first chapter only)
 */
async function exampleFastStart() {
  console.log('\n⚡ Fast Start Example (First Chapter Only)\n');
  
  const config: DramatizationConfig = {
    gemini: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id',
      location: 'us-central1',
    },
  };
  
  const dramatizer = new GeminiDramatizer(config);
  
  // Load book
  const bookPath = path.join(__dirname, '..', 'assets', 'sample_ebook.txt');
  const bookText = await fs.readFile(bookPath, 'utf-8');
  const chapters = detectTextChapters(bookText);
  
  // Dramatize first chapter only (~30s)
  const result = await dramatizer.dramatizeFirstChapter(
    bookText,
    chapters[0],
    'Sample Ebook'
  );
  
  console.log('✅ First chapter ready!');
  console.log(`   Characters: ${result.characters.map(c => c.name).join(', ')}`);
  console.log(`   Tagged chapter length: ${result.taggedChapter.length} chars`);
  console.log('\n💡 User can start listening while remaining chapters process in background');
}

/**
 * Example: Check if dramatization is needed
 */
async function exampleCheckDramatization() {
  console.log('\n🔍 Check Dramatization Example\n');
  
  // Load a book that might already be dramatized
  const bookPath = path.join(__dirname, '..', 'assets', 'sample_text_dramatized.txt');
  const bookText = await fs.readFile(bookPath, 'utf-8');
  
  // Check if already has voice tags
  const hasVoiceTags = /\[VOICE=.*?\]/.test(bookText);
  
  if (hasVoiceTags) {
    console.log('✅ Book already dramatized (has [VOICE=] tags)');
    console.log('   No LLM processing needed - use existing tags');
  } else {
    console.log('❌ Book not dramatized');
    console.log('   LLM dramatization recommended for better experience');
  }
}

// Run examples
async function main() {
  try {
    // Check environment
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      console.error('❌ GOOGLE_CLOUD_PROJECT environment variable not set');
      console.error('   Set it to your GCP project ID');
      process.exit(1);
    }
    
    // Run examples
    await exampleCheckDramatization();
    
    // TODO: Uncomment to test full dramatization (costs ~$0.02)
    // await exampleDramatizeBook();
    
    // TODO: Uncomment to test fast start
    // await exampleFastStart();
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Uncomment to run:
// main();

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║  LLM Dramatization Example                                     ║
║                                                                ║
║  This file shows how to use the Gemini dramatization system.  ║
║                                                                ║
║  TO RUN:                                                       ║
║  1. Set GOOGLE_CLOUD_PROJECT env variable                     ║
║  2. Set GOOGLE_APPLICATION_CREDENTIALS                         ║
║  3. Uncomment main() at bottom of file                         ║
║  4. Run: npx tsx src/exampleDramatization.ts                  ║
║                                                                ║
║  NOTE: Running full dramatization costs ~$0.02 per book        ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);

export { exampleDramatizeBook, exampleFastStart, exampleCheckDramatization };
