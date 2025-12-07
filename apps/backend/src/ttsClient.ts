import { GoogleAuth } from 'google-auth-library';
import { FileWriter } from 'wav';
import { Readable } from 'stream';

interface TTSConfig {
  projectId: string;
  location: string;
}

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
   * Synthesizes text to audio using Gemini 2.5 Pro TTS via Vertex AI REST API
   * This matches the behavior of Google AI Studio
   * @param text - The text to synthesize
   * @returns Buffer containing audio data (PCM/WAV format)
   */
  async synthesizeText(text: string): Promise<Buffer> {
    // Professional voice artist prompt for theatrical audiobook narration
    const narratorPrompt = `Read as a top voice artist in emotionally expressive yet calm, natural tone. Detect dialogue and use lower pitch / firm timbre for males, higher pitch / soft timbre for females and children. Identify each character's personality and match their voice consistently.`;
    const model = 'gemini-2.5-flash-tts';
    const endpoint = `https://aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${model}:generateContent`;

    // Get access token
    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }

    // TTS-specific request body (safety filters require invoiced billing account)
    const requestBody = {
      contents: {
        role: 'user',
        parts: {
          text: `${narratorPrompt}${text}`
        }
      },
      generation_config: {
        speech_config: {
          voice_config: {
            prebuilt_voice_config: {
              voice_name: 'Algieba'
            }
          }
        }
      }
    };

    try {
      console.log(`🎤 TTS API call - Text: ${text.length} chars + Prompt: ${narratorPrompt.length} chars = ${text.length + narratorPrompt.length} total`);
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
        throw new Error(`Vertex AI API returned ${response.status}: ${errorText}`);
      }

      const jsonResponse: any = await response.json();
      
      // Extract audio data from response
      const audioData = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (!audioData) {
        console.error('Full response:', JSON.stringify(jsonResponse, null, 2));
        throw new Error('No audio content received from Vertex AI API');
      }

      console.log(`🎵 Audio data received, converting to WAV...`);
      
      // Convert base64 to Buffer (PCM audio data)
      const pcmBuffer = Buffer.from(audioData, 'base64');
      console.log(`📦 PCM buffer size: ${pcmBuffer.length} bytes`);
      
      // Add WAV header to PCM data for browser compatibility
      const wavBuffer = await createWavBuffer(pcmBuffer);
      console.log(`✅ WAV conversion complete: ${wavBuffer.length} bytes`);
      
      return wavBuffer;
    } catch (error) {
      console.error('❌ Vertex AI TTS Error:', error);
      throw new Error(`Failed to synthesize text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export async function synthesizeText(text: string): Promise<Buffer> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT is not set in environment variables');
  }

  // GOOGLE_APPLICATION_CREDENTIALS should be set in .env and point to service account JSON file
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set in environment variables');
  }

  const ttsClient = new TTSClient({ 
    projectId,
    location,
  });
  
  return ttsClient.synthesizeText(text);
}
