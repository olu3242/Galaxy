import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { GatewayAnalyticsService } from '../GatewayAnalyticsService.js';

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

const baseLogRow = {
  id: 'log-1',
  organization_id: 'org-1',
  api_key_id: 'key-1',
  endpoint: '/api/v1/users',
  method: 'GET',
  status_code: 200,
  latency_ms: 42,
  created_at: new Date('2025-01-01T00:00:00.000Z'),
};

describe('GatewayAnalyticsService.logRequest', () => {
  it('inserts a request log with correct params', async () => {
    const pool = makePool([ok([])]);
    const svc = new GatewayAnalyticsService(pool);

    await svc.logRequest({
      organizationId: 'org-1',
      apiKeyId: 'key-1',
      endpoint: '/api/v1/users',
      method: 'GET',
      statusCode: 200,
      latencyMs: 100,
    });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[0]?.[1] ?? []) as unknown[];
    expect(params[0]).toBe('org-1');
    expect(params[1]).toBe('key-1');
    expect(params[2]).toBe('/api/v1/users');
    expect(params[3]).toBe('GET');
    expect(params[4]).toBe(200);
    expect(params[5]).toBe(100);
  });

  it('handles error status codes', async () => {
    const pool = makePool([ok([])]);
    const svc = new GatewayAnalyticsService(pool);

    await svc.logRequest({
      organizationId: 'org-1',
      apiKeyId: 'key-1',
      endpoint: '/api/v1/things',
      method: 'POST',
      statusCode: 500,
      latencyMs: 1234,
    });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[0]?.[1] ?? []) as unknown[];
    expect(params[4]).toBe(500);
  });
});

describe('GatewayAnalyticsService.getRecentLogs', () => {
  it('sets tenant context then returns mapped logs', async () => {
    const pool = makePool([ok([]), ok([baseLogRow])]);
    const svc = new GatewayAnalyticsService(pool);

    const logs = await svc.getRecentLogs('org-1');

    // First call should be set_config for tenant context
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const firstParams = (calls[0]?.[1] ?? []) as unknown[];
    expect(firstParams[0]).toBe('app.current_tenant');
    expect(firstParams[1]).toBe('org-1');

    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log?.id).toBe('log-1');
    expect(log?.organizationId).toBe('org-1');
    expect(log?.apiKeyId).toBe('key-1');
    expect(log?.endpoint).toBe('/api/v1/users');
    expect(log?.method).toBe('GET');
    expect(log?.statusCode).toBe(200);
    expect(log?.latencyMs).toBe(42);
    expect(log?.createdAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('returns empty array when no logs', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new GatewayAnalyticsService(pool);

    const logs = await svc.getRecentLogs('org-empty');
    expect(logs).toEqual([]);
  });

  it('uses default limit of 100 and respects custom limit', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new GatewayAnalyticsService(pool);

    await svc.getRecentLogs('org-1', 25);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[1]?.[1] ?? []) as unknown[];
    expect(params[1]).toBe(25);
  });
});

describe('GatewayAnalyticsService.getStats', () => {
  it('returns zero stats when no rows', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new GatewayAnalyticsService(pool);

    const stats = await svc.getStats('org-1', 24);

    expect(stats.totalCalls).toBe(0);
    expect(stats.errorRate).toBe(0);
    expect(stats.p95LatencyMs).toBe(0);
    expect(stats.windowHours).toBe(24);
  });

  it('parses aggregate row correctly', async () => {
    const aggRow = { total_calls: '200', error_count: '20', p95_latency: '150.5' };
    const pool = makePool([ok([]), ok([aggRow])]);
    const svc = new GatewayAnalyticsService(pool);

    const stats = await svc.getStats('org-1', 24);

    expect(stats.totalCalls).toBe(200);
    expect(stats.errorRate).toBeCloseTo(0.1);
    expect(stats.p95LatencyMs).toBeCloseTo(150.5);
    expect(stats.windowHours).toBe(24);
  });

  it('handles zero total calls to avoid division by zero', async () => {
    const aggRow = { total_calls: '0', error_count: '0', p95_latency: '0' };
    const pool = makePool([ok([]), ok([aggRow])]);
    const svc = new GatewayAnalyticsService(pool);

    const stats = await svc.getStats('org-1', 24);

    expect(stats.errorRate).toBe(0);
  });

  it('sets tenant context before querying', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new GatewayAnalyticsService(pool);

    await svc.getStats('org-xyz', 168);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const firstParams = (calls[0]?.[1] ?? []) as unknown[];
    expect(firstParams[0]).toBe('app.current_tenant');
    expect(firstParams[1]).toBe('org-xyz');
  });

  it('passes windowHours to query for 168h window', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new GatewayAnalyticsService(pool);

    await svc.getStats('org-1', 168);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[1]?.[1] ?? []) as unknown[];
    expect(params[1]).toBe(168);
  });
});

describe('GatewayAnalyticsService.getStatsByEndpoint', () => {
  it('returns mapped endpoint stats', async () => {
    const statsRow = {
      endpoint: '/api/v1/users',
      method: 'GET',
      call_count: '50',
      error_count: '5',
      p50_latency: '30',
      p95_latency: '90',
      p99_latency: '200',
    };
    const pool = makePool([ok([]), ok([statsRow])]);
    const svc = new GatewayAnalyticsService(pool);

    const stats = await svc.getStatsByEndpoint('org-1');

    expect(stats.length).toBe(1);
    const s = stats[0];
    expect(s?.endpoint).toBe('/api/v1/users');
    expect(s?.method).toBe('GET');
    expect(s?.callCount).toBe(50);
    expect(s?.errorCount).toBe(5);
    expect(s?.errorRate).toBeCloseTo(0.1);
    expect(s?.p50LatencyMs).toBe(30);
    expect(s?.p95LatencyMs).toBe(90);
    expect(s?.p99LatencyMs).toBe(200);
  });

  it('returns empty array when no data', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new GatewayAnalyticsService(pool);

    const stats = await svc.getStatsByEndpoint('org-1');
    expect(stats).toEqual([]);
  });

  it('handles zero call count to avoid division by zero', async () => {
    const statsRow = {
      endpoint: '/api/v1/test',
      method: 'GET',
      call_count: '0',
      error_count: '0',
      p50_latency: '0',
      p95_latency: '0',
      p99_latency: '0',
    };
    const pool = makePool([ok([]), ok([statsRow])]);
    const svc = new GatewayAnalyticsService(pool);

    const stats = await svc.getStatsByEndpoint('org-1');
    expect(stats[0]?.errorRate).toBe(0);
  });
});

describe('GatewayAnalyticsService.getTopEndpoints', () => {
  it('limits results to specified count', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      endpoint: `/api/v1/endpoint${String(i)}`,
      method: 'GET',
      call_count: String(100 - i * 10),
      error_count: '0',
      p50_latency: '10',
      p95_latency: '50',
      p99_latency: '100',
    }));
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new GatewayAnalyticsService(pool);

    const top = await svc.getTopEndpoints('org-1', 24, 3);

    expect(top.length).toBe(3);
  });

  it('returns all results when limit exceeds available', async () => {
    const rows = [
      {
        endpoint: '/api/v1/only',
        method: 'POST',
        call_count: '10',
        error_count: '1',
        p50_latency: '5',
        p95_latency: '20',
        p99_latency: '50',
      },
    ];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new GatewayAnalyticsService(pool);

    const top = await svc.getTopEndpoints('org-1', 24, 10);

    expect(top.length).toBe(1);
  });
});
