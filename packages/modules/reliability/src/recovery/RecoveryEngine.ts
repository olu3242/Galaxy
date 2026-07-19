import type { Pool } from 'pg';
import type { RetryPolicy, RetryRecord, RetryStatus, RecoveryChannel } from './types.js';

interface PolicyRow {
  id: string;
  organization_id: string;
  resource_type: string;
  max_retries: number;
  backoff_seconds: number;
  fallback_channel: string | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

interface RetryRow {
  id: string;
  organization_id: string;
  resource_type: string;
  resource_id: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  last_attempt_at: Date | null;
  succeeded_at: Date | null;
  error_message: string | null;
  created_at: Date;
}

function rowToPolicy(row: PolicyRow): RetryPolicy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    resourceType: row.resource_type,
    maxRetries: row.max_retries,
    backoffSeconds: row.backoff_seconds,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.fallback_channel !== null
      ? { fallbackChannel: row.fallback_channel as RecoveryChannel }
      : {}),
  };
}

function rowToRetry(row: RetryRow): RetryRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    status: row.status as RetryStatus,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at,
    ...(row.last_attempt_at !== null ? { lastAttemptAt: row.last_attempt_at } : {}),
    ...(row.succeeded_at !== null ? { succeededAt: row.succeeded_at } : {}),
    ...(row.error_message !== null ? { errorMessage: row.error_message } : {}),
  };
}

export class RecoveryEngine {
  constructor(private readonly pool: Pool) {}

  async setPolicy(
    orgId: string,
    resourceType: string,
    maxRetries: number,
    backoffSeconds: number,
    fallbackChannel?: RecoveryChannel,
  ): Promise<RetryPolicy> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<PolicyRow>(
      `INSERT INTO retry_policies (organization_id, resource_type, max_retries, backoff_seconds, fallback_channel)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, resource_type)
       DO UPDATE SET max_retries = EXCLUDED.max_retries, backoff_seconds = EXCLUDED.backoff_seconds,
                     fallback_channel = EXCLUDED.fallback_channel, updated_at = NOW()
       RETURNING *`,
      [orgId, resourceType, maxRetries, backoffSeconds, fallbackChannel ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to set retry policy');
    return rowToPolicy(row);
  }

  async initiateRetry(
    orgId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<RetryRecord> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const policyResult = await this.pool.query<PolicyRow>(
      'SELECT * FROM retry_policies WHERE organization_id = $1 AND resource_type = $2 AND enabled = true',
      [orgId, resourceType],
    );
    const maxAttempts = policyResult.rows[0]?.max_retries ?? 3;
    const result = await this.pool.query<RetryRow>(
      `INSERT INTO retry_records (organization_id, resource_type, resource_id, max_attempts)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [orgId, resourceType, resourceId, maxAttempts],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to initiate retry');
    return rowToRetry(row);
  }

  async recordAttempt(
    orgId: string,
    retryId: string,
    succeeded: boolean,
    errorMessage?: string,
  ): Promise<RetryRecord> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const current = await this.pool.query<RetryRow>(
      'SELECT * FROM retry_records WHERE organization_id = $1 AND id = $2',
      [orgId, retryId],
    );
    const record = current.rows[0];
    if (!record) throw new Error('Retry record not found');
    const newCount = record.attempt_count + 1;
    let status: RetryStatus = 'retrying';
    if (succeeded) status = 'succeeded';
    else if (newCount >= record.max_attempts) status = 'exhausted';
    const result = await this.pool.query<RetryRow>(
      `UPDATE retry_records
       SET attempt_count = $3, status = $4, last_attempt_at = NOW(),
           succeeded_at = CASE WHEN $5 THEN NOW() ELSE NULL END,
           error_message = $6
       WHERE organization_id = $1 AND id = $2 RETURNING *`,
      [orgId, retryId, newCount, status, succeeded, errorMessage ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to update retry record');
    return rowToRetry(row);
  }

  async listRetries(orgId: string, status?: RetryStatus, limit = 100): Promise<RetryRecord[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const params: unknown[] = [orgId];
    const cond = status !== undefined ? ` AND status = $${String(params.push(status))}` : '';
    params.push(limit);
    const result = await this.pool.query<RetryRow>(
      `SELECT * FROM retry_records WHERE organization_id = $1${cond} ORDER BY created_at DESC LIMIT $${String(params.length)}`,
      params,
    );
    return result.rows.map(rowToRetry);
  }
}
