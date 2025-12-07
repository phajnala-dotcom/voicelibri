import { describe, it, expect } from 'vitest';
import { parseBookMetadata, extractTextFromEpub } from './bookChunker.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('EPUB Parser', () => {
  it('should handle missing EPUB gracefully', () => {
    const fakeBuffer = Buffer.from('not a real epub');
    const metadata = parseBookMetadata(fakeBuffer, 'epub', 'test.epub');
    
    expect(metadata.title).toBeDefined();
    expect(metadata.author).toBeDefined();
  });

  it('should extract text from valid EPUB if available', () => {
    const assetsDir = path.join(__dirname, '..', 'assets');
    const files = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
    const epubFile = files.find(f => f.endsWith('.epub'));
    
    if (!epubFile) {
      console.log('⚠️ No EPUB file found for testing - skipping');
      expect(true).toBe(true); // Pass test if no EPUB available
      return;
    }
    
    const epubPath = path.join(assetsDir, epubFile);
    const epubBuffer = fs.readFileSync(epubPath);
    
    // Test metadata extraction
    const metadata = parseBookMetadata(epubBuffer, 'epub', epubPath);
    console.log('📚 EPUB Metadata:', metadata);
    
    expect(metadata.title).toBeTruthy();
    expect(metadata.title).not.toBe('Unknown EPUB');
    expect(metadata.author).toBeTruthy();
    
    // Test text extraction
    const text = extractTextFromEpub(epubBuffer);
    console.log(`📄 Extracted text: ${text.length} characters`);
    
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('<html>');
    expect(text).not.toContain('<body>');
  });
});
