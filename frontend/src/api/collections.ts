import { apiClient } from './client';
import { Collection, Transcription } from '@/types';

export const collectionsApi = {
  async list(): Promise<Collection[]> {
    return apiClient.get<Collection[]>('/collections');
  },

  async get(id: string): Promise<Collection> {
    return apiClient.get<Collection>(`/collections/${id}`);
  },

  async create(data: { name: string; description?: string }): Promise<Collection> {
    return apiClient.post<Collection>('/collections', data);
  },

  async update(
    id: string,
    data: { name?: string; description?: string },
  ): Promise<Collection> {
    return apiClient.patch<Collection>(`/collections/${id}`, data);
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete(`/collections/${id}`);
  },

  async listTranscriptions(collectionId: string): Promise<Transcription[]> {
    return apiClient.get<Transcription[]>(`/collections/${collectionId}/transcriptions`);
  },

  async assignTranscription(collectionId: string, transcriptionId: string): Promise<void> {
    return apiClient.patch(`/collections/${collectionId}/transcriptions/${transcriptionId}`);
  },

  async removeTranscription(collectionId: string, transcriptionId: string): Promise<void> {
    return apiClient.delete(`/collections/${collectionId}/transcriptions/${transcriptionId}`);
  },
};
