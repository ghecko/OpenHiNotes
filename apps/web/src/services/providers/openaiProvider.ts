import type { TranscriptionResult, InsightData } from '@/types';
import type {
  TranscriptionProvider,
  ProviderCapabilities,
  TranscribeOptions,
  TranscriptionProgress,
  CancellationToken,
} from './types';

/**
 * OpenAI Cloud Provider — uses the official OpenAI Audio Transcription API.
 *
 * Identical wire format to WhisperX but with Bearer token authentication
 * and the official OpenAI endpoint.
 */
export class OpenAIProvider implements TranscriptionProvider {
  readonly type = 'openai' as const;
  readonly name: string;
  readonly capabilities: ProviderCapabilities = {
    transcription: true,
    insights: false,
  };

  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'whisper-1', baseUrl?: string, name?: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = (baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
    this.name = name || 'OpenAI Cloud';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      // OpenAI doesn't have a dedicated health endpoint, so we check the models list
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        return { ok: true, message: 'Connected to OpenAI API successfully.' };
      }

      if (response.status === 401) {
        return { ok: false, message: 'Invalid API key. Please check your OpenAI API key.' };
      }

      return {
        ok: false,
        message: `OpenAI API returned status ${response.status}.`,
      };
    } catch (error) {
      return {
        ok: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async transcribeAudio(
    audioFile: File | Blob,
    options: TranscribeOptions,
    onProgress?: (progress: TranscriptionProgress) => void,
    cancellationToken?: CancellationToken,
  ): Promise<TranscriptionResult> {
    if (cancellationToken?.cancelled) {
      throw new Error('Operation cancelled');
    }

    onProgress?.({
      stage: 'uploading',
      progress: 10,
      message: 'Preparing audio for upload...',
    });

    const formData = new FormData();
    const fileName = options.fileName
      || (audioFile instanceof File ? audioFile.name : 'recording.wav');
    formData.append('file', audioFile, fileName);
    formData.append('model', this.model);
    formData.append('response_format', options.responseFormat || 'verbose_json');

    if (options.language && options.language !== 'auto') {
      formData.append('language', options.language);
    }
    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }

    if (cancellationToken?.cancelled) {
      throw new Error('Operation cancelled');
    }

    onProgress?.({
      stage: 'processing',
      progress: 30,
      message: 'Sending audio to OpenAI...',
    });

    const abortController = new AbortController();
    if (cancellationToken) {
      const originalCancel = cancellationToken.cancel;
      cancellationToken.cancel = () => {
        originalCancel();
        abortController.abort();
      };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/v1/audio/transcriptions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: formData,
          signal: abortController.signal,
        },
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      onProgress?.({
        stage: 'processing',
        progress: 80,
        message: 'Processing transcription result...',
      });

      const contentType = response.headers.get('content-type') || '';
      let text: string;

      if (contentType.includes('application/json')) {
        const json = await response.json();
        text = json.text || '';
      } else {
        text = await response.text();
      }

      onProgress?.({
        stage: 'complete',
        progress: 100,
        message: 'Transcription complete!',
      });

      return {
        text: text.trim(),
        language: options.language || 'auto-detected',
        timestamp: new Date(),
      };
    } catch (error) {
      if (cancellationToken?.cancelled || (error instanceof Error && error.name === 'AbortError')) {
        throw new Error('Transcription cancelled');
      }
      throw new Error(
        `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async extractInsights(): Promise<InsightData> {
    throw new Error(
      'Insight extraction is not supported by the OpenAI Whisper provider. ' +
      'Use a provider with LLM capabilities (e.g., Gemini) for insights.',
    );
  }
}
