import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { SLABreachPredictorService } from '../SLABreachPredictorService.js';

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

const ORG = 'org-sla';

describe('SLABreachPredictorService', () => {
  describe('computeBreachProbability', () => {
    it('sets tenant context before querying', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SLABreachPredictorService(pool);
      await svc.computeBreachProbability(ORG);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns empty array when no runs', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SLABreachPredictorService(pool);
      const result = await svc.computeBreachProbability(ORG);
      expect(result).toEqual([]);
    });

    it('returns probability of 1 when past deadline', async () => {
      const pastDeadline = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const created = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const rows = [
        {
          id: 'run-1',
          workflow_id: 'wf-1',
          created_at: created,
          sla_deadline: pastDeadline,
          status: 'in_progress',
        },
      ];
      const pool = makePool([ok([]), ok(rows)]);
      const svc = new SLABreachPredictorService(pool);
      const result = await svc.computeBreachProbability(ORG);
      expect(result[0]?.breachProbability).toBe(1);
    });

    it('returns low probability for runs well before deadline', async () => {
      const futureDeadline = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
      const created = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const rows = [
        {
          id: 'run-2',
          workflow_id: 'wf-2',
          created_at: created,
          sla_deadline: futureDeadline,
          status: 'pending',
        },
      ];
      const pool = makePool([ok([]), ok(rows)]);
      const svc = new SLABreachPredictorService(pool);
      const result = await svc.computeBreachProbability(ORG);
      // elapsed/total ~ 1/11 => prob ~ (1/11)^2 ~ 0.008
      expect(result[0]?.breachProbability).toBeGreaterThanOrEqual(0);
      expect(result[0]?.breachProbability).toBeLessThan(0.1);
    });

    it('includes workflowRunId, workflowId, organizationId on results', async () => {
      const futureDeadline = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
      const created = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const rows = [
        {
          id: 'run-3',
          workflow_id: 'wf-3',
          created_at: created,
          sla_deadline: futureDeadline,
          status: 'pending',
        },
      ];
      const pool = makePool([ok([]), ok(rows)]);
      const svc = new SLABreachPredictorService(pool);
      const result = await svc.computeBreachProbability(ORG);
      expect(result[0]?.workflowRunId).toBe('run-3');
      expect(result[0]?.workflowId).toBe('wf-3');
      expect(result[0]?.organizationId).toBe(ORG);
      expect(result[0]?.slaDeadline).toBe(futureDeadline);
    });

    it('includes status in factors', async () => {
      const futureDeadline = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
      const created = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const rows = [
        {
          id: 'run-4',
          workflow_id: 'wf-4',
          created_at: created,
          sla_deadline: futureDeadline,
          status: 'in_progress',
        },
      ];
      const pool = makePool([ok([]), ok(rows)]);
      const svc = new SLABreachPredictorService(pool);
      const result = await svc.computeBreachProbability(ORG);
      expect(result[0]?.factors.status).toBe('in_progress');
    });
  });
});
