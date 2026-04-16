export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'pending' | 'rejected';
export type RegistrationSource = 'self_registered' | 'admin_created' | 'oidc';

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  is_active: boolean;
  status: UserStatus;
  registration_source: RegistrationSource;
  force_password_reset: boolean;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
  force_password_reset?: boolean;
}

export interface RegisterResult {
  user: User;
  message: string | null;
}

export interface RegistrationSettings {
  registration_enabled: boolean;
  approval_required: boolean;
  allowed_domains: string[];
}

export type TranscriptionStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export type PermissionLevel = 'owner' | 'write' | 'read';

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  transcription_count: number;
  permission_level?: PermissionLevel | null;
  shared_by?: string | null;
}

export type RecordingType = 'record' | 'whisper';

export interface Transcription {
  id: string;
  user_id: string;
  filename: string;
  original_filename: string;
  recording_type: RecordingType;
  title: string | null;
  collection_id: string | null;
  audio_duration: number | null;
  language: string;
  text: string;
  segments: TranscriptionSegment[];
  speakers: Record<string, string>;
  status: TranscriptionStatus;
  error_message: string | null;
  notes: string | null;
  queue_position: number | null;
  progress: number | null;
  progress_stage: string | null;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  keep_audio: boolean;
  audio_available: boolean;
  auto_summarize: boolean;
  auto_summarize_template_id: string | null;
  created_at: string;
  updated_at: string;
  permission_level?: PermissionLevel | null;
  shared_by?: string | null;
}

// Access control types
export type SharingPolicy = 'creator_only' | 'members_allowed';

export interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  owner_id: string;
  sharing_policy: SharingPolicy;
  created_at: string;
  updated_at: string;
  member_count: number;
  is_owner: boolean;
}

export interface UserGroupDetail extends UserGroup {
  members: GroupMember[];
}

export interface GroupMember {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
}

export interface ResourceShare {
  id: string;
  resource_type: 'transcription' | 'collection';
  resource_id: string;
  grantee_type: 'user' | 'group';
  grantee_id: string;
  permission: 'read' | 'write';
  granted_by: string;
  created_at: string;
  grantee?: {
    id: string;
    name: string;
    email?: string;
    type: 'user' | 'group';
  } | null;
}

export interface SharedWithMeItem {
  resource_type: 'transcription' | 'collection';
  resource_id: string;
  resource_name: string;
  permission: 'read' | 'write';
  shared_by_name: string;
  shared_at: string;
}

export type TemplateTargetType = 'record' | 'whisper' | 'both';

export interface SummaryTemplate {
  id: string;
  name: string;
  description: string;
  prompt_template: string;
  category: string | null;
  target_type: TemplateTargetType;
  is_active: boolean;
  is_default: boolean;
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

export interface QueueStatus {
  queue: Transcription[];
  total_in_queue: number;
  currently_processing: Transcription | null;
}

export interface QueueSSEEvent {
  event: 'queued' | 'position_update' | 'processing_started' | 'progress' | 'completed' | 'failed' | 'cancelled' | 'status';
  status?: string;
  progress?: number;
  stage?: string | null;
  queue_position?: number;
  error?: string;
  auto_summarize?: boolean;
}

// Voice fingerprinting
// OIDC / SSO types
export interface OIDCProviderInfo {
  slug: string;
  display_name: string;
  icon: string | null;
}

export interface OIDCAuthorizeResponse {
  authorize_url: string;
  state: string;
}

export interface OIDCProviderDetail {
  id: string;
  slug: string;
  display_name: string;
  icon: string | null;
  discovery_url: string;
  client_id: string;
  client_secret_masked: string;
  scopes: string;
  authorize_url_override: string | null;
  token_url_override: string | null;
  userinfo_url_override: string | null;
  jwks_uri_override: string | null;
  auto_provision: boolean;
  default_role: string;
  allowed_domains: string | null;
  require_approval: boolean;
  email_claim: string;
  name_claim: string;
  role_claim: string | null;
  role_mapping: string | null;
  is_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface OIDCDiscoveryTestResult {
  success: boolean;
  issuer: string | null;
  authorization_endpoint: string | null;
  token_endpoint: string | null;
  userinfo_endpoint: string | null;
  jwks_uri: string | null;
  scopes_supported: string[] | null;
  error: string | null;
}

export interface VoiceProfile {
  id: string;
  user_id: string;
  label: string;
  embedding_dim: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
