import { apiClient } from './client';
import { OIDCProviderDetail, OIDCDiscoveryTestResult } from '@/types';

export interface OIDCProviderCreatePayload {
  display_name: string;
  slug?: string;
  icon?: string;
  discovery_url: string;
  client_id: string;
  client_secret: string;
  scopes?: string;
  auto_provision?: boolean;
  default_role?: string;
  allowed_domains?: string;
  require_approval?: boolean;
  email_claim?: string;
  name_claim?: string;
  is_enabled?: boolean;
}

export interface OIDCProviderUpdatePayload {
  display_name?: string;
  icon?: string;
  discovery_url?: string;
  client_id?: string;
  client_secret?: string;
  scopes?: string;
  auto_provision?: boolean;
  default_role?: string;
  allowed_domains?: string;
  require_approval?: boolean;
  email_claim?: string;
  name_claim?: string;
  is_enabled?: boolean;
}

export const oidcAdminApi = {
  async listProviders(): Promise<OIDCProviderDetail[]> {
    return apiClient.get<OIDCProviderDetail[]>('/settings/oidc/providers');
  },

  async getProvider(id: string): Promise<OIDCProviderDetail> {
    return apiClient.get<OIDCProviderDetail>(`/settings/oidc/providers/${id}`);
  },

  async createProvider(data: OIDCProviderCreatePayload): Promise<OIDCProviderDetail> {
    return apiClient.post<OIDCProviderDetail>('/settings/oidc/providers', data);
  },

  async updateProvider(id: string, data: OIDCProviderUpdatePayload): Promise<OIDCProviderDetail> {
    return apiClient.put<OIDCProviderDetail>(`/settings/oidc/providers/${id}`, data);
  },

  async deleteProvider(id: string): Promise<void> {
    return apiClient.delete(`/settings/oidc/providers/${id}`);
  },

  async testDiscovery(discoveryUrl: string): Promise<OIDCDiscoveryTestResult> {
    return apiClient.post<OIDCDiscoveryTestResult>(
      `/settings/oidc/test-discovery?discovery_url=${encodeURIComponent(discoveryUrl)}`
    );
  },
};
