import { apiClient } from './client';
import { SummaryTemplate } from '@/types';

interface CreateTemplateData {
  name: string;
  description: string;
  prompt_template: string;
  category?: string;
  target_type?: string;
}

interface UpdateTemplateData {
  name?: string;
  description?: string;
  prompt_template?: string;
  category?: string;
  target_type?: string;
  is_active?: boolean;
}

export const templatesApi = {
  async getTemplates(includeInactive = false, targetType?: 'record' | 'whisper'): Promise<SummaryTemplate[]> {
    const params = new URLSearchParams();
    if (includeInactive) params.set('include_inactive', 'true');
    if (targetType) params.set('target_type', targetType);
    const qs = params.toString();
    return apiClient.get<SummaryTemplate[]>(`/templates${qs ? `?${qs}` : ''}`);
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
