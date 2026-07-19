import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { TenantHealthService } from '../TenantHealthService.js';

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

const healthRow = {
  id: 'th-1',
  tenant_id: 'tenant-1',
  score: '90',
  metrics: { uptime: 99.9 },
  checked_at: '2024-01-01T00:00:00Z',
};

const limitRow = {
  id: 'lim-1',
  tenant_id: 'tenant-1',
  resource_type: 'api_calls',
  limit_value: '1000',
  current_value: '250',
};

describe('TenantHealthService', () => {
  describe('recordHealth', () => {
    it('returns recorded health', async () => {
      const pool = makePool([ok([healthRow])]);
      const svc = new TenantHealthService(pool);
      const result = await svc.recordHealth({ tenantId: 'tenant-1', score: 90 });
      expect(result.id).toBe('th-1');
      expect(result.score).toBe(90);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantHealthService(pool);
      await expect(svc.recordHealth({ tenantId: 'tenant-1', score: 50 })).rejects.toThrow(
        'Failed to record tenant health',
      );
    });
  });

  describe('getLatestHealth', () => {
    it('returns latest health record', async () => {
      const pool = makePool([ok([healthRow])]);
      const svc = new TenantHealthService(pool);
      const result = await svc.getLatestHealth('tenant-1');
      expect(result?.tenantId).toBe('tenant-1');
    });

    it('returns null when no health record', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantHealthService(pool);
      const result = await svc.getLatestHealth('missing');
      expect(result).toBeNull();
    });
  });

  describe('getTenantLimits', () => {
    it('returns list of tenant limits', async () => {
      const pool = makePool([ok([limitRow])]);
      const svc = new TenantHealthService(pool);
      const result = await svc.getTenantLimits('tenant-1');
      expect(result[0]?.resourceType).toBe('api_calls');
      expect(result[0]?.limitValue).toBe(1000);
      expect(result[0]?.currentValue).toBe(250);
    });

    it('returns empty array when no limits', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantHealthService(pool);
      const result = await svc.getTenantLimits('tenant-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('setTenantLimit', () => {
    it('returns upserted limit', async () => {
      const pool = makePool([ok([limitRow])]);
      const svc = new TenantHealthService(pool);
      const result = await svc.setTenantLimit({
        tenantId: 'tenant-1',
        resourceType: 'api_calls',
        limitValue: 1000,
      });
      expect(result.id).toBe('lim-1');
      expect(result.limitValue).toBe(1000);
    });

    it('throws when upsert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantHealthService(pool);
      await expect(
        svc.setTenantLimit({ tenantId: 'tenant-1', resourceType: 'x', limitValue: 100 }),
      ).rejects.toThrow('Failed to set tenant limit');
    });
  });
});
