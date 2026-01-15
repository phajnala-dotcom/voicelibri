/**
 * Token Count Test - Validate tokens/word coefficient for Czech/Slovak
 * 
 * Uses Google Vertex AI CountTokens API to get exact token counts.
 * Run with: npx ts-node src/tokenCountTest.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || '';
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const MODEL = 'gemini-2.5-flash';

interface TokenCountResponse {
  totalTokens: number;
  totalBillableCharacters?: number;
}

// Slovak text sample (Harry Potter opening paragraph)
const SLOVAK_TEXT = `Pán a pani Dursleyoví z domu číslo štyri na Privátnej ulici boli hrdí na to, že sú úplne normálni, 
ďakujeme pekne. Boli to poslední ľudia, od ktorých by ste čakali, že budú zapletení do niečoho zvláštneho 
alebo tajomného, pretože o takých nezmysloch jednoducho nechceli nič počuť. Pán Dursley bol riaditeľom 
firmy menom Grunnings, ktorá vyrábala vrtáky. Bol to veľký, mäsitý muž takmer bez krku, hoci mal 
veľmi veľké fúzy. Pani Dursleyová bola chudá a plavovlasá a mala takmer dvakrát taký dlhý krk ako 
normálni ľudia, čo sa jej veľmi hodilo, keďže trávila toľko času naťahovaním sa ponad záhradný plot 
a špehovaním susedov. Dursleyoví mali malého syna menom Dudley a podľa ich názoru neexistovalo 
krajšie dieťa na celom svete.`;

// Czech text sample (Harry Potter opening paragraph)  
const CZECH_TEXT = `Pan a paní Dursleyovi z domu číslo čtyři v Zobí ulici byli hrdi na to, že jsou naprosto 
normální, moc vám děkuji. Byli to poslední lidé, od kterých byste čekali, že budou zapleteni do něčeho 
zvláštního nebo tajemného, protože o takových nesmyslech prostě nechtěli nic slyšet. Pan Dursley byl 
ředitelem firmy jménem Grunnings, která vyráběla vrtáky. Byl to velký, masitý muž téměř bez krku, 
i když měl velice velké kníry. Paní Dursleyová byla hubená a plavovlasá a měla téměř dvakrát tak 
dlouhý krk jako normální lidé, což se jí velmi hodilo, protože trávila tolik času natahováním se přes 
zahradní plot a šmírováním sousedů. Dursleyovi měli malého syna jménem Dudley a podle jejich názoru 
neexistovalo krásnější dítě na celém světě.`;

// English text sample (Harry Potter opening paragraph) - for comparison
const ENGLISH_TEXT = `Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were 
perfectly normal, thank you very much. They were the last people you'd expect to be involved in anything 
strange or mysterious, because they just didn't hold with such nonsense. Mr. Dursley was the director of 
a firm called Grunnings, which made drills. He was a big, beefy man with hardly any neck, although he 
did have a very large mustache. Mrs. Dursley was thin and blonde and had nearly twice the usual amount 
of neck, which came in very useful as she spent so much of her time craning over garden fences, spying 
on the neighbors. The Dursleys had a small son called Dudley and in their opinion there was no finer 
boy anywhere.`;

async function countTokens(text: string): Promise<TokenCountResponse> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  
  if (!accessToken.token) {
    throw new Error('Failed to get access token');
  }
  
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:countTokens`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text }]
      }]
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CountTokens API error: ${response.status} - ${error}`);
  }
  
  return await response.json() as TokenCountResponse;
}

function countWords(text: string): number {
  // Remove punctuation and split by whitespace
  const cleaned = text.replace(/[„""\'''«»‹›,\.!?;:—–\-\(\)\[\]]/g, ' ');
  return cleaned.split(/\s+/).filter(w => w.length > 0).length;
}

function countChars(text: string): number {
  return text.length;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('        VOICELIBRI - TOKEN COEFFICIENT VALIDATION');
  console.log('        Using Google Vertex AI CountTokens API');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  
  const samples = [
    { name: 'Slovak', text: SLOVAK_TEXT },
    { name: 'Czech', text: CZECH_TEXT },
    { name: 'English', text: ENGLISH_TEXT },
  ];
  
  const results: Array<{
    name: string;
    tokens: number;
    words: number;
    chars: number;
    tokensPerWord: number;
    charsPerToken: number;
  }> = [];
  
  for (const sample of samples) {
    console.log(`\n📊 Analyzing ${sample.name} text...`);
    
    try {
      const tokenResult = await countTokens(sample.text);
      const words = countWords(sample.text);
      const chars = countChars(sample.text);
      const tokens = tokenResult.totalTokens;
      
      const tokensPerWord = tokens / words;
      const charsPerToken = chars / tokens;
      
      results.push({
        name: sample.name,
        tokens,
        words,
        chars,
        tokensPerWord,
        charsPerToken,
      });
      
      console.log(`   Characters: ${chars}`);
      console.log(`   Words: ${words}`);
      console.log(`   Tokens: ${tokens}`);
      console.log(`   Tokens/Word: ${tokensPerWord.toFixed(3)}`);
      console.log(`   Chars/Token: ${charsPerToken.toFixed(3)}`);
      
    } catch (error) {
      console.error(`   ❌ Error: ${error}`);
    }
  }
  
  // Calculate average for Slavic languages (SK + CZ)
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('                           RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════');
  
  const slavicResults = results.filter(r => r.name === 'Slovak' || r.name === 'Czech');
  const englishResult = results.find(r => r.name === 'English');
  
  if (slavicResults.length === 2) {
    const avgTokensPerWord = (slavicResults[0].tokensPerWord + slavicResults[1].tokensPerWord) / 2;
    const avgCharsPerToken = (slavicResults[0].charsPerToken + slavicResults[1].charsPerToken) / 2;
    
    console.log('\n📌 SLAVIC LANGUAGES (Czech + Slovak average):');
    console.log(`   Slovak tokens/word:  ${slavicResults.find(r => r.name === 'Slovak')?.tokensPerWord.toFixed(3)}`);
    console.log(`   Czech tokens/word:   ${slavicResults.find(r => r.name === 'Czech')?.tokensPerWord.toFixed(3)}`);
    console.log(`   ────────────────────────────────────────`);
    console.log(`   AVERAGE tokens/word: ${avgTokensPerWord.toFixed(3)}`);
    console.log(`   AVERAGE chars/token: ${avgCharsPerToken.toFixed(3)}`);
    
    console.log('\n📌 ENGLISH (for comparison):');
    if (englishResult) {
      console.log(`   tokens/word: ${englishResult.tokensPerWord.toFixed(3)}`);
      console.log(`   chars/token: ${englishResult.charsPerToken.toFixed(3)}`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('                    RECOMMENDED CONSTANTS FOR VOICELIBRI');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`
// Token estimation by language
export const TOKEN_COEFFICIENTS = {
  // Slavic languages (validated with Gemini CountTokens API)
  SLAVIC_TOKENS_PER_WORD: ${avgTokensPerWord.toFixed(2)},
  
  // English (for comparison)
  ENGLISH_TOKENS_PER_WORD: ${englishResult?.tokensPerWord.toFixed(2) || '1.33'},
  
  // Fallback for unknown languages
  DEFAULT_TOKENS_PER_WORD: ${((avgTokensPerWord + (englishResult?.tokensPerWord || 1.33)) / 2).toFixed(2)},
};

// Usage: 
// const tokens = wordCount * TOKEN_COEFFICIENTS.SLAVIC_TOKENS_PER_WORD;
`);
  }
}

main().catch(console.error);
