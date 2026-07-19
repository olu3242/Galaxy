import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { GatewayRateLimitService } from '../GatewayRateLimitService.js';
import type { RateLimitStatus } from '../../types.js';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(responses: QueryResult[]): Pool {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

describe('GatewayRateLimitService.getTierConfig', () => {
  const svc = new GatewayRateLimitService({} as unknown as Pool);

  it('returns free tier config', () => {
    const cfg = svc.getTierConfig('free');
    expect(cfg.tier).toBe('free');
    expect(cfg.requestsPerHour).toBe(100);
    expect(cfg.windowMs).toBe(3_600_000);
  });

  it('returns basic tier config', () => {
    const cfg = svc.getTierConfig('basic');
    expect(cfg.tier).toBe('basic');
    expect(cfg.requestsPerHour).toBe(1000);
  });

  it('returns pro tier config', () => {
    const cfg = svc.getTierConfig('pro');
    expect(cfg.tier).toBe('pro');
    expect(cfg.requestsPerHour).toBe(10000);
  });

  it('returns enterprise tier config with Infinity requestsPerHour', () => {
    const cfg = svc.getTierConfig('enterprise');
    expect(cfg.tier).toBe('enterprise');
    expect(cfg.requestsPerHour).toBe(Infinity);
  });
});

describe('GatewayRateLimitService.incrementAndCheck', () => {
  it('returns allowed:true for enterprise without hitting DB', async () => {
    const pool = makePool([]);
    const svc = new GatewayRateLimitService(pool);

    const result = await svc.incrementAndCheck('key-1', 'org-1', 'enterprise');

    expect(result.allowed).toBe(true);
    expect(result.status.isUnlimited).toBe(true);
    expect(result.status.limit).toBe(Infinity);
    expect(result.status.remaining).toBe(Infinity);
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('returns allowed:true when count is within limit', async () => {
    const pool = makePool([ok([{ count: '50', window_start: new Date() }])]);
    const svc = new GatewayRateLimitService(pool);

    const result = await svc.incrementAndCheck('key-1', 'org-1', 'free');

    expect(result.allowed).toBe(true);
    expect(result.status.remaining).toBe(50); // 100 - 50
    expect(result.status.limit).toBe(100);
    expect(result.status.isUnlimited).toBe(false);
    expect(result.status.tier).toBe('free');
  });

  it('returns allowed:false when count exceeds limit', async () => {
    const pool = makePool([ok([{ count: '101', window_start: new Date() }])]);
    const svc = new GatewayRateLimitService(pool);

    const result = await svc.incrementAndCheck('key-1', 'org-1', 'free');

    expect(result.allowed).toBe(false);
    expect(result.status.remaining).toBe(0);
  });

  it('returns allowed:true when count equals limit exactly', async () => {
    const pool = makePool([ok([{ count: '100', window_start: new Date() }])]);
    const svc = new GatewayRateLimitService(pool);

    const result = await svc.incrementAndCheck('key-1', 'org-1', 'free');

    expect(result.allowed).toBe(true);
    expect(result.status.remaining).toBe(0);
  });

  it('throws when DB returns no rows', async () => {
    const pool = makePool([ok([])]);
    const svc = new GatewayRateLimitService(pool);

    await expect(svc.incrementAndCheck('key-1', 'org-1', 'basic')).rejects.toThrow(
      'Failed to upsert rate limit window',
    );
  });

  it('passes correct params to DB for basic tier', async () => {
    const pool = makePool([ok([{ count: '1', window_start: new Date() }])]);
    const svc = new GatewayRateLimitService(pool);

    await svc.incrementAndCheck('key-abc', 'org-xyz', 'basic');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[0]?.[1] ?? []) as unknown[];
    expect(params[0]).toBe('key-abc');
    expect(params[1]).toBe('org-xyz');
  });

  it('includes resetAt ISO string in status', async () => {
    const pool = makePool([ok([{ count: '5', window_start: new Date() }])]);
    const svc = new GatewayRateLimitService(pool);

    const result = await svc.incrementAndCheck('key-1', 'org-1', 'pro');

    expect(typeof result.status.resetAt).toBe('string');
    expect(() => new Date(result.status.resetAt)).not.toThrow();
  });
});

describe('GatewayRateLimitService.getStatus', () => {
  it('returns unlimited status for enterprise tier', async () => {
    const pool = makePool([]);
    const svc = new GatewayRateLimitService(pool);

    const status = await svc.getStatus('key-1', 'enterprise');

    expect(status.isUnlimited).toBe(true);
    expect(status.limit).toBe(Infinity);
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('returns zero count when no window row exists', async () => {
    const pool = makePool([ok([])]);
    const svc = new GatewayRateLimitService(pool);

    const status = await svc.getStatus('key-new', 'free');

    expect(status.remaining).toBe(100);
    expect(status.limit).toBe(100);
    expect(status.isUnlimited).toBe(false);
  });

  it('returns correct remaining when usage exists', async () => {
    const pool = makePool([ok([{ count: '30', window_start: new Date() }])]);
    const svc = new GatewayRateLimitService(pool);

    const status = await svc.getStatus('key-1', 'basic');

    expect(status.remaining).toBe(970); // 1000 - 30
    expect(status.limit).toBe(1000);
    expect(status.tier).toBe('basic');
  });

  it('clamps remaining to 0 when over limit', async () => {
    const pool = makePool([ok([{ count: '9999', window_start: new Date() }])]);
    const svc = new GatewayRateLimitService(pool);

    const status = await svc.getStatus('key-1', 'free');

    expect(status.remaining).toBe(0);
  });
});

describe('GatewayRateLimitService.buildHeaders', () => {
  const svc = new GatewayRateLimitService({} as unknown as Pool);

  it('returns only tier header for unlimited status', () => {
    const status: RateLimitStatus = {
      tier: 'enterprise',
      limit: Infinity,
      remaining: Infinity,
      resetAt: new Date().toISOString(),
      isUnlimited: true,
    };
    const headers = svc.buildHeaders(status);
    expect(headers['X-RateLimit-Tier']).toBe('enterprise');
    expect(headers['X-RateLimit-Limit']).toBeUndefined();
    expect(headers['X-RateLimit-Remaining']).toBeUndefined();
    expect(headers['X-RateLimit-Reset']).toBeUndefined();
  });

  it('returns full headers for limited status', () => {
    const resetAt = new Date('2025-01-01T12:00:00.000Z').toISOString();
    const status: RateLimitStatus = {
      tier: 'free',
      limit: 100,
      remaining: 42,
      resetAt,
      isUnlimited: false,
    };
    const headers = svc.buildHeaders(status);
    expect(headers['X-RateLimit-Limit']).toBe('100');
    expect(headers['X-RateLimit-Remaining']).toBe('42');
    expect(headers['X-RateLimit-Tier']).toBe('free');
    expect(typeof headers['X-RateLimit-Reset']).toBe('string');
    // Should be unix epoch seconds
    const resetSeconds = parseInt(headers['X-RateLimit-Reset'] ?? '0', 10);
    expect(resetSeconds).toBe(Math.floor(new Date(resetAt).getTime() / 1000));
  });
});
