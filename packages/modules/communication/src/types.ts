export type ChannelType = 'direct' | 'group' | 'broadcast' | 'announcement';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export type MessageContentType = 'text' | 'image' | 'file' | 'audio' | 'video' | 'template';

export interface MessageContent {
  type: MessageContentType;
  text?: string;
  mediaUrl?: string;
  templateName?: string;
  templateVariables?: Record<string, string>;
}

export interface MessageResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
  sentAt?: string;
}

export interface ChannelRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  channel_type: string;
  is_archived: boolean;
  created_by: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  organization_id: string;
  channel_id: string;
  sender_id: string;
  thread_id: string | null;
  content: string;
  content_type: string;
  status: string;
  is_deleted: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BroadcastRow {
  id: string;
  organization_id: string;
  title: string;
  content: string;
  target_type: string;
  target_ids: string[];
  status: string;
  sent_count: number;
  failed_count: number;
  sent_by: string;
  sent_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementRow {
  id: string;
  organization_id: string;
  title: string;
  body: string;
  status: string;
  published_by: string | null;
  published_at: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}
