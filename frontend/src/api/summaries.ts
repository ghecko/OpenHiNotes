import { apiClient } from './client';
import { ReasoningLevel, Summary } from '@/types';

interface CreateSummaryData {
  transcription_id: string;
  template_id?: string;
  custom_prompt?: string;
  reasoning_level?: ReasoningLevel;
}

export const summariesApi = {
  /** Queues the summary and returns it right away (status "pending"). */
  async createSummary(data: CreateSummaryData): Promise<Summary> {
    return apiClient.post<Summary>('/summaries', data);
  },

  async getSummaries(transcriptionId: string): Promise<Summary[]> {
    return apiClient.get<Summary[]>(`/summaries?transcription_id=${transcriptionId}`);
  },

  async getSummary(id: string): Promise<Summary> {
    return apiClient.get<Summary>(`/summaries/${id}`);
  },

  async cancelSummary(id: string): Promise<Summary> {
    return apiClient.post<Summary>(`/summaries/${id}/cancel`, {});
  },

  async retrySummary(id: string): Promise<Summary> {
    return apiClient.post<Summary>(`/summaries/${id}/retry`, {});
  },

  async updateContent(id: string, content: string): Promise<Summary> {
    return apiClient.patch<Summary>(`/summaries/${id}`, { content });
  },

  async deleteSummary(id: string): Promise<void> {
    return apiClient.delete<void>(`/summaries/${id}`);
  },
};
