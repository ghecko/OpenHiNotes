import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader, CheckCircle, ExternalLink, Server } from 'lucide-react';
import { Transcription, SummaryTemplate } from '@/types';
import { transcriptionsApi } from '@/api/transcriptions';
import { collectionsApi } from '@/api/collections';
import { templatesApi } from '@/api/templates';
import { settingsApi } from '@/api/settings';
import { useQueueStore } from '@/store/useQueueStore';
import { TemplateSelector } from '@/components/TemplateSelector';

interface TranscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioFile: Blob | null;
  fileName: string;
  /** If set, automatically applied as the transcription title after successful transcribe */
  initialTitle?: string;
  /** If set, automatically assigns the transcription to this collection after transcribe */
  initialCollectionId?: string;
  onComplete: (transcription: Transcription) => void;
}

const LANGUAGES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
];

export function TranscribeModal({
  isOpen,
  onClose,
  audioFile,
  fileName,
  initialTitle,
  initialCollectionId,
  onComplete,
}: TranscribeModalProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [language, setLanguage] = useState('auto');
  const [keepAudio, setKeepAudio] = useState(false);
  const [autoSummarize, setAutoSummarize] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templates, setTemplates] = useState<SummaryTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submittedTranscription, setSubmittedTranscription] = useState<Transcription | null>(null);
  const [keepAudioAllowed, setKeepAudioAllowed] = useState(true);

  useEffect(() => {
    settingsApi.getAudioSettings()
      .then((s) => {
        setKeepAudioAllowed(s.keep_audio_enabled);
        if (!s.keep_audio_enabled) setKeepAudio(false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (autoSummarize) {
      loadTemplates();
    }
  }, [autoSummarize]);

  const loadTemplates = async () => {
    try {
      const t = await templatesApi.getTemplates();
      setTemplates(t);
      if (t.length > 0) {
        setSelectedTemplate(t[0].id);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const handleSubmit = async () => {
    if (!audioFile) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const file = new File([audioFile], fileName, { type: 'audio/wav' });

      // Always use queue — returns immediately
      const transcription = await transcriptionsApi.queueTranscription(
        file,
        language,
        keepAudio,
        autoSummarize,
        autoSummarize ? selectedTemplate : undefined,
      );

      // If an alias / initial title was provided, set it
      if (initialTitle && transcription.id) {
        try {
          await transcriptionsApi.updateTitle(transcription.id, initialTitle);
          transcription.title = initialTitle;
        } catch {
          console.warn('Could not set initial title from alias');
        }
      }

      // If a collection was pre-assigned, assign it
      if (initialCollectionId && transcription.id) {
        try {
          await collectionsApi.assignTranscription(initialCollectionId, transcription.id);
          transcription.collection_id = initialCollectionId;
        } catch {
          console.warn('Could not assign to collection');
        }
      }

      // Add to queue store (starts SSE streaming automatically for real-time progress)
      useQueueStore.getState().addQueueItem(transcription);

      setIsSubmitting(false);
      setSubmittedTranscription(transcription);
      onComplete(transcription);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to queue transcription';
      setError(message);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const fileSize = audioFile ? (audioFile.size / 1024 / 1024).toFixed(2) : '0';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Transcribe Audio</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">File</p>
            <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {initialTitle || fileName}
              </p>
              {initialTitle && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{fileName}</p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">{fileSize} MB</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {keepAudioAllowed && (
              <>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepAudio}
                    onChange={(e) => setKeepAudio(e.target.checked)}
                    disabled={isSubmitting}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <Server className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Save audio on server
                  </span>
                </label>
                {keepAudio && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 ml-6 pl-4">
                    Audio will be saved on the server and playable from the transcription. Anyone with access to the transcript can listen.
                  </p>
                )}
              </>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSummarize}
                onChange={(e) => setAutoSummarize(e.target.checked)}
                disabled={isSubmitting}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Auto-summarize after transcription
              </span>
            </label>
          </div>

          {autoSummarize && (
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                Summary Template
              </label>
              <TemplateSelector
                templates={templates}
                value={selectedTemplate}
                onChange={setSelectedTemplate}
                disabled={isSubmitting}
              />
            </div>
          )}
        </div>

        {submittedTranscription ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  Sent to queue!
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                  {submittedTranscription.queue_position
                    ? `Position ${submittedTranscription.queue_position} — track progress from the queue icon in the header`
                    : 'Track progress from the queue icon in the header'}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSubmittedTranscription(null);
                  onClose();
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const id = submittedTranscription.id;
                  setSubmittedTranscription(null);
                  onClose();
                  navigate(`/transcriptions/${id}`);
                }}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                View Status
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !audioFile}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Sending...' : autoSummarize ? 'Transcribe & Summarize' : 'Transcribe'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
