import { apiClient } from './client';

/** A correctly spelled term, with the mis-transcriptions seen so far. */
export interface GlossaryTerm {
  id: string;
  user_id: string;
  /** null = the user's general vocabulary */
  collection_id: string | null;
  term: string;
  aliases: string[];
  created_at: string;
  updated_at: string;
}

export const glossaryApi = {
  /** General vocabulary of the current user, or the vocabulary of a collection. */
  async list(collectionId?: string | null): Promise<GlossaryTerm[]> {
    const query = collectionId ? `?collection_id=${encodeURIComponent(collectionId)}` : '';
    return apiClient.get<GlossaryTerm[]>(`/glossary${query}`);
  },

  /** Add a term; aliases are merged into an existing term with the same spelling. */
  async add(data: { term: string; aliases?: string[]; collection_id?: string | null }): Promise<GlossaryTerm> {
    return apiClient.post<GlossaryTerm>('/glossary', data);
  },

  async update(id: string, data: { term?: string; aliases?: string[] }): Promise<GlossaryTerm> {
    return apiClient.patch<GlossaryTerm>(`/glossary/${id}`, data);
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete(`/glossary/${id}`);
  },
};
