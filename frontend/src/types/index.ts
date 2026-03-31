export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

export type TranscriptionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface Transcription {
  id: string;
  user_id: string;
  filename: string;
  original_filename: string;
  title: string | null;
  audio_duration: number | null;
  language: string;
  text: string;
  segments: TranscriptionSegment[];
  speakers: Record<string, string>;
  status: TranscriptionStatus;
  error_message: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SummaryTemplate {
  id: string;
  name: string;
  description: string;
  prompt_template: string;
  is_active: boolean;
  created_at: string;
}

export interface Summary {
  id: string;
  transcription_id: string;
  template_id: string | null;
  content: string;
  model_used: string;
  created_at: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface HiDockDevice {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  firmwareVersion: string;
  connected: boolean;
  storageInfo?: StorageInfo;
}

export interface StorageInfo {
  totalSpace: number;
  usedSpace: number;
  freeSpace: number;
  fileCount: number;
}

export interface AudioRecording {
  id: string;
  fileName: string;
  size: number;
  duration: number;
  dateCreated: Date;
  fileVersion: number;
  signature?: Uint8Array;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}
