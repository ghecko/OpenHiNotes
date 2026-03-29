export type { TranscriptionProvider, ProviderConfig, ProviderType, ProviderCapabilities, TranscriptionProgress, CancellationToken, TranscribeOptions } from './types';
export { PROVIDER_PRESETS, createCancellationToken } from './types';

export { WhisperXProvider } from './whisperxProvider';
export { OpenAIProvider } from './openaiProvider';
export { GeminiProvider } from './geminiProvider';

import type { ProviderConfig, TranscriptionProvider } from './types';
import { WhisperXProvider } from './whisperxProvider';
import { OpenAIProvider } from './openaiProvider';
import { GeminiProvider } from './geminiProvider';

/**
 * Factory: create a provider instance from configuration.
 */
export function createProvider(config: ProviderConfig): TranscriptionProvider {
  switch (config.type) {
    case 'whisperx':
      if (!config.baseUrl) {
        throw new Error('Server URL is required for WhisperX provider.');
      }
      return new WhisperXProvider(config.baseUrl, config.model, config.name);

    case 'openai':
      if (!config.apiKey) {
        throw new Error('API key is required for OpenAI provider.');
      }
      return new OpenAIProvider(config.apiKey, config.model, config.baseUrl, config.name);

    case 'gemini':
      if (!config.apiKey) {
        throw new Error('API key is required for Gemini provider.');
      }
      return new GeminiProvider(config.apiKey, config.model, config.name);

    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}
