import { apiClient } from './client';
import { SummaryTemplate, TemplateTargetType, TemplateVisibility } from '@/types';

interface CreateTemplateData {
  name: string;
  description: string;
  prompt_template: string;
  category?: string;
  target_type?: TemplateTargetType;
}

interface UpdateTemplateData {
  name?: string;
  description?: string;
  prompt_template?: string;
  category?: string;
  target_type?: TemplateTargetType;
  is_active?: boolean;
}

interface ListTemplatesOptions {
  includeInactive?: boolean;
  targetType?: 'record' | 'whisper';
  visibility?: TemplateVisibility;
  mine?: boolean;
}

export const templatesApi = {
  async getTemplates(options: ListTemplatesOptions = {}): Promise<SummaryTemplate[]> {
    const params = new URLSearchParams();
    if (options.includeInactive) params.set('include_inactive', 'true');
    if (options.targetType) params.set('target_type', options.targetType);
    if (options.visibility) params.set('visibility', options.visibility);
    if (options.mine) params.set('mine', 'true');
    const qs = params.toString();
    return apiClient.get<SummaryTemplate[]>(`/templates${qs ? `?${qs}` : ''}`);
  },

  async getPendingReview(): Promise<SummaryTemplate[]> {
    return apiClient.get<SummaryTemplate[]>('/templates/pending-review');
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

  async submitForReview(id: string): Promise<SummaryTemplate> {
    return apiClient.post<SummaryTemplate>(`/templates/${id}/submit`, {});
  },

  async approveTemplate(id: string): Promise<SummaryTemplate> {
    return apiClient.post<SummaryTemplate>(`/templates/${id}/approve`, {});
  },

  async rejectTemplate(id: string, feedback?: string): Promise<SummaryTemplate> {
    return apiClient.post<SummaryTemplate>(`/templates/${id}/reject`, { feedback: feedback ?? null });
  },
};
