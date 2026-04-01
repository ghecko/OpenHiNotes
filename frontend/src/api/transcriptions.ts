import { apiClient } from './client';
import { Transcription, PaginatedResponse } from '@/types';

export interface TranscriptionProgressEvent {
  event: 'progress';
  status: string;
  progress: number;
}

export interface TranscriptionCompleteEvent {
  event: 'complete';
  transcription: Transcription;
}

export interface TranscriptionErrorEvent {
  event: 'error';
  message: string;
}

export type TranscriptionSSEEvent =
  | TranscriptionProgressEvent
  | TranscriptionCompleteEvent
  | TranscriptionErrorEvent;

export const transcriptionsApi = {
  async uploadAndTranscribe(
    file: File,
    language: string = 'auto',
    autoSummarize: boolean = false,
    templateId?: string
  ): Promise<Transcription> {
    const extraFields: Record<string, string> = {
      language,
      auto_summarize: autoSummarize.toString(),
    };

    if (templateId) {
      extraFields.template_id = templateId;
    }

    return apiClient.uploadFile<Transcription>(
      '/transcriptions/upload',
      file,
      extraFields
    );
  },

  /**
   * Upload and transcribe with real-time SSE progress streaming.
   * Calls the /upload-stream endpoint and reads SSE events.
   */
  async uploadAndTranscribeStream(
    file: File,
    language: string = 'auto',
    autoSummarize: boolean = false,
    templateId?: string,
    onProgress?: (status: string, progress: number) => void,
    signal?: AbortSignal,
  ): Promise<Transcription> {
    const formData = new FormData();
    formData.append('file', file);

    const params = new URLSearchParams({ language, auto_summarize: autoSummarize.toString() });
    if (templateId) {
      params.set('template_id', templateId);
    }

    const token = localStorage.getItem('auth_token');
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`/api/transcriptions/upload-stream?${params}`, {
      method: 'POST',
      headers,
      body: formData,
      signal,
    });

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        window.location.href = '/login';
      }
      const error = await response.json().catch(() => ({ message: 'An error occurred' }));
      throw new Error(error.message || error.detail || `HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body for SSE stream');
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;

      // SSE messages are separated by double newlines
      const parts = buffer.split('\n\n');
      // Keep the last (possibly incomplete) chunk in the buffer
      buffer = parts.pop() || '';

      for (const part of parts) {
        // Skip keep-alive comments
        if (part.startsWith(':')) continue;

        const dataLine = part
          .split('\n')
          .find((line) => line.startsWith('data: '));
        if (!dataLine) continue;

        const jsonStr = dataLine.slice('data: '.length);
        let evt: TranscriptionSSEEvent;
        try {
          evt = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        if (evt.event === 'progress') {
          onProgress?.(evt.status, evt.progress);
        } else if (evt.event === 'complete') {
          return evt.transcription;
        } else if (evt.event === 'error') {
          throw new Error(evt.message);
        }
      }
    }

    throw new Error('SSE stream ended without a completion event');
  },

  async getTranscriptions(
    skip: number = 0,
    limit: number = 20
  ): Promise<PaginatedResponse<Transcription>> {
    return apiClient.get<PaginatedResponse<Transcription>>(
      `/transcriptions?skip=${skip}&limit=${limit}`
    );
  },

  async getTranscription(id: string): Promise<Transcription> {
    return apiClient.get<Transcription>(`/transcriptions/${id}`);
  },

  async updateSpeakers(
    id: string,
    speakers: Record<string, string>
  ): Promise<Transcription> {
    return apiClient.patch<Transcription>(`/transcriptions/${id}/speakers`, {
      speakers,
    });
  },

  async updateNotes(id: string, notes: string): Promise<Transcription> {
    return apiClient.patch<Transcription>(`/transcriptions/${id}/notes`, {
      notes,
    });
  },

  async updateTitle(id: string, title: string | null): Promise<Transcription> {
    return apiClient.patch<Transcription>(`/transcriptions/${id}/title`, { title });
  },

  async deleteTranscription(id: string): Promise<void> {
    return apiClient.delete<void>(`/transcriptions/${id}`);
  },

  async checkByFilenames(filenames: string[]): Promise<Record<string, { id: string; status: string; title: string | null }>> {
    if (filenames.length === 0) return {};
    return apiClient.get<Record<string, { id: string; status: string; title: string | null }>>(
      `/transcriptions/by-filenames?filenames=${encodeURIComponent(filenames.join(','))}`
    );
  },
};
