import type { TranscriptionResult, InsightData } from '@/types';
import {
  createProvider,
  createCancellationToken,
  type TranscriptionProvider,
  type ProviderConfig,
  type TranscriptionProgress,
  type CancellationToken,
  type TranscribeOptions,
} from './providers';

/**
 * TranscriptionService — orchestrator that delegates to the active provider.
 *
 * Usage:
 *   transcriptionService.initialize({ type: 'whisperx', baseUrl: '...', model: '...' });
 *   const result = await transcriptionService.transcribe(file, { language: 'en' });
 */
class TranscriptionService {
  private provider: TranscriptionProvider | null = null;
  private config: ProviderConfig | null = null;

  /**
   * Initialize (or re-initialize) the service with a provider configuration.
   */
  initialize(config: ProviderConfig): void {
    this.config = config;
    this.provider = createProvider(config);
  }

  /**
   * Whether a provider has been configured.
   */
  isInitialized(): boolean {
    return this.provider !== null;
  }

  /**
   * Get the active provider (or null).
   */
  getProvider(): TranscriptionProvider | null {
    return this.provider;
  }

  /**
   * Get the current configuration.
   */
  getConfig(): ProviderConfig | null {
    return this.config;
  }

  /**
   * Whether the active provider supports insight extraction.
   */
  supportsInsights(): boolean {
    return this.provider?.capabilities.insights ?? false;
  }

  /**
   * Create a cancellation token for in-flight operations.
   */
  createCancellationToken(): CancellationToken {
    return createCancellationToken();
  }

  /**
   * Test the connection to the configured provider.
   */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.provider) {
      return { ok: false, message: 'No provider configured.' };
    }
    return this.provider.testConnection();
  }

  /**
   * Transcribe an audio file using the active provider.
   */
  async transcribe(
    audioFile: File | Blob,
    options: TranscribeOptions = {},
    onProgress?: (progress: TranscriptionProgress) => void,
    cancellationToken?: CancellationToken,
  ): Promise<TranscriptionResult> {
    if (!this.provider) {
      throw new Error('Transcription service not initialized. Configure a provider in Settings.');
    }
    return this.provider.transcribeAudio(audioFile, options, onProgress, cancellationToken);
  }

  /**
   * Extract insights from transcribed text.
   * Only works with providers that have insights capability.
   */
  async extractInsights(
    transcriptionText: string,
    onProgress?: (progress: TranscriptionProgress) => void,
    cancellationToken?: CancellationToken,
  ): Promise<InsightData> {
    if (!this.provider) {
      throw new Error('Transcription service not initialized.');
    }
    if (!this.provider.capabilities.insights) {
      throw new Error(
        `The ${this.provider.name} provider does not support insight extraction. ` +
        'Switch to a provider with LLM capabilities (e.g., Gemini).',
      );
    }
    return this.provider.extractInsights(transcriptionText, onProgress, cancellationToken);
  }
}

// Singleton instance
export const transcriptionService = new TranscriptionService();
