import { apiClient } from './client';
import { Transcription, PaginatedResponse, QueueStatus, QueueSSEEvent } from '@/types';

export interface TranscriptionProgressEvent {
  event: 'progress';
  status: string;
  progress: number;
  stage: 'loading' | 'vad' | 'transcribing' | null;
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
    onProgress?: (status: string, progress: number, stage: 'loading' | 'vad' | 'transcribing' | null) => void,
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
          onProgress?.(evt.status, evt.progress, evt.stage);
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
    limit: number = 20,
    sort: 'newest' | 'oldest' = 'newest',
    filter: 'all' | 'mine' | 'shared' = 'all',
  ): Promise<PaginatedResponse<Transcription>> {
    return apiClient.get<PaginatedResponse<Transcription>>(
      `/transcriptions?skip=${skip}&limit=${limit}&sort=${sort}&filter=${filter}`
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

  async reassignSegmentSpeaker(
    id: string,
    segmentIndices: number[],
    newSpeaker: string,
  ): Promise<Transcription> {
    return apiClient.patch<Transcription>(`/transcriptions/${id}/segments/reassign-speaker`, {
      segment_indices: segmentIndices,
      new_speaker: newSpeaker,
    });
  },

  async updateSegmentText(
    id: string,
    segmentIndex: number,
    text: string,
  ): Promise<Transcription> {
    return apiClient.patch<Transcription>(`/transcriptions/${id}/segments/update-text`, {
      segment_index: segmentIndex,
      text,
    });
  },

  async findAndReplace(
    id: string,
    find: string,
    replace: string,
    caseSensitive: boolean = false,
  ): Promise<Transcription> {
    return apiClient.patch<Transcription>(`/transcriptions/${id}/find-replace`, {
      find,
      replace,
      case_sensitive: caseSensitive,
    });
  },

  async deleteTranscription(id: string): Promise<void> {
    return apiClient.delete<void>(`/transcriptions/${id}`);
  },

  async checkByFilenames(filenames: string[]): Promise<Record<string, { id: string; status: string; title: string | null; keep_audio: boolean; audio_available: boolean }>> {
    if (filenames.length === 0) return {};
    return apiClient.get<Record<string, { id: string; status: string; title: string | null; keep_audio: boolean; audio_available: boolean }>>(
      `/transcriptions/by-filenames?filenames=${encodeURIComponent(filenames.join(','))}`
    );
  },

  // ── Queue endpoints ──

  async queueTranscription(
    file: File,
    language: string = 'auto',
    keepAudio: boolean = false,
    autoSummarize: boolean = false,
    templateId?: string
  ): Promise<Transcription> {
    const extraFields: Record<string, string> = {
      language,
      keep_audio: keepAudio.toString(),
      auto_summarize: autoSummarize.toString(),
    };
    if (templateId) {
      extraFields.template_id = templateId;
    }
    return apiClient.uploadFile<Transcription>(
      '/transcriptions/queue',
      file,
      extraFields
    );
  },

  async getAudioBlobUrl(transcriptionId: string): Promise<string> {
    const token = localStorage.getItem('auth_token');
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`/api/transcriptions/audio/${transcriptionId}`, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },

  async toggleKeepAudio(id: string, keepAudio: boolean): Promise<Transcription> {
    return apiClient.patch<Transcription>(
      `/transcriptions/keep-audio/${id}?keep_audio=${keepAudio}`
    );
  },

  async getQueueStatus(): Promise<QueueStatus> {
    return apiClient.get<QueueStatus>('/transcriptions/queue/status');
  },

  async getMyQueueItems(): Promise<Transcription[]> {
    return apiClient.get<Transcription[]>('/transcriptions/queue/my');
  },

  async cancelTranscription(id: string): Promise<void> {
    await apiClient.post(`/transcriptions/queue/cancel/${id}`);
  },

  async getVoxhubQueueInfo(): Promise<{ pending: number; processing: number; total: number; jobs_ahead: number }> {
    return apiClient.get('/transcriptions/queue/voxhub-info');
  },

  /**
   * Subscribe to real-time SSE updates for a queued/processing transcription.
   * Returns an abort function to stop listening.
   */
  streamQueueStatus(
    transcriptionId: string,
    onEvent: (event: QueueSSEEvent) => void,
    onError?: (error: Error) => void,
  ): () => void {
    const token = localStorage.getItem('auth_token');
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const abortController = new AbortController();

    (async () => {
      try {
        const response = await fetch(`/api/transcriptions/queue/stream/${transcriptionId}`, {
          headers,
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
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
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            if (part.startsWith(':')) continue;

            const dataLine = part.split('\n').find((line) => line.startsWith('data: '));
            if (!dataLine) continue;

            const jsonStr = dataLine.slice('data: '.length);
            try {
              const evt: QueueSSEEvent = JSON.parse(jsonStr);
              onEvent(evt);
            } catch {
              continue;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          onError?.(err as Error);
        }
      }
    })();

    return () => abortController.abort();
  },
};
