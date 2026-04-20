import { apiClient } from './client';
import { AppNotification, NotificationCount } from '@/types';

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
};
