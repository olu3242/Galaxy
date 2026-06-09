export type RecoveryChannel = 'whatsapp' | 'email' | 'sms' | 'dashboard' | 'push' | 'api_callback';
export type RetryStatus = 'pending' | 'retrying' | 'succeeded' | 'exhausted';

export interface RetryPolicy {
  id: string;
  organizationId: string;
  resourceType: string;
  maxRetries: number;
  backoffSeconds: number;
  fallbackChannel?: RecoveryChannel;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetryRecord {
  id: string;
  organizationId: string;
  resourceType: string;
  resourceId: string;
  status: RetryStatus;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt?: Date;
  succeededAt?: Date;
  errorMessage?: string;
  createdAt: Date;
}
