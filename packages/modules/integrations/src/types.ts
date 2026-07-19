export type ConnectorType = 'webhook' | 'api' | 'oauth2' | 'whatsapp';
export type ConnectorStatus = 'active' | 'inactive' | 'error';
export type SyncDirection = 'inbound' | 'outbound' | 'bidirectional';

export interface IntegrationConnector {
  id: string;
  organizationId: string;
  name: string;
  connectorType: ConnectorType;
  status: ConnectorStatus;
  config: Record<string, unknown>;
  credentials: Record<string, unknown>;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface IntegrationConnectorRow {
  id: string;
  organization_id: string;
  name: string;
  connector_type: string;
  status: string;
  config: Record<string, unknown>;
  credentials: Record<string, unknown>;
  last_sync_at: string | null;
  created_at: string;
}

export interface ConnectorCredentials {
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  webhookSecret?: string;
  [key: string]: unknown;
}

export interface SyncJob {
  connectorId: string;
  organizationId: string;
  direction: SyncDirection;
}

export interface SyncLog {
  id: string;
  organizationId: string;
  connectorId: string;
  direction: SyncDirection;
  recordsSynced: number;
  errorCount: number;
  startedAt: string;
  completedAt: string | null;
}

export interface SyncLogRow {
  id: string;
  organization_id: string;
  connector_id: string;
  direction: string;
  records_synced: string;
  error_count: string;
  started_at: string;
  completed_at: string | null;
}

export interface EventMapping {
  id: string;
  organizationId: string;
  connectorId: string;
  galaxyEventType: string;
  externalEventType: string;
  transformationRules: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

export interface EventMappingRow {
  id: string;
  organization_id: string;
  connector_id: string;
  galaxy_event_type: string;
  external_event_type: string;
  transformation_rules: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface EventDelivery {
  id: string;
  mappingId: string;
  organizationId: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface EventDeliveryRow {
  id: string;
  mapping_id: string;
  organization_id: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: string;
  last_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
}
