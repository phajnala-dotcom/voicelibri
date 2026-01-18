/**
 * VoiceLibri Audio Storage Service
 * 
 * Handles downloading and storing audiobook audio files to device local storage.
 * Uses the official expo-file-system API (SDK 54+).
 * 
 * Storage locations:
 * - Paths.document: Persistent storage, backed up to iCloud (for completed audiobooks)
 * - Paths.cache: Temporary storage (for in-progress downloads)
 * 
 * Based on official Expo FileSystem documentation:
 * https://docs.expo.dev/versions/latest/sdk/filesystem/
 */

import { File, Directory, Paths } from 'expo-file-system';
import { API_BASE_URL } from './voiceLibriApi';

// ============================================================================
// TYPES
// ============================================================================

export interface LocalAudiobook {
  title: string;
  chaptersDownloaded: number;
  totalChapters: number;
  totalSize: number; // bytes
  downloadedAt: string;
  localPath: string;
}

export interface ChapterDownloadProgress {
  chapterIndex: number;
  subChunksDownloaded: number;
  totalSubChunks: number;
  status: 'pending' | 'downloading' | 'complete' | 'error';
  error?: string;
}

export interface DownloadProgress {
  bookTitle: string;
  chapters: ChapterDownloadProgress[];
  overallProgress: number; // 0-100
  status: 'idle' | 'downloading' | 'consolidating' | 'complete' | 'error';
}

// ============================================================================
// STORAGE PATHS
// ============================================================================

/**
 * Get the audiobooks directory in document storage (persistent, backed up)
 */
function getAudiobooksDirectory(): Directory {
  return new Directory(Paths.document, 'voicelibri', 'audiobooks');
}

/**
 * Get directory for a specific audiobook
 */
function getBookDirectory(bookTitle: string): Directory {
  const sanitizedTitle = sanitizeFilename(bookTitle);
  return new Directory(getAudiobooksDirectory(), sanitizedTitle);
}

/**
 * Get the temp directory for downloads in progress
 */
function getTempDirectory(): Directory {
  return new Directory(Paths.cache, 'voicelibri', 'temp');
}

/**
 * Sanitize filename to remove special characters
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_\s]/g, '').replace(/\s+/g, '_').substring(0, 100);
}

// ============================================================================
// DIRECTORY MANAGEMENT
// ============================================================================

/**
 * Ensure audiobooks directory structure exists
 */
export function ensureDirectoriesExist(): void {
  try {
    const audiobooksDir = getAudiobooksDirectory();
    if (!audiobooksDir.exists) {
      audiobooksDir.create({ intermediates: true });
      console.log('✓ Created audiobooks directory:', audiobooksDir.uri);
    }
    
    const tempDir = getTempDirectory();
    if (!tempDir.exists) {
      tempDir.create({ intermediates: true });
      console.log('✓ Created temp directory:', tempDir.uri);
    }
  } catch (error) {
    console.error('✗ Error creating directories:', error);
    throw error;
  }
}

// ============================================================================
// DOWNLOAD FUNCTIONS
// ============================================================================

/**
 * Download a single subchunk from backend and save to device storage
 */
export async function downloadSubChunk(
  bookTitle: string,
  chapterIndex: number,
  subChunkIndex: number
): Promise<string> {
  ensureDirectoriesExist();
  
  const url = `${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/subchunks/${chapterIndex}/${subChunkIndex}`;
  const bookDir = getBookDirectory(bookTitle);
  
  // Create book directory if it doesn't exist
  if (!bookDir.exists) {
    bookDir.create({ intermediates: true });
  }
  
  // Create chapter subdirectory
  const chapterDir = new Directory(bookDir, `chapter_${chapterIndex}`);
  if (!chapterDir.exists) {
    chapterDir.create();
  }
  
  console.log(`📥 Downloading subchunk ${chapterIndex}:${subChunkIndex}`);
  
  try {
    // Use official File.downloadFileAsync per Expo docs
    const downloadedFile = await File.downloadFileAsync(url, chapterDir, {
      idempotent: true, // Overwrite if exists
    });
    
    // Rename to our expected filename
    // Use Paths.basename to get current filename from URI per official docs
    const expectedName = `subchunk_${subChunkIndex}.wav`;
    const currentName = Paths.basename(downloadedFile.uri);
    if (currentName !== expectedName) {
      downloadedFile.rename(expectedName);
    }
    
    console.log(`✓ Downloaded subchunk ${chapterIndex}:${subChunkIndex} (${downloadedFile.size} bytes)`);
    return downloadedFile.uri;
  } catch (error) {
    console.error(`✗ Failed to download subchunk ${chapterIndex}:${subChunkIndex}:`, error);
    throw error;
  }
}

/**
 * Download result with file info
 */
export interface DownloadResult {
  uri: string;
  size: number;
}

/**
 * Download a complete chapter from backend
 * Returns both URI and size to avoid incorrect File constructor usage
 */
export async function downloadChapter(
  bookTitle: string,
  chapterIndex: number
): Promise<DownloadResult> {
  ensureDirectoriesExist();
  
  const url = `${API_BASE_URL}/audiobooks/${encodeURIComponent(bookTitle)}/chapters/${chapterIndex}`;
  const bookDir = getBookDirectory(bookTitle);
  
  // Create book directory if it doesn't exist
  if (!bookDir.exists) {
    bookDir.create({ intermediates: true });
  }
  
  console.log(`📥 Downloading chapter ${chapterIndex} for "${bookTitle}"`);
  
  try {
    // Download directly to book directory per official Expo docs
    // File.downloadFileAsync returns a File instance
    const downloadedFile = await File.downloadFileAsync(url, bookDir, {
      idempotent: true,
    });
    
    // Rename to our expected filename per official docs: file.rename(newName)
    // Use Paths.basename to get current filename from URI per official docs
    const expectedName = `chapter_${chapterIndex}.wav`;
    const currentName = Paths.basename(downloadedFile.uri);
    if (currentName !== expectedName) {
      downloadedFile.rename(expectedName);
    }
    
    const fileSize = downloadedFile.size || 0;
    console.log(`✓ Downloaded chapter ${chapterIndex} (${fileSize} bytes)`);
    
    // Return both URI and size from the File instance
    return {
      uri: downloadedFile.uri,
      size: fileSize,
    };
  } catch (error) {
    console.error(`✗ Failed to download chapter ${chapterIndex}:`, error);
    throw error;
  }
}

/**
 * Download all chapters for an audiobook with progress tracking
 */
export async function downloadAudiobook(
  bookTitle: string,
  totalChapters: number,
  onProgress?: (progress: DownloadProgress) => void
): Promise<LocalAudiobook> {
  ensureDirectoriesExist();
  
  const progress: DownloadProgress = {
    bookTitle,
    chapters: Array.from({ length: totalChapters }, (_, i) => ({
      chapterIndex: i,
      subChunksDownloaded: 0,
      totalSubChunks: 0, // Unknown until we fetch
      status: 'pending' as const,
    })),
    overallProgress: 0,
    status: 'downloading',
  };
  
  onProgress?.(progress);
  
  const bookDir = getBookDirectory(bookTitle);
  let totalSize = 0;
  
  for (let i = 0; i < totalChapters; i++) {
    progress.chapters[i].status = 'downloading';
    onProgress?.(progress);
    
    try {
      // downloadChapter now returns { uri, size } per official docs pattern
      const downloadResult = await downloadChapter(bookTitle, i);
      totalSize += downloadResult.size;
      
      progress.chapters[i].status = 'complete';
      progress.overallProgress = Math.round(((i + 1) / totalChapters) * 100);
      onProgress?.(progress);
    } catch (error) {
      progress.chapters[i].status = 'error';
      progress.chapters[i].error = error instanceof Error ? error.message : 'Download failed';
      onProgress?.(progress);
      // Continue with other chapters
    }
  }
  
  progress.status = 'complete';
  onProgress?.(progress);
  
  const localAudiobook: LocalAudiobook = {
    title: bookTitle,
    chaptersDownloaded: progress.chapters.filter(c => c.status === 'complete').length,
    totalChapters,
    totalSize,
    downloadedAt: new Date().toISOString(),
    localPath: bookDir.uri,
  };
  
  // Save metadata
  await saveAudiobookMetadata(bookTitle, localAudiobook);
  
  return localAudiobook;
}

// ============================================================================
// LOCAL PLAYBACK
// ============================================================================

/**
 * Get local file URI for a chapter (for playback)
 * Returns null if chapter is not downloaded
 */
export function getLocalChapterUri(bookTitle: string, chapterIndex: number): string | null {
  const bookDir = getBookDirectory(bookTitle);
  const chapterFile = new File(bookDir, `chapter_${chapterIndex}.wav`);
  
  if (chapterFile.exists) {
    return chapterFile.uri;
  }
  
  return null;
}

/**
 * Check if a chapter is available locally
 */
export function isChapterDownloaded(bookTitle: string, chapterIndex: number): boolean {
  return getLocalChapterUri(bookTitle, chapterIndex) !== null;
}

/**
 * Get local file URI for a subchunk (for progressive playback)
 * Returns null if subchunk is not downloaded
 */
export function getLocalSubChunkUri(
  bookTitle: string,
  chapterIndex: number,
  subChunkIndex: number
): string | null {
  const bookDir = getBookDirectory(bookTitle);
  const chapterDir = new Directory(bookDir, `chapter_${chapterIndex}`);
  const subChunkFile = new File(chapterDir, `subchunk_${subChunkIndex}.wav`);
  return subChunkFile.exists ? subChunkFile.uri : null;
}

/**
 * List downloaded subchunks for a chapter
 */
export function getDownloadedSubChunks(bookTitle: string, chapterIndex: number): number[] {
  const bookDir = getBookDirectory(bookTitle);
  const chapterDir = new Directory(bookDir, `chapter_${chapterIndex}`);
  if (!chapterDir.exists) return [];

  const subChunks: number[] = [];
  const contents = chapterDir.list();
  for (const item of contents) {
    if (item instanceof File && item.name.startsWith('subchunk_') && item.name.endsWith('.wav')) {
      const match = item.name.match(/subchunk_(\d+)\.wav/);
      if (match) {
        subChunks.push(parseInt(match[1], 10));
      }
    }
  }

  return subChunks.sort((a, b) => a - b);
}

/**
 * Consolidate downloaded subchunks into a single chapter WAV file
 * Uses WAV header from first subchunk and concatenates PCM data
 */
export async function consolidateChapterFromSubChunks(
  bookTitle: string,
  chapterIndex: number
): Promise<string> {
  const bookDir = getBookDirectory(bookTitle);
  const chapterDir = new Directory(bookDir, `chapter_${chapterIndex}`);
  if (!chapterDir.exists) {
    throw new Error(`Chapter directory not found for ${bookTitle} chapter ${chapterIndex}`);
  }

  const subChunkFiles = chapterDir
    .list()
    .filter((item): item is File => item instanceof File)
    .filter((file) => file.name.startsWith('subchunk_') && file.name.endsWith('.wav'))
    .sort((a, b) => {
      const aMatch = a.name.match(/subchunk_(\d+)\.wav/);
      const bMatch = b.name.match(/subchunk_(\d+)\.wav/);
      const aIndex = aMatch ? parseInt(aMatch[1], 10) : 0;
      const bIndex = bMatch ? parseInt(bMatch[1], 10) : 0;
      return aIndex - bIndex;
    });

  if (subChunkFiles.length === 0) {
    throw new Error(`No subchunks found for ${bookTitle} chapter ${chapterIndex}`);
  }

  // Read all subchunk bytes
  const dataChunks: Uint8Array[] = [];
  let totalPcmBytes = 0;
  let header: Uint8Array | null = null;

  for (const file of subChunkFiles) {
    const bytes = await file.bytes();
    if (bytes.length <= 44) {
      continue;
    }

    if (!header) {
      header = bytes.slice(0, 44);
    }

    const pcm = bytes.slice(44);
    totalPcmBytes += pcm.length;
    dataChunks.push(pcm);
  }

  if (!header) {
    throw new Error(`Unable to read WAV header for ${bookTitle} chapter ${chapterIndex}`);
  }

  // Build output buffer: header + concatenated PCM data
  const output = new Uint8Array(44 + totalPcmBytes);
  output.set(header, 0);

  // Update WAV header sizes (little-endian)
  const view = new DataView(output.buffer);
  // ChunkSize at offset 4 = 36 + data size
  view.setUint32(4, 36 + totalPcmBytes, true);
  // Subchunk2Size at offset 40 = data size
  view.setUint32(40, totalPcmBytes, true);

  let offset = 44;
  for (const chunk of dataChunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  // Write consolidated chapter file
  const chapterFile = new File(bookDir, `chapter_${chapterIndex}.wav`);
  chapterFile.create({ intermediates: true, overwrite: true });
  chapterFile.write(output);

  console.log(`✅ Consolidated chapter ${chapterIndex} (${totalPcmBytes} PCM bytes)`);
  return chapterFile.uri;
}

/**
 * Get all downloaded chapters for a book
 */
export function getDownloadedChapters(bookTitle: string): number[] {
  const bookDir = getBookDirectory(bookTitle);
  
  // DEBUG: Log the directory being checked
  console.log('📂 [getDownloadedChapters] Checking for bookTitle:', bookTitle);
  console.log('📂 [getDownloadedChapters] Book directory URI:', bookDir.uri);
  console.log('📂 [getDownloadedChapters] Directory exists:', bookDir.exists);
  
  if (!bookDir.exists) {
    console.log('📂 [getDownloadedChapters] Directory does NOT exist, returning []');
    return [];
  }
  
  const chapters: number[] = [];
  const contents = bookDir.list();
  
  // DEBUG: Log directory contents
  console.log('📂 [getDownloadedChapters] Directory contents:', contents.map(item => ({
    name: item.name || 'unknown',
    isFile: item instanceof File,
  })));
  
  for (const item of contents) {
    if (item instanceof File && item.name.startsWith('chapter_') && item.name.endsWith('.wav')) {
      const match = item.name.match(/chapter_(\d+)\.wav/);
      if (match) {
        chapters.push(parseInt(match[1], 10));
      }
    }
  }
  
  console.log('📂 [getDownloadedChapters] Found chapters:', chapters);
  return chapters.sort((a, b) => a - b);
}

// ============================================================================
// METADATA MANAGEMENT
// ============================================================================

/**
 * Save audiobook metadata to local storage
 */
async function saveAudiobookMetadata(bookTitle: string, metadata: LocalAudiobook): Promise<void> {
  const bookDir = getBookDirectory(bookTitle);
  const metadataFile = new File(bookDir, 'metadata.json');
  
  try {
    metadataFile.write(JSON.stringify(metadata, null, 2));
    console.log('✓ Saved audiobook metadata');
  } catch (error) {
    console.error('✗ Failed to save metadata:', error);
  }
}

/**
 * Load audiobook metadata from local storage
 */
export function loadAudiobookMetadata(bookTitle: string): LocalAudiobook | null {
  const bookDir = getBookDirectory(bookTitle);
  const metadataFile = new File(bookDir, 'metadata.json');
  
  if (!metadataFile.exists) {
    return null;
  }
  
  try {
    const content = metadataFile.textSync();
    return JSON.parse(content) as LocalAudiobook;
  } catch (error) {
    console.error('✗ Failed to load metadata:', error);
    return null;
  }
}

/**
 * Get all locally stored audiobooks
 */
export function getLocalAudiobooks(): LocalAudiobook[] {
  const audiobooksDir = getAudiobooksDirectory();
  
  if (!audiobooksDir.exists) {
    return [];
  }
  
  const audiobooks: LocalAudiobook[] = [];
  const contents = audiobooksDir.list();
  
  for (const item of contents) {
    if (item instanceof Directory) {
      const metadataFile = new File(item, 'metadata.json');
      if (metadataFile.exists) {
        try {
          const content = metadataFile.textSync();
          audiobooks.push(JSON.parse(content) as LocalAudiobook);
        } catch {
          // Skip invalid metadata
        }
      }
    }
  }
  
  return audiobooks;
}

// ============================================================================
// STORAGE MANAGEMENT
// ============================================================================

/**
 * Delete a locally stored audiobook
 */
export function deleteLocalAudiobook(bookTitle: string): void {
  const bookDir = getBookDirectory(bookTitle);
  
  if (bookDir.exists) {
    bookDir.delete();
    console.log(`✓ Deleted local audiobook: ${bookTitle}`);
  }
}

/**
 * Get total storage used by audiobooks
 */
export function getStorageUsed(): number {
  const audiobooksDir = getAudiobooksDirectory();
  
  if (!audiobooksDir.exists) {
    return 0;
  }
  
  return audiobooksDir.size || 0;
}

/**
 * Get available storage space
 */
export function getAvailableSpace(): number {
  return Paths.availableDiskSpace;
}

/**
 * Clear all cached/temp files
 */
export function clearCache(): void {
  const tempDir = getTempDirectory();
  
  if (tempDir.exists) {
    tempDir.delete();
    tempDir.create({ intermediates: true });
    console.log('✓ Cleared audio cache');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
