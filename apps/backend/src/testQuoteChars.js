import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sampleTextPath = path.join(__dirname, '..', 'assets', 'sample_text.txt');
const sampleText = fs.readFileSync(sampleTextPath, 'utf-8');

// Find the first quote character
const quoteIndex = sampleText.indexOf('„');
if (quoteIndex >= 0) {
  const snippet = sampleText.substring(quoteIndex - 5, quoteIndex + 50);
  console.log('Found opening quote at index:', quoteIndex);
  console.log('Snippet:', snippet);
  console.log('\nCharacter codes around quote:');
  for (let i = Math.max(0, quoteIndex - 2); i < Math.min(sampleText.length, quoteIndex + 10); i++) {
    const char = sampleText[i];
    console.log(`  [${i}] '${char}' = U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
  }
} else {
  console.log('No opening quote „ found');
  console.log('\nSearching for any quote-like characters...');
  
  // Show first 500 chars with character codes for quotes
  for (let i = 0; i < Math.min(500, sampleText.length); i++) {
    const char = sampleText[i];
    const code = char.charCodeAt(0);
    
    // Show quote-like characters
    if (code === 0x201E || code === 0x201C || code === 0x0022 || code === 0x201D) {
      console.log(`  [${i}] '${char}' = U+${code.toString(16).toUpperCase().padStart(4, '0')}`);
      const snippet = sampleText.substring(Math.max(0, i - 10), Math.min(sampleText.length, i + 30));
      console.log(`    Context: ${snippet}`);
    }
  }
}
