import { apiClient } from './client';
import { RecordingType, TranscriptionStatus } from '@/types';

export interface SearchHit {
  transcription_id: string;
  title: string | null;
  original_filename: string;
  recording_type: RecordingType;
  status: TranscriptionStatus;
  snippet: string | null;
  rank: number;
  is_pinned: boolean;
  created_at: string;
}

export interface SearchResponse {
  items: SearchHit[];
  total: number;
  query: string;
}

export const searchApi = {
  async searchTranscriptions(
    q: string,
    options: {
      limit?: number;
      skip?: number;
      recordingType?: RecordingType;
    } = {},
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({ q });
    if (options.limit) params.set('limit', String(options.limit));
    if (options.skip) params.set('skip', String(options.skip));
    if (options.recordingType) params.set('recording_type', options.recordingType);
    return apiClient.get<SearchResponse>(`/search/transcriptions?${params}`);
  },
};
