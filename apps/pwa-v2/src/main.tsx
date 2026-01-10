import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Apply initial theme
const savedTheme = localStorage.getItem('voicelibri-theme');
if (savedTheme) {
  try {
    const themeState = JSON.parse(savedTheme);
    if (themeState?.state?.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {
    // Ignore parsing errors
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
