import { apiClient } from './client';

export interface ChatConversationMessage {
  role: string;
  content: string;
}

export interface ChatConversation {
  id: string;
  transcription_id: string | null;
  user_id: string;
  title: string;
  messages: ChatConversationMessage[];
  created_at: string;
  updated_at: string;
}

export interface ChatConversationListItem {
  id: string;
  transcription_id: string | null;
  user_id: string;
  title: string;
  transcription_name: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateConversationData {
  transcription_id?: string;
  title: string;
  messages: ChatConversationMessage[];
}

interface UpdateConversationData {
  title?: string;
  messages?: ChatConversationMessage[];
}

export const chatConversationsApi = {
  async create(data: CreateConversationData): Promise<ChatConversation> {
    return apiClient.post<ChatConversation>('/chat-conversations', data);
  },

  async list(transcriptionId?: string, collectionId?: string): Promise<ChatConversationListItem[]> {
    const parts: string[] = [];
    if (transcriptionId) parts.push(`transcription_id=${transcriptionId}`);
    if (collectionId) parts.push(`collection_id=${collectionId}`);
    const params = parts.length ? `?${parts.join('&')}` : '';
    return apiClient.get<ChatConversationListItem[]>(`/chat-conversations${params}`);
  },

  async get(id: string): Promise<ChatConversation> {
    return apiClient.get<ChatConversation>(`/chat-conversations/${id}`);
  },

  async update(id: string, data: UpdateConversationData): Promise<ChatConversation> {
    return apiClient.put<ChatConversation>(`/chat-conversations/${id}`, data);
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/chat-conversations/${id}`);
  },
};
