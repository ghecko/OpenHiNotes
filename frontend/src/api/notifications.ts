import { apiClient } from './client';
import { AppNotification, NotificationCount } from '@/types';

export interface NotificationPreferences {
  notify_on_completion: boolean;
  notify_email_on_completion: boolean;
}

export const notificationsApi = {
  async list(options: { unreadOnly?: boolean; limit?: number } = {}): Promise<AppNotification[]> {
    const params = new URLSearchParams();
    if (options.unreadOnly) params.set('unread_only', 'true');
    if (options.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    return apiClient.get<AppNotification[]>(`/notifications${qs ? `?${qs}` : ''}`);
  },

  async count(): Promise<NotificationCount> {
    return apiClient.get<NotificationCount>('/notifications/count');
  },

  async markRead(id: string): Promise<AppNotification> {
    return apiClient.post<AppNotification>(`/notifications/${id}/read`, {});
  },

  async markAllRead(): Promise<void> {
    return apiClient.post<void>('/notifications/read-all', {});
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/notifications/${id}`);
  },

  // Phase 6.5 — per-user transcription-complete preferences.
  async getPreferences(): Promise<NotificationPreferences> {
    return apiClient.get<NotificationPreferences>('/users/me/preferences/notifications');
  },

  async updatePreferences(prefs: NotificationPreferences): Promise<NotificationPreferences> {
    return apiClient.put<NotificationPreferences>('/users/me/preferences/notifications', prefs);
  },
};
