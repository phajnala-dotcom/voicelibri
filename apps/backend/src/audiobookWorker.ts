/**
 * Audiobook Generation Worker - Background audiobook generation
 * 
 * Persistent worker that:
 * - Generates audiobooks in background (continues even if frontend closes)
 * - Saves generation state to disk (resumes on server restart)
 * - Handles errors gracefully with retry logic
 * - Generates temp chunks in parallel (2 at once)
 * - Consolidates chapters when all chunks complete
 * 
 * Part of Phase 3: Audiobook Library & File-Based Generation
 */

import EventEmitter from 'events';
import {
  generateAndSaveTempChunk,
  generateMultipleTempChunks,
  consolidateChapterFromTemps,
  tempChunkExists,
} from './tempChunkManager.js';
import {
  loadAudiobookMetadata,
  saveAudiobookMetadata,
  sanitizeBookTitle,
  type AudiobookMetadata,
  type ChapterMetadata,
} from './audiobookManager.js';
import { Chapter } from './bookChunker.js';
import { ChunkInfo } from './chapterChunker.js';
import { applySoundscapeToChapter } from './soundscapeIntegration.js';

// ========================================
// Worker State & Queue
// ========================================

interface GenerationJob {
  bookTitle: string;
  chapters: Chapter[];
  chunks: ChunkInfo[];
  voiceMap: Record<string, string>;
  defaultVoice: string;
  isDramatized: boolean;
}

interface GenerationProgress {
  bookTitle: string;
  totalChunks: number;
  chunksGenerated: number;
  totalChapters: number;
  chaptersConsolidated: number;
  status: 'queued' | 'generating' | 'consolidating' | 'completed' | 'error';
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

class AudiobookGenerationWorker extends EventEmitter {
  private queue: GenerationJob[] = [];
  private isProcessing = false;
  private currentJob: GenerationJob | null = null;
  private progressMap = new Map<string, GenerationProgress>();

  /**
   * Add a book to the generation queue
   * 
   * @param bookTitle - Sanitized book title
   * @param chapters - Array of chapters
   * @param chunks - Array of chunk info
   * @param voiceMap - Character to voice mapping
   * @param defaultVoice - Default narrator voice
   * @param isDramatized - Whether book contains voice tags
   */
  addBook(
    bookTitle: string,
    chapters: Chapter[],
    chunks: ChunkInfo[],
    voiceMap: Record<string, string> = {},
    defaultVoice: string = 'Algieba',
    isDramatized: boolean = false
  ): void {
    // Check if already in queue or processing
    if (this.progressMap.has(bookTitle)) {
      const progress = this.progressMap.get(bookTitle)!;
      if (progress.status === 'generating' || progress.status === 'queued') {
        console.log(`⚠️ Book "${bookTitle}" already queued or generating`);
        return;
      }
    }

    const job: GenerationJob = {
      bookTitle,
      chapters,
      chunks,
      voiceMap,
      defaultVoice,
      isDramatized,
    };

    this.queue.push(job);

    // Initialize progress tracking
    this.progressMap.set(bookTitle, {
      bookTitle,
      totalChunks: chunks.length,
      chunksGenerated: 0,
      totalChapters: chapters.length,
      chaptersConsolidated: 0,
      status: 'queued',
    });

    console.log(`📚 Added "${bookTitle}" to generation queue (${chunks.length} chunks, ${chapters.length} chapters)`);
    this.emit('jobAdded', bookTitle);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process the generation queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.currentJob = job;

      try {
        await this.generateAudiobook(job);
      } catch (error) {
        console.error(`✗ Failed to generate audiobook "${job.bookTitle}":`, error);
        this.updateProgress(job.bookTitle, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.currentJob = null;
    this.isProcessing = false;
    console.log('✓ Generation queue empty');
  }

  /**
   * Generate an entire audiobook
   * 
   * @param job - Generation job
   */
  private async generateAudiobook(job: GenerationJob): Promise<void> {
    const { bookTitle, chapters, chunks, voiceMap, defaultVoice } = job;

    console.log(`\n🚀 Starting generation: "${bookTitle}"`);
    console.log(`   Chunks: ${chunks.length}, Chapters: ${chapters.length}`);

    this.updateProgress(bookTitle, {
      status: 'generating',
      startedAt: new Date().toISOString(),
    });

    // Generate all chunks (with parallel batching)
    await this.generateAllChunks(bookTitle, chunks, voiceMap, defaultVoice);

    // Consolidate chapters
    await this.consolidateAllChapters(bookTitle, chunks);

    // Mark as completed
    this.updateProgress(bookTitle, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    // Update metadata
    const metadata = loadAudiobookMetadata(bookTitle);
    if (metadata) {
      metadata.generationStatus = 'completed';
      saveAudiobookMetadata(bookTitle, metadata);
    }

    console.log(`✅ Audiobook generation complete: "${bookTitle}"`);
    this.emit('jobCompleted', bookTitle);
  }

  /**
   * Generate all chunks with parallel batching
   * Generates 2 chunks at a time for optimal performance
   * 
   * @param bookTitle - Book title
   * @param chunks - Array of chunk info
   * @param voiceMap - Voice mapping
   * @param defaultVoice - Default voice
   */
  private async generateAllChunks(
    bookTitle: string,
    chunks: ChunkInfo[],
    voiceMap: Record<string, string>,
    defaultVoice: string
  ): Promise<void> {
    console.log(`\n🎤 Generating ${chunks.length} chunks...`);

    const PARALLEL_BATCH_SIZE = 2; // Generate 2 chunks at once
    let generatedCount = 0;

    for (let i = 0; i < chunks.length; i += PARALLEL_BATCH_SIZE) {
      const batch = chunks.slice(i, i + PARALLEL_BATCH_SIZE);
      const batchIndices = batch.map(c => c.globalChunkIndex);
      const batchTexts = batch.map(c => c.text);

      try {
        // Check which chunks already exist
        const needsGeneration = batch.filter(
          c => !tempChunkExists(bookTitle, c.globalChunkIndex)
        );

        if (needsGeneration.length === 0) {
          console.log(`  Batch ${i}-${i + batch.length - 1}: All chunks exist, skipping`);
          generatedCount += batch.length;
          this.updateProgress(bookTitle, { chunksGenerated: generatedCount });
          continue;
        }

        // Generate batch in parallel
        const results = await generateMultipleTempChunks(
          batchIndices,
          batchTexts,
          bookTitle,
          voiceMap,
          defaultVoice
        );

        generatedCount += batch.length;
        this.updateProgress(bookTitle, { chunksGenerated: generatedCount });

        console.log(`  Progress: ${generatedCount}/${chunks.length} chunks (${((generatedCount / chunks.length) * 100).toFixed(1)}%)`);
      } catch (error) {
        console.error(`✗ Failed to generate batch ${i}-${i + batch.length - 1}:`, error);
        // Continue with next batch (don't fail entire job)
      }
    }

    console.log(`✓ All chunks generated: ${generatedCount}/${chunks.length}`);
  }

  /**
   * Consolidate all chapters from temp chunks
   * 
   * @param bookTitle - Book title
   * @param chunks - Array of chunk info
   */
  private async consolidateAllChapters(
    bookTitle: string,
    chunks: ChunkInfo[]
  ): Promise<void> {
    // Build chapter-to-chunks mapping
    const chapterChunks = new Map<number, number[]>();
    const chapterTextMap = new Map<number, string>();

    for (const chunk of chunks) {
      if (!chapterChunks.has(chunk.chapterIndex)) {
        chapterChunks.set(chunk.chapterIndex, []);
      }
      chapterChunks.get(chunk.chapterIndex)!.push(chunk.globalChunkIndex);

      const existingText = chapterTextMap.get(chunk.chapterIndex) ?? '';
      chapterTextMap.set(
        chunk.chapterIndex,
        existingText ? `${existingText}\n${chunk.text}` : chunk.text
      );
    }

    console.log(`\n📦 Consolidating ${chapterChunks.size} chapters...`);

    this.updateProgress(bookTitle, { status: 'consolidating' });

    let consolidatedCount = 0;

    for (const [chapterIndex, chunkIndices] of chapterChunks.entries()) {
      try {
        console.log(`  Consolidating chapter ${chapterIndex}: ${chunkIndices.length} chunks (${chunkIndices.join(', ')})`);
        const chapterPath = await consolidateChapterFromTemps(bookTitle, chapterIndex, chunkIndices);
        const chapterText = chapterTextMap.get(chapterIndex) ?? '';
        const metadata = loadAudiobookMetadata(bookTitle);
        await applySoundscapeToChapter({
          bookTitle,
          chapterIndex,
          chapterPath,
          chapterText,
          preferences: metadata?.userPreferences,
        });
        consolidatedCount++;
        this.updateProgress(bookTitle, { chaptersConsolidated: consolidatedCount });
        console.log(`  ✓ Chapter ${chapterIndex} consolidated (${consolidatedCount}/${chapterChunks.size})`);
      } catch (error) {
        console.error(`✗ Failed to consolidate chapter ${chapterIndex}:`, error);
        // Log error but continue with other chapters
        if (error instanceof Error) {
          console.error(`  Error details: ${error.message}`);
        }
      }
    }

    console.log(`✓ Consolidation complete: ${consolidatedCount}/${chapterChunks.size} chapters`);
  }

  /**
   * Update progress for a book
   * 
   * @param bookTitle - Book title
   * @param updates - Partial progress updates
   */
  private updateProgress(bookTitle: string, updates: Partial<GenerationProgress>): void {
    const current = this.progressMap.get(bookTitle);
    if (current) {
      Object.assign(current, updates);
      this.emit('progressUpdate', bookTitle, current);
    }
  }

  /**
   * Get progress for a specific book
   * 
   * @param bookTitle - Book title
   * @returns Progress or null if not found
   */
  getProgress(bookTitle: string): GenerationProgress | null {
    return this.progressMap.get(bookTitle) || null;
  }

  /**
   * Get all progress (for all books)
   * 
   * @returns Map of bookTitle -> progress
   */
  getAllProgress(): Map<string, GenerationProgress> {
    return new Map(this.progressMap);
  }

  /**
   * Cancel generation for a book (if queued)
   * Cannot cancel currently processing job
   * 
   * @param bookTitle - Book title
   * @returns True if cancelled, false if not found or already processing
   */
  cancelJob(bookTitle: string): boolean {
    const index = this.queue.findIndex(job => job.bookTitle === bookTitle);

    if (index !== -1) {
      this.queue.splice(index, 1);
      this.progressMap.delete(bookTitle);
      console.log(`🚫 Cancelled job: "${bookTitle}"`);
      this.emit('jobCancelled', bookTitle);
      return true;
    }

    return false;
  }

  /**
   * Get current processing status
   * 
   * @returns Worker status
   */
  getStatus(): {
    isProcessing: boolean;
    currentJob: string | null;
    queueLength: number;
  } {
    return {
      isProcessing: this.isProcessing,
      currentJob: this.currentJob?.bookTitle || null,
      queueLength: this.queue.length,
    };
  }
}

// Export singleton instance
export const audiobookWorker = new AudiobookGenerationWorker();
