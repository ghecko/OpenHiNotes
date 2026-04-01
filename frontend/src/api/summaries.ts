import { apiClient } from './client';
import { Summary } from '@/types';

interface CreateSummaryData {
  transcription_id: string;
  template_id?: string;
  custom_prompt?: string;
}

export const summariesApi = {
  async createSummary(data: CreateSummaryData): Promise<Summary> {
    return apiClient.post<Summary>('/summaries', data);
  },

  async getSummaries(transcriptionId: string): Promise<Summary[]> {
    return apiClient.get<Summary[]>(`/summaries?transcription_id=${transcriptionId}`);
  },

  async deleteSummary(id: string): Promise<void> {
    return apiClient.delete<void>(`/summaries/${id}`);
  },
};
