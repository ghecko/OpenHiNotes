import { apiClient } from './client';
import { ResourceShare, SharedWithMeItem } from '@/types';

export const sharesApi = {
  async create(data: {
    resource_type: 'transcription' | 'collection';
    resource_id: string;
    grantee_type: 'user' | 'group';
    grantee_id: string;
    permission: 'read' | 'write';
  }): Promise<ResourceShare> {
    return apiClient.post<ResourceShare>('/shares', data);
  },

  async listForResource(
    resourceType: 'transcription' | 'collection',
    resourceId: string,
  ): Promise<ResourceShare[]> {
    return apiClient.get<ResourceShare[]>(`/shares/resource/${resourceType}/${resourceId}`);
  },

  async update(shareId: string, permission: 'read' | 'write'): Promise<ResourceShare> {
    return apiClient.patch<ResourceShare>(`/shares/${shareId}`, { permission });
  },

  async delete(shareId: string): Promise<void> {
    return apiClient.delete(`/shares/${shareId}`);
  },

  async sharedWithMe(): Promise<SharedWithMeItem[]> {
    return apiClient.get<SharedWithMeItem[]>('/shares/shared-with-me');
  },
};
