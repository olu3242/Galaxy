import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ContributionService } from '../ContributionService.js';

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

const baseContribRow = {
  id: 'contrib-1',
  organization_id: 'org-1',
  metric_key: 'workflow_completion_rate',
  metric_value: '0.82',
  period: '2024-01',
  anonymization_noise: '0.02',
  created_at: '2024-01-01T00:00:00Z',
};

describe('ContributionService', () => {
  describe('contribute', () => {
    it('stores contribution with noisy value and returns mapped result', async () => {
      const pool = makePool([ok([]), ok([baseContribRow])]);
      const svc = new ContributionService(pool);
      const result = await svc.contribute({
        organizationId: 'org-1',
        metricKey: 'workflow_completion_rate',
        metricValue: 0.8,
        period: '2024-01',
      });
      expect(result.id).toBe('contrib-1');
      expect(result.metricKey).toBe('workflow_completion_rate');
      expect(result.metricValue).toBe(0.82);
      expect(result.anonymizationNoise).toBe(0.02);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ContributionService(pool);
      await expect(
        svc.contribute({
          organizationId: 'org-1',
          metricKey: 'metric',
          metricValue: 1.0,
          period: '2024-01',
        }),
      ).rejects.toThrow('Failed to store contribution');
    });

    it('sets tenant context before inserting', async () => {
      const pool = makePool([ok([]), ok([baseContribRow])]);
      const svc = new ContributionService(pool);
      await svc.contribute({
        organizationId: 'org-1',
        metricKey: 'metric',
        metricValue: 1.0,
        period: '2024-01',
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const firstCall = calls[0];
      expect(firstCall?.[0]).toContain('set_config');
      const params = (firstCall?.[1] ?? []) as unknown[];
      expect(params[1]).toBe('org-1');
    });
  });

  describe('withdraw', () => {
    it('deletes the contribution without throwing', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ContributionService(pool);
      await expect(
        svc.withdraw('org-1', 'workflow_completion_rate', '2024-01'),
      ).resolves.toBeUndefined();
    });

    it('passes correct parameters to DELETE', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ContributionService(pool);
      await svc.withdraw('org-1', 'my_metric', '2024-06');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const deleteCall = calls[1];
      expect(deleteCall?.[0]).toContain('DELETE FROM intelligence_contributions');
      const params = (deleteCall?.[1] ?? []) as unknown[];
      expect(params[0]).toBe('org-1');
      expect(params[1]).toBe('my_metric');
      expect(params[2]).toBe('2024-06');
    });
  });
});
