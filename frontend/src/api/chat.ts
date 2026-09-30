import { apiClient } from './client';
import { ChatContext, ChatEvent, ChatMessage, ReasoningLevel } from '@/types';

interface ChatRequest {
  messages: ChatMessage[];
  transcription_id?: string;
  transcription_ids?: string[];
  collection_id?: string;
  reasoning_level?: ReasoningLevel;
  context?: ChatContext;
}

export interface ChatSendOptions {
  collectionId?: string;
  transcriptionIds?: string[];
  /** Thinking level for this reply; omitted or 'default' = admin default. */
  reasoningLevel?: ReasoningLevel;
  /** Transcript / summaries selection (single-transcription chat only). */
  context?: ChatContext;
  /** Abort the request (Stop button). */
  signal?: AbortSignal;
}

/**
 * Parse the chat SSE stream into typed events. Ends on `[DONE]`, after an
 * `error` event, or when the stream closes.
 */
async function* sseEvents(stream: ReadableStream<string>): AsyncGenerator<ChatEvent, void, unknown> {
  const reader = stream.getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split('\n');

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;

        let parsed: ChatEvent;
        try {
          parsed = JSON.parse(data) as ChatEvent;
        } catch {
          continue; // skip unparseable SSE frames
        }
        yield parsed;
        if ('error' in parsed) return;
      }

      buffer = lines[lines.length - 1];
    }
  } finally {
    reader.releaseLock();
  }
}

export const chatApi = {
  async sendChatMessage(
    messages: ChatMessage[],
    transcriptionId?: string,
    opts: ChatSendOptions = {},
  ): Promise<ReadableStream<string>> {
    const body: ChatRequest = { messages };
    if (transcriptionId) {
      body.transcription_id = transcriptionId;
    }
    if (opts.collectionId) {
      body.collection_id = opts.collectionId;
    }
    if (opts.transcriptionIds?.length) {
      body.transcription_ids = opts.transcriptionIds;
    }
    if (opts.reasoningLevel && opts.reasoningLevel !== 'default') {
      body.reasoning_level = opts.reasoningLevel;
    }
    if (opts.context) {
      body.context = opts.context;
    }
    return apiClient.streamPost('/chat', body, opts.signal);
  },

  parseSSEStream(stream: ReadableStream<string>): AsyncGenerator<ChatEvent, void, unknown> {
    return sseEvents(stream);
  },
};
