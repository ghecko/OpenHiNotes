import { apiClient } from './client';
import { SummaryTemplate } from '@/types';

interface CreateTemplateData {
  name: string;
  description: string;
  prompt_template: string;
  category?: string;
}

interface UpdateTemplateData {
  name?: string;
  description?: string;
  prompt_template?: string;
  category?: string;
  is_active?: boolean;
}

export const templatesApi = {
  async getTemplates(includeInactive = false): Promise<SummaryTemplate[]> {
    const params = includeInactive ? '?include_inactive=true' : '';
    return apiClient.get<SummaryTemplate[]>(`/templates${params}`);
  },

  async createTemplate(data: CreateTemplateData): Promise<SummaryTemplate> {
    return apiClient.post<SummaryTemplate>('/templates', data);
  },

  async updateTemplate(id: string, data: UpdateTemplateData): Promise<SummaryTemplate> {
    return apiClient.patch<SummaryTemplate>(`/templates/${id}`, data);
  },

  async toggleTemplate(id: string): Promise<SummaryTemplate> {
    return apiClient.patch<SummaryTemplate>(`/templates/${id}/toggle`, {});
  },

  async deleteTemplate(id: string): Promise<void> {
    return apiClient.delete<void>(`/templates/${id}`);
  },
};
