import { AudioRecorder } from '@/components/AudioRecorder';
import { FileUpload } from '@/components/FileUpload';
import { transcriptionService } from '@/services/transcriptionService';
import type { TranscriptionProgress, CancellationToken } from '@/services/providers/types';
import { useAppStore } from '@/store/useAppStore';
import type { AudioData, InsightData, TranscriptionResult } from '@/types';
import {
  CheckCircle,
  Copy,
  Download,
  FileAudio,
  Lightbulb,
  MessageSquare,
  Mic,
  Server,
  X
} from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type TranscriptionStep = 'upload' | 'transcribing' | 'transcribed' | 'analyzing' | 'complete';

export const Transcription: React.FC = () => {
  const { settings, setError, setLoading } = useAppStore();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<TranscriptionStep>('upload');
  const [audioData, setAudioData] = useState<AudioData | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const cancellationTokenRef = useRef<CancellationToken | null>(null);

  const isConfigured = transcriptionService.isInitialized();
  const supportsInsights = transcriptionService.supportsInsights();

  const handleFileSelect = useCallback((data: AudioData) => {
    setAudioData(data);
    setCurrentStep('upload');
  }, []);

  const handleRecordingComplete = useCallback((data: AudioData) => {
    setAudioData(data);
    setCurrentStep('upload');
  }, []);

  const handleTranscribe = useCallback(async () => {
    if (!audioData || !isConfigured) {
      setError('Audio data or transcription provider not configured');
      return;
    }

    setCurrentStep('transcribing');
    setLoading(true);
    setIsProcessing(true);
    setProgress(null);

    const token = transcriptionService.createCancellationToken();
    cancellationTokenRef.current = token;

    try {
      // Build a File/Blob from the audio data
      const blob = audioData.blob
        || base64ToBlob(audioData.base64, audioData.mimeType);

      const result = await transcriptionService.transcribe(
        blob,
        {
          language: settings.transcriptionLanguage,
          fileName: audioData.fileName,
        },
        (progressData) => setProgress(progressData),
        token,
      );

      setTranscription(result);
      setCurrentStep('transcribed');
      setProgress(null);
    } catch (error) {
      if (error instanceof Error && error.message.includes('cancelled')) {
        setCurrentStep('upload');
        setProgress(null);
      } else {
        setError(error instanceof Error ? error.message : 'Transcription failed');
        setCurrentStep('upload');
      }
    } finally {
      setLoading(false);
      setIsProcessing(false);
      cancellationTokenRef.current = null;
    }
  }, [audioData, isConfigured, settings.transcriptionLanguage, setError, setLoading]);

  const handleAnalyze = useCallback(async () => {
    if (!transcription) {
      setError('No transcription available');
      return;
    }

    setCurrentStep('analyzing');
    setLoading(true);
    setIsProcessing(true);
    setProgress(null);

    const token = transcriptionService.createCancellationToken();
    cancellationTokenRef.current = token;

    try {
      const result = await transcriptionService.extractInsights(
        transcription.text,
        (progressData) => setProgress(progressData),
        token,
      );
      setInsights(result);
      setCurrentStep('complete');
      setProgress(null);
    } catch (error) {
      if (error instanceof Error && error.message.includes('cancelled')) {
        setCurrentStep('transcribed');
        setProgress(null);
      } else {
        setError(error instanceof Error ? error.message : 'Analysis failed');
        setCurrentStep('transcribed');
      }
    } finally {
      setLoading(false);
      setIsProcessing(false);
      cancellationTokenRef.current = null;
    }
  }, [transcription, setError, setLoading]);

  const handleCopy = useCallback((text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleCancel = useCallback(() => {
    if (cancellationTokenRef.current) {
      cancellationTokenRef.current.cancel();
    }
  }, []);

  const resetTranscription = () => {
    if (cancellationTokenRef.current) {
      cancellationTokenRef.current.cancel();
    }
    setCurrentStep('upload');
    setAudioData(null);
    setTranscription(null);
    setInsights(null);
    setProgress(null);
    setIsProcessing(false);
    setLoading(false);
  };

  // Not configured guard
  if (!isConfigured) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <Server className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-100 mb-2">Transcription Provider Required</h3>
          <p className="text-slate-400 mb-4">
            Configure a transcription provider in Settings to use this feature.
            <br />
            <span className="text-slate-500 text-sm">
              Supports local WhisperX, OpenAI Cloud, or Google Gemini.
            </span>
          </p>
          <button onClick={() => navigate('/settings')} className="btn-primary">
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  const providerName = transcriptionService.getProvider()?.name || 'Unknown';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">AI Transcription</h1>
        <p className="text-slate-400">
          Upload audio files or record directly to get transcriptions
          {supportsInsights && ' and AI-powered insights'}
          <span className="text-slate-500 text-sm ml-2">
            — using {providerName}
          </span>
        </p>
      </div>

      {/* Step 1: Audio Upload */}
      <div className="card p-6">
        <div className="flex items-center mb-4">
          <FileAudio className="w-6 h-6 text-primary-500 mr-3" />
          <h2 className="text-xl font-semibold text-slate-100">1. Provide Audio</h2>
        </div>

        {!audioData ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-slate-100 mb-4 flex items-center space-x-2">
                <FileAudio className="w-5 h-5" />
                <span>Upload Audio File</span>
              </h3>
              <FileUpload
                onFileSelect={handleFileSelect}
                onError={setError}
                disabled={currentStep === 'transcribing' || currentStep === 'analyzing'}
              />
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-slate-800 text-slate-400">Or</span>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-slate-100 mb-4 flex items-center space-x-2">
                <Mic className="w-5 h-5" />
                <span>Record Audio</span>
              </h3>
              <AudioRecorder
                onRecordingComplete={handleRecordingComplete}
                onError={setError}
                disabled={currentStep === 'transcribing' || currentStep === 'analyzing'}
              />
            </div>
          </div>
        ) : (
          <div className="bg-slate-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-100 font-medium">{audioData.fileName}</p>
                <p className="text-slate-400 text-sm">{audioData.mimeType}</p>
              </div>
              <button
                onClick={resetTranscription}
                className="text-slate-400 hover:text-slate-200"
              >
                Change File
              </button>
            </div>
          </div>
        )}

        {audioData && currentStep === 'upload' && (
          <div className="mt-4">
            <button onClick={handleTranscribe} className="btn-primary w-full">
              <MessageSquare className="w-4 h-4 mr-2" />
              Transcribe Audio
            </button>
          </div>
        )}
      </div>

      {/* Step 2: Transcription */}
      {(currentStep === 'transcribing' || transcription) && (
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <MessageSquare className="w-6 h-6 text-secondary-500 mr-3" />
            <h2 className="text-xl font-semibold text-slate-100">2. Transcription</h2>
          </div>

          {currentStep === 'transcribing' ? (
            <div className="space-y-4">
              {progress && (
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-200">{progress.message}</span>
                    <span className="text-sm text-slate-400">{progress.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-600 rounded-full h-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress.progress}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    Stage: {progress.stage}
                  </div>
                </div>
              )}

              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-slate-400">
                  {progress?.message || 'Transcribing audio...'}
                </p>

                {isProcessing && (
                  <button
                    onClick={handleCancel}
                    className="mt-4 px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors flex items-center space-x-2 mx-auto"
                  >
                    <X className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                )}
              </div>
            </div>
          ) : transcription ? (
            <div className="space-y-4">
              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Transcription Result</span>
                  <button
                    onClick={() => handleCopy(transcription.text, 'transcription')}
                    className="text-slate-400 hover:text-slate-200 flex items-center space-x-1"
                  >
                    {copied === 'transcription' ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-slate-100 leading-relaxed">{transcription.text}</p>
              </div>

              {/* Show "Extract Insights" only if provider supports it */}
              {currentStep === 'transcribed' && supportsInsights && (
                <button onClick={handleAnalyze} className="btn-primary w-full">
                  <Lightbulb className="w-4 h-4 mr-2" />
                  Extract Insights
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Step 3: Insights (only shown when provider supports it) */}
      {supportsInsights && (currentStep === 'analyzing' || insights) && (
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <Lightbulb className="w-6 h-6 text-accent-500 mr-3" />
            <h2 className="text-xl font-semibold text-slate-100">3. AI Insights</h2>
          </div>

          {currentStep === 'analyzing' ? (
            <div className="space-y-4">
              {progress && (
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-200">{progress.message}</span>
                    <span className="text-sm text-slate-400">{progress.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-600 rounded-full h-2">
                    <div
                      className="bg-accent-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress.progress}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    Stage: {progress.stage}
                  </div>
                </div>
              )}

              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-slate-400">
                  {progress?.message || 'Analyzing insights...'}
                </p>

                {isProcessing && (
                  <button
                    onClick={handleCancel}
                    className="mt-4 px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors flex items-center space-x-2 mx-auto"
                  >
                    <X className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                )}
              </div>
            </div>
          ) : insights ? (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-100">Summary</h3>
                  <button
                    onClick={() => handleCopy(insights.summary, 'summary')}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    {copied === 'summary' ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-slate-300 bg-slate-700/50 rounded-lg p-4">{insights.summary}</p>
              </div>

              {insights.keyPoints.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-100 mb-2">Key Points</h3>
                  <ul className="space-y-2">
                    {insights.keyPoints.map((point, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <span className="w-2 h-2 bg-primary-500 rounded-full mt-2 flex-shrink-0"></span>
                        <span className="text-slate-300">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.actionItems.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-100 mb-2">Action Items</h3>
                  <ul className="space-y-2">
                    {insights.actionItems.map((item, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <CheckCircle className="w-4 h-4 text-accent-500 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-300">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="font-semibold text-slate-100 mb-2">Sentiment</h3>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${insights.sentiment === 'Positive'
                  ? 'bg-green-600/20 text-green-400'
                  : insights.sentiment === 'Negative'
                    ? 'bg-red-600/20 text-red-400'
                    : 'bg-slate-600/20 text-slate-400'
                  }`}>
                  {insights.sentiment}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Actions */}
      {(currentStep === 'complete' || (currentStep === 'transcribed' && !supportsInsights)) && (
        <div className="flex items-center space-x-4">
          <button onClick={resetTranscription} className="btn-secondary">
            Start Over
          </button>
          <button className="btn-primary flex items-center space-x-2">
            <Download className="w-4 h-4" />
            <span>Export Results</span>
          </button>
        </div>
      )}
    </div>
  );
};

// ── Utility ─────────────────────────────────────────────────────────────────────

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}
