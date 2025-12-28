/**
 * Audiobook Library Manager
 * 
 * Manages the audiobook folder structure, metadata, and library operations.
 * Part of Phase 3: Audiobook Library & File-Based Generation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES modules dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Chapter metadata within an audiobook
 */
export interface ChapterMetadata {
  index: number;
  title: string;
  filename: string; // e.g., "Chapter_01_Title.wav"
  duration: number; // seconds
  isGenerated: boolean;
  tempChunksCount?: number; // Number of temp chunks for this chapter
  tempChunksGenerated?: number; // Number of temp chunks already generated
}

/**
 * Audiobook metadata stored in metadata.json
 */
export interface AudiobookMetadata {
  title: string;
  author: string;
  language: string;
  totalChapters: number;
  chapters: ChapterMetadata[];
  generationStatus: 'not-started' | 'in-progress' | 'completed';
  lastUpdated: string; // ISO timestamp
  voiceMap?: Record<string, string>; // Character -> Voice mapping
  sourceFile?: string; // Original book file name
  
  // Dramatization metadata
  isDramatized?: boolean; // Whether book uses multi-voice dramatization
  dramatizationVersion?: string; // Version of dramatization algorithm (for cache invalidation)
  dramatizationType?: 'llm-only' | 'hybrid-optimized'; // Which dramatization pipeline was used
  charactersFound?: number; // Number of speaking characters
  dramatizationCost?: number; // Total cost in USD for dramatization
  dramatizationConfidence?: number; // Average confidence score (0-1)
  taggingMethodBreakdown?: { // How chapters were tagged
    autoNarrator: number;
    ruleBased: number;
    llmFallback: number;
  };
  
  // User playback state (for cross-device sync)
  playback?: {
    currentChapter: number; // 0-based chapter index
    currentTime: number; // seconds within the chapter
    lastPlayedAt: string; // ISO timestamp
  };
  
  // User preferences (for cross-device sync)
  userPreferences?: {
    narratorVoice?: string; // Gemini voice name (e.g., "Algieba")
    narratorGender?: string; // Gender filter
    playbackSpeed?: number; // 0.75, 1.0, 1.25, etc.
  };
}

/**
 * Get the audiobooks root directory (project root/audiobooks)
 */
export function getAudiobooksDir(): string {
  // Navigate from backend/src to project root
  return path.join(__dirname, '..', '..', '..', 'audiobooks');
}

/**
 * Sanitize book title for folder name
 * Removes special characters and spaces, converts to valid directory name
 * 
 * @param title - Book title
 * @returns Sanitized folder name
 */
export function sanitizeBookTitle(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/\.+$/, '') // Remove trailing dots
    .substring(0, 100); // Limit length
}

/**
 * Sanitize chapter title for filename
 * Similar to book title but more aggressive (used in filenames)
 * 
 * @param title - Chapter title
 * @returns Sanitized filename-safe string
 */
export function sanitizeChapterTitle(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
    .replace(/\.+$/, '') // Remove trailing dots
    .replace(/^Chapter\s*/i, '') // Remove "Chapter" prefix if present
    .substring(0, 50); // Shorter limit for chapter titles
}

/**
 * Create audiobook folder structure
 * 
 * Creates:
 * - audiobooks/{bookTitle}/
 * - audiobooks/{bookTitle}/temp/
 * 
 * @param bookTitle - Sanitized book title
 * @returns Absolute path to the audiobook folder
 */
export function createAudiobookFolder(bookTitle: string): string {
  const audiobooksDir = getAudiobooksDir();
  const bookDir = path.join(audiobooksDir, bookTitle);
  const tempDir = path.join(bookDir, 'temp');
  
  // Create directories if they don't exist
  if (!fs.existsSync(audiobooksDir)) {
    fs.mkdirSync(audiobooksDir, { recursive: true });
    console.log(`✓ Created audiobooks directory: ${audiobooksDir}`);
  }
  
  if (!fs.existsSync(bookDir)) {
    fs.mkdirSync(bookDir, { recursive: true });
    console.log(`✓ Created audiobook folder: ${bookDir}`);
  }
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`✓ Created temp folder: ${tempDir}`);
  }
  
  return bookDir;
}

/**
 * Save audiobook metadata to metadata.json
 * 
 * @param bookTitle - Sanitized book title
 * @param metadata - Audiobook metadata to save
 */
export function saveAudiobookMetadata(bookTitle: string, metadata: AudiobookMetadata): void {
  const bookDir = path.join(getAudiobooksDir(), bookTitle);
  const metadataPath = path.join(bookDir, 'metadata.json');
  
  // Ensure directory exists
  if (!fs.existsSync(bookDir)) {
    createAudiobookFolder(bookTitle);
  }
  
  // Update timestamp
  metadata.lastUpdated = new Date().toISOString();
  
  // Write JSON with pretty formatting
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  console.log(`✓ Saved metadata: ${metadataPath}`);
}

/**
 * Load audiobook metadata from metadata.json
 * 
 * @param bookTitle - Sanitized book title
 * @returns Audiobook metadata or null if not found
 */
export function loadAudiobookMetadata(bookTitle: string): AudiobookMetadata | null {
  const bookDir = path.join(getAudiobooksDir(), bookTitle);
  const metadataPath = path.join(bookDir, 'metadata.json');
  
  if (!fs.existsSync(metadataPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(metadataPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`✗ Failed to load metadata from ${metadataPath}:`, error);
    return null;
  }
}

/**
 * List all audiobooks in the library
 * 
 * @returns Array of audiobook folder names
 */
export function listAudiobooks(): string[] {
  const audiobooksDir = getAudiobooksDir();
  
  if (!fs.existsSync(audiobooksDir)) {
    return [];
  }
  
  try {
    const entries = fs.readdirSync(audiobooksDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
  } catch (error) {
    console.error('✗ Failed to list audiobooks:', error);
    return [];
  }
}

/**
 * Get audiobook folder path
 * 
 * @param bookTitle - Sanitized book title
 * @returns Absolute path to the audiobook folder
 */
export function getAudiobookFolder(bookTitle: string): string {
  return path.join(getAudiobooksDir(), bookTitle);
}

/**
 * Get temp folder path
 * 
 * @param bookTitle - Sanitized book title
 * @returns Absolute path to the temp folder
 */
export function getTempFolder(bookTitle: string): string {
  return path.join(getAudiobookFolder(bookTitle), 'temp');
}

/**
 * Check if audiobook exists in library
 * 
 * @param bookTitle - Sanitized book title
 * @returns True if audiobook folder exists
 */
export function audiobookExists(bookTitle: string): boolean {
  const bookDir = getAudiobookFolder(bookTitle);
  return fs.existsSync(bookDir);
}

/**
 * Delete audiobook from library
 * WARNING: This deletes all files including temp chunks and consolidated chapters
 * 
 * @param bookTitle - Sanitized book title
 * @returns True if deleted successfully
 */
export function deleteAudiobook(bookTitle: string): boolean {
  const bookDir = getAudiobookFolder(bookTitle);
  
  if (!fs.existsSync(bookDir)) {
    return false;
  }
  
  try {
    fs.rmSync(bookDir, { recursive: true, force: true });
    console.log(`✓ Deleted audiobook: ${bookTitle}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to delete audiobook ${bookTitle}:`, error);
    return false;
  }
}

/**
 * Get temp chunk file path
 * 
 * @param bookTitle - Sanitized book title
 * @param chunkIndex - Chunk index (0-based)
 * @returns Absolute path to the temp chunk file
 */
export function getTempChunkPath(bookTitle: string, chunkIndex: number): string {
  const tempDir = getTempFolder(bookTitle);
  const filename = `chunk_${chunkIndex.toString().padStart(3, '0')}.wav`;
  return path.join(tempDir, filename);
}

/**
 * Get chapter file path with title
 * 
 * @param bookTitle - Sanitized book title
 * @param chapterIndex - Chapter index (0-based)
 * @param chapterTitle - Chapter title (optional, will be sanitized)
 * @param partIndex - Part index for long chapters (optional, 0-based)
 * @returns Absolute path to the chapter file
 */
export function getChapterPath(
  bookTitle: string, 
  chapterIndex: number, 
  chapterTitle?: string,
  partIndex?: number
): string {
  const bookDir = getAudiobookFolder(bookTitle);
  
  // Build filename: "06_Kapitola 5_Part 01.wav"
  let filename = `${(chapterIndex + 1).toString().padStart(2, '0')}`;
  
  if (chapterTitle) {
    const sanitizedTitle = sanitizeChapterTitle(chapterTitle);
    if (sanitizedTitle) {
      filename += `_${sanitizedTitle}`;
    }
  }
  
  if (partIndex !== undefined && partIndex >= 0) {
    filename += `_Part ${(partIndex + 1).toString().padStart(2, '0')}`;
  }
  
  filename += '.wav';
  
  return path.join(bookDir, filename);
}

/**
 * Count existing temp chunks for a book
 * 
 * @param bookTitle - Sanitized book title
 * @returns Number of temp chunk files found
 */
export function countTempChunks(bookTitle: string): number {
  const tempDir = getTempFolder(bookTitle);
  
  if (!fs.existsSync(tempDir)) {
    return 0;
  }
  
  try {
    const files = fs.readdirSync(tempDir);
    return files.filter(f => f.match(/^chunk_\d{3}\.wav$/)).length;
  } catch (error) {
    console.error('✗ Failed to count temp chunks:', error);
    return 0;
  }
}

/**
 * Save voice map to audiobook folder
 * 
 * @param bookTitle - Sanitized book title
 * @param voiceMap - Character to voice mapping
 */
export function saveVoiceMap(bookTitle: string, voiceMap: Record<string, string>): void {
  const bookDir = getAudiobookFolder(bookTitle);
  const voiceMapPath = path.join(bookDir, 'voice_map.json');
  
  fs.writeFileSync(voiceMapPath, JSON.stringify(voiceMap, null, 2), 'utf-8');
  console.log(`✓ Saved voice map: ${voiceMapPath}`);
}

/**
 * Load voice map from audiobook folder
 * 
 * @param bookTitle - Sanitized book title
 * @returns Voice map or empty object if not found
 */
export function loadVoiceMapForBook(bookTitle: string): Record<string, string> {
  const bookDir = getAudiobookFolder(bookTitle);
  const voiceMapPath = path.join(bookDir, 'voice_map.json');
  
  if (!fs.existsSync(voiceMapPath)) {
    return {};
  }
  
  try {
    const content = fs.readFileSync(voiceMapPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('✗ Failed to load voice map:', error);
    return {};
  }
}
