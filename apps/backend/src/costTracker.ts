/**
 * VoiceLibri - Cost Tracking Module
 * 
 * Tracks LLM/TTS token usage and calculates costs per audiobook.
 * Saves cost summary as JSON to audiobook folder.
 * 
 * Pricing (as of 2025):
 * - gemini-2.5-flash (character extraction): $0.30/M input, $2.50/M output
 * - gemini-2.5-flash (dramatization): $0.50/M input, $2.50/M output  
 * - gemini-2.5-flash-tts (audio): $0.30/M input, $10.00/M output
 */

import fs from 'fs';
import path from 'path';
import { getAudiobooksDir } from './audiobookManager.js';

/**
 * Token estimation coefficients (validated with Google Vertex AI CountTokens API)
 * 
 * These values were measured using real text samples with the official Gemini tokenizer:
 * - Slovak sample: 2.203 tokens/word
 * - Czech sample: 2.092 tokens/word
 * - English sample: 1.379 tokens/word
 */
export const TOKEN_COEFFICIENTS = {
  // Slavic languages (validated average of Czech + Slovak)
  SLAVIC_TOKENS_PER_WORD: 2.15,
  
  // English
  ENGLISH_TOKENS_PER_WORD: 1.38,
  
  // Fallback for unknown languages (conservative middle ground)
  DEFAULT_TOKENS_PER_WORD: 1.76,
};

/**
 * Count words in text (excluding punctuation)
 */
export function countWords(text: string): number {
  const cleaned = text.replace(/[„""\'''«»‹›,\.!?;:—–\-\(\)\[\]]/g, ' ');
  return cleaned.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Estimate tokens from text based on language
 * 
 * @param text - The text to estimate tokens for
 * @param language - Language code (e.g., 'cs', 'sk', 'en') or 'slavic', 'english'
 * @returns Estimated token count
 */
export function estimateTokens(text: string, language?: string): number {
  const words = countWords(text);
  
  // Determine coefficient based on language
  let coefficient = TOKEN_COEFFICIENTS.DEFAULT_TOKENS_PER_WORD;
  
  if (language) {
    const lang = language.toLowerCase();
    if (['cs', 'sk', 'pl', 'uk', 'ru', 'hr', 'sr', 'bg', 'sl', 'slavic', 'czech', 'slovak'].includes(lang)) {
      coefficient = TOKEN_COEFFICIENTS.SLAVIC_TOKENS_PER_WORD;
    } else if (['en', 'english'].includes(lang)) {
      coefficient = TOKEN_COEFFICIENTS.ENGLISH_TOKENS_PER_WORD;
    }
  }
  
  return Math.ceil(words * coefficient);
}

/**
 * Pricing rates per million tokens (USD)
 */
export const PRICING = {
  CHARACTER_EXTRACTION: {
    model: 'gemini-2.5-flash',
    inputPerMillion: 0.30,
    outputPerMillion: 2.50,
  },
  DRAMATIZATION: {
    model: 'gemini-2.5-flash',
    inputPerMillion: 0.50,
    outputPerMillion: 2.50,
  },
  AUDIO_GENERATION: {
    model: 'gemini-2.5-flash-tts',
    inputPerMillion: 0.30,
    outputPerMillion: 10.00,
  },
  TRANSLATION: {
    model: 'gemini-2.5-flash',
    inputPerMillion: 0.30,
    outputPerMillion: 2.50,
  },
};


/**
 * Token usage for a single process
 */
export interface ProcessUsage {
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  subtotal: number;  // inputCost + outputCost
}

/**
 * Complete cost summary for an audiobook
 */
export interface CostSummary {
  title: string;
  generatedAt: string;
  
  // Token usage by process
  characterExtraction: ProcessUsage;
  translation: ProcessUsage;
  dramatization: ProcessUsage;
  audioGeneration: ProcessUsage;
  
  // Totals
  totalInputTokens: number;
  totalOutputTokens: number;
  totalInputCost: number;
  totalOutputCost: number;
  grandTotal: number;
  
  // Duration and unit price
  totalDurationHours: number;
  costPerHour: number;
}

/**
 * Cost Tracker - accumulates usage during audiobook generation
 */
export class CostTracker {
  private title: string;
  private characterExtraction: ProcessUsage = { inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, subtotal: 0 };
  private translation: ProcessUsage = { inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, subtotal: 0 };
  private dramatization: ProcessUsage = { inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, subtotal: 0 };
  private audioGeneration: ProcessUsage = { inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, subtotal: 0 };
  private totalDurationSeconds: number = 0;
  
  constructor(title: string) {
    this.title = title;
  }
  
  /**
   * Add character extraction usage
   */
  addCharacterExtraction(inputTokens: number, outputTokens: number): void {
    const pricing = PRICING.CHARACTER_EXTRACTION;
    this.characterExtraction.inputTokens += inputTokens;
    this.characterExtraction.outputTokens += outputTokens;
    this.characterExtraction.inputCost = (this.characterExtraction.inputTokens / 1_000_000) * pricing.inputPerMillion;
    this.characterExtraction.outputCost = (this.characterExtraction.outputTokens / 1_000_000) * pricing.outputPerMillion;
    this.characterExtraction.subtotal = this.characterExtraction.inputCost + this.characterExtraction.outputCost;
  }
  
  /**
   * Add translation usage
   */
  addTranslation(inputTokens: number, outputTokens: number): void {
    const pricing = PRICING.TRANSLATION;
    this.translation.inputTokens += inputTokens;
    this.translation.outputTokens += outputTokens;
    this.translation.inputCost = (this.translation.inputTokens / 1_000_000) * pricing.inputPerMillion;
    this.translation.outputCost = (this.translation.outputTokens / 1_000_000) * pricing.outputPerMillion;
    this.translation.subtotal = this.translation.inputCost + this.translation.outputCost;
  }
  
  /**
   * Add dramatization usage
   */
  addDramatization(inputTokens: number, outputTokens: number): void {
    const pricing = PRICING.DRAMATIZATION;
    this.dramatization.inputTokens += inputTokens;
    this.dramatization.outputTokens += outputTokens;
    this.dramatization.inputCost = (this.dramatization.inputTokens / 1_000_000) * pricing.inputPerMillion;
    this.dramatization.outputCost = (this.dramatization.outputTokens / 1_000_000) * pricing.outputPerMillion;
    this.dramatization.subtotal = this.dramatization.inputCost + this.dramatization.outputCost;
  }
  
  /**
   * Add audio generation usage
   */
  addAudioGeneration(inputTokens: number, outputTokens: number): void {
    const pricing = PRICING.AUDIO_GENERATION;
    this.audioGeneration.inputTokens += inputTokens;
    this.audioGeneration.outputTokens += outputTokens;
    this.audioGeneration.inputCost = (this.audioGeneration.inputTokens / 1_000_000) * pricing.inputPerMillion;
    this.audioGeneration.outputCost = (this.audioGeneration.outputTokens / 1_000_000) * pricing.outputPerMillion;
    this.audioGeneration.subtotal = this.audioGeneration.inputCost + this.audioGeneration.outputCost;
  }
  
  /**
   * Set total audio duration
   */
  setDuration(seconds: number): void {
    this.totalDurationSeconds = seconds;
  }
  
  /**
   * Get current cost summary
   */
  getSummary(): CostSummary {
    const totalInputTokens = 
      this.characterExtraction.inputTokens +
      this.translation.inputTokens +
      this.dramatization.inputTokens +
      this.audioGeneration.inputTokens;
      
    const totalOutputTokens =
      this.characterExtraction.outputTokens +
      this.translation.outputTokens +
      this.dramatization.outputTokens +
      this.audioGeneration.outputTokens;
      
    const totalInputCost =
      this.characterExtraction.inputCost +
      this.translation.inputCost +
      this.dramatization.inputCost +
      this.audioGeneration.inputCost;
      
    const totalOutputCost =
      this.characterExtraction.outputCost +
      this.translation.outputCost +
      this.dramatization.outputCost +
      this.audioGeneration.outputCost;
      
    const grandTotal = totalInputCost + totalOutputCost;
    const totalDurationHours = this.totalDurationSeconds / 3600;
    const costPerHour = totalDurationHours > 0 ? grandTotal / totalDurationHours : 0;
    
    return {
      title: this.title,
      generatedAt: new Date().toISOString(),
      characterExtraction: { ...this.characterExtraction },
      translation: { ...this.translation },
      dramatization: { ...this.dramatization },
      audioGeneration: { ...this.audioGeneration },
      totalInputTokens,
      totalOutputTokens,
      totalInputCost,
      totalOutputCost,
      grandTotal,
      totalDurationHours,
      costPerHour,
    };
  }
  
  /**
   * Save cost summary to audiobook folder as JSON
   */
  async saveToFile(): Promise<string> {
    const summary = this.getSummary();
    const bookFolder = path.join(getAudiobooksDir(), this.title);
    
    // Ensure folder exists
    await fs.promises.mkdir(bookFolder, { recursive: true });
    
    const jsonPath = path.join(bookFolder, 'cost_summary.json');
    const jsonContent = JSON.stringify(summary, null, 2);
    
    await fs.promises.writeFile(jsonPath, jsonContent, 'utf8');
    console.log(`   💰 Cost summary saved: ${jsonPath}`);
    
    return jsonPath;
  }
  
  /**
   * Generate formatted text report
   */
  getTextReport(): string {
    const s = this.getSummary();
    
    const lines = [
      `═══════════════════════════════════════════════════════════════════════`,
      `                    VOICELIBRI COST SUMMARY`,
      `═══════════════════════════════════════════════════════════════════════`,
      `Title: ${s.title}`,
      `Generated: ${s.generatedAt}`,
      ``,
      `───────────────────────────────────────────────────────────────────────`,
      `Process                  Input Tokens   Output Tokens   Subtotal`,
      `───────────────────────────────────────────────────────────────────────`,
      `Character Extraction     ${s.characterExtraction.inputTokens.toLocaleString().padStart(12)}   ${s.characterExtraction.outputTokens.toLocaleString().padStart(13)}   $${s.characterExtraction.subtotal.toFixed(4)}`,
      `Translation              ${s.translation.inputTokens.toLocaleString().padStart(12)}   ${s.translation.outputTokens.toLocaleString().padStart(13)}   $${s.translation.subtotal.toFixed(4)}`,
      `Dramatization            ${s.dramatization.inputTokens.toLocaleString().padStart(12)}   ${s.dramatization.outputTokens.toLocaleString().padStart(13)}   $${s.dramatization.subtotal.toFixed(4)}`,
      `Audio Generation         ${s.audioGeneration.inputTokens.toLocaleString().padStart(12)}   ${s.audioGeneration.outputTokens.toLocaleString().padStart(13)}   $${s.audioGeneration.subtotal.toFixed(4)}`,
      `───────────────────────────────────────────────────────────────────────`,
      `TOTAL                    ${s.totalInputTokens.toLocaleString().padStart(12)}   ${s.totalOutputTokens.toLocaleString().padStart(13)}   $${s.grandTotal.toFixed(4)}`,
      ``,
      `Duration: ${s.totalDurationHours.toFixed(2)} hours`,
      `Cost per hour: $${s.costPerHour.toFixed(4)}`,
      `═══════════════════════════════════════════════════════════════════════`,
    ];
    
    return lines.join('\n');
  }
}

// Global cost tracker instance (per audiobook generation)
let currentTracker: CostTracker | null = null;

/**
 * Start tracking costs for a new audiobook
 */
export function startCostTracking(title: string): CostTracker {
  currentTracker = new CostTracker(title);
  console.log(`   💰 Cost tracking started for: ${title}`);
  return currentTracker;
}

/**
 * Get current cost tracker
 */
export function getCostTracker(): CostTracker | null {
  return currentTracker;
}

/**
 * Clear cost tracker
 */
export function clearCostTracker(): void {
  currentTracker = null;
}
