import { applyRuleBasedTagging, calculateConfidence, hasDialogue } from './hybridTagger.js';
import { extractVoiceSegments } from './dramatizedChunkerSimple.js';

// Test 1: English with titles
console.log('=== TEST 1: English with titles ===');
const test1 = `"Did you see the news?" asked Mrs. Dursley.
"Strange things," said Mr. Dursley.`;
const chars1 = [
  { name: 'Mr. Dursley', gender: 'male' as const, traits: [], role: 'unknown' as const },
  { name: 'Mrs. Dursley', gender: 'female' as const, traits: [], role: 'unknown' as const },
];
const result1 = applyRuleBasedTagging(test1, chars1);
const segs1 = extractVoiceSegments(result1.taggedText);
segs1.forEach((s, i) => console.log(`${s.speaker}: "${s.text.substring(0,50)}"`));

// Test 2: Simple English names
console.log('\n=== TEST 2: Simple English names ===');
const test2 = `"Hello," said John.
"Hi there," replied Mary.`;
const chars2 = [
  { name: 'John', gender: 'male' as const, traits: [], role: 'unknown' as const },
  { name: 'Mary', gender: 'female' as const, traits: [], role: 'unknown' as const },
];
const result2 = applyRuleBasedTagging(test2, chars2);
const segs2 = extractVoiceSegments(result2.taggedText);
segs2.forEach((s, i) => console.log(`${s.speaker}: "${s.text.substring(0,50)}"`));

// Test 3: Czech names
console.log('\n=== TEST 3: Czech names ===');
const test3 = `"Ahoj," řekla Marie.
"Nazdar," odpověděl Jan.`;
const chars3 = [
  { name: 'Marie', gender: 'female' as const, traits: [], role: 'unknown' as const },
  { name: 'Jan', gender: 'male' as const, traits: [], role: 'unknown' as const },
];
const result3 = applyRuleBasedTagging(test3, chars3);
const segs3 = extractVoiceSegments(result3.taggedText);
segs3.forEach((s, i) => console.log(`${s.speaker}: "${s.text.substring(0,50)}"`));

// Test 4: Aliases (Dudley = Big D)
console.log('\n=== TEST 4: Aliases ===');
const test4 = `"Leave him alone!" shouted Dudley.
"Yeah!" added Big D.`;
const chars4 = [
  { name: 'Dudley', gender: 'male' as const, traits: [], role: 'unknown' as const, aliases: ['Big D'] },
];
const result4 = applyRuleBasedTagging(test4, chars4);
const segs4 = extractVoiceSegments(result4.taggedText);
segs4.forEach((s, i) => console.log(`${s.speaker}: "${s.text.substring(0,50)}"`));
console.log('(Big D should resolve to DUDLEY)');

// Test 5: Multi-word character names
console.log('\n=== TEST 5: Multi-word names ===');
const test5 = `"The boy is strange," observed Aunt Petunia.
"Agreed," muttered Uncle Vernon.`;
const chars5 = [
  { name: 'Aunt Petunia', gender: 'female' as const, traits: [], role: 'unknown' as const },
  { name: 'Uncle Vernon', gender: 'male' as const, traits: [], role: 'unknown' as const },
];
const result5 = applyRuleBasedTagging(test5, chars5);
const segs5 = extractVoiceSegments(result5.taggedText);
segs5.forEach((s, i) => console.log(`${s.speaker}: "${s.text.substring(0,50)}"`));
