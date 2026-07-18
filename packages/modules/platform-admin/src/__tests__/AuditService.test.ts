import { describe, it, expect, vi } from 'vitest';
import { AuditService } from '../audit/AuditService.js';
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

const auditRow = {
  id: 'log-1',
  organization_id: 'org-1',
  actor_type: 'member',
  actor_id: 'user-1',
  action: 'workflow.submitted',
  resource_type: 'workflow',
  resource_id: 'wf-1',
  metadata: { key: 'value' },
  ip_address: '127.0.0.1',
  created_at: '2024-01-01T00:00:00Z',
};

describe('AuditService', () => {
  describe('log', () => {
    it('inserts and returns mapped audit log', async () => {
      const pool = makePool([ok([auditRow])]);
      const svc = new AuditService(pool);
      const result = await svc.log({
        organizationId: 'org-1',
        actorType: 'member',
        actorId: 'user-1',
        action: 'workflow.submitted',
        resourceType: 'workflow',
        resourceId: 'wf-1',
        metadata: { key: 'value' },
        ipAddress: '127.0.0.1',
      });
      expect(result.id).toBe('log-1');
      expect(result.organizationId).toBe('org-1');
      expect(result.action).toBe('workflow.submitted');
      expect(result.ipAddress).toBe('127.0.0.1');
    });

    it('passes null for optional fields when omitted', async () => {
      const pool = makePool([ok([{ ...auditRow, organization_id: null, ip_address: null }])]);
      const svc = new AuditService(pool);
      await svc.log({ actorType: 'system', actorId: 'sys', action: 'boot' });
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      const params = calls[0][1] as unknown[];
      expect(params[0]).toBeNull(); // organizationId
      expect(params[7]).toBeNull(); // ipAddress
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new AuditService(pool);
      await expect(
        svc.log({ actorType: 'system', actorId: 'sys', action: 'boot' }),
      ).rejects.toThrow('Audit log insert failed');
    });
  });

  describe('queryLogs', () => {
    it('returns mapped logs', async () => {
      const pool = makePool([ok([auditRow])]);
      const svc = new AuditService(pool);
      const results = await svc.queryLogs({});
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('log-1');
    });

    it('returns empty array when no logs', async () => {
      const pool = makePool([ok([])]);
      const svc = new AuditService(pool);
      const results = await svc.queryLogs({});
      expect(results).toHaveLength(0);
    });

    it('passes organizationId filter', async () => {
      const pool = makePool([ok([])]);
      const svc = new AuditService(pool);
      await svc.queryLogs({ organizationId: 'org-1' });
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0][1]).toContain('org-1');
    });

    it('passes actorId and action filters', async () => {
      const pool = makePool([ok([])]);
      const svc = new AuditService(pool);
      await svc.queryLogs({ actorId: 'user-1', action: 'workflow.submitted' });
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      const params = calls[0][1] as unknown[];
      expect(params).toContain('user-1');
      expect(params).toContain('workflow.submitted');
    });

    it('passes limit and offset', async () => {
      const pool = makePool([ok([])]);
      const svc = new AuditService(pool);
      await svc.queryLogs({ limit: 5, offset: 15 });
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      const params = calls[0][1] as unknown[];
      expect(params).toContain(5);
      expect(params).toContain(15);
    });
  });
});
