export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RateLimitTier = 'free' | 'basic' | 'pro' | 'enterprise';

export type ApiVersion = 'v1' | 'v2';

export interface GatewayRoute {
  id: string;
  path: string;
  method: HttpMethod;
  version: ApiVersion;
  authRequired: boolean;
  rateLimitTier: RateLimitTier;
  description: string;
  isActive: boolean;
  createdAt: string;
}

export interface RateLimitConfig {
  tier: RateLimitTier;
  requestsPerHour: number;
  windowMs: number;
}

export interface RateLimitStatus {
  tier: RateLimitTier;
  limit: number;
  remaining: number;
  resetAt: string;
  isUnlimited: boolean;
}

export interface ApiRequestLog {
  id: string;
  organizationId: string;
  apiKeyId: string;
  endpoint: string;
  method: HttpMethod;
  statusCode: number;
  latencyMs: number;
  createdAt: string;
}

export interface EndpointStats {
  endpoint: string;
  method: string;
  callCount: number;
  errorCount: number;
  errorRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

export interface GatewayStats {
  totalCalls: number;
  errorRate: number;
  p95LatencyMs: number;
  windowHours: number;
}

export interface RegisterRouteInput {
  path: string;
  method: HttpMethod;
  version: ApiVersion;
  authRequired: boolean;
  rateLimitTier: RateLimitTier;
  description: string;
}

export interface LogRequestInput {
  organizationId: string;
  apiKeyId: string;
  endpoint: string;
  method: HttpMethod;
  statusCode: number;
  latencyMs: number;
}
