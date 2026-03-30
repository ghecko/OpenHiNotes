import { apiClient } from './client';
import { ChatMessage } from '@/types';

interface ChatRequest {
  messages: ChatMessage[];
  transcription_id?: string;
}

async function* sseIterator(
  stream: ReadableStream<string>,
): AsyncGenerator<string, void, unknown> {
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

        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              yield parsed.content;
            }
          } catch {
            // skip unparseable SSE frames
          }
        }
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
  ): Promise<ReadableStream<string>> {
    const body: ChatRequest = { messages };
    if (transcriptionId) {
      body.transcription_id = transcriptionId;
    }
    return apiClient.streamPost('/chat', body);
  },

  parseSSEStream(stream: ReadableStream<string>): AsyncGenerator<string, void, unknown> {
    return sseIterator(stream);
  },
};
