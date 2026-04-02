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
};
