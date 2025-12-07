import { useState, useRef, useEffect } from 'react';
import './App.css';

const API_URL = '/api';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const handlePlaySample = async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('Requesting TTS from backend...');
      
      const response = await fetch(`${API_URL}/tts/read-sample`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      console.log('Received audio, creating blob...');
      
      // Get the audio blob
      const audioBlob = await response.blob();
      console.log(`Audio blob size: ${audioBlob.size} bytes`);

      // Revoke previous URL if exists
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      // Create a URL for the audio blob
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      // Wait for next tick to ensure audio element is ready
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.load();
          
          // Play the audio
          audioRef.current.play()
            .then(() => {
              console.log('Audio playback started');
              setIsPlaying(true);
            })
            .catch((err) => {
              console.error('Playback error:', err);
              setError('Chyba pri prehrávaní audio');
            });
        }
      }, 100);

    } catch (err) {
      console.error('TTS Error:', err);
      setError(err instanceof Error ? err.message : 'Neznáma chyba pri TTS');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAudioEnded = () => {
    console.log('Audio playback ended');
    setIsPlaying(false);
  };

  const handleAudioError = (e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    console.error('Audio element error:', e);
    setError('Chyba pri načítaní audio súboru');
    setIsPlaying(false);
  };

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play()
          .then(() => setIsPlaying(true))
          .catch((err) => {
            console.error('Play error:', err);
            setError('Chyba pri prehrávaní');
          });
      }
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>📖 Ebook Reader POC 1.0</h1>
        <p className="subtitle">Čítanie textu pomocou Gemini 2.5 Flash TTS</p>
      </header>

      <main className="app-main">
        <div className="player-card">
          <div className="description">
            <p>Prečítať ukážkový text syntetizovaným hlasom</p>
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          <div className="controls">
            {!audioUrl ? (
              <button
                onClick={handlePlaySample}
                disabled={isLoading}
                className="btn-primary"
              >
                {isLoading ? '⏳ Generujem audio...' : '🎧 Prehrať ukážku'}
              </button>
            ) : (
              <button
                onClick={togglePlayPause}
                disabled={isLoading}
                className="btn-primary"
              >
                {isPlaying ? '⏸️ Pauza' : '▶️ Prehrať'}
              </button>
            )}
          </div>

          {/* Audio element - hidden but accessible */}
          <audio
            ref={audioRef}
            onEnded={handleAudioEnded}
            onError={handleAudioError}
            controls
            className="audio-player"
          />
        </div>

        <div className="info">
          <p className="info-text">
            POC 1.0: Základné prehrávanie testovacieho textu
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;
