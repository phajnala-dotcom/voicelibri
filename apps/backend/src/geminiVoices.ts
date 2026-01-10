/**
 * Gemini TTS Voice Database
 * 
 * Complete list of 30 prebuilt Gemini voices with characteristics
 * Based on Gemini TTS documentation and empirical testing
 */

export interface GeminiVoice {
  name: string;              // Original Gemini TTS name (star name)
  alias: string;             // VoiceLibri frontend-friendly alias
  gender: 'male' | 'female';
  pitch: 'low' | 'medium' | 'high';
  characteristic: string;    // One-word description
}

/**
 * All 30 Gemini prebuilt voices with VoiceLibri frontend aliases
 * 
 * Source: Google Gemini TTS Documentation
 * https://cloud.google.com/text-to-speech/docs/gemini-tts
 */
export const GEMINI_VOICES: GeminiVoice[] = [
  // MALE VOICES (16 total)
  { name: 'Achird', alias: 'Arthur', gender: 'male', pitch: 'medium', characteristic: 'neutral' },
  { name: 'Algenib', alias: 'Alex', gender: 'male', pitch: 'medium', characteristic: 'clear' },
  { name: 'Algieba', alias: 'Albert', gender: 'male', pitch: 'low', characteristic: 'deep' },
  { name: 'Alnilam', alias: 'Milan', gender: 'male', pitch: 'low', characteristic: 'authoritative' },
  { name: 'Charon', alias: 'Charles', gender: 'male', pitch: 'medium', characteristic: 'friendly' },
  { name: 'Enceladus', alias: 'Eric', gender: 'male', pitch: 'medium', characteristic: 'energetic' },
  { name: 'Fenrir', alias: 'Fero', gender: 'male', pitch: 'medium', characteristic: 'dynamic' },
  { name: 'Iapetus', alias: 'Ian', gender: 'male', pitch: 'low', characteristic: 'calm' },
  { name: 'Orus', alias: 'Oliver', gender: 'male', pitch: 'medium', characteristic: 'smooth' },
  { name: 'Puck', alias: 'Peter', gender: 'male', pitch: 'high', characteristic: 'youthful' },
  { name: 'Rasalgethi', alias: 'Ross', gender: 'male', pitch: 'low', characteristic: 'mature' },
  { name: 'Sadachbia', alias: 'Stan', gender: 'male', pitch: 'medium', characteristic: 'steady' },
  { name: 'Sadaltager', alias: 'Simon', gender: 'male', pitch: 'medium', characteristic: 'warm' },
  { name: 'Schedar', alias: 'Scott', gender: 'male', pitch: 'low', characteristic: 'serious' },
  { name: 'Umbriel', alias: 'Umberto', gender: 'male', pitch: 'medium', characteristic: 'gentle' },
  { name: 'Zubenelgenubi', alias: 'Zachary', gender: 'male', pitch: 'medium', characteristic: 'balanced' },
  
  // FEMALE VOICES (14 total)
  { name: 'Achernar', alias: 'Ash', gender: 'female', pitch: 'low', characteristic: 'professional' },
  { name: 'Aoede', alias: 'Ada', gender: 'female', pitch: 'high', characteristic: 'bright' },
  { name: 'Autonoe', alias: 'Toni', gender: 'female', pitch: 'medium', characteristic: 'elegant' },
  { name: 'Callirrhoe', alias: 'Callie', gender: 'female', pitch: 'medium', characteristic: 'refined' },
  { name: 'Despina', alias: 'Desi', gender: 'female', pitch: 'medium', characteristic: 'soft' },
  { name: 'Erinome', alias: 'Erin', gender: 'female', pitch: 'medium', characteristic: 'melodic' },
  { name: 'Gacrux', alias: 'Grace', gender: 'female', pitch: 'low', characteristic: 'strong' },
  { name: 'Kore', alias: 'Cora', gender: 'female', pitch: 'medium', characteristic: 'pleasant' },
  { name: 'Laomedeia', alias: 'Laura', gender: 'female', pitch: 'medium', characteristic: 'smooth' },
  { name: 'Leda', alias: 'Lea', gender: 'female', pitch: 'high', characteristic: 'playful' },
  { name: 'Pulcherrima', alias: 'Paula', gender: 'female', pitch: 'high', characteristic: 'cheerful' },
  { name: 'Sulafat', alias: 'Sue', gender: 'female', pitch: 'low', characteristic: 'confident' },
  { name: 'Vindemiatrix', alias: 'Vinnie', gender: 'female', pitch: 'medium', characteristic: 'crisp' },
  { name: 'Zephyr', alias: 'Zara', gender: 'female', pitch: 'high', characteristic: 'light' },
];

/**
 * Get voice by Gemini TTS name (star name)
 */
export function getVoiceByName(name: string): GeminiVoice | undefined {
  return GEMINI_VOICES.find(v => v.name.toLowerCase() === name.toLowerCase());
}

/**
 * Get voice by frontend alias
 */
export function getVoiceByAlias(alias: string): GeminiVoice | undefined {
  return GEMINI_VOICES.find(v => v.alias.toLowerCase() === alias.toLowerCase());
}

/**
 * Convert frontend alias to Gemini TTS name
 * @param alias - Frontend alias (e.g., 'Arthur', 'Ash')
 * @returns Gemini TTS name (e.g., 'Achird', 'Achernar') or undefined if not found
 */
export function aliasToGeminiName(alias: string): string | undefined {
  const voice = getVoiceByAlias(alias);
  return voice?.name;
}

/**
 * Convert Gemini TTS name to frontend alias
 * @param geminiName - Gemini TTS name (e.g., 'Achird', 'Achernar')
 * @returns Frontend alias (e.g., 'Arthur', 'Ash') or undefined if not found
 */
export function geminiNameToAlias(geminiName: string): string | undefined {
  const voice = getVoiceByName(geminiName);
  return voice?.alias;
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
 * Semantic trait clusters - maps related concepts to voice characteristics
 * Uses semantic similarity rather than exact matching
 */
const TRAIT_SEMANTIC_CLUSTERS: Record<string, string[]> = {
  // Voice characteristic -> semantically related traits
  'deep': ['deep', 'bass', 'resonant', 'booming', 'rich', 'low voice', 'hluboký'],
  'authoritative': ['authoritative', 'commanding', 'leader', 'powerful', 'dominant', 'boss', 'master', 'lord', 'king', 'emperor', 'general', 'captain', 'chief', 'director', 'vůdce', 'pán'],
  'mature': ['mature', 'elderly', 'old', 'aged', 'wise', 'experienced', 'senior', 'veteran', 'ancient', 'stará', 'starý', 'babička', 'dědeček', 'grandmother', 'grandfather'],
  'calm': ['calm', 'peaceful', 'serene', 'tranquil', 'composed', 'relaxed', 'zen', 'meditative', 'klidný', 'klidná'],
  'gentle': ['gentle', 'soft', 'tender', 'kind', 'caring', 'nurturing', 'sweet', 'mild', 'jemný', 'laskavý'],
  'serious': ['serious', 'stern', 'grave', 'solemn', 'stoic', 'formal', 'strict', 'vážný', 'přísný'],
  'warm': ['warm', 'friendly', 'welcoming', 'affectionate', 'loving', 'cordial', 'hospitable', 'vřelý', 'přátelský'],
  'youthful': ['youthful', 'young', 'child', 'kid', 'teen', 'teenager', 'boy', 'girl', 'juvenile', 'dítě', 'mladý', 'mladá', 'chlapec', 'dívka'],
  'energetic': ['energetic', 'lively', 'dynamic', 'vibrant', 'spirited', 'enthusiastic', 'animated', 'excited', 'energický'],
  'playful': ['playful', 'mischievous', 'fun', 'humorous', 'witty', 'prankster', 'joker', 'hravý', 'vtipný'],
  'bright': ['bright', 'cheerful', 'happy', 'optimistic', 'sunny', 'radiant', 'joyful', 'veselý', 'radostný'],
  'elegant': ['elegant', 'refined', 'sophisticated', 'graceful', 'noble', 'aristocratic', 'lady', 'gentleman', 'elegantní', 'vznešený', 'paní', 'dáma'],
  'professional': ['professional', 'businesslike', 'competent', 'efficient', 'skilled', 'expert', 'profesionální'],
  'confident': ['confident', 'bold', 'assertive', 'self-assured', 'fearless', 'brave', 'courageous', 'sebevědomý', 'odvážný'],
  'strong': ['strong', 'powerful', 'mighty', 'robust', 'tough', 'hardy', 'silný', 'mocný'],
  'smooth': ['smooth', 'silky', 'flowing', 'fluid', 'sleek', 'polished', 'hladký'],
  'crisp': ['crisp', 'clear', 'precise', 'sharp', 'articulate', 'distinct', 'jasný', 'zřetelný'],
  'melodic': ['melodic', 'musical', 'lyrical', 'harmonious', 'singing', 'melodický', 'zpěvný'],
  'soft': ['soft', 'quiet', 'hushed', 'whispered', 'delicate', 'faint', 'tichý', 'jemný'],
  'neutral': ['neutral', 'balanced', 'even', 'moderate', 'impartial', 'neutrální', 'vyvážený'],
  'clear': ['clear', 'lucid', 'transparent', 'intelligible', 'understandable', 'srozumitelný'],
  'friendly': ['friendly', 'amiable', 'approachable', 'likable', 'pleasant', 'nice', 'milý', 'sympatický'],
  'dynamic': ['dynamic', 'active', 'vigorous', 'forceful', 'powerful', 'intense', 'dynamický'],
  'steady': ['steady', 'stable', 'consistent', 'reliable', 'dependable', 'trustworthy', 'spolehlivý'],
  'pleasant': ['pleasant', 'agreeable', 'enjoyable', 'likeable', 'charming', 'appealing', 'příjemný'],
  'refined': ['refined', 'cultured', 'polished', 'cultivated', 'tasteful', 'rafinovaný'],
  'light': ['light', 'airy', 'ethereal', 'delicate', 'feathery', 'lehký', 'vzdušný'],
  'cheerful': ['cheerful', 'happy', 'jolly', 'merry', 'bubbly', 'upbeat', 'veselý'],
};

/**
 * Age range to preferred pitch mapping
 * NOTE: Pitch values are RELATIVE within gender (low female ≠ low male)
 * - Female "low" voices: Achernar, Gacrux, Sulafat (mature/professional)
 * - Male "low" voices: Algieba, Alnilam, Iapetus, Rasalgethi, Schedar (deep/authoritative)
 * This works correctly because we filter by gender first, then apply pitch preference
 */
const AGE_TO_PITCH: Record<string, 'low' | 'medium' | 'high'> = {
  'child': 'high',
  'young adult': 'medium',
  'adult': 'medium',
  'elderly': 'low',
};

/**
 * Calculate semantic similarity score between trait and voice characteristic
 * Returns 0-1 score based on semantic cluster matching
 */
function calculateTraitScore(trait: string, voiceCharacteristic: string): number {
  const traitLower = trait.toLowerCase();
  const charLower = voiceCharacteristic.toLowerCase();
  
  // Exact match = perfect score
  if (traitLower === charLower) return 1.0;
  
  // Check if trait is in the semantic cluster for this characteristic
  const cluster = TRAIT_SEMANTIC_CLUSTERS[charLower];
  if (cluster) {
    // Check for substring matches in cluster
    for (const synonym of cluster) {
      if (traitLower.includes(synonym) || synonym.includes(traitLower)) {
        return 0.8; // Strong semantic match
      }
    }
  }
  
  // Check reverse - if characteristic is in trait's cluster
  for (const [characteristic, synonyms] of Object.entries(TRAIT_SEMANTIC_CLUSTERS)) {
    if (synonyms.some(s => traitLower.includes(s) || s.includes(traitLower))) {
      if (characteristic === charLower) {
        return 0.8;
      }
    }
  }
  
  // Partial string match
  if (traitLower.includes(charLower) || charLower.includes(traitLower)) {
    return 0.5;
  }
  
  return 0;
}

/**
 * Smart voice selection for character based on profile
 * Uses intelligent semantic matching with traits, age, and scoring
 * 
 * @param characterName - Character name (used for name-based hints like "stará paní")
 * @param gender - Character gender
 * @param traits - Character traits (e.g., ['calm', 'mature', 'authoritative'])
 * @param excludeVoices - Voices to exclude (e.g., narrator voice, already used voices)
 * @param ageRange - Optional age range for pitch selection
 * @returns Best matching voice
 */
export function selectVoiceForCharacter(
  characterName: string,
  gender: 'male' | 'female' | 'neutral',
  traits: string[] = [],
  excludeVoices: string[] = [],
  ageRange?: string
): GeminiVoice {
  // Filter by gender
  let candidates = gender === 'neutral' 
    ? GEMINI_VOICES 
    : GEMINI_VOICES.filter(v => v.gender === gender);
  
  // Exclude already used voices
  let availableCandidates = candidates.filter(v => !excludeVoices.includes(v.name));
  
  // If all voices of this gender are used, allow reuse (for books with many characters)
  if (availableCandidates.length === 0) {
    console.log(`[VoiceSelect] All ${gender} voices used, allowing reuse for ${characterName}`);
    availableCandidates = candidates;
  }
  
  if (availableCandidates.length === 0) {
    // Fallback to any voice if no gender match
    availableCandidates = GEMINI_VOICES.filter(v => !excludeVoices.includes(v.name));
    if (availableCandidates.length === 0) {
      availableCandidates = GEMINI_VOICES; // Last resort: reuse any voice
    }
  }
  
  // Combine character name with traits for matching
  // This allows "Stará paní" in name to influence voice selection
  const allTraits = [...traits, ...characterName.split(/\s+/)];
  
  // Score each candidate voice
  const scoredCandidates = availableCandidates.map(voice => {
    let score = 0;
    
    // 1. Trait matching (semantic)
    for (const trait of allTraits) {
      const traitScore = calculateTraitScore(trait, voice.characteristic);
      score += traitScore * 2; // Weight trait matches highly
    }
    
    // 2. Age/pitch matching
    if (ageRange) {
      const preferredPitch = AGE_TO_PITCH[ageRange.toLowerCase()];
      if (preferredPitch && voice.pitch === preferredPitch) {
        score += 1.5; // Bonus for age-appropriate pitch
      }
    }
    
    // 3. Infer age from traits/name
    const allTraitsLower = allTraits.map(t => t.toLowerCase()).join(' ');
    if (/stará|starý|elderly|old|aged|babička|dědeček|grandmother|grandfather/.test(allTraitsLower)) {
      if (voice.pitch === 'low') score += 1.5;
    } else if (/mladý|mladá|young|child|kid|boy|girl|dítě|teen/.test(allTraitsLower)) {
      if (voice.pitch === 'high') score += 1.5;
    }
    
    // 4. Small random factor to add variety when scores are equal
    score += Math.random() * 0.1;
    
    return { voice, score };
  });
  
  // Sort by score (highest first)
  scoredCandidates.sort((a, b) => b.score - a.score);
  
  const selected = scoredCandidates[0].voice;
  const topScore = scoredCandidates[0].score;
  
  console.log(`[VoiceSelect] ${characterName}: score=${topScore.toFixed(2)} -> ${selected.name} (${selected.characteristic}, ${selected.pitch})`);
  
  return selected;
}
