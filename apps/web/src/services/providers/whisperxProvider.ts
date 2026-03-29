import type { TranscriptionResult, InsightData } from '@/types';
import type {
  TranscriptionProvider,
  ProviderCapabilities,
  TranscribeOptions,
  TranscriptionProgress,
  CancellationToken,
} from './types';

/**
 * WhisperX Provider — OpenAI-compatible transcription endpoint.
 *
 * Works with any server that implements the OpenAI Audio Transcription API:
 * - whisperx-api-server (https://github.com/Nyralei/whisperx-api-server)
 * - faster-whisper-server
 * - Any OpenAI-compatible local ASR server
 *
 * Sends audio as multipart/form-data to POST {baseUrl}/v1/audio/transcriptions
 */
export class WhisperXProvider implements TranscriptionProvider {
  readonly type = 'whisperx' as const;
  readonly name: string;
  readonly capabilities: ProviderCapabilities = {
    transcription: true,
    insights: false,
  };

  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string, model: string = 'large-v3', name?: string) {
    // Normalize URL — strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
    this.name = name || 'Local WhisperX';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      // Try hitting the OpenAPI docs or a health endpoint
      const urls = [
        `${this.baseUrl}/docs`,
        `${this.baseUrl}/health`,
        `${this.baseUrl}/`,
      ];

      for (const url of urls) {
        try {
          const response = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok || response.status === 404) {
            // 404 is fine — server is running, just doesn't have that route
            return {
              ok: true,
              message: `Connected to server at ${this.baseUrl}`,
            };
          }
        } catch {
          // Try next URL
        }
      }

      return {
        ok: false,
        message: `Could not reach server at ${this.baseUrl}. Make sure it is running.`,
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

    // Build multipart form data
    const formData = new FormData();

    // Determine filename
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
      message: 'Sending audio to transcription server...',
    });

    const abortController = new AbortController();

    // Wire cancellation token to abort controller
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
          body: formData,
          signal: abortController.signal,
        },
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown server error');
        throw new Error(`Transcription server error (${response.status}): ${errorText}`);
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
        // OpenAI-compatible response: { text: "...", segments: [...], ... }
        text = json.text || '';
      } else {
        // Plain text response
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
      'Insight extraction is not supported by the WhisperX provider. ' +
      'Use a provider with LLM capabilities (e.g., Gemini) for insights.',
    );
  }
}
