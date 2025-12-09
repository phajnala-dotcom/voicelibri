/**
 * Gemini TTS Voice Database
 * 
 * Complete list of 30 prebuilt Gemini voices with characteristics
 * Based on Gemini TTS documentation and empirical testing
 */

export interface GeminiVoice {
  name: string;
  gender: 'male' | 'female';
  pitch: 'low' | 'medium' | 'high';
  characteristic: string; // One-word description
}

/**
 * All 30 Gemini prebuilt voices
 * 
 * Source: Google Gemini TTS Documentation
 * https://cloud.google.com/text-to-speech/docs/gemini-tts
 */
export const GEMINI_VOICES: GeminiVoice[] = [
  // MALE VOICES (16 total)
  { name: 'Achird', gender: 'male', pitch: 'medium', characteristic: 'neutral' },
  { name: 'Algenib', gender: 'male', pitch: 'medium', characteristic: 'clear' },
  { name: 'Algieba', gender: 'male', pitch: 'low', characteristic: 'deep' },
  { name: 'Alnilam', gender: 'male', pitch: 'low', characteristic: 'authoritative' },
  { name: 'Charon', gender: 'male', pitch: 'medium', characteristic: 'friendly' },
  { name: 'Enceladus', gender: 'male', pitch: 'medium', characteristic: 'energetic' },
  { name: 'Fenrir', gender: 'male', pitch: 'medium', characteristic: 'dynamic' },
  { name: 'Iapetus', gender: 'male', pitch: 'low', characteristic: 'calm' },
  { name: 'Orus', gender: 'male', pitch: 'medium', characteristic: 'smooth' },
  { name: 'Puck', gender: 'male', pitch: 'high', characteristic: 'youthful' },
  { name: 'Rasalgethi', gender: 'male', pitch: 'low', characteristic: 'mature' },
  { name: 'Sadachbia', gender: 'male', pitch: 'medium', characteristic: 'steady' },
  { name: 'Sadaltager', gender: 'male', pitch: 'medium', characteristic: 'warm' },
  { name: 'Schedar', gender: 'male', pitch: 'low', characteristic: 'serious' },
  { name: 'Umbriel', gender: 'male', pitch: 'medium', characteristic: 'gentle' },
  { name: 'Zubenelgenubi', gender: 'male', pitch: 'medium', characteristic: 'balanced' },
  
  // FEMALE VOICES (14 total)
  { name: 'Achernar', gender: 'female', pitch: 'low', characteristic: 'professional' },
  { name: 'Aoede', gender: 'female', pitch: 'high', characteristic: 'bright' },
  { name: 'Autonoe', gender: 'female', pitch: 'medium', characteristic: 'elegant' },
  { name: 'Callirrhoe', gender: 'female', pitch: 'medium', characteristic: 'refined' },
  { name: 'Despina', gender: 'female', pitch: 'medium', characteristic: 'soft' },
  { name: 'Erinome', gender: 'female', pitch: 'medium', characteristic: 'melodic' },
  { name: 'Gacrux', gender: 'female', pitch: 'low', characteristic: 'strong' },
  { name: 'Kore', gender: 'female', pitch: 'medium', characteristic: 'pleasant' },
  { name: 'Laomedeia', gender: 'female', pitch: 'medium', characteristic: 'smooth' },
  { name: 'Leda', gender: 'female', pitch: 'high', characteristic: 'playful' },
  { name: 'Pulcherrima', gender: 'female', pitch: 'high', characteristic: 'cheerful' },
  { name: 'Sulafat', gender: 'female', pitch: 'low', characteristic: 'confident' },
  { name: 'Vindemiatrix', gender: 'female', pitch: 'medium', characteristic: 'crisp' },
  { name: 'Zephyr', gender: 'female', pitch: 'high', characteristic: 'light' },
];

/**
 * Get voice by name
 */
export function getVoiceByName(name: string): GeminiVoice | undefined {
  return GEMINI_VOICES.find(v => v.name.toLowerCase() === name.toLowerCase());
}

/**
 * Get all voices by gender
 */
export function getVoicesByGender(gender: 'male' | 'female'): GeminiVoice[] {
  return GEMINI_VOICES.filter(v => v.gender === gender);
}

/**
 * Get all voices by pitch
 */
export function getVoicesByPitch(pitch: 'low' | 'medium' | 'high'): GeminiVoice[] {
  return GEMINI_VOICES.filter(v => v.pitch === pitch);
}

/**
 * Smart voice selection for character based on profile
 * 
 * @param characterName - Character name
 * @param gender - Character gender
 * @param traits - Character traits (e.g., ['calm', 'mature', 'authoritative'])
 * @param excludeVoices - Voices to exclude (e.g., narrator voice, already used voices)
 * @returns Best matching voice
 */
export function selectVoiceForCharacter(
  characterName: string,
  gender: 'male' | 'female' | 'neutral',
  traits: string[] = [],
  excludeVoices: string[] = []
): GeminiVoice {
  // Filter by gender
  let candidates = gender === 'neutral' 
    ? GEMINI_VOICES 
    : GEMINI_VOICES.filter(v => v.gender === gender);
  
  // Exclude voices (narrator, already used)
  candidates = candidates.filter(v => !excludeVoices.includes(v.name));
  
  if (candidates.length === 0) {
    throw new Error(`No available voices for gender: ${gender}`);
  }
  
  // Match traits to characteristics
  const traitLower = traits.map(t => t.toLowerCase());
  
  // Try exact match first
  for (const trait of traitLower) {
    const match = candidates.find(v => v.characteristic.toLowerCase() === trait);
    if (match) return match;
  }
  
  // Age-based selection
  if (traitLower.includes('young') || traitLower.includes('child')) {
    const highPitch = candidates.filter(v => v.pitch === 'high');
    if (highPitch.length > 0) return highPitch[0];
  }
  
  if (traitLower.includes('mature') || traitLower.includes('elderly') || traitLower.includes('old')) {
    const lowPitch = candidates.filter(v => v.pitch === 'low');
    if (lowPitch.length > 0) return lowPitch[0];
  }
  
  // Authority/strength
  if (traitLower.includes('authoritative') || traitLower.includes('strong') || traitLower.includes('powerful')) {
    const strong = candidates.find(v => 
      v.characteristic === 'authoritative' || 
      v.characteristic === 'strong' ||
      v.characteristic === 'confident'
    );
    if (strong) return strong;
  }
  
  // Calm/gentle
  if (traitLower.includes('calm') || traitLower.includes('gentle') || traitLower.includes('soft')) {
    const calm = candidates.find(v => 
      v.characteristic === 'calm' || 
      v.characteristic === 'gentle' ||
      v.characteristic === 'soft'
    );
    if (calm) return calm;
  }
  
  // Default: return first available
  return candidates[0];
}
