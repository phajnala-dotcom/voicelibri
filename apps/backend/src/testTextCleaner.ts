/**
 * Text Cleaner Test Suite
 * Tests cleanText function with sample files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanText } from './textCleaner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

async function testTextCleaner() {
  console.log('🧪 Testing Text Cleaner Module\n');
  console.log('═'.repeat(60));
  
  // Test 1: Plain text file
  console.log('\n📄 Test 1: Plain Text File (sample_text.txt)');
  console.log('─'.repeat(60));
  try {
    const textPath = path.join(ASSETS_DIR, 'sample_text.txt');
    if (fs.existsSync(textPath)) {
      const originalText = fs.readFileSync(textPath, 'utf-8');
      const result = cleanText(originalText);
      
      console.log(`✓ Original length: ${result.originalLength} characters`);
      console.log(`✓ Cleaned length: ${result.cleanedLength} characters`);
      console.log(`✓ Reduction: ${((result.bytesRemoved / result.originalLength) * 100).toFixed(1)}%`);
      console.log(`✓ Patterns matched: ${result.patternsMatched.join(', ')}`);
      if (result.warnings.length > 0) {
        console.log(`⚠ Warnings: ${result.warnings.join(', ')}`);
      }
      
      // Check if common non-content elements were removed
      const hasPageNumbers = /^Page \d+$/m.test(result.cleanedText);
      const hasTOC = /TABLE OF CONTENTS|Contents/i.test(result.cleanedText);
      console.log(`✓ Page numbers removed: ${!hasPageNumbers}`);
      console.log(`✓ TOC removed: ${!hasTOC}`);
      
      // Save cleaned version for inspection
      const outputPath = path.join(ASSETS_DIR, 'sample_text_cleaned.txt');
      fs.writeFileSync(outputPath, result.cleanedText, 'utf-8');
      console.log(`✓ Saved cleaned version: ${outputPath}`);
    } else {
      console.log('⚠ File not found, skipping test');
    }
  } catch (error) {
    console.error('✗ Test 1 failed:', error);
  }
  
  // Test 2: Dramatized text file
  console.log('\n📄 Test 2: Dramatized Text File (sample_text_dramatized.txt)');
  console.log('─'.repeat(60));
  try {
    const textPath = path.join(ASSETS_DIR, 'sample_text_dramatized.txt');
    if (fs.existsSync(textPath)) {
      const originalText = fs.readFileSync(textPath, 'utf-8');
      const result = cleanText(originalText);
      
      console.log(`✓ Original length: ${result.originalLength} characters`);
      console.log(`✓ Cleaned length: ${result.cleanedLength} characters`);
      console.log(`✓ Reduction: ${((result.bytesRemoved / result.originalLength) * 100).toFixed(1)}%`);
      console.log(`✓ Patterns matched: ${result.patternsMatched.join(', ')}`);
      
      // Check if voice tags are preserved (SPEAKER: format)
      const hasVoiceTags = /^[A-Z][A-Z0-9]*:\s/m.test(result.cleanedText);
      console.log(`✓ Voice tags preserved: ${hasVoiceTags}`);
      
      // Count voice tags (SPEAKER: format)
      const voiceTagCount = (result.cleanedText.match(/^[A-Z][A-Z0-9]*:\s/gm) || []).length;
      console.log(`✓ Voice tags found: ${voiceTagCount}`);
    } else {
      console.log('⚠ File not found, skipping test');
    }
  } catch (error) {
    console.error('✗ Test 2 failed:', error);
  }
  
  // Test 3: Conservative vs Aggressive modes
  console.log('\n📄 Test 3: Conservative vs Aggressive Cleaning');
  console.log('─'.repeat(60));
  try {
    const textPath = path.join(ASSETS_DIR, 'sample_text.txt');
    if (fs.existsSync(textPath)) {
      const text = fs.readFileSync(textPath, 'utf-8');
      
      const conservative = cleanText(text, {
        removePageNumbers: true,
        removeTableOfContents: true,
        removeEditorialNotes: true,
        removePublisherInfo: true,
        removeHeadersFooters: true,
        preserveCopyright: true,
        preserveAuthor: true,
        aggressive: false,
      });
      const aggressive = cleanText(text, {
        removePageNumbers: true,
        removeTableOfContents: true,
        removeEditorialNotes: true,
        removePublisherInfo: true,
        removeHeadersFooters: true,
        preserveCopyright: true,
        preserveAuthor: true,
        aggressive: true,
      });
      
      console.log(`✓ Conservative: ${conservative.cleanedLength} characters`);
      console.log(`✓ Aggressive: ${aggressive.cleanedLength} characters`);
      console.log(`✓ Additional reduction: ${((1 - aggressive.cleanedLength / conservative.cleanedLength) * 100).toFixed(1)}%`);
    } else {
      console.log('⚠ File not found, skipping test');
    }
  } catch (error) {
    console.error('✗ Test 3 failed:', error);
  }
  
  // Test 4: Edge cases
  console.log('\n📄 Test 4: Edge Cases');
  console.log('─'.repeat(60));
  
  // Empty string
  const emptyResult = cleanText('');
  console.log(`✓ Empty string: "${emptyResult.cleanedText}" (length: ${emptyResult.cleanedLength})`);
  
  // Only whitespace
  const whitespaceResult = cleanText('   \n\n\t  \n   ');
  console.log(`✓ Only whitespace: "${whitespaceResult.cleanedText}" (length: ${whitespaceResult.cleanedLength})`);
  
  // Already clean text
  const cleanInput = 'This is a clean story with no page numbers or metadata.';
  const cleanResult = cleanText(cleanInput);
  console.log(`✓ Already clean: ${cleanInput.length} → ${cleanResult.cleanedLength} characters`);
  console.log(`✓ Preserved: ${cleanResult.cleanedText === cleanInput}`);
  console.log(`✓ Bytes removed: ${cleanResult.bytesRemoved}`);
  
  // Voice tags preservation (new Gemini TTS format: SPEAKER: text)
  const voiceTaggedInput = 'NARRATOR: Once upon a time.\nCHARACTER: "Hello!"';
  const voiceTaggedResult = cleanText(voiceTaggedInput);
  console.log(`✓ Voice tags preserved: ${/^[A-Z]+:\s/m.test(voiceTaggedResult.cleanedText)}`);
  console.log(`✓ Voice tag result: "${voiceTaggedResult.cleanedText.substring(0, 50)}..."`);

  console.log('\n═'.repeat(60));
  console.log('✓ Text Cleaner Tests Complete\n');
}

// Run tests
testTextCleaner().catch(console.error);
