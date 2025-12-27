/**
 * Gemini Dramatizer - Main Orchestration Module
 * 
 * Implements Option C → D Strategy:
 * - Phase 1: Quick character scan (15-20s)
 * - Phase 2: Progressive chapter tagging (stay ahead of playback)
 * - Phase 3: Caching for instant replay
 * 
 * Coordinates:
 * - Text cleaning
 * - LLM character extraction
 * - LLM chapter tagging
 * - Voice assignment
 * - Caching/storage
 */

import { GeminiCharacterAnalyzer, CharacterProfile, GeminiConfig } from './llmCharacterAnalyzer.js';
import { assignVoices, VoiceMap } from './voiceAssigner.js';
import { cleanEpubText, cleanPlainText } from './textCleaner.js';
import { Chapter } from './bookChunker.js';
import fs from 'fs/promises';
import path from 'path';
import { getAudiobooksDir, sanitizeBookTitle } from './audiobookManager.js';

/**
 * Dramatization configuration
 */
export interface DramatizationConfig {
  /** Gemini API configuration */
  gemini: GeminiConfig;
  
  /** Minimum dialogue lines for character inclusion */
  minDialogueLines?: number;
  
  /** Maximum characters to voice */
  maxCharacters?: number;
  
  /** Enable caching */
  enableCaching?: boolean;
  
  /** Text cleaning aggressiveness */
  aggressive?: boolean;
}

/**
 * Dramatization result
 */
export interface DramatizationResult {
  characters: CharacterProfile[];
  voiceMap: VoiceMap;
  taggedChapters: string[];
  cacheLocation?: string;
  stats: {
    charactersFound: number;
    chaptersTagged: number;
    totalTime: number; // milliseconds
    characterScanTime: number;
    taggingTime: number;
  };
}

/**
 * Progress callback for user feedback
 */
export type ProgressCallback = (progress: {
  phase: 'cleaning' | 'scanning' | 'tagging' | 'caching';
  progress: number; // 0-100
  message: string;
}) => void;

/**
 * Cache metadata
 */
interface CacheMetadata {
  version: string; // '1.0'
  timestamp: string;
  bookTitle: string;
  charactersFound: number;
  chaptersTagged: number;
}

/**
 * Main Dramatizer class
 */
export class GeminiDramatizer {
  private analyzer: GeminiCharacterAnalyzer;
  private config: DramatizationConfig;
  
  constructor(config: DramatizationConfig) {
    this.config = {
      minDialogueLines: 3,
      maxCharacters: 10,
      enableCaching: true,
      aggressive: false,
      ...config,
    };
    
    this.analyzer = new GeminiCharacterAnalyzer(config.gemini);
  }
  
  /**
   * Check if dramatization is cached
   * 
   * @param bookTitle - Sanitized book title
   * @returns Cache metadata if exists, null otherwise
   */
  async checkCache(bookTitle: string): Promise<CacheMetadata | null> {
    if (!this.config.enableCaching) {
      return null;
    }
    
    try {
      const cacheDir = this.getCacheDir(bookTitle);
      const metadataPath = path.join(cacheDir, 'dramatization.json');
      
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata: CacheMetadata = JSON.parse(metadataContent);
      
      console.log(`📦 Found cached dramatization: ${metadata.charactersFound} characters, ${metadata.chaptersTagged} chapters`);
      return metadata;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Load cached dramatization
   * 
   * @param bookTitle - Sanitized book title
   * @returns Cached characters and tagged chapters
   */
  async loadCache(bookTitle: string): Promise<{
    characters: CharacterProfile[];
    voiceMap: VoiceMap;
    taggedChapters: string[];
  } | null> {
    try {
      const cacheDir = this.getCacheDir(bookTitle);
      
      // Load characters
      const charactersPath = path.join(cacheDir, 'characters.json');
      const charactersContent = await fs.readFile(charactersPath, 'utf-8');
      const characters: CharacterProfile[] = JSON.parse(charactersContent);
      
      // Load voice map
      const voiceMapPath = path.join(cacheDir, 'voice_map.json');
      const voiceMapContent = await fs.readFile(voiceMapPath, 'utf-8');
      const voiceMap: VoiceMap = JSON.parse(voiceMapContent);
      
      // Load tagged chapters
      const taggedChapters: string[] = [];
      const chaptersDir = path.join(cacheDir, 'chapters');
      const chapterFiles = await fs.readdir(chaptersDir);
      
      for (const file of chapterFiles.sort()) {
        if (file.endsWith('.txt')) {
          const chapterPath = path.join(chaptersDir, file);
          const chapterContent = await fs.readFile(chapterPath, 'utf-8');
          taggedChapters.push(chapterContent);
        }
      }
      
      console.log(`✅ Loaded cached dramatization: ${characters.length} characters, ${taggedChapters.length} chapters`);
      return { characters, voiceMap, taggedChapters };
    } catch (error) {
      console.error('❌ Failed to load cache:', error);
      return null;
    }
  }
  
  /**
   * Save dramatization to cache
   */
  private async saveCache(
    bookTitle: string,
    characters: CharacterProfile[],
    voiceMap: VoiceMap,
    taggedChapters: string[]
  ): Promise<void> {
    if (!this.config.enableCaching) {
      return;
    }
    
    try {
      const cacheDir = this.getCacheDir(bookTitle);
      await fs.mkdir(cacheDir, { recursive: true });
      
      // Save metadata
      const metadata: CacheMetadata = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        bookTitle,
        charactersFound: characters.length,
        chaptersTagged: taggedChapters.length,
      };
      await fs.writeFile(
        path.join(cacheDir, 'dramatization.json'),
        JSON.stringify(metadata, null, 2)
      );
      
      // Save characters
      await fs.writeFile(
        path.join(cacheDir, 'characters.json'),
        JSON.stringify(characters, null, 2)
      );
      
      // Save voice map
      await fs.writeFile(
        path.join(cacheDir, 'voice_map.json'),
        JSON.stringify(voiceMap, null, 2)
      );
      
      // Save tagged chapters
      const chaptersDir = path.join(cacheDir, 'chapters');
      await fs.mkdir(chaptersDir, { recursive: true });
      
      for (let i = 0; i < taggedChapters.length; i++) {
        const filename = `chapter_${(i + 1).toString().padStart(3, '0')}.txt`;
        await fs.writeFile(
          path.join(chaptersDir, filename),
          taggedChapters[i]
        );
      }
      
      console.log(`💾 Saved dramatization cache: ${cacheDir}`);
    } catch (error) {
      console.error('❌ Failed to save cache:', error);
    }
  }
  
  /**
   * Get cache directory path
   */
  private getCacheDir(bookTitle: string): string {
    const sanitized = sanitizeBookTitle(bookTitle);
    return path.join(getAudiobooksDir(), sanitized, 'dramatization_cache');
  }
  
  /**
   * Dramatize a book (full process)
   * 
   * @param bookText - Full book text
   * @param chapters - Array of chapter objects
   * @param bookTitle - Book title for caching
   * @param format - 'epub' or 'txt'
   * @param onProgress - Progress callback
   * @returns Dramatization result
   */
  async dramatizeBook(
    bookText: string,
    chapters: Chapter[],
    bookTitle: string,
    format: 'epub' | 'txt' = 'txt',
    onProgress?: ProgressCallback
  ): Promise<DramatizationResult> {
    const startTime = Date.now();
    
    console.log(`\n🎭 Starting dramatization: "${bookTitle}" (${chapters.length} chapters)`);
    
    // Check cache first
    const cached = await this.loadCache(bookTitle);
    if (cached) {
      onProgress?.({ phase: 'caching', progress: 100, message: 'Loaded from cache' });
      return {
        characters: cached.characters,
        voiceMap: cached.voiceMap,
        taggedChapters: cached.taggedChapters,
        cacheLocation: this.getCacheDir(bookTitle),
        stats: {
          charactersFound: cached.characters.length,
          chaptersTagged: cached.taggedChapters.length,
          totalTime: Date.now() - startTime,
          characterScanTime: 0,
          taggingTime: 0,
        },
      };
    }
    
    // Phase 1: Character Scan (15-20s)
    onProgress?.({ phase: 'scanning', progress: 10, message: 'Analyzing characters...' });
    
    const scanStart = Date.now();
    const characters = await this.analyzer.analyzeFullBook(bookText);
    const scanTime = Date.now() - scanStart;
    
    console.log(`✅ Character scan complete (${(scanTime / 1000).toFixed(1)}s): ${characters.length} characters`);
    onProgress?.({ phase: 'scanning', progress: 40, message: `Found ${characters.length} characters` });
    
    // Assign voices
    const voiceMap = assignVoices(
      characters.map(c => ({
        name: c.name,
        gender: c.gender,
        traits: c.traits,
      }))
    );
    
    console.log(`🎤 Voice assignments:`, voiceMap);
    onProgress?.({ phase: 'scanning', progress: 50, message: 'Voices assigned' });
    
    // Phase 2: Progressive Chapter Tagging
    onProgress?.({ phase: 'tagging', progress: 50, message: 'Tagging chapters...' });
    
    const taggingStart = Date.now();
    const taggedChapters: string[] = [];
    
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const progress = 50 + Math.floor((i / chapters.length) * 45);
      
      onProgress?.({
        phase: 'tagging',
        progress,
        message: `Tagging chapter ${i + 1}/${chapters.length}: "${chapter.title}"`
      });
      
      console.log(`\n📝 Tagging chapter ${i + 1}/${chapters.length}: "${chapter.title}"`);
      
      const taggedChapter = await this.analyzer.tagChapterWithVoices(chapter.text, characters);
      taggedChapters.push(taggedChapter);
    }
    
    const taggingTime = Date.now() - taggingStart;
    console.log(`✅ Chapter tagging complete (${(taggingTime / 1000).toFixed(1)}s)`);
    
    // Phase 3: Save cache
    onProgress?.({ phase: 'caching', progress: 95, message: 'Saving cache...' });
    await this.saveCache(bookTitle, characters, voiceMap, taggedChapters);
    
    const totalTime = Date.now() - startTime;
    
    onProgress?.({ phase: 'caching', progress: 100, message: 'Complete!' });
    
    console.log(`\n🎉 Dramatization complete!`);
    console.log(`   Total time: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`   Character scan: ${(scanTime / 1000).toFixed(1)}s`);
    console.log(`   Chapter tagging: ${(taggingTime / 1000).toFixed(1)}s`);
    
    return {
      characters,
      voiceMap,
      taggedChapters,
      cacheLocation: this.getCacheDir(bookTitle),
      stats: {
        charactersFound: characters.length,
        chaptersTagged: taggedChapters.length,
        totalTime,
        characterScanTime: scanTime,
        taggingTime,
      },
    };
  }
  
  /**
   * Dramatize just first chapter (for fast start)
   * 
   * @param bookText - Full book text (for character scan)
   * @param firstChapter - First chapter only
   * @param bookTitle - Book title
   * @returns Characters, voice map, and tagged first chapter
   */
  async dramatizeFirstChapter(
    bookText: string,
    firstChapter: Chapter,
    bookTitle: string
  ): Promise<{
    characters: CharacterProfile[];
    voiceMap: VoiceMap;
    taggedChapter: string;
  }> {
    console.log(`\n⚡ Fast start: Dramatizing first chapter only`);
    
    // Character scan
    const characters = await this.analyzer.analyzeFullBook(bookText);
    const voiceMap = assignVoices(
      characters.map(c => ({
        name: c.name,
        gender: c.gender,
        traits: c.traits,
      }))
    );
    
    // Tag first chapter
    const taggedChapter = await this.analyzer.tagChapterWithVoices(firstChapter.text, characters);
    
    console.log(`✅ First chapter ready (~30s)`);
    
    return { characters, voiceMap, taggedChapter };
  }
}
