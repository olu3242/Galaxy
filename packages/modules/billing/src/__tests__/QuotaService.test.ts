import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { QuotaService } from '../usage/QuotaService.js';

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

const limitsRow = {
  max_members: 50,
  max_workflows: 50,
  max_agents: 10,
  api_calls_per_month: 50000,
  storage_mb: 10240,
};

describe('QuotaService', () => {
  describe('checkQuota', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([limitsRow]), ok([{ total: '100' }])]);
      const svc = new QuotaService(pool);
      await svc.checkQuota('org-1', 'api_call');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[0] as [string, unknown[]])[0]).toContain('set_config');
      expect((calls[0] as [string, unknown[]])[1]).toContain('org-1');
    });

    it('returns correct quota check for api_call', async () => {
      const pool = makePool([ok([]), ok([limitsRow]), ok([{ total: '100' }])]);
      const svc = new QuotaService(pool);
      const result = await svc.checkQuota('org-1', 'api_call');
      expect(result.organizationId).toBe('org-1');
      expect(result.eventType).toBe('api_call');
      expect(result.used).toBe(100);
      expect(result.limit).toBe(50000);
      expect(result.remaining).toBe(49900);
      expect(result.isExceeded).toBe(false);
    });

    it('returns isExceeded true when usage at or above limit', async () => {
      const pool = makePool([ok([]), ok([limitsRow]), ok([{ total: '50000' }])]);
      const svc = new QuotaService(pool);
      const result = await svc.checkQuota('org-1', 'api_call');
      expect(result.isExceeded).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('calculates percentUsed correctly', async () => {
      const pool = makePool([ok([]), ok([limitsRow]), ok([{ total: '25000' }])]);
      const svc = new QuotaService(pool);
      const result = await svc.checkQuota('org-1', 'api_call');
      expect(result.percentUsed).toBe(50);
    });

    it('returns limit 0 when no tenant_limits row found', async () => {
      // No alert raised since percent would be 0 with limit=0
      const pool = makePool([ok([]), ok([]), ok([{ total: '0' }])]);
      const svc = new QuotaService(pool);
      const result = await svc.checkQuota('org-1', 'api_call');
      expect(result.limit).toBe(0);
    });

    it('raises alert when usage is at or above 80%', async () => {
      const pool = makePool([
        ok([]),
        ok([limitsRow]),
        ok([{ total: '40001' }]), // ~80.0%
        ok([]), // alert insert
      ]);
      const svc = new QuotaService(pool);
      await svc.checkQuota('org-1', 'api_call');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(4);
      expect((calls[3] as [string, unknown[]])[0]).toContain('INSERT INTO usage_alerts');
    });

    it('does not raise alert when usage is below 80%', async () => {
      const pool = makePool([ok([]), ok([limitsRow]), ok([{ total: '100' }])]);
      const svc = new QuotaService(pool);
      await svc.checkQuota('org-1', 'api_call');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(3);
    });

    it('uses member_seat limit for member_seat event type', async () => {
      const pool = makePool([ok([]), ok([limitsRow]), ok([{ total: '10' }])]);
      const svc = new QuotaService(pool);
      const result = await svc.checkQuota('org-1', 'member_seat');
      expect(result.limit).toBe(50);
    });

    it('uses storage_mb limit for storage_mb event type', async () => {
      const pool = makePool([ok([]), ok([limitsRow]), ok([{ total: '100' }])]);
      const svc = new QuotaService(pool);
      const result = await svc.checkQuota('org-1', 'storage_mb');
      expect(result.limit).toBe(10240);
    });

    it('accepts custom period', async () => {
      const pool = makePool([ok([]), ok([limitsRow]), ok([{ total: '5' }])]);
      const svc = new QuotaService(pool);
      const period = { start: '2024-01-01', end: '2024-01-31' };
      await svc.checkQuota('org-1', 'api_call', period);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[2] as [string, unknown[]])[1]).toContain('2024-01-01');
      expect((calls[2] as [string, unknown[]])[1]).toContain('2024-01-31');
    });
  });

  describe('getAlerts', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new QuotaService(pool);
      await svc.getAlerts('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[0] as [string, unknown[]])[0]).toContain('set_config');
      expect((calls[0] as [string, unknown[]])[1]).toContain('org-1');
    });

    it('returns mapped alerts', async () => {
      const alertRow = {
        id: 'alert-1',
        organization_id: 'org-1',
        event_type: 'api_call',
        threshold: 80,
        current_value: 85,
        triggered_at: '2024-01-15T00:00:00Z',
      };
      const pool = makePool([ok([]), ok([alertRow])]);
      const svc = new QuotaService(pool);
      const alerts = await svc.getAlerts('org-1');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.id).toBe('alert-1');
      expect(alerts[0]?.organizationId).toBe('org-1');
      expect(alerts[0]?.eventType).toBe('api_call');
      expect(alerts[0]?.threshold).toBe(80);
      expect(alerts[0]?.currentValue).toBe(85);
    });

    it('returns empty array when no alerts', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new QuotaService(pool);
      const alerts = await svc.getAlerts('org-1');
      expect(alerts).toHaveLength(0);
    });

    it('passes orgId as parameter', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new QuotaService(pool);
      await svc.getAlerts('org-42');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[1] as [string, unknown[]])[1]).toContain('org-42');
    });
  });
});
