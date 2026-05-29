import { useState, useRef, useCallback } from 'react';
import { transcriptionsApi } from '@/api/transcriptions';
import { X, Loader, Upload as UploadIcon, Copy, Check, AlertCircle, Zap } from 'lucide-react';

interface OneShotTranscribeModalProps {
  onClose: () => void;
}

interface OneShotResult {
  text: string;
  language: string | null;
  duration: number | null;
  segments: Array<{ start: number; end: number; text: string; speaker?: string }>;
}

const ACCEPT = '.mp3,.wav,.m4a,.ogg,.flac,.hda,.webm';

export function OneShotTranscribeModal({ onClose }: OneShotTranscribeModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OneShotResult | null>(null);
  const [language, setLanguage] = useState<'auto' | 'en' | 'fr' | 'es' | 'de' | 'it'>('auto');
  const [diarize, setDiarize] = useState(true);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPick = (f: File | null) => {
    setFile(f);
    setResult(null);
    setError(null);
  };

  const run = useCallback(async () => {
    if (!file) return;
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await transcriptionsApi.oneshotTranscribe(file, {
        language: language === 'auto' ? undefined : language,
        diarize,
      });
      setResult({
        text: res.text,
        language: res.language,
        duration: res.duration,
        segments: res.segments,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsRunning(false);
    }
  }, [file, language, diarize]);

  const copyText = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked — best effort
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">One-shot transcription</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
            Run a quick speech-to-text without saving anything. Nothing is
            written to your library, no audio is kept on the server after
            this returns.
          </p>

          {!file ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex flex-col items-center gap-2 hover:border-primary-500 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors"
            >
              <UploadIcon className="w-8 h-8 text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-300">Click to pick an audio file</span>
              <span className="text-xs text-gray-400">{ACCEPT}</span>
            </button>
          ) : (
            <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</div>
              </div>
              <button
                onClick={() => onPick(null)}
                disabled={isRunning}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
              >
                Change
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] || null)}
          />

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <span className="block font-medium">Language</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as typeof language)}
                disabled={isRunning}
                className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-50"
              >
                <option value="auto">Auto-detect</option>
                <option value="en">English</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="de">German</option>
                <option value="it">Italian</option>
              </select>
            </label>
            <label className="text-xs text-gray-600 dark:text-gray-400 space-y-1 flex flex-col">
              <span className="block font-medium">Diarization</span>
              <label className="flex items-center gap-2 mt-1.5">
                <input
                  type="checkbox"
                  checked={diarize}
                  disabled={isRunning}
                  onChange={(e) => setDiarize(e.target.checked)}
                  className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Detect speakers</span>
              </label>
            </label>
          </div>

          <button
            onClick={run}
            disabled={!file || isRunning}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {isRunning ? (
              <>
                <Loader className="w-4 h-4 animate-spin" /> Transcribing...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" /> Transcribe
              </>
            )}
          </button>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {result.language ? `Language: ${result.language}` : 'Language: unknown'}
                  {result.duration ? ` · ${Math.round(result.duration)}s` : ''}
                </div>
                <button
                  onClick={copyText}
                  className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
                {result.text || '(no text)'}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
