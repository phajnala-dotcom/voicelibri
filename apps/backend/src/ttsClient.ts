import { GoogleAuth } from 'google-auth-library';
import { FileWriter } from 'wav';
import { Readable } from 'stream';

interface TTSConfig {
  projectId: string;
  location: string;
}

/**
 * Speaker configuration for multi-speaker TTS
 */
export interface SpeakerConfig {
  speaker: string;
  voiceName: string;
}

// Note: TTS functions return Buffer directly (simplified - no metadata extraction needed)

/**
 * Gemini TTS model to use
 * Using 'gemini-2.5-flash-tts' (stable) - switch to 'gemini-2.5-flash-preview-tts' when rate limits allow
 */
const TTS_MODEL = 'gemini-2.5-flash-tts';

/**
 * Creates a WAV file header and combines it with PCM audio data
 * @param pcmBuffer - Raw PCM audio data from Vertex AI
 * @returns Complete WAV file as Buffer
 */
function createWavBuffer(pcmBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    
    // Create WAV writer with Vertex AI default settings
    // Use platform-specific null device (Windows: 'nul', Unix: '/dev/null')
    const nullDevice = process.platform === 'win32' ? 'nul' : '/dev/null';
    const writer = new FileWriter(nullDevice, {
      sampleRate: 24000,  // Vertex AI default sample rate
      channels: 1,        // Mono
      bitDepth: 16,       // 16-bit PCM
    });

    // Capture all data chunks
    writer.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    writer.on('finish', () => {
      const wavBuffer = Buffer.concat(chunks);
      resolve(wavBuffer);
    });

    writer.on('error', (err: Error) => {
      reject(err);
    });

    // Write PCM data
    writer.write(pcmBuffer);
    writer.end();
  });
}

export class TTSClient {
  private projectId: string;
  private location: string;
  private auth: GoogleAuth;

  constructor(config: TTSConfig) {
    this.projectId = config.projectId;
    this.location = config.location;
    // GoogleAuth will automatically use GOOGLE_APPLICATION_CREDENTIALS env var
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }

  /**
   * Synthesizes text to audio using Gemini TTS via Vertex AI REST API
   * Single-speaker mode using voiceConfig
   * 
   * @param text - The text to synthesize
   * @param voiceName - The Gemini voice name to use (e.g., 'Algieba', 'Puck', 'Zephyr')
   * @param style - Voice style modifier: 'normal', 'whisper', 'thought', 'letter'
   * @returns Buffer containing audio data (WAV format)
   */
  async synthesizeText(
    text: string, 
    voiceName: string = 'Algieba',
    style: 'normal' | 'whisper' | 'thought' | 'letter' = 'normal'
  ): Promise<Buffer> {
    const endpoint = `https://aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${TTS_MODEL}:generateContent`;

    // Get access token
    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }

    // Apply verbal style instructions for Gemini TTS
    let styledText = text;
    switch (style) {
      case 'whisper':
        styledText = `[Speak in a hushed whisper] ${text}`;
        break;
      case 'thought':
        styledText = `[Internal thought, speaking to oneself] ${text}`;
        break;
      case 'letter':
        styledText = `[Reading aloud from a letter] ${text}`;
        break;
      case 'normal':
      default:
        styledText = text;
        break;
    }

    const requestBody = {
      contents: {
        role: 'user',
        parts: {
          text: styledText
        }
      },
      generation_config: {
        response_modalities: ['AUDIO'],
        speech_config: {
          voice_config: {
            prebuilt_voice_config: {
              voice_name: voiceName
            }
          }
        }
      }
    };

    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`  🔄 Retry ${attempt}/${maxRetries} after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const styleDesc = style !== 'normal' ? ` [${style.toUpperCase()}]` : '';
        console.log(`🎤 TTS API call - Text: ${text.length} chars, Voice: ${voiceName}${styleDesc}`);
        const startTime = Date.now();
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(120000), // 120 second timeout
        });

        const fetchTime = Date.now() - startTime;
        console.log(`⏱️ TTS API response received in ${fetchTime}ms`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Vertex AI API Error:', errorText);
          
          // Retry on 500 errors (server-side issues)
          if (response.status >= 500 && attempt < maxRetries) {
            lastError = new Error(`Vertex AI API returned ${response.status}: ${errorText}`);
            continue;
          }
          
          throw new Error(`Vertex AI API returned ${response.status}: ${errorText}`);
        }

        const jsonResponse: any = await response.json();
        const audioData = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        // ...existing code...
        
        if (!audioData) {
          // Check for safety block
          const finishReason = jsonResponse.candidates?.[0]?.finishReason;
          if (finishReason === 'SAFETY' && attempt < maxRetries) {
            console.warn('  ⚠️ TTS blocked by safety filter, retrying...');
            lastError = new Error('Safety filter blocked response');
            continue;
          }
          
          console.error('Full response:', JSON.stringify(jsonResponse, null, 2));
          throw new Error('No audio content received from Vertex AI API');
        }

        console.log(`🎵 Audio data received, converting to WAV...`);
        const pcmBuffer = Buffer.from(audioData, 'base64');
        console.log(`📦 PCM buffer size: ${pcmBuffer.length} bytes`);
        
        const wavBuffer = await createWavBuffer(pcmBuffer);
        console.log(`✅ WAV conversion complete: ${wavBuffer.length} bytes`);
        
        return wavBuffer;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Retry on network/timeout errors
        if (attempt < maxRetries && (
          lastError.message.includes('500') ||
          lastError.message.includes('timeout') ||
          lastError.message.includes('ECONNRESET') ||
          lastError.message.includes('fetch failed')
        )) {
          continue;
        }
        
        console.error('❌ Vertex AI TTS Error:', error);
        throw new Error(`Failed to synthesize text: ${lastError.message}`);
      }
    }
    
    // All retries exhausted
    throw new Error(`Failed to synthesize text after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Synthesizes multi-speaker text to audio using Gemini TTS
   * 
   * Uses the official multiSpeakerVoiceConfig for true multi-voice synthesis
   * in a SINGLE API call (up to 2 speakers per call per API limitation).
   * 
   * Text format must use "Speaker: text" format, e.g.:
   *   "NARRATOR: Once upon a time...
   *    JOE: Hello there!"
   * 
   * @param text - Text with speaker labels
   * @param speakers - Array of speaker configurations (max 2)
   * @returns Buffer containing audio data (WAV format)
   */
  async synthesizeMultiSpeaker(
    text: string,
    speakers: SpeakerConfig[]
  ): Promise<Buffer> {
    if (speakers.length > 2) {
      throw new Error('Gemini TTS supports maximum 2 speakers per API call');
    }

    if (speakers.length === 0) {
      throw new Error('At least one speaker configuration is required');
    }

    const endpoint = `https://aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${TTS_MODEL}:generateContent`;

    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }

    // Build multi-speaker voice config
    const speakerVoiceConfigs = speakers.map(s => ({
      speaker: s.speaker,
      voice_config: {
        prebuilt_voice_config: {
          voice_name: s.voiceName
        }
      }
    }));

    // According to official Gemini TTS docs:
    // - TTS models do NOT support systemInstruction field
    // - Style/voice guidance must be embedded IN the prompt text itself
    // - Keep it short and direct to avoid slowing down generation
    
    // Build speaker mapping for the prompt
    const speakerList = speakers.map(s => s.speaker).join(', ');
    
    // Two-part instruction: 1) Voice switching rule  2) Artistic delivery
    const directorsNotes = `VOICE RULE: SWITCH VOICE IMMEDIATELY AT EACH SPEAKER LABEL! Labels: ${speakerList}
STYLE: Read as a world-class voice artist with immersive, expressive, yet natural elocution, rich variety of expressive means, expressing the speakers emotions, story events and environment by highly adaptive prosody.

`;
    
    const textWithGuidance = directorsNotes + text;

    const requestBody = {
      contents: {
        role: 'user',
        parts: {
          text: textWithGuidance
        }
      },
      generation_config: {
        response_modalities: ['AUDIO'],
        speech_config: {
          multi_speaker_voice_config: {
            speaker_voice_configs: speakerVoiceConfigs
          }
        }
      }
      // Safety settings - requires monthly invoiced billing to use
      // See: https://cloud.google.com/billing/docs/how-to/invoiced-billing
      // safety_settings: [
      //   { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      //   { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      //   { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      //   { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' }
      // ]
    };

    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`  🔄 Multi-speaker retry ${attempt}/${maxRetries} after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        console.log(`🎤 Multi-speaker TTS: ${text.length} chars, ${speakers.length} speakers: ${speakers.map(s => `${s.speaker}→${s.voiceName}`).join(', ')}`);
        const startTime = Date.now();

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(180000), // 3 minute timeout for longer texts
        });

        const fetchTime = Date.now() - startTime;
        console.log(`⏱️ Multi-speaker TTS response in ${fetchTime}ms`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Vertex AI Multi-Speaker TTS Error:', errorText);
          
          // Retry on 500 errors
          if (response.status >= 500 && attempt < maxRetries) {
            lastError = new Error(`Vertex AI API returned ${response.status}: ${errorText}`);
            continue;
          }
          
          throw new Error(`Vertex AI API returned ${response.status}: ${errorText}`);
        }

        const jsonResponse: any = await response.json();
        const audioData = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        // ...existing code...

        if (!audioData) {
          // Check for safety block
          const finishReason = jsonResponse.candidates?.[0]?.finishReason;
          if (finishReason === 'SAFETY' && attempt < maxRetries) {
            console.warn('  ⚠️ Multi-speaker TTS blocked by safety filter, retrying...');
            lastError = new Error('Safety filter blocked response');
            continue;
          }
          
          console.error('Full response:', JSON.stringify(jsonResponse, null, 2));
          throw new Error('No audio content received from multi-speaker TTS');
        }

        const pcmBuffer = Buffer.from(audioData, 'base64');
        const wavBuffer = await createWavBuffer(pcmBuffer);
        console.log(`✅ Multi-speaker audio: ${wavBuffer.length} bytes`);

        return wavBuffer;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Retry on network/timeout/500 errors
        if (attempt < maxRetries && (
          lastError.message.includes('500') ||
          lastError.message.includes('timeout') ||
          lastError.message.includes('ECONNRESET') ||
          lastError.message.includes('fetch failed') ||
          lastError.message.includes('Safety filter')
        )) {
          continue;
        }
        
        console.error('❌ Multi-speaker TTS Error:', error);
        throw new Error(`Multi-speaker synthesis failed: ${lastError.message}`);
      }
    }
    
    // All retries exhausted
    throw new Error(`Multi-speaker synthesis failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`);
  }
}

// ========================================
// Convenience functions (stateless)
// ========================================

export async function synthesizeText(text: string, voiceName: string = 'Algieba'): Promise<Buffer> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT is not set in environment variables');
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set in environment variables');
  }

  const ttsClient = new TTSClient({ projectId, location });
  return ttsClient.synthesizeText(text, voiceName);
}

/**
 * Synthesize multi-speaker audio (up to 2 speakers per API call)
 * 
 * Text format: "Speaker: text" on each line
 * Example:
 *   NARRATOR: Once upon a time...
 *   JOE: Hello there!
 * 
 * @param text - Text with speaker labels matching speaker configs
 * @param speakers - Speaker configurations (max 2)
 * @returns WAV audio buffer
 */
export async function synthesizeMultiSpeaker(
  text: string,
  speakers: SpeakerConfig[]
): Promise<Buffer> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT is not set in environment variables');
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set in environment variables');
  }

  const ttsClient = new TTSClient({ projectId, location });
  return ttsClient.synthesizeMultiSpeaker(text, speakers);
}
