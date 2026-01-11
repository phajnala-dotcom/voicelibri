/**
 * VoiceLibri - Neumorphism Generate Screen
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Convert text/ebooks to audiobooks with AI
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Upload, 
  FileText, 
  Sparkles, 
  Settings2,
  Play,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Button, Card, CardBody, Toggle, CircularProgress } from '../components/ui';
import { generateAudiobook, getGenerationProgress, convertToBook, getAudiobook } from '../services/api';
import { useLibraryStore } from '../stores/libraryStore';
import { usePlayerStore } from '../stores/playerStore';

type GenerationStep = 'upload' | 'configure' | 'processing' | 'complete';

/**
 * Neumorphism Generate Screen
 */
export function GenerateScreen() {
  const navigate = useNavigate();
  const { addBook } = useLibraryStore();
  const { setCurrentBook, setCurrentChapter, play } = usePlayerStore();
  
  const [step, setStep] = useState<GenerationStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState('English');
  const [error, setError] = useState<string | null>(null);
  const [generatedBookTitle, setGeneratedBookTitle] = useState<string>('');
  const [progress, setProgress] = useState(0);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setStep('configure');
    }
  };

  const handleGenerate = async () => {
    if (!selectedFile) return;
    
    setStep('processing');
    setError(null);
    setProgress(0);
    
    try {
      // Backend expects files to be in assets/ folder
      // For now, use the filename directly - user should place files in assets folder
      // TODO: Add file upload endpoint to backend for proper file uploads
      const bookFile = selectedFile.name;
      
      // Start generation with proper JSON payload
      const result = await generateAudiobook({
        bookFile,
        targetLanguage: targetLanguage !== 'English' ? targetLanguage : undefined,
      });
      setGeneratedBookTitle(result.bookTitle);
      
      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const progressData = await getGenerationProgress(result.bookTitle);
          const progressPercent = (progressData.chaptersGenerated / progressData.totalChapters) * 100;
          setProgress(progressPercent);
          
          if (progressData.status === 'completed') {
            clearInterval(pollInterval);
            
            // Fetch complete audiobook metadata
            const metadata = await getAudiobook(result.bookTitle);
            const book = convertToBook(metadata);
            
            // Add to library
            addBook(book);
            
            setStep('complete');
          }
        } catch (err) {
          console.error('Progress polling error:', err);
        }
      }, 2000); // Poll every 2 seconds
      
      // Cleanup interval on unmount or error
      return () => clearInterval(pollInterval);
      
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate audiobook');
      setStep('upload');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--neu-body-bg)]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[var(--neu-body-bg)] shadow-[var(--neu-shadow-light)]">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold text-[var(--neu-dark)]">Create</h1>
          <p className="text-[var(--neu-gray-700)] text-sm mt-1">
            Convert text to audiobook with AI voices
          </p>
        </div>
      </header>

      <div className="px-4 py-6">
        {error && (
          <Card className="mb-6 border-l-4 border-[var(--neu-danger)]">
            <CardBody className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[var(--neu-danger)] flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-[var(--neu-danger)] mb-1">Generation Failed</h4>
                <p className="text-sm text-[var(--neu-gray-700)]">{error}</p>
              </div>
            </CardBody>
          </Card>
        )}
        
        {step === 'upload' && (
          <div className="space-y-6">
            {/* Upload area - neumorphism inset */}
            <label className="block">
              <div className="
                neu-pressed p-8 
                rounded-[var(--neu-radius-lg)] 
                text-center 
                cursor-pointer
                hover:shadow-[var(--neu-shadow-soft)]
                transition-all duration-200
              ">
                <input
                  type="file"
                  accept=".txt,.epub,.pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="w-16 h-16 mx-auto mb-4 neu-raised rounded-full flex items-center justify-center">
                  <Upload className="w-8 h-8 text-[var(--neu-secondary)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--neu-dark)] mb-2">
                  Upload your book
                </h3>
                <p className="text-[var(--neu-gray-700)] text-sm">
                  Supports TXT, EPUB, PDF files
                </p>
              </div>
            </label>

            {/* Quick options - neumorphism cards */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-4 cursor-pointer active:shadow-[var(--neu-shadow-inset)]">
                <FileText className="w-6 h-6 text-[var(--neu-info)] mb-2" />
                <h4 className="text-[var(--neu-dark)] font-semibold text-sm">Paste Text</h4>
                <p className="text-[var(--neu-gray-600)] text-xs mt-1">From clipboard</p>
              </Card>
              <Card className="p-4 cursor-pointer active:shadow-[var(--neu-shadow-inset)]">
                <Sparkles className="w-6 h-6 text-[var(--neu-warning)] mb-2" />
                <h4 className="text-[var(--neu-dark)] font-semibold text-sm">AI Sample</h4>
                <p className="text-[var(--neu-gray-600)] text-xs mt-1">Try with demo text</p>
              </Card>
            </div>

            {/* Features list */}
            <Card>
              <CardBody>
                <h4 className="text-[var(--neu-dark)] font-semibold mb-3">What you get:</h4>
                <ul className="space-y-2">
                  {[
                    'Multi-voice character detection',
                    'Dramatized narration',
                    'Chapter-aware processing',
                    'Background audio sync',
                  ].map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-[var(--neu-gray-700)]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--neu-secondary)]" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        )}

        {step === 'configure' && selectedFile && (
          <div className="space-y-6">
            {/* Selected file */}
            <Card className="flex items-center gap-3 p-4">
              <div className="w-12 h-12 neu-pressed rounded-[var(--neu-radius)] flex items-center justify-center">
                <FileText className="w-6 h-6 text-[var(--neu-secondary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-[var(--neu-dark)] font-semibold truncate">
                  {selectedFile.name}
                </h4>
                <p className="text-[var(--neu-gray-600)] text-sm">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </Card>

            {/* Audiobook Settings */}
            <div className="space-y-3">
              <h4 className="text-[var(--neu-dark)] font-semibold flex items-center gap-2">
                <Settings2 className="w-4 h-4" /> Audiobook Settings
              </h4>
              <Card>
                <CardBody className="space-y-4">
                  {/* Target Language */}
                  <div className="flex items-center gap-3">
                    <label htmlFor="target-language" className="text-[var(--neu-body-color)] text-sm font-medium whitespace-nowrap">
                      Target Language
                    </label>
                    <select
                      id="target-language"
                      value={targetLanguage}
                      onChange={(e) => setTargetLanguage(e.target.value)}
                      className="neu-input text-sm font-medium"
                      style={{ width: '25%', minWidth: '80px' }}
                      aria-label="Select target language"
                    >
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
                  
                  {/* Multi-voice toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--neu-body-color)] text-sm">Multi-voice</span>
                    <Toggle defaultChecked={true} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--neu-body-color)] text-sm">Background music</span>
                    <Toggle defaultChecked={false} />
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* Create button */}
            <Button
              variant="secondary"
              size="lg"
              block
              onClick={handleGenerate}
              leftIcon={<Sparkles className="w-5 h-5" />}
            >
              Create Audiobook
            </Button>
          </div>
        )}

        {step === 'processing' && (
          <div className="text-center py-12">
            <CircularProgress size="lg" className="mx-auto mb-6" />
            <h3 className="text-xl font-bold text-[var(--neu-dark)] mb-2">
              Generating audiobook...
            </h3>
            <p className="text-[var(--neu-gray-700)] text-sm mb-2">
              This may take a few minutes
            </p>
            <p className="text-[var(--neu-secondary)] font-semibold mb-8">
              {progress.toFixed(0)}% complete
            </p>
            
            <Card className="max-w-xs mx-auto">
              <CardBody className="space-y-2">
                {['Analyzing text', 'Detecting characters', 'Generating voices'].map((status, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {i < 2 ? (
                      <CheckCircle className="w-4 h-4 text-[var(--neu-success)]" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-[var(--neu-gray-400)] border-t-[var(--neu-secondary)] animate-spin" />
                    )}
                    <span className={i < 2 ? 'text-[var(--neu-gray-600)]' : 'text-[var(--neu-dark)]'}>
                      {status}
                    </span>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        )}

        {step === 'complete' && (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-6 neu-raised rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-[var(--neu-success)]" />
            </div>
            <h3 className="text-xl font-bold text-[var(--neu-dark)] mb-2">
              Audiobook Ready!
            </h3>
            <p className="text-[var(--neu-gray-700)] text-sm mb-8">
              Your audiobook has been added to the library
            </p>
            <div className="flex flex-col gap-3 max-w-xs mx-auto">
              <Button 
                variant="secondary" 
                size="lg" 
                leftIcon={<Play className="w-5 h-5" />}
                onClick={async () => {
                  if (!generatedBookTitle) return;
                  try {
                    const metadata = await getAudiobook(generatedBookTitle);
                    const book = convertToBook(metadata);
                    setCurrentBook(book);
                    if (book.chapters.length > 0) {
                      setCurrentChapter(book.chapters[0]);
                    }
                    play();
                    navigate('/');
                  } catch (err) {
                    console.error('Failed to play audiobook:', err);
                  }
                }}
              >
                Play Now
              </Button>
              <Button 
                variant="primary" 
                size="lg"
                onClick={() => {
                  setStep('upload');
                  setSelectedFile(null);
                }}
              >
                Create Another
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
