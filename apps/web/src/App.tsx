import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { Recordings } from '@/pages/Recordings';
import { Transcription } from '@/pages/Transcription';
import { Settings } from '@/pages/Settings';
import { useAppStore } from '@/store/useAppStore';
import { transcriptionService } from '@/services/transcriptionService';

function App() {
  const { settings } = useAppStore();

  useEffect(() => {
    // Initialize transcription service with the configured provider
    try {
      const { providerType, providerBaseUrl, providerApiKey, providerModel } = settings;

      // Only initialize if minimal config is present
      const canInit =
        (providerType === 'whisperx' && providerBaseUrl) ||
        (providerType === 'openai' && providerApiKey) ||
        (providerType === 'gemini' && providerApiKey);

      if (canInit) {
        transcriptionService.initialize({
          type: providerType,
          name: providerType,
          baseUrl: providerBaseUrl || undefined,
          apiKey: providerApiKey || undefined,
          model: providerModel || undefined,
        });
      }
    } catch (error) {
      console.error('Failed to initialize transcription service:', error);
    }
  }, [settings.providerType, settings.providerBaseUrl, settings.providerApiKey, settings.providerModel]);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/recordings" element={<Recordings />} />
        <Route path="/transcription" element={<Transcription />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}

export default App;
