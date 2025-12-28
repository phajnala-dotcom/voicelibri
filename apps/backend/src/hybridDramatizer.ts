/**
 * Hybrid Dramatization Pipeline
 * 
 * Cost-optimized workflow:
 * 1. Full-book character scan (LLM) - $0.04
 * 2. Chapter analysis:
 *    - No dialogue → Auto-tag NARRATOR ($0)
 *    - Simple dialogue → Rule-based ($0)
 *    - Complex dialogue → LLM on dialogue only ($0.01-0.02)
 * 
 * Expected: 60-80% cost reduction, 97-99% accuracy
 */

import { GeminiCharacterAnalyzer, CharacterProfile, GeminiConfig } from './llmCharacterAnalyzer.js';
import { 
  hasDialogue, 
  countDialogues, 
  applyRuleBasedTagging, 
  calculateConfidence,
  extractDialogueParagraphs,
  mergeWithNarration,
  TaggingResult 
} from './hybridTagger.js';

export interface HybridDramatizationResult {
  taggedChapters: Array<{
    chapterNumber: number;
    taggedText: string;
    method: 'auto-narrator' | 'rule-based' | 'llm-fallback';
    confidence: number;
    cost: number;
  }>;
  characters: CharacterProfile[];
  totalCost: number;
  costBreakdown: {
    characterScan: number;
    autoNarrator: number;
    ruleBased: number;
    llmFallback: number;
  };
}

/**
 * Smart chapter tagging with hybrid approach
 * 
 * Decision tree:
 * - No dialogue → Auto-tag NARRATOR (100% confidence, $0)
 * - Has dialogue → Try rule-based
 *   - High confidence (≥0.85) → Use rule-based ($0)
 *   - Low confidence (<0.85) → LLM fallback on dialogue paragraphs only (~$0.01-0.02)
 */
export async function tagChapterHybrid(
  chapterText: string,
  characters: CharacterProfile[],
  analyzer: GeminiCharacterAnalyzer,
  chapterNumber: number,
  confidenceThreshold: number = 0.85
): Promise<TaggingResult> {
  
  // Strategy 1: No dialogue → Auto-tag as NARRATOR
  if (!hasDialogue(chapterText)) {
    console.log(`📖 Chapter ${chapterNumber}: No dialogue detected → Auto-tag NARRATOR`);
    const taggedText = `[VOICE=NARRATOR]\n${chapterText}`;
    
    return {
      taggedText,
      method: 'auto-narrator',
      confidence: 1.0,
      dialogueCount: 0,
      cost: 0,
    };
  }
  
  const dialogueCount = countDialogues(chapterText);
  console.log(`💬 Chapter ${chapterNumber}: ${dialogueCount} dialogue(s) detected`);
  
  // Strategy 2: Try rule-based tagging
  console.log(`🔍 Chapter ${chapterNumber}: Attempting rule-based tagging...`);
  const { taggedText: ruleBasedTagged, confidence: ruleConfidence } = applyRuleBasedTagging(
    chapterText,
    characters
  );
  
  const finalConfidence = calculateConfidence(ruleBasedTagged, characters);
  console.log(`📊 Rule-based confidence: ${(finalConfidence * 100).toFixed(1)}%`);
  
  // High confidence → Use rule-based
  if (finalConfidence >= confidenceThreshold) {
    console.log(`✅ Chapter ${chapterNumber}: Rule-based tagging successful (confidence ${(finalConfidence * 100).toFixed(1)}%)`);
    
    return {
      taggedText: ruleBasedTagged,
      method: 'rule-based',
      confidence: finalConfidence,
      dialogueCount,
      cost: 0,
    };
  }
  
  // Strategy 3: LLM fallback (dialogue paragraphs only)
  console.log(`🤖 Chapter ${chapterNumber}: Low confidence → LLM fallback on dialogue paragraphs`);
  
  // Extract only paragraphs with dialogue
  const dialogueParagraphs = extractDialogueParagraphs(chapterText);
  const dialogueText = dialogueParagraphs.join('\n\n');
  
  console.log(`📝 Sending ${dialogueParagraphs.length} dialogue paragraphs to LLM (${dialogueText.length} chars vs ${chapterText.length} full chapter)`);
  
  // Call LLM on dialogue-only text
  const llmTagged = await analyzer.tagChapterWithVoices(
    dialogueText,
    characters
  );
  
  // Merge LLM-tagged dialogues back with narration
  const mergedText = mergeWithNarration(chapterText, llmTagged, characters);
  
  // Estimate cost (much cheaper than full chapter)
  const inputTokens = Math.ceil(dialogueText.length / 4);
  const outputTokens = Math.ceil(llmTagged.length / 4);
  const cost = (inputTokens * 0.30 / 1_000_000) + (outputTokens * 2.50 / 1_000_000);
  
  console.log(`💰 LLM fallback cost: $${cost.toFixed(4)} (${inputTokens} in + ${outputTokens} out tokens)`);
  
  return {
    taggedText: mergedText,
    method: 'llm-fallback',
    confidence: 0.98, // LLM is highly accurate
    dialogueCount,
    cost,
  };
}

/**
 * Dramatize full book with hybrid approach
 */
export async function dramatizeBookHybrid(
  bookText: string,
  chapters: string[],
  geminiConfig: GeminiConfig,
  confidenceThreshold: number = 0.85
): Promise<HybridDramatizationResult> {
  
  // Initialize Gemini analyzer
  const analyzer = new GeminiCharacterAnalyzer(geminiConfig);
  
  console.log('🎭 Starting hybrid dramatization pipeline...');
  console.log(`📚 Book: ${bookText.length} chars, ${chapters.length} chapters`);
  
  // Step 1: Full-book character scan (LLM - required)
  console.log('🔍 Step 1: Analyzing full book for characters (LLM)...');
  const characters = await analyzer.analyzeFullBook(bookText);
  
  const characterScanCost = 0.04; // Estimated $0.04 for ~120k tokens
  console.log(`✅ Found ${characters.length} characters: ${characters.map((c: CharacterProfile) => c.name).join(', ')}`);
  console.log(`💰 Character scan cost: $${characterScanCost.toFixed(4)}`);
  
  // Step 2: Tag each chapter with hybrid approach
  console.log('🏷️ Step 2: Tagging chapters (hybrid approach)...');
  
  const taggedChapters = [];
  let autoNarratorCost = 0;
  let ruleBasedCost = 0;
  let llmFallbackCost = 0;
  
  for (let i = 0; i < chapters.length; i++) {
    const chapterNum = i + 1;
    console.log(`\n📖 Processing Chapter ${chapterNum}/${chapters.length}...`);
    
    const result = await tagChapterHybrid(
      chapters[i],
      characters,
      analyzer,
      chapterNum,
      confidenceThreshold
    );
    
    taggedChapters.push({
      chapterNumber: chapterNum,
      taggedText: result.taggedText,
      method: result.method,
      confidence: result.confidence,
      cost: result.cost,
    });
    
    // Track costs by method
    switch (result.method) {
      case 'auto-narrator':
        autoNarratorCost += result.cost;
        break;
      case 'rule-based':
        ruleBasedCost += result.cost;
        break;
      case 'llm-fallback':
        llmFallbackCost += result.cost;
        break;
    }
  }
  
  const totalCost = characterScanCost + autoNarratorCost + ruleBasedCost + llmFallbackCost;
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('🎉 HYBRID DRAMATIZATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`📚 Chapters processed: ${chapters.length}`);
  console.log(`👥 Characters found: ${characters.length}`);
  console.log('\n💰 Cost Breakdown:');
  console.log(`  Character scan (LLM):     $${characterScanCost.toFixed(4)}`);
  console.log(`  Auto-narrator (free):     $${autoNarratorCost.toFixed(4)}`);
  console.log(`  Rule-based (free):        $${ruleBasedCost.toFixed(4)}`);
  console.log(`  LLM fallback (dialogue):  $${llmFallbackCost.toFixed(4)}`);
  console.log(`  --------------------------------`);
  console.log(`  TOTAL:                    $${totalCost.toFixed(4)}`);
  
  // Method distribution
  const methodCounts = {
    'auto-narrator': taggedChapters.filter(c => c.method === 'auto-narrator').length,
    'rule-based': taggedChapters.filter(c => c.method === 'rule-based').length,
    'llm-fallback': taggedChapters.filter(c => c.method === 'llm-fallback').length,
  };
  
  console.log('\n📊 Tagging Methods Used:');
  console.log(`  Auto-narrator:  ${methodCounts['auto-narrator']} chapters (${(methodCounts['auto-narrator'] / chapters.length * 100).toFixed(0)}%)`);
  console.log(`  Rule-based:     ${methodCounts['rule-based']} chapters (${(methodCounts['rule-based'] / chapters.length * 100).toFixed(0)}%)`);
  console.log(`  LLM fallback:   ${methodCounts['llm-fallback']} chapters (${(methodCounts['llm-fallback'] / chapters.length * 100).toFixed(0)}%)`);
  
  console.log('='.repeat(60) + '\n');
  
  return {
    taggedChapters,
    characters,
    totalCost,
    costBreakdown: {
      characterScan: characterScanCost,
      autoNarrator: autoNarratorCost,
      ruleBased: ruleBasedCost,
      llmFallback: llmFallbackCost,
    },
  };
}

/**
 * Fast-start: Dramatize first chapter only for immediate playback
 */
export async function dramatizeFirstChapterHybrid(
  bookText: string,
  firstChapter: string,
  geminiConfig: GeminiConfig,
  confidenceThreshold: number = 0.85
): Promise<{
  taggedText: string;
  characters: CharacterProfile[];
  method: 'auto-narrator' | 'rule-based' | 'llm-fallback';
  confidence: number;
  cost: number;
}> {
  
  console.log('⚡ Fast-start: First chapter hybrid dramatization...');
  
  // Initialize analyzer
  const analyzer = new GeminiCharacterAnalyzer(geminiConfig);
  
  // Step 1: Character scan
  const characters = await analyzer.analyzeFullBook(bookText);
  const characterScanCost = 0.04;
  
  // Step 2: Tag first chapter with hybrid approach
  const result = await tagChapterHybrid(firstChapter, characters, analyzer, 1, confidenceThreshold);
  
  console.log(`⚡ Fast-start complete: ${result.method} (confidence ${(result.confidence * 100).toFixed(1)}%)`);
  console.log(`💰 Total cost: $${(characterScanCost + result.cost).toFixed(4)}`);
  
  return {
    taggedText: result.taggedText,
    characters,
    method: result.method,
    confidence: result.confidence,
    cost: characterScanCost + result.cost,
  };
}
