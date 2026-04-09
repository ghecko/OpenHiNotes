import { apiClient } from './client';
import { User, AuthTokens, RegisterResult, RegistrationSettings } from '@/types';

export const authApi = {
  async login(email: string, password: string): Promise<AuthTokens> {
    return apiClient.post<AuthTokens>('/auth/login', { email, password });
  },

  async register(
    email: string,
    password: string,
    display_name?: string
  ): Promise<RegisterResult> {
    return apiClient.post<RegisterResult>('/auth/register', {
      email,
      password,
      display_name,
    });
  },

  async getMe(): Promise<User> {
    return apiClient.get<User>('/auth/me');
  },

  async getRegistrationSettings(): Promise<RegistrationSettings> {
    return apiClient.get<RegistrationSettings>('/auth/registration-settings');
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  async checkEmailConfigured(): Promise<{ email_configured: boolean }> {
    return apiClient.get<{ email_configured: boolean }>('/auth/email-configured');
  },

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/auth/request-password-reset', { email });
  },

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/auth/reset-password', {
      token,
      new_password: newPassword,
    });
  },
};
