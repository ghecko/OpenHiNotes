import type { TranscriptionResult, InsightData } from '@/types';

// ─── Provider Capabilities ─────────────────────────────────────────────────────

export interface ProviderCapabilities {
  /** Can transcribe audio files to text */
  transcription: boolean;
  /** Can extract insights (summary, sentiment, action items) from text */
  insights: boolean;
}

// ─── Progress & Cancellation ────────────────────────────────────────────────────

export interface TranscriptionProgress {
  stage: 'uploading' | 'processing' | 'analyzing' | 'complete';
  progress: number; // 0-100
  message: string;
}

export interface CancellationToken {
  cancelled: boolean;
  cancel: () => void;
}

export function createCancellationToken(): CancellationToken {
  const token: CancellationToken = {
    cancelled: false,
    cancel: () => {
      token.cancelled = true;
    },
  };
  return token;
}

// ─── Provider Configuration ─────────────────────────────────────────────────────

export type ProviderType = 'whisperx' | 'openai' | 'gemini';

export interface ProviderConfig {
  type: ProviderType;
  /** Display name for the provider */
  name: string;
  /** Base URL for API providers (whisperx, openai) */
  baseUrl?: string;
  /** API key for authenticated providers (openai, gemini) */
  apiKey?: string;
  /** Model identifier (e.g. 'large-v3', 'whisper-1', 'gemini-1.5-flash') */
  model?: string;
}

// ─── Provider Interface ─────────────────────────────────────────────────────────

export interface TranscriptionProvider {
  /** Unique provider type identifier */
  readonly type: ProviderType;

  /** Human-readable name */
  readonly name: string;

  /** What this provider can do */
  readonly capabilities: ProviderCapabilities;

  /** Check if the provider is properly configured and reachable */
  testConnection(): Promise<{ ok: boolean; message: string }>;

  /** Transcribe an audio file */
  transcribeAudio(
    audioFile: File | Blob,
    options: TranscribeOptions,
    onProgress?: (progress: TranscriptionProgress) => void,
    cancellationToken?: CancellationToken,
  ): Promise<TranscriptionResult>;

  /**
   * Extract insights from transcribed text.
   * Only available if capabilities.insights === true.
   * Throws if not supported.
   */
  extractInsights(
    transcriptionText: string,
    onProgress?: (progress: TranscriptionProgress) => void,
    cancellationToken?: CancellationToken,
  ): Promise<InsightData>;
}

// ─── Transcription Options ──────────────────────────────────────────────────────

export interface TranscribeOptions {
  /** Language code (e.g. 'en', 'fr', 'auto') */
  language?: string;
  /** Transcription prompt / context */
  prompt?: string;
  /** Response format (provider-specific) */
  responseFormat?: string;
  /** Original filename for the audio */
  fileName?: string;
}

// ─── Provider Presets ───────────────────────────────────────────────────────────

export const PROVIDER_PRESETS: Record<ProviderType, Omit<ProviderConfig, 'apiKey'>> = {
  whisperx: {
    type: 'whisperx',
    name: 'Local WhisperX',
    baseUrl: 'http://localhost:8000',
    model: 'large-v3',
  },
  openai: {
    type: 'openai',
    name: 'OpenAI Cloud',
    baseUrl: 'https://api.openai.com',
    model: 'whisper-1',
  },
  gemini: {
    type: 'gemini',
    name: 'Google Gemini',
    model: 'gemini-1.5-flash',
  },
};
