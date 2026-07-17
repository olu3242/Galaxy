import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { AuditService } from '../AuditService.js';

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

const logRow = {
  id: 'log-1',
  organization_id: 'org-1',
  actor_type: 'member',
  actor_id: 'user-1',
  action: 'workflow.submitted',
  resource_type: 'workflow',
  resource_id: 'wf-1',
  metadata: {},
  created_at: '2024-01-01T00:00:00Z',
};

describe('AuditService', () => {
  describe('queryLogs', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([logRow])]);
      const svc = new AuditService(pool);
      await svc.queryLogs({ organizationId: 'org-1' });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
      expect(calls[0]?.[0]).toContain('set_config');
      expect((calls[0]?.[1] ?? [])[1]).toBe('org-1');
    });

    it('returns mapped log entries', async () => {
      const pool = makePool([ok([]), ok([logRow])]);
      const svc = new AuditService(pool);
      const result = await svc.queryLogs({ organizationId: 'org-1' });
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('log-1');
      expect(result[0]?.actorType).toBe('member');
      expect(result[0]?.action).toBe('workflow.submitted');
    });

    it('returns empty array when no logs', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AuditService(pool);
      const result = await svc.queryLogs({ organizationId: 'org-1' });
      expect(result).toHaveLength(0);
    });

    it('passes optional filters to query', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AuditService(pool);
      await svc.queryLogs({
        organizationId: 'org-1',
        actorId: 'user-1',
        action: 'workflow.submitted',
        limit: 5,
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[1]?.[1] ?? []) as unknown[];
      expect(params).toContain('user-1');
      expect(params).toContain('workflow.submitted');
      expect(params).toContain(5);
    });
  });
});
