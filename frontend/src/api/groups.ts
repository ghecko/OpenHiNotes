import { apiClient } from './client';
import { UserGroup, UserGroupDetail } from '@/types';

export const groupsApi = {
  async list(): Promise<UserGroup[]> {
    return apiClient.get<UserGroup[]>('/groups');
  },

  async get(id: string): Promise<UserGroupDetail> {
    return apiClient.get<UserGroupDetail>(`/groups/${id}`);
  },

  async create(data: { name: string; description?: string }): Promise<UserGroup> {
    return apiClient.post<UserGroup>('/groups', data);
  },

  async update(id: string, data: { name?: string; description?: string }): Promise<UserGroup> {
    return apiClient.patch<UserGroup>(`/groups/${id}`, data);
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete(`/groups/${id}`);
  },

  async addMember(groupId: string, userId: string): Promise<UserGroupDetail> {
    return apiClient.post<UserGroupDetail>(`/groups/${groupId}/members`, { user_id: userId });
  },

  async removeMember(groupId: string, userId: string): Promise<void> {
    return apiClient.delete(`/groups/${groupId}/members/${userId}`);
  },
};
