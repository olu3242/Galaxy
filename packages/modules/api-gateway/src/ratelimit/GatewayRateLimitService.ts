import type { Pool } from 'pg';
import type { RateLimitTier, RateLimitConfig, RateLimitStatus } from '../types.js';

const TIER_CONFIGS: Record<RateLimitTier, RateLimitConfig> = {
  free: { tier: 'free', requestsPerHour: 100, windowMs: 3600_000 },
  basic: { tier: 'basic', requestsPerHour: 1000, windowMs: 3600_000 },
  pro: { tier: 'pro', requestsPerHour: 10000, windowMs: 3600_000 },
  enterprise: { tier: 'enterprise', requestsPerHour: Infinity, windowMs: 3600_000 },
};

interface CountRow {
  count: string;
  window_start: Date;
}

export class GatewayRateLimitService {
  constructor(private readonly pool: Pool) {}

  getTierConfig(tier: RateLimitTier): RateLimitConfig {
    return TIER_CONFIGS[tier];
  }

  /**
   * Atomically increments the counter for the current window and returns the new count.
   * Uses PostgreSQL JSONB-backed rate_limit_windows table (no Redis dependency).
   */
  async incrementAndCheck(
    apiKeyId: string,
    organizationId: string,
    tier: RateLimitTier,
  ): Promise<{ allowed: boolean; status: RateLimitStatus }> {
    const config = TIER_CONFIGS[tier];

    if (tier === 'enterprise') {
      const resetAt = new Date(Date.now() + config.windowMs);
      return {
        allowed: true,
        status: {
          tier,
          limit: Infinity,
          remaining: Infinity,
          resetAt: resetAt.toISOString(),
          isUnlimited: true,
        },
      };
    }

    const windowStart = new Date(Math.floor(Date.now() / config.windowMs) * config.windowMs);
    const windowEnd = new Date(windowStart.getTime() + config.windowMs);

    // Upsert into a JSONB tracking table
    const result = await this.pool.query<CountRow>(
      `INSERT INTO rate_limit_windows (api_key_id, organization_id, window_start, count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (api_key_id, window_start)
       DO UPDATE SET count = rate_limit_windows.count + 1
       RETURNING count, window_start`,
      [apiKeyId, organizationId, windowStart.toISOString()],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to upsert rate limit window');

    const currentCount = parseInt(row.count, 10);
    const remaining = Math.max(0, config.requestsPerHour - currentCount);
    const allowed = currentCount <= config.requestsPerHour;

    return {
      allowed,
      status: {
        tier,
        limit: config.requestsPerHour,
        remaining,
        resetAt: windowEnd.toISOString(),
        isUnlimited: false,
      },
    };
  }

  async getStatus(
    apiKeyId: string,
    tier: RateLimitTier,
  ): Promise<RateLimitStatus> {
    const config = TIER_CONFIGS[tier];

    if (tier === 'enterprise') {
      return {
        tier,
        limit: Infinity,
        remaining: Infinity,
        resetAt: new Date(Date.now() + config.windowMs).toISOString(),
        isUnlimited: true,
      };
    }

    const windowStart = new Date(Math.floor(Date.now() / config.windowMs) * config.windowMs);
    const windowEnd = new Date(windowStart.getTime() + config.windowMs);

    const result = await this.pool.query<CountRow>(
      'SELECT count, window_start FROM rate_limit_windows WHERE api_key_id = $1 AND window_start = $2',
      [apiKeyId, windowStart.toISOString()],
    );

    const currentCount = result.rows[0] ? parseInt(result.rows[0].count, 10) : 0;
    const remaining = Math.max(0, config.requestsPerHour - currentCount);

    return {
      tier,
      limit: config.requestsPerHour,
      remaining,
      resetAt: windowEnd.toISOString(),
      isUnlimited: false,
    };
  }

  buildHeaders(status: RateLimitStatus): Record<string, string> {
    if (status.isUnlimited) {
      return {
        'X-RateLimit-Tier': status.tier,
      };
    }
    return {
      'X-RateLimit-Limit': String(status.limit),
      'X-RateLimit-Remaining': String(status.remaining),
      'X-RateLimit-Reset': String(Math.floor(new Date(status.resetAt).getTime() / 1000)),
      'X-RateLimit-Tier': status.tier,
    };
  }
}
