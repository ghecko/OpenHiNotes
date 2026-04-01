import { useState, useMemo } from 'react';
import { Layout } from '@/components/Layout';
import { ChatPanel } from '@/components/ChatPanel';
import { transcriptionsApi } from '@/api/transcriptions';
import { Transcription } from '@/types';

export function Chat() {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [selectedTranscriptionId, setSelectedTranscriptionId] = useState<string | undefined>();
  const [isLoadingTranscriptions, setIsLoadingTranscriptions] = useState(false);
  const [hasLoadedTranscriptions, setHasLoadedTranscriptions] = useState(false);

  const handleLoadTranscriptions = async () => {
    setIsLoadingTranscriptions(true);
    try {
      const response = await transcriptionsApi.getTranscriptions(0, 50);
      setTranscriptions(response.items.filter(t => t.status === 'completed'));
      setHasLoadedTranscriptions(true);
    } catch (error) {
      console.error('Failed to load transcriptions:', error);
    } finally {
      setIsLoadingTranscriptions(false);
    }
  };

  return (
    <Layout title="Chat">
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Select Context (Optional)
          </h2>

          <div className="flex gap-3 mb-4">
            <button
              onClick={handleLoadTranscriptions}
              disabled={isLoadingTranscriptions}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {isLoadingTranscriptions ? 'Loading...' : 'Load Transcriptions'}
            </button>
            {selectedTranscriptionId && (
              <button
                onClick={() => setSelectedTranscriptionId(undefined)}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
              >
                Clear Selection
              </button>
            )}
          </div>

          {transcriptions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
              {transcriptions.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTranscriptionId(t.id)}
                  className={`p-3 text-left rounded-lg border transition-colors ${
                    selectedTranscriptionId === t.id
                      ? 'bg-blue-100 dark:bg-blue-900 border-blue-500 dark:border-blue-400'
                      : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                    {t.title || t.original_filename}
                  </p>
                  {t.title && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {t.original_filename}
                    </p>
                  )}
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Ready
                  </p>
                </button>
              ))}
            </div>
          ) : hasLoadedTranscriptions ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No completed transcriptions available. Transcriptions must finish processing before they can be used as chat context.
            </p>
          ) : null}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 h-96 md:h-[600px]">
          <ChatPanel
            transcriptionId={selectedTranscriptionId}
            scopeToTranscription={false}
            transcriptionNames={transcriptions.reduce<Record<string, string>>((acc, t) => {
              acc[t.id] = t.title || t.original_filename;
              return acc;
            }, {})}
          />
        </div>
      </div>
    </Layout>
  );
}
