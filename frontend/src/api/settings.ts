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

export interface AudioSettings {
  keep_audio_enabled: boolean;
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

  async getAudioSettings(): Promise<AudioSettings> {
    return apiClient.get<AudioSettings>('/settings/audio');
  },

  async updateAudioSettings(keepAudioEnabled: boolean): Promise<AudioSettings> {
    return apiClient.put<AudioSettings>('/settings/audio', { keep_audio_enabled: keepAudioEnabled });
  },

  async getGroupsSettings(): Promise<{ allow_user_group_creation: boolean }> {
    return apiClient.get('/settings/groups');
  },

  async updateGroupsSettings(allowUserGroupCreation: boolean): Promise<{ allow_user_group_creation: boolean }> {
    return apiClient.put('/settings/groups', { allow_user_group_creation: allowUserGroupCreation });
  },
};
