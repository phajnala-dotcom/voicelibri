import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sampleTextPath = path.join(__dirname, '..', 'assets', 'sample_text.txt');
const sampleText = fs.readFileSync(sampleTextPath, 'utf-8');

// Find closing quote after opening
const openIndex = sampleText.indexOf('„');
if (openIndex >= 0) {
  const afterOpen = sampleText.substring(openIndex + 1, openIndex + 100);
  console.log('Text after opening quote:');
  console.log(afterOpen);
  console.log('\nLooking for closing quote...');
  
  // Check for different closing quote types
  const closeChars = ['"', '"', '"', '„'];
  closeChars.forEach(closeChar => {
    const closeIndex = afterOpen.indexOf(closeChar);
    if (closeIndex >= 0) {
      console.log(`Found '${closeChar}' (U+${closeChar.charCodeAt(0).toString(16).toUpperCase()}) at position ${closeIndex}`);
      console.log(`  Full quote: „${afterOpen.substring(0, closeIndex + 1)}`);
    }
  });
}

// Test the actual regex pattern
console.log('\n--- Testing regex patterns ---');
const patterns = [
  { name: 'Current', regex: /„([^„"]+)"/ },
  { name: 'With U+201C', regex: /„([^„"]+)"/ },
  { name: 'With both', regex: /„([^„"]+)[""]/ },
  { name: 'Flexible', regex: /„([^„""]+)[""]/ }
];

patterns.forEach(p => {
  const match = sampleText.match(p.regex);
  console.log(`${p.name}:`, match ? 'MATCH - ' + match[0].substring(0, 50) : 'NO MATCH');
});
