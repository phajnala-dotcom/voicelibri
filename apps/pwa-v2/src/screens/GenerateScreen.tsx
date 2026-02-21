/**
 * VoiceLibri - Neumorphism Generate Screen
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * 
 * ALL-IN-ONE page with 4 sections:
 * A. Upload section - title + upload button + text box in one row
 * B. Audiobook Settings - Target Language, Narrator Gender, Narrator Voice, Multi-voice
 * C. Create button
 * D. MiniPlayer (handled by AppShell, persistent across all tabs)
 */

import { useState, useRef } from 'react';
import { 
  Upload, 
  Settings2,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { Card, CardBody, Toggle } from '../components/ui';
import { selectBook, convertToBook, getGenerationProgress, getAudiobook, createFromText, createFromUrl } from '../services/api';
import { useLibraryStore } from '../stores/libraryStore';
import { usePlayerStore } from '../stores/playerStore';

// Voice options - separated by gender
const MALE_VOICES = [
  { alias: 'Arthur', geminiName: 'Achird' },
  { alias: 'Albert', geminiName: 'Algieba' },
  { alias: 'Alex', geminiName: 'Algenib' },
  { alias: 'Charles', geminiName: 'Charon' },
  { alias: 'Eric', geminiName: 'Enceladus' },
  { alias: 'Fero', geminiName: 'Fenrir' },
  { alias: 'Ian', geminiName: 'Iapetus' },
  { alias: 'Milan', geminiName: 'Alnilam' },
  { alias: 'Oliver', geminiName: 'Orus' },
  { alias: 'Peter', geminiName: 'Puck' },
  { alias: 'Ross', geminiName: 'Rasalgethi' },
  { alias: 'Scott', geminiName: 'Schedar' },
  { alias: 'Simon', geminiName: 'Sadaltager' },
  { alias: 'Stan', geminiName: 'Sadachbia' },
  { alias: 'Umberto', geminiName: 'Umbriel' },
  { alias: 'Zachary', geminiName: 'Zubenelgenubi' },
];

const FEMALE_VOICES = [
  { alias: 'Ada', geminiName: 'Aoede' },
  { alias: 'Ash', geminiName: 'Achernar' },
  { alias: 'Callie', geminiName: 'Callirrhoe' },
  { alias: 'Cora', geminiName: 'Kore' },
  { alias: 'Desi', geminiName: 'Despina' },
  { alias: 'Erin', geminiName: 'Erinome' },
  { alias: 'Grace', geminiName: 'Gacrux' },
  { alias: 'Laura', geminiName: 'Laomedeia' },
  { alias: 'Lea', geminiName: 'Leda' },
  { alias: 'Paula', geminiName: 'Pulcherrima' },
  { alias: 'Sue', geminiName: 'Sulafat' },
  { alias: 'Toni', geminiName: 'Autonoe' },
  { alias: 'Vinnie', geminiName: 'Vindemiatrix' },
  { alias: 'Zara', geminiName: 'Zephyr' },
];

/**
 * Neumorphism Generate Screen - ALL IN ONE
 */
export function GenerateScreen() {
  const { addBook, books } = useLibraryStore();
  const { showMiniPlayer, startProgressivePlayback: startProgressivePlaybackStore } = usePlayerStore();
  
  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [inputMode, setInputMode] = useState<'file' | 'text' | 'url'>('file');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Settings state
  const [targetLanguage, setTargetLanguage] = useState('Original');
  const [narratorGender, setNarratorGender] = useState<'Female' | 'Male'>('Female');
  const [narratorVoice, setNarratorVoice] = useState('Ada');
  const [multiVoice, setMultiVoice] = useState(true);
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Get voices based on selected gender
  const availableVoices = narratorGender === 'Female' ? FEMALE_VOICES : MALE_VOICES;

  // Reset voice when gender changes
  const handleGenderChange = (gender: 'Female' | 'Male') => {
    setNarratorGender(gender);
    // Set first voice of the new gender
    setNarratorVoice(gender === 'Female' ? FEMALE_VOICES[0].alias : MALE_VOICES[0].alias);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPastedText('');
      setUrlInput('');
      setInputMode('file');
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (text) {
      setPastedText(text);
      setSelectedFile(null);
      setUrlInput('');
      setInputMode('text');
    }
  };
  
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Check if it looks like a URL
    if (value.startsWith('http://') || value.startsWith('https://')) {
      setUrlInput(value);
      setPastedText('');
      setSelectedFile(null);
      setInputMode('url');
    } else {
      setPastedText(value);
      setUrlInput('');
      if (value) setSelectedFile(null);
      setInputMode(value ? 'text' : 'file');
    }
  };

  // Convert alias to Gemini TTS voice name
  const aliasToGeminiName = (alias: string): string => {
    const allVoices = [...MALE_VOICES, ...FEMALE_VOICES];
    const voice = allVoices.find(v => v.alias === alias);
    return voice?.geminiName || 'Aoede';
  };

  const handleCreate = async () => {
    if (!selectedFile && !pastedText && !urlInput) {
      setError('Please upload an e-book, paste text, or enter a URL');
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    setProgress(0);
    
    try {
      // Convert target language to backend format
      const langMap: Record<string, string> = {
        'Original': 'original',
        'Chinese': 'zh-CN',
        'Czech': 'cs-CZ',
        'Dutch': 'nl-NL',
        'English': 'en-US',
        'French': 'fr-FR',
        'German': 'de-DE',
        'Hindi': 'hi-IN',
        'Italian': 'it-IT',
        'Japanese': 'ja-JP',
        'Korean': 'ko-KR',
        'Polish': 'pl-PL',
        'Portuguese': 'pt-BR',
        'Russian': 'ru-RU',
        'Slovak': 'sk-SK',
        'Spanish': 'es-ES',
        'Ukrainian': 'uk-UA',
      };
      const targetLangCode = langMap[targetLanguage] || 'original';
      const geminiVoice = aliasToGeminiName(narratorVoice);
      
      let result;
      
      // Choose API based on input mode
      if (inputMode === 'text' && pastedText) {
        // Use text paste API
        result = await createFromText({
          text: pastedText,
          title: 'Pasted Text',
          detectChapters: true,
          narratorVoice: geminiVoice,
          targetLanguage: targetLangCode,
        });
      } else if (inputMode === 'url' && urlInput) {
        // Use URL download API
        result = await createFromUrl({
          url: urlInput,
          narratorVoice: geminiVoice,
          targetLanguage: targetLangCode,
        });
      } else if (selectedFile) {
        // Use existing file upload API
        result = await selectBook({
          filename: selectedFile.name,
          narratorVoice: geminiVoice,
          targetLanguage: targetLangCode,
          dramatize: true,
        });
      } else {
        throw new Error('No valid input provided');
      }
      
      const bookTitle = result.audiobookTitle || result.title;
      
      // Create book object and add to library IMMEDIATELY
      if (result.chapters && result.chapters.length > 0) {
        const book = {
          id: bookTitle,
          title: result.title,
          author: result.author || 'Unknown Author',
          totalDuration: result._internal?.durationSeconds || 0,
          chapters: result.chapters.map((ch: any, i: number) => ({
            id: `ch-${i}`,
            title: ch.title,
            index: i,
            start: 0,
            end: 0,
            duration: 0,
          })),
          audioUrl: '',
          isFinished: false,
          createdAt: new Date(),
        };
        
        // Add to library immediately
        const existingBook = books.find(b => b.id === bookTitle);
        if (!existingBook) {
          addBook(book);
        }
        
        // Start progressive playback IMMEDIATELY
        console.log('🚀 Starting progressive playback for new audiobook:', book.title);
        showMiniPlayer();
        startProgressivePlaybackStore(book);
        
        // Start polling for status updates
        const pollInterval = setInterval(async () => {
          try {
            const progressData = await getGenerationProgress(bookTitle);
            if (progressData.status === 'completed') {
              console.log('📚 Audiobook generation completed!');
              setIsGenerating(false);
              clearInterval(pollInterval);
              
              // Refresh book metadata
              try {
                const audioBookMetadata = await getAudiobook(bookTitle);
                const updatedBook = convertToBook(audioBookMetadata);
                addBook(updatedBook);
              } catch (e) {
                console.log('Could not refresh book metadata:', e);
              }
            } else {
              // Update progress if available
              setProgress(progressData.progress || 0);
            }
          } catch (err) {
            console.error('Status polling error:', err);
          }
        }, 3000);
      }
      
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate audiobook');
      setIsGenerating(false);
    }
  };

  // Display text for the text box
  const displayText = selectedFile?.name || urlInput || pastedText || '';
  const placeholderText = 'Paste text or URL here';

  // Has valid input
  const hasInput = selectedFile || pastedText || urlInput;

  return (
    <div className="min-h-screen bg-[var(--neu-body-bg)]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[var(--neu-body-bg)] shadow-[var(--neu-shadow-light)]">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold text-[var(--neu-dark)]">Create</h1>
        </div>
      </header>

      <div className="px-4 py-6 space-y-6">
        {/* Error message */}
        {error && (
          <Card className="border-l-4 border-[var(--neu-danger)]">
            <CardBody className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[var(--neu-danger)] flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-[var(--neu-danger)] mb-1">Error</h4>
                <p className="text-sm text-[var(--neu-gray-700)]">{error}</p>
              </div>
            </CardBody>
          </Card>
        )}

        {/* ==================== SECTION A: Upload ==================== */}
        <div className="space-y-3">
          <h4 className="text-[var(--neu-dark)] font-semibold flex items-center gap-2">
            <Upload className="w-4 h-4" /> Upload your e-book
          </h4>
          
          {/* Row: Upload button + Text box */}
          <div className="flex items-center gap-3">
            {/* Upload button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.epub,.pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={handleUploadClick}
              className="
                neu-btn neu-btn-secondary
                px-4 py-2.5
                flex items-center gap-2
                text-white font-semibold text-sm
                flex-shrink-0
              "
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
            
            {/* Text box - same style as search box */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={displayText}
                onPaste={handlePaste}
                onChange={handleTextChange}
                placeholder={placeholderText}
                className="
                  neu-input w-full
                  text-sm
                  placeholder:text-[var(--neu-gray-500)]
                "
              />
              {inputMode === 'url' && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--neu-secondary)]">
                  🌐 URL
                </span>
              )}
              {inputMode === 'text' && pastedText.length > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--neu-gray-500)]">
                  {(pastedText.length / 1000).toFixed(1)}k chars
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ==================== SECTION B: Audiobook Settings ==================== */}
        <div className="space-y-3">
          <h4 className="text-[var(--neu-dark)] font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Audiobook Settings
          </h4>
          <Card>
            <CardBody className="space-y-4">
              {/* Target Language */}
              <div className="flex items-center justify-between">
                <label htmlFor="target-language" className="text-[var(--neu-body-color)] text-sm font-medium whitespace-nowrap">
                  Target Language
                </label>
                <select
                  id="target-language"
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="neu-input text-sm font-medium"
                  style={{ width: '35%', minWidth: '100px' }}
                >
                  <option value="Original">Original</option>
                  <option value="Chinese">Chinese</option>
                  <option value="Czech">Czech</option>
                  <option value="Dutch">Dutch</option>
                  <option value="English">English</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                  <option value="Hindi">Hindi</option>
                  <option value="Italian">Italian</option>
                  <option value="Japanese">Japanese</option>
                  <option value="Korean">Korean</option>
                  <option value="Polish">Polish</option>
                  <option value="Portuguese">Portuguese</option>
                  <option value="Russian">Russian</option>
                  <option value="Slovak">Slovak</option>
                  <option value="Spanish">Spanish</option>
                  <option value="Ukrainian">Ukrainian</option>
                </select>
              </div>
              
              {/* Narrator Gender */}
              <div className="flex items-center justify-between">
                <label htmlFor="narrator-gender" className="text-[var(--neu-body-color)] text-sm font-medium whitespace-nowrap">
                  Narrator Gender
                </label>
                <select
                  id="narrator-gender"
                  value={narratorGender}
                  onChange={(e) => handleGenderChange(e.target.value as 'Female' | 'Male')}
                  className="neu-input text-sm font-medium"
                  style={{ width: '35%', minWidth: '100px' }}
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </div>
              
              {/* Narrator Voice */}
              <div className="flex items-center justify-between">
                <label htmlFor="narrator-voice" className="text-[var(--neu-body-color)] text-sm font-medium whitespace-nowrap">
                  Narrator Voice
                </label>
                <select
                  id="narrator-voice"
                  value={narratorVoice}
                  onChange={(e) => setNarratorVoice(e.target.value)}
                  className="neu-input text-sm font-medium"
                  style={{ width: '35%', minWidth: '100px' }}
                >
                  {availableVoices.map((voice) => (
                    <option key={voice.alias} value={voice.alias}>
                      {voice.alias}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Multi-voice toggle */}
              <div className="flex items-center justify-between">
                <span className="text-[var(--neu-body-color)] text-sm font-medium">Multi-voice</span>
                <Toggle 
                  checked={multiVoice}
                  onChange={setMultiVoice}
                />
              </div>
            </CardBody>
          </Card>
        </div>

        {/* ==================== SECTION C: Create Button ==================== */}
        <button
          onClick={handleCreate}
          disabled={isGenerating || !hasInput}
          className={`
            w-full py-4 rounded-[var(--neu-radius)]
            font-bold text-lg
            flex items-center justify-center gap-3
            transition-all duration-200
            ${isGenerating || !hasInput
              ? 'neu-pressed text-[var(--neu-gray-500)] cursor-not-allowed'
              : 'neu-btn-secondary text-white shadow-[var(--neu-shadow-soft)] active:shadow-[var(--neu-shadow-inset)]'
            }
          `}
        >
          {isGenerating ? (
            <>
              <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Generating... {progress.toFixed(0)}%
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Create Audiobook
            </>
          )}
        </button>

        {/* Progress indicator when generating */}
        {isGenerating && (
          <div className="neu-card p-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-[var(--neu-gray-700)]">Progress</span>
              <span className="text-[var(--neu-secondary)] font-semibold">{progress.toFixed(0)}%</span>
            </div>
            <div className="neu-progress">
              <div 
                className="neu-progress-bar transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-[var(--neu-gray-600)] mt-2 text-center">
              Playback started in MiniPlayer below
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
