import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { EscalationService } from '../EscalationService.js';

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

const escalationRow = {
  id: 'esc-1',
  organization_id: ORG,
  escalation_type: 'manager',
  status: 'pending',
  resource_type: 'workflow',
  resource_id: 'wf-1',
  reason: 'SLA exceeded',
  escalated_to: 'manager-1',
  escalated_by: 'system',
  due_at: null,
  acknowledged_at: null,
  resolved_at: null,
  created_at: NOW,
};

describe('EscalationService', () => {
  describe('escalate', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([escalationRow])]);
      const svc = new EscalationService(pool);
      await svc.escalate(ORG, 'manager', 'workflow', 'wf-1', 'SLA exceeded', 'manager-1', 'system');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns mapped escalation record', async () => {
      const pool = makePool([ok([]), ok([escalationRow])]);
      const svc = new EscalationService(pool);
      const result = await svc.escalate(
        ORG,
        'manager',
        'workflow',
        'wf-1',
        'SLA exceeded',
        'manager-1',
        'system',
      );
      expect(result.id).toBe('esc-1');
      expect(result.escalationType).toBe('manager');
      expect(result.status).toBe('pending');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new EscalationService(pool);
      await expect(
        svc.escalate(ORG, 'manager', 'workflow', 'wf-1', 'reason', 'to', 'by'),
      ).rejects.toThrow('Failed to create escalation');
    });
  });

  describe('acknowledge', () => {
    it('sets tenant context and returns acknowledged record', async () => {
      const ackRow = { ...escalationRow, status: 'acknowledged', acknowledged_at: NOW };
      const pool = makePool([ok([]), ok([ackRow])]);
      const svc = new EscalationService(pool);
      const result = await svc.acknowledge(ORG, 'esc-1');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result.status).toBe('acknowledged');
    });

    it('throws when escalation not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new EscalationService(pool);
      await expect(svc.acknowledge(ORG, 'missing')).rejects.toThrow('Escalation not found');
    });
  });

  describe('resolve', () => {
    it('sets tenant context and returns resolved record', async () => {
      const resolvedRow = { ...escalationRow, status: 'resolved', resolved_at: NOW };
      const pool = makePool([ok([]), ok([resolvedRow])]);
      const svc = new EscalationService(pool);
      const result = await svc.resolve(ORG, 'esc-1');
      expect(result.status).toBe('resolved');
      expect(result.resolvedAt).toBe(NOW);
    });

    it('throws when escalation not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new EscalationService(pool);
      await expect(svc.resolve(ORG, 'missing')).rejects.toThrow('Escalation not found');
    });
  });

  describe('listEscalations', () => {
    it('returns all escalations without filter', async () => {
      const pool = makePool([ok([]), ok([escalationRow])]);
      const svc = new EscalationService(pool);
      const results = await svc.listEscalations(ORG);
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('esc-1');
    });

    it('adds status filter when provided', async () => {
      const pool = makePool([ok([]), ok([escalationRow])]);
      const svc = new EscalationService(pool);
      await svc.listEscalations(ORG, 'pending');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(String(calls[1]?.[0])).toContain('status');
    });
  });

  describe('checkTimeouts', () => {
    it('sets tenant context and returns count of timed out records', async () => {
      const pool = makePool([ok([]), { ...ok([{ id: 'esc-1' }, { id: 'esc-2' }]), rowCount: 2 }]);
      const svc = new EscalationService(pool);
      const count = await svc.checkTimeouts(ORG);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(count).toBe(2);
    });

    it('returns 0 when no timeouts', async () => {
      const pool = makePool([ok([]), { ...ok([]), rowCount: 0 }]);
      const svc = new EscalationService(pool);
      const count = await svc.checkTimeouts(ORG);
      expect(count).toBe(0);
    });
  });
});
