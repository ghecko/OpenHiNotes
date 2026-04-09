import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@/types';
import { authApi } from '@/api/auth';
import { apiClient } from '@/api/client';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  /** Set after registration when account needs admin approval */
  pendingMessage: string | null;
  /** Set when user must change password before proceeding */
  forcePasswordReset: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, display_name?: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  initialize: () => Promise<void>;
  clearError: () => void;
  clearPendingMessage: () => void;
  clearForcePasswordReset: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      pendingMessage: null,
      forcePasswordReset: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null, forcePasswordReset: false });
        try {
          const tokens = await authApi.login(email, password);
          apiClient.setToken(tokens.access_token);
          set({ token: tokens.access_token });

          // Check if user must change password
          if (tokens.force_password_reset) {
            const user = await authApi.getMe();
            set({
              user,
              isAuthenticated: true,
              isLoading: false,
              forcePasswordReset: true,
            });
            return;
          }

          const user = await authApi.getMe();
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Login failed';
          set({
            error: message,
            isLoading: false,
          });
          throw error;
        }
      },

      register: async (email: string, password: string, display_name?: string) => {
        set({ isLoading: true, error: null, pendingMessage: null });
        try {
          const result = await authApi.register(email, password, display_name);
          // If account is pending approval, don't auto-login
          if (result.user.status === 'pending') {
            set({
              pendingMessage: result.message || 'Your account is pending admin approval.',
              isLoading: false,
            });
            return;
          }
          // Active account — proceed with auto-login
          await get().login(email, password);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Registration failed';
          set({
            error: message,
            isLoading: false,
          });
          throw error;
        }
      },

      logout: () => {
        apiClient.clearToken();
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
          pendingMessage: null,
          forcePasswordReset: false,
        });
      },

      loadUser: async () => {
        const token = get().token;
        if (!token) return;

        set({ isLoading: true });
        try {
          const user = await authApi.getMe();
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            forcePasswordReset: user.force_password_reset || false,
          });
        } catch (error) {
          get().logout();
          set({ isLoading: false });
        }
      },

      initialize: async () => {
        const token = localStorage.getItem('auth_token') || get().token;
        if (token) {
          apiClient.setToken(token);
          localStorage.setItem('auth_token', token);
          set({ token });
          await get().loadUser();
        } else {
          set({ isLoading: false });
        }
      },

      clearError: () => {
        set({ error: null });
      },

      clearPendingMessage: () => {
        set({ pendingMessage: null });
      },

      clearForcePasswordReset: () => {
        set({ forcePasswordReset: false });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
      }),
    }
  )
);
