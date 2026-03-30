import { apiClient } from './client';

export interface AppSetting {
  key: string;
  value: string;
  description: string | null;
  source: string;
}

export interface SettingsResponse {
  settings: AppSetting[];
}

export const settingsApi = {
  async getSettings(): Promise<AppSetting[]> {
    const response = await apiClient.get<SettingsResponse>('/settings');
    return response.settings;
  },

  async updateSetting(key: string, value: string): Promise<void> {
    await apiClient.put(`/settings/${key}`, { value });
  },

  async resetSetting(key: string): Promise<void> {
    await apiClient.delete(`/settings/${key}`);
  },
};
