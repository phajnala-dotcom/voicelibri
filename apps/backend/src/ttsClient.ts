import { GoogleAuth } from 'google-auth-library';

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
 * Map short language codes to BCP-47 format required by Cloud TTS API.
 * Cloud TTS VoiceSelectionParams.languageCode is REQUIRED.
 */
const LANG_CODE_TO_BCP47: Record<string, string> = {
  'sk': 'sk-SK',
  'cs': 'cs-CZ',
  'en': 'en-US',
  'de': 'de-DE',
  'ru': 'ru-RU',
  'pl': 'pl-PL',
  'hr': 'hr-HR',
  'zh': 'cmn-CN',
  'nl': 'nl-NL',
  'fr': 'fr-FR',
  'hi': 'hi-IN',
  'it': 'it-IT',
  'ja': 'ja-JP',
  'ko': 'ko-KR',
  'pt': 'pt-BR',
  'es': 'es-ES',
  'uk': 'uk-UA',
};

/**
 * Convert language code to BCP-47 format.
 * Handles short codes ('sk') and full BCP-47 codes ('sk-SK').
 */
function toBCP47(langCode: string): string {
  if (langCode.includes('-')) return langCode;
  return LANG_CODE_TO_BCP47[langCode.toLowerCase()] || `${langCode}-${langCode.toUpperCase()}`;
}

/**
 * Resolve BCP-47 language code for TTS API (required field).
 * Priority: explicit param > TARGET_LANGUAGE global > BOOK_METADATA.language > fallback 'en-US'
 */
function resolveLanguageCode(explicitCode?: string): string {
  if (explicitCode) return toBCP47(explicitCode);
  const targetLang = (global as any).TARGET_LANGUAGE;
  if (targetLang) return toBCP47(targetLang);
  const bookLang = (global as any).BOOK_METADATA?.language;
  if (bookLang) return toBCP47(bookLang);
  return 'en-US'; // safe fallback
}

/**
 * Gemini TTS model to use
 * TTS model configured via environment variable
 */
const TTS_MODEL = process.env.TTS_MODEL || 'gemini-2.5-flash-tts';

/**
 * Resolves the Cloud Text-to-Speech API endpoint based on location.
 * 
 * Cloud TTS API endpoint format per official docs:
 *   - Global: texttospeech.googleapis.com
 *   - Regional: {REGION}-texttospeech.googleapis.com
 * 
 * Supported regions for Gemini TTS: global, us, eu
 * We map Vertex AI region names to Cloud TTS region names.
 */
function getTtsEndpoint(location: string): string {
  // Map Vertex AI locations to Cloud TTS regions
  // Cloud TTS supports: global, us, eu, northamerica-northeast1
  // Vertex AI uses: us-central1, europe-west1, etc.
  const regionMap: Record<string, string> = {
    'us-central1': 'us',
    'us-east1': 'us',
    'us-east4': 'us',
    'us-east5': 'us',
    'us-south1': 'us',
    'us-west1': 'us',
    'us-west4': 'us',
    'europe-west1': 'eu',
    'europe-west4': 'eu',
    'europe-central2': 'eu',
    'europe-north1': 'eu',
    'europe-southwest1': 'eu',
    'northamerica-northeast1': 'northamerica-northeast1',
    'global': 'global',
  };

  const ttsRegion = regionMap[location] || 'us';
  if (ttsRegion === 'global') {
    return 'https://texttospeech.googleapis.com';
  }
  return `https://${ttsRegion}-texttospeech.googleapis.com`;
}



export class TTSClient {
  private projectId: string;
  private location: string;
  private ttsBaseUrl: string;
  private auth: GoogleAuth;

  constructor(config: TTSConfig) {
    this.projectId = config.projectId;
    this.location = config.location;
    this.ttsBaseUrl = getTtsEndpoint(config.location);
    // GoogleAuth will automatically use GOOGLE_APPLICATION_CREDENTIALS env var
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }

  /**
   * Synthesizes text to audio using Cloud Text-to-Speech API (Gemini TTS)
   * Single-speaker mode using voice name
   * 
   * Uses the Cloud TTS API with LINEAR16 encoding for lossless PCM quality.
   * Returns WAV buffer (with header) — downstream pipeline handles WAV→OGG conversion
   * at chapter consolidation for optimal single-encode quality.
   * 
   * @param text - The text to synthesize
   * @param voiceName - The Gemini voice name to use (e.g., 'Algieba', 'Puck', 'Zephyr')
   * @param style - Voice style modifier: 'normal', 'whisper', 'thought', 'letter'
   * @param speechStyle - Optional custom speech style instruction (natural sentence like "Speak slowly with gravelly voice.")
   * @param languageCode - Optional language code to force (e.g., 'cs-CZ') - used for single-word texts to prevent misdetection
   * @returns Buffer containing audio data (WAV LINEAR16 format)
   */
  async synthesizeText(
    text: string, 
    voiceName: string = 'Algieba',
    style: 'normal' | 'whisper' | 'thought' | 'letter' = 'normal',
    speechStyle?: string,
    languageCode?: string
  ): Promise<Buffer> {
    const endpoint = `${this.ttsBaseUrl}/v1/text:synthesize`;

    // Get access token
    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }

    // Cloud TTS API has separate `text` and `prompt` fields in SynthesisInput.
    // `text`: the actual text to speak (passed unedited to TTS)
    // `prompt`: style/voice instructions (system instruction for controllable models)
    let promptText: string | undefined;
    
    // Check word count (after removing punctuation)
    const cleanText = text.replace(/["„"'«»‹›,\.!?;:—–-]/g, '').trim();
    const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;
    const isShortText = wordCount <= 3;
    
    if (speechStyle) {
      // Use speech style directive directly as prompt
      promptText = speechStyle.replace(/\.$/, '').trim();
    } else if (!isShortText) {
      // Apply basic style presets (only for >3 words)
      switch (style) {
        case 'whisper':
          promptText = 'Speak in a hushed whisper';
          break;
        case 'thought':
          promptText = 'Speak as an internal thought';
          break;
        case 'letter':
          promptText = 'Read aloud';
          break;
        case 'normal':
        default:
          // No prompt for normal style
          break;
      }
    }

    // Build SynthesisInput per Cloud TTS API spec
    const input: any = { text };
    if (promptText) {
      input.prompt = promptText;
    }

    // Build VoiceSelectionParams per Cloud TTS API spec
    // languageCode is REQUIRED by the Cloud TTS API
    const resolvedLang = resolveLanguageCode(languageCode);
    const voice: any = {
      name: voiceName,
      modelName: TTS_MODEL,
      languageCode: resolvedLang,
    };
    console.log(`  \uD83D\uDD24 TTS language_code: ${resolvedLang}${languageCode ? ' (explicit)' : ' (auto-resolved)'}`);

    // AudioConfig: LINEAR16 (lossless PCM) — WAV→OGG conversion happens at chapter consolidation
    const audioConfig = {
      audioEncoding: 'LINEAR16',
    };

    const requestBody = { input, voice, audioConfig };

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
        
        const styleDesc = speechStyle 
          ? ` ${speechStyle.substring(0, 50)}...` 
          : (style !== 'normal' ? ` [${style.toUpperCase()}]` : '');
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
          console.error('Cloud TTS API Error:', errorText);
          
          // Retry on 500 errors (server-side issues)
          if (response.status >= 500 && attempt < maxRetries) {
            lastError = new Error(`Cloud TTS API returned ${response.status}: ${errorText}`);
            continue;
          }
          
          throw new Error(`Cloud TTS API returned ${response.status}: ${errorText}`);
        }

        // Cloud TTS API returns { audioContent: "<base64 encoded LINEAR16 WAV>" }
        const jsonResponse: any = await response.json();
        const audioContent = jsonResponse.audioContent;
        
        if (!audioContent) {
          console.error('Full response:', JSON.stringify(jsonResponse, null, 2));
          throw new Error('No audioContent received from Cloud TTS API');
        }

        // LINEAR16 returns WAV with header — lossless, ready for sub-chunk storage
        const wavBuffer = Buffer.from(audioContent, 'base64');
        console.log(`✅ WAV audio received: ${wavBuffer.length} bytes (LINEAR16 from API)`);
        
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
        
        console.error('❌ Cloud TTS Error:', error);
        throw new Error(`Failed to synthesize text: ${lastError.message}`);
      }
    }
    
    // All retries exhausted
    throw new Error(`Failed to synthesize text after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Synthesizes multi-speaker text to audio using Gemini TTS
   * 
   * Uses the Cloud TTS API multiSpeakerVoiceConfig for true multi-voice synthesis
   * in a SINGLE API call (up to 2 speakers per call per API limitation).
   * 
   * Text format must use "Speaker: text" format, e.g.:
   *   "NARRATOR: Once upon a time...
   *    JOE: Hello there!"
   * 
   * @param text - Text with speaker labels
   * @param speakers - Array of speaker configurations (max 2)
   * @returns Buffer containing audio data (WAV LINEAR16 format)
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

    const endpoint = `${this.ttsBaseUrl}/v1/text:synthesize`;

    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }

    // Build multi-speaker voice config per Cloud TTS API spec
    // Uses speakerAlias (label in text) and speakerId (voice name)
    const speakerVoiceConfigs = speakers.map(s => ({
      speakerAlias: s.speaker,
      speakerId: s.voiceName,
    }));

    // Cloud TTS API has a dedicated `prompt` field for style instructions
    // This is separate from the text and goes into SynthesisInput.prompt
    const speakerList = speakers.map(s => s.speaker).join(', ');
    const promptText = `VOICE RULE: SWITCH VOICE IMMEDIATELY AT EACH SPEAKER LABEL! Labels: ${speakerList}\nSTYLE: Read as a world-class voice artist with immersive, expressive, yet natural elocution, rich variety of expressive means, expressing the speakers emotions, story events and environment by highly adaptive prosody.`;

    // Build request per Cloud TTS API spec
    // languageCode is REQUIRED by the Cloud TTS API
    const resolvedLang = resolveLanguageCode();
    console.log(`  \uD83D\uDD24 Multi-speaker TTS language_code: ${resolvedLang}`);
    const requestBody = {
      input: {
        text: text,
        prompt: promptText,
      },
      voice: {
        languageCode: resolvedLang,
        modelName: TTS_MODEL,
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: speakerVoiceConfigs,
        },
      },
      audioConfig: {
        audioEncoding: 'LINEAR16',
      },
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
          console.error('Cloud TTS Multi-Speaker Error:', errorText);
          
          // Retry on 500 errors
          if (response.status >= 500 && attempt < maxRetries) {
            lastError = new Error(`Cloud TTS API returned ${response.status}: ${errorText}`);
            continue;
          }
          
          throw new Error(`Cloud TTS API returned ${response.status}: ${errorText}`);
        }

        // Cloud TTS API returns { audioContent: "<base64 encoded LINEAR16 WAV>" }
        const jsonResponse: any = await response.json();
        const audioContent = jsonResponse.audioContent;

        if (!audioContent) {
          console.error('Full response:', JSON.stringify(jsonResponse, null, 2));
          throw new Error('No audioContent received from multi-speaker TTS');
        }

        // LINEAR16 returns WAV with header — lossless, ready for sub-chunk storage
        const wavBuffer = Buffer.from(audioContent, 'base64');
        console.log(`✅ Multi-speaker WAV audio: ${wavBuffer.length} bytes (LINEAR16 from API)`);

        return wavBuffer;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Retry on network/timeout/500 errors
        if (attempt < maxRetries && (
          lastError.message.includes('500') ||
          lastError.message.includes('timeout') ||
          lastError.message.includes('ECONNRESET') ||
          lastError.message.includes('fetch failed')
        )) {
          continue;
        }
        
        console.error('❌ Multi-speaker Cloud TTS Error:', error);
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

export async function synthesizeText(
  text: string, 
  voiceName: string = 'Algieba',
  style: 'normal' | 'whisper' | 'thought' | 'letter' = 'normal',
  speechStyle?: string,
  languageCode?: string
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
  return ttsClient.synthesizeText(text, voiceName, style, speechStyle, languageCode);
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
 * @returns WAV LINEAR16 audio buffer
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
