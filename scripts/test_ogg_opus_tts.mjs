/**
 * Standalone test: Gemini 2.5 Flash TTS with OGG_OPUS native output
 *
 * Per official docs (https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1/AudioEncoding):
 *   OGG_OPUS — "Opus encoded audio wrapped in an ogg container."
 *
 * This script tests BOTH single-speaker and multi-speaker calls
 * with OGG_OPUS encoding to verify native support without WAV→OGG transcoding.
 *
 * Usage:  node scripts/test_ogg_opus_tts.mjs
 * Requires: GOOGLE_APPLICATION_CREDENTIALS and GOOGLE_CLOUD_PROJECT env vars
 *           (loaded from apps/backend/.env)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleAuth } from 'google-auth-library';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Load .env from apps/backend/.env ──
function loadEnv() {
  const envPath = path.join(ROOT, 'apps', 'backend', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ apps/backend/.env not found');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
  // Resolve relative GOOGLE_APPLICATION_CREDENTIALS path
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(
      ROOT, 'apps', 'backend', process.env.GOOGLE_APPLICATION_CREDENTIALS
    );
  }
}

loadEnv();

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'calmbridge-2';
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const TTS_MODEL = process.env.TTS_MODEL || 'gemini-2.5-flash-tts';

// ── TTS endpoint (same logic as ttsClient.ts) ──
function getTtsEndpoint(location) {
  const regionMap = {
    'us-central1': 'us',
    'us-east1': 'us',
    'europe-west1': 'eu',
    'global': 'global',
  };
  const ttsRegion = regionMap[location] || 'us';
  if (ttsRegion === 'global') return 'https://texttospeech.googleapis.com';
  return `https://${ttsRegion}-texttospeech.googleapis.com`;
}

const BASE_URL = getTtsEndpoint(LOCATION);
const ENDPOINT = `${BASE_URL}/v1/text:synthesize`;

console.log('═══════════════════════════════════════════════════════════');
console.log('  VoiceLibri — OGG Opus Native TTS Test');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  Project:  ${PROJECT_ID}`);
console.log(`  Location: ${LOCATION}`);
console.log(`  Model:    ${TTS_MODEL}`);
console.log(`  Endpoint: ${ENDPOINT}`);
console.log(`  Creds:    ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
console.log('');

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

async function getAccessToken() {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Failed to get access token');
  return token.token;
}

// ═════════════════════════════════════════════════════════
// TEST 1: Single-speaker OGG_OPUS
// ═════════════════════════════════════════════════════════
async function testSingleSpeaker() {
  console.log('─── TEST 1: Single-speaker OGG_OPUS ───');
  const token = await getAccessToken();

  const requestBody = {
    input: { text: 'Hello, this is a test of native OGG Opus output from Gemini TTS. The quick brown fox jumps over the lazy dog.' },
    voice: {
      name: 'Algieba',
      modelName: TTS_MODEL,
      languageCode: 'en-US',
    },
    audioConfig: {
      audioEncoding: 'OGG_OPUS',
    },
  };

  console.log(`  📤 Sending request to ${ENDPOINT}...`);
  const startTime = Date.now();

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(60000),
  });

  const elapsed = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`  ❌ API Error (${response.status}): ${errorText.substring(0, 500)}`);
    return false;
  }

  const data = await response.json();
  const audioContent = data.audioContent;
  if (!audioContent) {
    console.error('  ❌ No audioContent in response');
    return false;
  }

  const audioBuffer = Buffer.from(audioContent, 'base64');
  const outPath = path.join(ROOT, 'tts_audio_samples', 'test_ogg_opus_single.ogg');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, audioBuffer);

  // Check OGG signature (first 4 bytes = "OggS")
  const isOgg = audioBuffer.length >= 4 &&
    audioBuffer[0] === 0x4F && // O
    audioBuffer[1] === 0x67 && // g
    audioBuffer[2] === 0x67 && // g
    audioBuffer[3] === 0x53;   // S

  // Check if it's NOT a WAV (WAV starts with "RIFF")
  const isWav = audioBuffer.length >= 4 &&
    audioBuffer[0] === 0x52 && // R
    audioBuffer[1] === 0x49 && // I
    audioBuffer[2] === 0x46 && // F
    audioBuffer[3] === 0x46;   // F

  console.log(`  ⏱️  Response time: ${elapsed}ms`);
  console.log(`  📦 Audio size: ${audioBuffer.length} bytes`);
  console.log(`  🔍 Magic bytes: ${audioBuffer.slice(0, 4).toString('hex')} ("${audioBuffer.slice(0, 4).toString('ascii')}")`);
  console.log(`  ✅ Is OGG container: ${isOgg}`);
  console.log(`  ✅ Is NOT WAV:       ${!isWav}`);
  console.log(`  💾 Saved to: ${outPath}`);

  if (isOgg) {
    console.log('  🎉 SUCCESS — Single-speaker OGG Opus works natively!');
  } else if (isWav) {
    console.log('  ⚠️  FAIL — API returned WAV despite OGG_OPUS encoding request');
  } else {
    console.log(`  ⚠️  UNKNOWN format — magic: ${audioBuffer.slice(0, 8).toString('hex')}`);
  }

  return isOgg;
}

// ═════════════════════════════════════════════════════════
// TEST 2: Multi-speaker OGG_OPUS
// ═════════════════════════════════════════════════════════
async function testMultiSpeaker() {
  console.log('');
  console.log('─── TEST 2: Multi-speaker OGG_OPUS ───');
  const token = await getAccessToken();

  const requestBody = {
    input: {
      text: 'NARRATOR: Once upon a time, in a land far away.\nJOE: Hello there, traveler! Where are you headed?',
      prompt: 'VOICE RULE: SWITCH VOICE IMMEDIATELY AT EACH SPEAKER LABEL! Labels: NARRATOR, JOE',
    },
    voice: {
      languageCode: 'en-US',
      modelName: TTS_MODEL,
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: [
          { speakerAlias: 'NARRATOR', speakerId: 'Algieba' },
          { speakerAlias: 'JOE', speakerId: 'Puck' },
        ],
      },
    },
    audioConfig: {
      audioEncoding: 'OGG_OPUS',
    },
  };

  console.log(`  📤 Sending multi-speaker request...`);
  const startTime = Date.now();

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(120000),
  });

  const elapsed = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`  ❌ API Error (${response.status}): ${errorText.substring(0, 500)}`);
    return false;
  }

  const data = await response.json();
  const audioContent = data.audioContent;
  if (!audioContent) {
    console.error('  ❌ No audioContent in response');
    return false;
  }

  const audioBuffer = Buffer.from(audioContent, 'base64');
  const outPath = path.join(ROOT, 'tts_audio_samples', 'test_ogg_opus_multi.ogg');
  fs.writeFileSync(outPath, audioBuffer);

  const isOgg = audioBuffer.length >= 4 &&
    audioBuffer[0] === 0x4F &&
    audioBuffer[1] === 0x67 &&
    audioBuffer[2] === 0x67 &&
    audioBuffer[3] === 0x53;

  const isWav = audioBuffer.length >= 4 &&
    audioBuffer[0] === 0x52 &&
    audioBuffer[1] === 0x49 &&
    audioBuffer[2] === 0x46 &&
    audioBuffer[3] === 0x46;

  console.log(`  ⏱️  Response time: ${elapsed}ms`);
  console.log(`  📦 Audio size: ${audioBuffer.length} bytes`);
  console.log(`  🔍 Magic bytes: ${audioBuffer.slice(0, 4).toString('hex')} ("${audioBuffer.slice(0, 4).toString('ascii')}")`);
  console.log(`  ✅ Is OGG container: ${isOgg}`);
  console.log(`  ✅ Is NOT WAV:       ${!isWav}`);
  console.log(`  💾 Saved to: ${outPath}`);

  if (isOgg) {
    console.log('  🎉 SUCCESS — Multi-speaker OGG Opus works natively!');
  } else if (isWav) {
    console.log('  ⚠️  FAIL — API returned WAV despite OGG_OPUS encoding request');
  } else {
    console.log(`  ⚠️  UNKNOWN format — magic: ${audioBuffer.slice(0, 8).toString('hex')}`);
  }

  return isOgg;
}

// ═════════════════════════════════════════════════════════
// TEST 3: Compare sizes (WAV vs OGG)
// ═════════════════════════════════════════════════════════
async function testSizeComparison() {
  console.log('');
  console.log('─── TEST 3: Size comparison — LINEAR16 vs OGG_OPUS ───');
  const token = await getAccessToken();
  const testText = 'The Sorting Hat stood motionless atop the stool, its patched, frayed, and extremely dirty point seeming to droop with the weight of centuries.';

  // LINEAR16 (WAV) request
  const wavRequest = {
    input: { text: testText },
    voice: { name: 'Algieba', modelName: TTS_MODEL, languageCode: 'en-US' },
    audioConfig: { audioEncoding: 'LINEAR16' },
  };

  // OGG_OPUS request
  const oggRequest = {
    input: { text: testText },
    voice: { name: 'Algieba', modelName: TTS_MODEL, languageCode: 'en-US' },
    audioConfig: { audioEncoding: 'OGG_OPUS' },
  };

  console.log('  📤 Requesting same text with LINEAR16...');
  const wavStart = Date.now();
  const wavResp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(wavRequest),
    signal: AbortSignal.timeout(60000),
  });
  const wavTime = Date.now() - wavStart;

  console.log('  📤 Requesting same text with OGG_OPUS...');
  const oggStart = Date.now();
  const oggResp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(oggRequest),
    signal: AbortSignal.timeout(60000),
  });
  const oggTime = Date.now() - oggStart;

  if (!wavResp.ok || !oggResp.ok) {
    console.error('  ❌ One of the requests failed');
    return false;
  }

  const wavData = await wavResp.json();
  const oggData = await oggResp.json();
  const wavBuf = Buffer.from(wavData.audioContent, 'base64');
  const oggBuf = Buffer.from(oggData.audioContent, 'base64');

  const ratio = ((oggBuf.length / wavBuf.length) * 100).toFixed(1);

  console.log(`  📊 LINEAR16 (WAV): ${wavBuf.length} bytes (${wavTime}ms)`);
  console.log(`  📊 OGG_OPUS:       ${oggBuf.length} bytes (${oggTime}ms)`);
  console.log(`  📊 OGG is ${ratio}% of WAV size (${(100 - parseFloat(ratio)).toFixed(1)}% savings)`);
  console.log(`  📊 Time difference: ${Math.abs(wavTime - oggTime)}ms (${wavTime > oggTime ? 'OGG faster' : 'WAV faster'})`);

  return true;
}

// ═════════════════════════════════════════════════════════
// Run all tests
// ═════════════════════════════════════════════════════════
async function main() {
  try {
    const test1 = await testSingleSpeaker();
    const test2 = await testMultiSpeaker();
    const test3 = await testSizeComparison();

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  RESULTS SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Single-speaker OGG_OPUS: ${test1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Multi-speaker  OGG_OPUS: ${test2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Size comparison:         ${test3 ? '✅ PASS' : '❌ FAIL'}`);

    if (test1 && test2) {
      console.log('');
      console.log('  🎉 OGG Opus is natively supported by Gemini TTS!');
      console.log('  → Migration: Change audioEncoding from LINEAR16 to OGG_OPUS');
      console.log('  → Benefit: No WAV→OGG transcoding step needed at consolidation');
      console.log('  → Subchunks can be stored as .ogg directly');
    }
    console.log('═══════════════════════════════════════════════════════════');
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  }
}

main();
