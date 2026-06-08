import type { Pool } from 'pg';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: string;
}

interface RateLimitRow {
  request_count: string;
}

const DEFAULT_LIMITS: Record<string, number> = {
  default: 1000,
  starter: 1000,
  professional: 10000,
  enterprise: 100000,
};

export class RateLimitService {
  constructor(private readonly pool: Pool) {}

  async checkRateLimit(
    orgId: string,
    keyId: string,
    windowSeconds = 3600,
    limitOverride?: number,
  ): Promise<RateLimitResult> {
    const limit = limitOverride ?? DEFAULT_LIMITS.default ?? 1000;
    const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const resetAt = new Date(Date.now() + windowSeconds * 1000).toISOString();

    const result = await this.pool.query<RateLimitRow>(
      `SELECT COUNT(*) as request_count
       FROM rate_limit_events
       WHERE organization_id = $1
         AND key_id = $2
         AND recorded_at >= $3`,
      [orgId, keyId, windowStart],
    );

    const row = result.rows[0];
    const current = row ? Number(row.request_count) : 0;
    const remaining = Math.max(0, limit - current);

    return {
      allowed: current < limit,
      remaining,
      limit,
      resetAt,
    };
  }

  async recordRequest(orgId: string, keyId: string): Promise<void> {
    await this.pool.query(
      'INSERT INTO rate_limit_events (organization_id, key_id) VALUES ($1, $2)',
      [orgId, keyId],
    );
  }

  async checkAndRecord(
    orgId: string,
    keyId: string,
    windowSeconds = 3600,
    limitOverride?: number,
  ): Promise<RateLimitResult> {
    const result = await this.checkRateLimit(orgId, keyId, windowSeconds, limitOverride);

    if (result.allowed) {
      await this.recordRequest(orgId, keyId);
    }

    return result;
  }

  async getOrgRateLimit(
    orgId: string,
    windowSeconds = 3600,
    limitOverride?: number,
  ): Promise<RateLimitResult> {
    const limit = limitOverride ?? DEFAULT_LIMITS.default ?? 1000;
    const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const resetAt = new Date(Date.now() + windowSeconds * 1000).toISOString();

    const result = await this.pool.query<RateLimitRow>(
      `SELECT COUNT(*) as request_count
       FROM rate_limit_events
       WHERE organization_id = $1
         AND recorded_at >= $2`,
      [orgId, windowStart],
    );

    const row = result.rows[0];
    const current = row ? Number(row.request_count) : 0;
    const remaining = Math.max(0, limit - current);

    return {
      allowed: current < limit,
      remaining,
      limit,
      resetAt,
    };
  }

  async purgeOldEvents(olderThanSeconds = 86400): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanSeconds * 1000).toISOString();

    const result = await this.pool.query<{ count: string }>(
      'DELETE FROM rate_limit_events WHERE recorded_at < $1 RETURNING 1 as count',
      [cutoff],
    );

    return result.rowCount ?? 0;
  }
}
