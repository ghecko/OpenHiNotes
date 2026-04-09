import { apiClient } from './client';

export interface VoiceProfile {
  id: string;
  user_id: string;
  label: string;
  embedding_dim: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VoiceProfileListResponse {
  profiles: VoiceProfile[];
  total: number;
}

export const voiceProfilesApi = {
  /** List the current user's voice profiles. */
  async listProfiles(): Promise<VoiceProfileListResponse> {
    return apiClient.get<VoiceProfileListResponse>('/voice-profiles');
  },

  /** Upload a voice sample and create a new profile. */
  async createProfile(file: File | Blob, label: string = 'My voice'): Promise<VoiceProfile> {
    // Use the uploadFile helper for multipart/form-data
    const formData = new FormData();
    formData.append('file', file, file instanceof File ? file.name : 'recording.wav');
    formData.append('label', label);

    const token = localStorage.getItem('auth_token');
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch('/api/voice-profiles', {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'An error occurred' }));
      throw new Error(error.detail || error.message || `HTTP ${response.status}`);
    }

    return response.json();
  },

  /** Delete a specific voice profile. */
  async deleteProfile(profileId: string): Promise<void> {
    await apiClient.delete(`/voice-profiles/${profileId}`);
  },

  /** Delete ALL voice profiles for the current user (GDPR erasure). */
  async deleteAllProfiles(): Promise<void> {
    await apiClient.delete('/voice-profiles');
  },
};
