// Test the actual hasDialogue function from hybridTagger
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the actual sample_text.txt
const sampleTextPath = path.join(__dirname, '..', 'assets', 'sample_text.txt');
const sampleText = fs.readFileSync(sampleTextPath, 'utf-8');

console.log('File length:', sampleText.length);
console.log('First 200 chars:');
console.log(sampleText.substring(0, 200));
console.log('\n---\n');

// Test hasDialogue function
function hasDialogue(text) {
  const quotePatterns = [
    /["']([^"']+)["']/,        // English: "text" or 'text'
    /„([^„"]+)"/,              // Czech: „text"
    /[»«]([^»«]+)[»«]/,         // French/German guillemets
  ];
  
  return quotePatterns.some(pattern => pattern.test(text));
}

const result = hasDialogue(sampleText);
console.log('hasDialogue result:', result);

// Test each pattern individually
console.log('\nPattern testing:');
console.log('English quotes:', /["']([^"']+)["']/.test(sampleText));
console.log('Czech quotes:', /„([^„"]+)"/.test(sampleText));
console.log('Guillemets:', /[»«]([^»«]+)[»«]/.test(sampleText));

// Show what matches
console.log('\nCzech quote matches:');
const czechMatches = sampleText.match(/„([^„"]+)"/g);
console.log(czechMatches);
