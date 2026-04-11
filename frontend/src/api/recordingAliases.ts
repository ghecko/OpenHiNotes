import { apiClient } from './client';

export const recordingAliasesApi = {
  /** Fetch all recording aliases for the current user from the server. */
  async getAll(): Promise<Record<string, string>> {
    return apiClient.get<Record<string, string>>('/users/me/recording-aliases');
  },

  /** Replace the entire aliases map on the server. */
  async saveAll(aliases: Record<string, string>): Promise<Record<string, string>> {
    return apiClient.put<Record<string, string>>('/users/me/recording-aliases', aliases);
  },
};
