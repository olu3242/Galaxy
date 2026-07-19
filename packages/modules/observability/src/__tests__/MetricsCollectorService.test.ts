import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { MetricsCollectorService } from '../metrics/MetricsCollectorService.js';
import type { MetricPointRow } from '../types.js';

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

const ORG = 'org-333';
const TENANT_CALL = ok([]);

const metricRow: MetricPointRow = {
  id: 'mp-1',
  organization_id: ORG,
  metric_name: 'cpu_usage',
  metric_value: '75.5',
  labels: { host: 'server-1' },
  timestamp: '2025-01-01T00:00:00Z',
};

describe('MetricsCollectorService', () => {
  describe('record', () => {
    it('sets tenant context, inserts metric, returns mapped point', async () => {
      const pool = makePool([TENANT_CALL, ok([metricRow])]);
      const svc = new MetricsCollectorService(pool);
      const point = await svc.record({
        organizationId: ORG,
        metricName: 'cpu_usage',
        metricValue: 75.5,
        labels: { host: 'server-1' },
      });
      expect(point.id).toBe('mp-1');
      expect(point.metricValue).toBe(75.5);
      expect(point.metricName).toBe('cpu_usage');
      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG,
      ]);
    });

    it('uses provided timestamp when given', async () => {
      const pool = makePool([TENANT_CALL, ok([metricRow])]);
      const svc = new MetricsCollectorService(pool);
      const ts = '2025-06-15T12:00:00Z';
      await svc.record({
        organizationId: ORG,
        metricName: 'cpu_usage',
        metricValue: 50,
        labels: {},
        timestamp: ts,
      });
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO operational_metrics'),
        expect.arrayContaining([ts]),
      );
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new MetricsCollectorService(pool);
      await expect(
        svc.record({ organizationId: ORG, metricName: 'm', metricValue: 0, labels: {} }),
      ).rejects.toThrow('Failed to record metric');
    });
  });

  describe('query', () => {
    it('returns metric points in range', async () => {
      const pool = makePool([TENANT_CALL, ok([metricRow])]);
      const svc = new MetricsCollectorService(pool);
      const points = await svc.query(ORG, {
        metricName: 'cpu_usage',
        from: '2025-01-01T00:00:00Z',
        to: '2025-01-02T00:00:00Z',
      });
      expect(points).toHaveLength(1);
      expect(points[0]?.metricValue).toBe(75.5);
    });

    it('applies labels filter', async () => {
      const pool = makePool([TENANT_CALL, ok([metricRow])]);
      const svc = new MetricsCollectorService(pool);
      await svc.query(ORG, {
        metricName: 'cpu_usage',
        from: '2025-01-01T00:00:00Z',
        to: '2025-01-02T00:00:00Z',
        labels: { host: 'server-1' },
      });
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('@> $5::jsonb'),
        expect.arrayContaining([JSON.stringify({ host: 'server-1' })]),
      );
    });

    it('applies limit', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new MetricsCollectorService(pool);
      await svc.query(ORG, {
        metricName: 'cpu_usage',
        from: '2025-01-01T00:00:00Z',
        to: '2025-01-02T00:00:00Z',
        limit: 50,
      });
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([50]),
      );
    });

    it('returns empty array when no results', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new MetricsCollectorService(pool);
      const points = await svc.query(ORG, {
        metricName: 'missing_metric',
        from: '2025-01-01T00:00:00Z',
        to: '2025-01-02T00:00:00Z',
      });
      expect(points).toEqual([]);
    });
  });

  describe('getLatestValue', () => {
    it('returns latest metric point', async () => {
      const pool = makePool([TENANT_CALL, ok([metricRow])]);
      const svc = new MetricsCollectorService(pool);
      const point = await svc.getLatestValue(ORG, 'cpu_usage');
      expect(point?.id).toBe('mp-1');
      expect(point?.metricValue).toBe(75.5);
    });

    it('returns null when no metrics exist', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new MetricsCollectorService(pool);
      const point = await svc.getLatestValue(ORG, 'unknown');
      expect(point).toBeNull();
    });
  });

  describe('aggregate', () => {
    it('returns parsed float value', async () => {
      const valueRow = { value: '88.25' };
      const pool = makePool([TENANT_CALL, ok([valueRow])]);
      const svc = new MetricsCollectorService(pool);
      const result = await svc.aggregate(
        ORG,
        'cpu_usage',
        '2025-01-01T00:00:00Z',
        '2025-01-02T00:00:00Z',
        'avg',
      );
      expect(result).toBe(88.25);
    });

    it('returns 0 when no rows', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new MetricsCollectorService(pool);
      const result = await svc.aggregate(
        ORG,
        'cpu_usage',
        '2025-01-01T00:00:00Z',
        '2025-01-02T00:00:00Z',
        'sum',
      );
      expect(result).toBe(0);
    });

    it('sets tenant context before querying', async () => {
      const valueRow = { value: '10' };
      const pool = makePool([TENANT_CALL, ok([valueRow])]);
      const svc = new MetricsCollectorService(pool);
      await svc.aggregate(ORG, 'cpu_usage', '2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z', 'min');
      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG,
      ]);
    });
  });
});
