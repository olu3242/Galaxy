import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { MetricsService } from '../services/MetricsService.js';

function makePool(rows: unknown[] = []): Pool {
  const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length } as QueryResult);
  return { query } as unknown as Pool;
}

describe('MetricsService', () => {
  const organizationId = '00000000-0000-0000-0000-000000000001';

  describe('recordMetric', () => {
    it('sets tenant context before inserting', async () => {
      const metricRow = {
        id: 'uuid-1',
        organization_id: organizationId,
        name: 'workflow.completions',
        category: 'workflow',
        value: '1',
        unit: 'count',
        period: 'daily',
        period_start: '2026-01-01T00:00:00.000Z',
        period_end: '2026-01-01T23:59:59.000Z',
        dimensions: {},
        created_at: '2026-01-01T00:00:00.000Z',
      };

      const pool = makePool([metricRow]);
      const service = new MetricsService(pool);

      const result = await service.recordMetric({
        organizationId,
        name: 'workflow.completions',
        category: 'workflow',
        value: 1,
        unit: 'count',
        period: 'daily',
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-01-01T23:59:59.000Z',
      });

      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', organizationId]);
      expect(result.name).toBe('workflow.completions');
      expect(result.value).toBe(1);
    });

    it('throws on invalid input', async () => {
      const pool = makePool();
      const service = new MetricsService(pool);

      await expect(
        service.recordMetric({
          organizationId,
          name: '',
          category: 'workflow',
          value: 1,
          unit: 'count',
          period: 'daily',
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-01-01T23:59:59.000Z',
        }),
      ).rejects.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('sets tenant context and returns metrics', async () => {
      const pool = makePool([]);
      const service = new MetricsService(pool);

      const results = await service.getMetrics(organizationId);

      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', organizationId]);
      expect(results).toEqual([]);
    });

    it('filters by category when provided', async () => {
      const pool = makePool([]);
      const service = new MetricsService(pool);

      await service.getMetrics(organizationId, { category: 'workflow' });

      const selectCall = vi.mocked(pool.query).mock.calls[1];
      expect(String(selectCall?.[0])).toContain('category');
    });
  });

  describe('aggregateMetrics', () => {
    it('sets tenant context before aggregating', async () => {
      const pool = makePool([]);
      const service = new MetricsService(pool);

      await service.aggregateMetrics(organizationId, 'workflow.completions', 'daily');

      const firstCall = vi.mocked(pool.query).mock.calls[0];
      expect(firstCall?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(firstCall?.[1]).toEqual(['app.current_tenant', organizationId]);
    });
  });
});
