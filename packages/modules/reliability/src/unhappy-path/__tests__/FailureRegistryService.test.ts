import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { FailureRegistryService } from '../FailureRegistryService.js';

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

const ORG = 'org-1';
const NOW = new Date('2026-01-01T00:00:00Z');

const failureRow = {
  id: 'fail-1',
  organization_id: ORG,
  category: 'workflow_failure',
  severity: 'high',
  status: 'open',
  description: 'workflow stalled',
  context: {},
  recovery_rule_id: null,
  resolved_by: null,
  detected_at: NOW,
  resolved_at: null,
};

describe('FailureRegistryService', () => {
  describe('recordFailure', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([failureRow])]);
      const svc = new FailureRegistryService(pool);
      await svc.recordFailure(ORG, 'workflow_failure', 'high', 'workflow stalled');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns mapped failure record', async () => {
      const pool = makePool([ok([]), ok([failureRow])]);
      const svc = new FailureRegistryService(pool);
      const result = await svc.recordFailure(ORG, 'workflow_failure', 'high', 'workflow stalled');
      expect(result.id).toBe('fail-1');
      expect(result.category).toBe('workflow_failure');
      expect(result.severity).toBe('high');
      expect(result.status).toBe('open');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new FailureRegistryService(pool);
      await expect(svc.recordFailure(ORG, 'workflow_failure', 'high', 'x')).rejects.toThrow(
        'Failed to record failure',
      );
    });
  });

  describe('listFailures', () => {
    it('sets tenant context and returns rows', async () => {
      const pool = makePool([ok([]), ok([failureRow])]);
      const svc = new FailureRegistryService(pool);
      const results = await svc.listFailures(ORG);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(results).toHaveLength(1);
      expect(results[0]?.category).toBe('workflow_failure');
    });

    it('adds category filter when provided', async () => {
      const pool = makePool([ok([]), ok([failureRow])]);
      const svc = new FailureRegistryService(pool);
      await svc.listFailures(ORG, 'workflow_failure');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(String(calls[1]?.[0])).toContain('category');
    });

    it('adds status filter when provided', async () => {
      const pool = makePool([ok([]), ok([failureRow])]);
      const svc = new FailureRegistryService(pool);
      await svc.listFailures(ORG, undefined, 'open');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(String(calls[1]?.[0])).toContain('status');
    });
  });

  describe('resolveFailure', () => {
    it('sets tenant context and returns resolved record', async () => {
      const resolvedRow = {
        ...failureRow,
        status: 'recovered',
        resolved_by: 'user-1',
        resolved_at: NOW,
      };
      const pool = makePool([ok([]), ok([resolvedRow])]);
      const svc = new FailureRegistryService(pool);
      const result = await svc.resolveFailure(ORG, 'fail-1', 'user-1');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result.status).toBe('recovered');
      expect(result.resolvedBy).toBe('user-1');
    });

    it('throws when record not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new FailureRegistryService(pool);
      await expect(svc.resolveFailure(ORG, 'missing', 'user-1')).rejects.toThrow(
        'Failure record not found',
      );
    });
  });

  describe('getFailureMetrics', () => {
    it('sets tenant context and aggregates by category and status', async () => {
      const rows = [
        { category: 'workflow_failure', status: 'open', count: '3' },
        { category: 'workflow_failure', status: 'recovered', count: '1' },
      ];
      const pool = makePool([ok([]), ok(rows)]);
      const svc = new FailureRegistryService(pool);
      const metrics = await svc.getFailureMetrics(ORG);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      const wf = metrics.workflow_failure as Record<string, number>;
      expect(wf.open).toBe(3);
      expect(wf.recovered).toBe(1);
    });
  });
});
