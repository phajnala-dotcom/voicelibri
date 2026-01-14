/**
 * Interactive Slovak to English translation test
 * Run with: node test-translation.js
 * Enter your Slovak text when prompted
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function translateText(inputText) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: process.env.LLM_MODEL || 'gemini-2.5-flash-lite' 
    });

    const prompt = `
Translate the following Slovak text to English. Maintain the narrative style and tone:

${inputText}

Translation:`;

    console.log('\n🌍 Translating with', process.env.LLM_MODEL || 'gemini-2.5-flash-lite');
    console.log('⏳ Processing...\n');
    
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    const endTime = Date.now();
    
    const translation = result.response.text();
    
    console.log('✅ Translation completed in', endTime - startTime, 'ms');
    console.log('\n📖 ENGLISH TRANSLATION:');
    console.log('=' + '='.repeat(50));
    console.log(translation);
    console.log('=' + '='.repeat(50));
    
  } catch (error) {
    console.error('❌ Translation failed:', error);
  }
}

function askForText() {
  rl.question('\n📝 Enter your Slovak text (or "exit" to quit):\n> ', async (input) => {
    if (input.toLowerCase() === 'exit') {
      console.log('👋 Goodbye!');
      rl.close();
      return;
    }
    
    if (input.trim() === '') {
      console.log('⚠️  Please enter some text to translate.');
      askForText();
      return;
    }
    
    await translateText(input.trim());
    askForText(); // Ask for more text
  });
}

console.log('🎯 Interactive Slovak → English Translator');
console.log('Using:', process.env.LLM_MODEL || 'gemini-2.5-flash-lite');
askForText();