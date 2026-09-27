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

export type ConnectionService = 'llm' | 'voxhub';

export interface ConnectionTestResult {
  service: ConnectionService;
  ok: boolean;
  url: string;
  latency_ms: number | null;
  model: string;
  models: string[];
  /** true/false when the configured model could be checked against the list, null otherwise */
  model_found: boolean | null;
  error: string | null;
  hint: string | null;
  details: { loaded?: string[]; models_error?: string; [k: string]: unknown };
}

export interface ConnectionTestOverrides {
  api_url?: string;
  api_key?: string;
  model?: string;
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

  /** Probe VoxHub or the LLM from the backend and list the models it exposes. */
  async testConnection(
    service: ConnectionService,
    overrides: ConnectionTestOverrides = {},
  ): Promise<ConnectionTestResult> {
    return apiClient.post<ConnectionTestResult>(`/settings/test/${service}`, overrides);
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
