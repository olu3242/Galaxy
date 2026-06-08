export type APIKeyStatus = 'active' | 'revoked' | 'expired';

export type WebhookStatus = 'active' | 'inactive' | 'failed';

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed' | 'dead_letter';

export type OAuthGrantType = 'authorization_code' | 'client_credentials';

export type OAuthTokenStatus = 'active' | 'revoked' | 'expired';

export interface APIKey {
  id: string;
  organizationId: string;
  name: string;
  prefix: string;
  hashedSecret: string;
  scopes: string[];
  status: APIKeyStatus;
  lastUsedAt?: string;
  expiresAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface APIKeyWithSecret extends APIKey {
  plainSecret: string;
}

export interface Webhook {
  id: string;
  organizationId: string;
  name: string;
  url: string;
  secret: string;
  eventTypes: string[];
  status: WebhookStatus;
  failureCount: number;
  lastDeliveredAt?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  organizationId: string;
  webhookId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  responseStatus?: number;
  responseBody?: string;
  attemptCount: number;
  nextRetryAt?: string;
  deliveredAt?: string;
  createdAt: string;
}

export interface OAuthApp {
  id: string;
  organizationId: string;
  name: string;
  clientId: string;
  hashedClientSecret: string;
  redirectUris: string[];
  scopes: string[];
  grantTypes: OAuthGrantType[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OAuthToken {
  id: string;
  organizationId: string;
  oauthAppId: string;
  memberId?: string;
  accessToken: string;
  refreshToken?: string;
  scopes: string[];
  status: OAuthTokenStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OAuthAuthorizationCode {
  code: string;
  clientId: string;
  organizationId: string;
  memberId: string;
  scopes: string[];
  redirectUri: string;
  expiresAt: string;
}

export interface CreateAPIKeyInput {
  organizationId: string;
  name: string;
  scopes: string[];
  createdBy: string;
  expiresAt?: string;
}

export interface CreateWebhookInput {
  organizationId: string;
  name: string;
  url: string;
  eventTypes: string[];
  metadata?: Record<string, unknown>;
}

export interface RegisterOAuthAppInput {
  organizationId: string;
  name: string;
  redirectUris: string[];
  scopes: string[];
  grantTypes: OAuthGrantType[];
  createdBy: string;
}

export interface SDK {
  language: string;
  version: string;
  downloadUrl: string;
  documentation: string;
}
