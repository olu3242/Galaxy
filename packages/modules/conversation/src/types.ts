export type SessionStatus = 'OPEN' | 'ACTIVE' | 'WAITING' | 'ESCALATED' | 'CLOSED' | 'ARCHIVED';
export type ChannelType = 'whatsapp' | 'email' | 'sms' | 'voice' | 'form' | 'api';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'received' | 'processing' | 'processed' | 'failed';

export interface ConversationSession {
  id: string;
  organizationId: string;
  channelType: ChannelType;
  externalId: string;
  participantId: string;
  status: SessionStatus;
  intent?: string;
  language?: string;
  sentiment?: string;
  urgencyScore?: number;
  riskScore?: number;
  context: Record<string, unknown>;
  memory: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

export interface ConversationMessage {
  id: string;
  organizationId: string;
  sessionId: string;
  direction: MessageDirection;
  status: MessageStatus;
  content: string;
  rawPayload: Record<string, unknown>;
  intent?: string;
  entities: Record<string, unknown>;
  sentiment?: string;
  language?: string;
  translatedContent?: string;
  createdAt: Date;
}

export interface ConversationThread {
  id: string;
  organizationId: string;
  sessionId: string;
  topic?: string;
  summary?: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}
