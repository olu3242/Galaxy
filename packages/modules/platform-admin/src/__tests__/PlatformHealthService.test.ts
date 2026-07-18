import { describe, it, expect, vi } from 'vitest';
import { PlatformHealthService } from '../observability/PlatformHealthService.js';
import type { Pool, QueryResult } from 'pg';

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

describe('PlatformHealthService', () => {
  describe('runHealthChecks', () => {
    it('returns healthy report when db and tenant checks pass', async () => {
      const pool = makePool([
        // SELECT 1 (db check)
        ok([{ '?column?': 1 }]),
        // tenant health check
        ok([{ suspended: '0', total: '10' }]),
      ]);
      const svc = new PlatformHealthService(pool);
      const report = await svc.runHealthChecks();
      expect(report.overallStatus).toBe('healthy');
      expect(report.healthScore).toBe(100);
      expect(report.checks).toHaveLength(2);
      expect(report.checks[0]!.name).toBe('database');
      expect(report.checks[1]!.name).toBe('tenant_health');
    });

    it('returns degraded status when many tenants are suspended', async () => {
      const pool = makePool([
        ok([{ '?column?': 1 }]),
        ok([{ suspended: '3', total: '10' }]), // 30% > 20% threshold
      ]);
      const svc = new PlatformHealthService(pool);
      const report = await svc.runHealthChecks();
      expect(report.overallStatus).toBe('degraded');
      expect(report.checks[1]!.status).toBe('degraded');
    });

    it('returns unhealthy status when db check throws', async () => {
      const pool = {
        query: vi
          .fn()
          .mockRejectedValueOnce(new Error('connection refused'))
          .mockResolvedValueOnce(ok([{ suspended: '0', total: '5' }])),
      } as unknown as Pool;
      const svc = new PlatformHealthService(pool);
      const report = await svc.runHealthChecks();
      expect(report.overallStatus).toBe('unhealthy');
      expect(report.checks[0]!.status).toBe('unhealthy');
      expect(report.checks[0]!.message).toBe('connection refused');
    });

    it('returns unhealthy when tenant health check throws', async () => {
      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce(ok([{ '?column?': 1 }]))
          .mockRejectedValueOnce(new Error('tenant table missing')),
      } as unknown as Pool;
      const svc = new PlatformHealthService(pool);
      const report = await svc.runHealthChecks();
      expect(report.overallStatus).toBe('unhealthy');
      expect(report.checks[1]!.status).toBe('unhealthy');
    });

    it('includes slo metrics in report', async () => {
      const pool = makePool([ok([{ '?column?': 1 }]), ok([{ suspended: '0', total: '5' }])]);
      const svc = new PlatformHealthService(pool);
      const report = await svc.runHealthChecks();
      expect(report.slos).toHaveLength(2);
      const sloNames = report.slos.map((s) => s.name);
      expect(sloNames).toContain('availability');
      expect(sloNames).toContain('db_latency_ms');
    });

    it('health score is 0 when both checks fail', async () => {
      const pool = {
        query: vi
          .fn()
          .mockRejectedValueOnce(new Error('db down'))
          .mockRejectedValueOnce(new Error('tenant down')),
      } as unknown as Pool;
      const svc = new PlatformHealthService(pool);
      const report = await svc.runHealthChecks();
      expect(report.healthScore).toBe(0);
    });

    it('marks tenant_health as healthy when no tenants exist', async () => {
      const pool = makePool([ok([{ '?column?': 1 }]), ok([{ suspended: '0', total: '0' }])]);
      const svc = new PlatformHealthService(pool);
      const report = await svc.runHealthChecks();
      expect(report.checks[1]!.status).toBe('healthy');
    });
  });
});
