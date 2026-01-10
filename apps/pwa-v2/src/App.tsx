// VoiceLibri - Premium Audiobook Player PWA
// Main Application Entry Point

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/layout';
import { 
  LibraryScreen, 
  GenerateScreen, 
  ClassicsScreen, 
  SettingsScreen 
} from './screens';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<LibraryScreen />} />
            <Route path="/generate" element={<GenerateScreen />} />
            <Route path="/classics" element={<ClassicsScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
