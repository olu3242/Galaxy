import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { DigitalCOOService } from '../DigitalCOOService.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const BRIEFING_ID = '00000000-0000-0000-0000-000000000002';
const ACTION_ID = '00000000-0000-0000-0000-000000000003';
const ACTOR_ID = '00000000-0000-0000-0000-000000000004';
const CORR_ID = 'corr-0000-0000-0000-000000000001';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makeBriefingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: BRIEFING_ID,
    organization_id: ORG_ID,
    health_score: '95',
    executive_summary: 'All good.',
    critical_alert_count: 0,
    autonomous_action_count: 0,
    pending_action_count: 0,
    briefing_data: { insights: [], alerts: [], items: [], actions: [] },
    correlation_id: CORR_ID,
    created_at: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeActionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ACTION_ID,
    organization_id: ORG_ID,
    briefing_id: BRIEFING_ID,
    action_type: 'notify_approver',
    subject: 'Notify approvers',
    payload: {},
    autonomy_level: 'notify',
    status: 'pending',
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    executed_at: null,
    correlation_id: CORR_ID,
    reasoning: 'bottleneck detected',
    created_at: new Date('2026-01-01'),
    ...overrides,
  };
}

// DigitalCOOService.generateBriefing call sequence:
// 1. set_config (tenant context)
// 2-6. ContextAggregator.aggregate → set_config + 5 parallel queries (workflow, approval, task, overloaded, compliance)
// 7. INSERT coo_briefings RETURNING *
// (+ any INSERT coo_actions for each action planned — depends on insights)
function makeGenerateBriefingPool(briefingRow: Record<string, unknown>): Pool {
  const responses: QueryResult[] = [
    ok([]), // 1. set_config (DigitalCOOService)
    ok([]), // 2. set_config (ContextAggregator)
    // 3-7: Promise.all in ContextAggregator (all empty → no insights → no actions)
    ok([{ total: '0', active: '0', near_sla: '0', breached: '0' }]),
    ok([{ total: '0', stale_pending: '0', oldest_days: '0' }]),
    ok([{ total: '0', open: '0' }]),
    ok([]), // overloaded
    ok([{ passed: '0', failed: '0', warnings: '0' }]),
    ok([briefingRow]), // INSERT coo_briefings
  ];
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

describe('DigitalCOOService', () => {
  describe('generateBriefing', () => {
    it('returns a COOBriefing with parsed health score', async () => {
      const pool = makeGenerateBriefingPool(makeBriefingRow());
      const svc = new DigitalCOOService(pool);
      const briefing = await svc.generateBriefing(ORG_ID, ACTOR_ID, CORR_ID);

      expect(briefing.id).toBe(BRIEFING_ID);
      expect(briefing.organizationId).toBe(ORG_ID);
      expect(briefing.healthScore).toBe(95);
      expect(briefing.correlationId).toBe(CORR_ID);
      expect(typeof briefing.createdAt).toBe('string');
    });

    it('throws when briefing insert returns no row', async () => {
      const responses: QueryResult[] = [
        ok([]),
        ok([]),
        ok([{ total: '0', active: '0', near_sla: '0', breached: '0' }]),
        ok([{ total: '0', stale_pending: '0', oldest_days: '0' }]),
        ok([{ total: '0', open: '0' }]),
        ok([]),
        ok([{ passed: '0', failed: '0', warnings: '0' }]),
        ok([]), // INSERT returns no row
      ];
      let call = 0;
      const pool: Pool = {
        query: vi.fn(() => {
          const resp = responses[call] ?? ok([]);
          call++;
          return Promise.resolve(resp);
        }),
      } as unknown as Pool;

      const svc = new DigitalCOOService(pool);
      await expect(svc.generateBriefing(ORG_ID, ACTOR_ID, CORR_ID)).rejects.toThrow(
        'INSERT INTO coo_briefings returned no row',
      );
    });
  });

  describe('getBriefingHistory', () => {
    it('returns list of briefings', async () => {
      const row = makeBriefingRow();
      const responses: QueryResult[] = [ok([]), ok([row])];
      let call = 0;
      const pool: Pool = {
        query: vi.fn(() => {
          const resp = responses[call] ?? ok([]);
          call++;
          return Promise.resolve(resp);
        }),
      } as unknown as Pool;

      const svc = new DigitalCOOService(pool);
      const history = await svc.getBriefingHistory(ORG_ID);

      expect(history).toHaveLength(1);
      expect(history[0]?.id).toBe(BRIEFING_ID);
      expect(history[0]?.healthScore).toBe(95);
    });

    it('passes limit to query', async () => {
      const responses: QueryResult[] = [ok([]), ok([])];
      let call = 0;
      const pool: Pool = {
        query: vi.fn(() => {
          const resp = responses[call] ?? ok([]);
          call++;
          return Promise.resolve(resp);
        }),
      } as unknown as Pool;

      const svc = new DigitalCOOService(pool);
      await svc.getBriefingHistory(ORG_ID, 5);

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
      expect((calls[1]?.[1] ?? [])[1]).toBe(5);
    });
  });

  describe('getBriefing', () => {
    it('returns briefing when found', async () => {
      const row = makeBriefingRow();
      const responses: QueryResult[] = [ok([]), ok([row])];
      let call = 0;
      const pool: Pool = {
        query: vi.fn(() => {
          const resp = responses[call] ?? ok([]);
          call++;
          return Promise.resolve(resp);
        }),
      } as unknown as Pool;

      const svc = new DigitalCOOService(pool);
      const briefing = await svc.getBriefing(ORG_ID, BRIEFING_ID);
      expect(briefing?.id).toBe(BRIEFING_ID);
    });

    it('returns null when not found', async () => {
      const responses: QueryResult[] = [ok([]), ok([])];
      let call = 0;
      const pool: Pool = {
        query: vi.fn(() => {
          const resp = responses[call] ?? ok([]);
          call++;
          return Promise.resolve(resp);
        }),
      } as unknown as Pool;

      const svc = new DigitalCOOService(pool);
      const briefing = await svc.getBriefing(ORG_ID, BRIEFING_ID);
      expect(briefing).toBeNull();
    });
  });

  describe('listActions', () => {
    it('returns all pending actions', async () => {
      const row = makeActionRow();
      const responses: QueryResult[] = [ok([]), ok([row])];
      let call = 0;
      const pool: Pool = {
        query: vi.fn(() => {
          const resp = responses[call] ?? ok([]);
          call++;
          return Promise.resolve(resp);
        }),
      } as unknown as Pool;

      const svc = new DigitalCOOService(pool);
      const actions = await svc.listActions(ORG_ID);

      expect(actions).toHaveLength(1);
      expect(actions[0]?.id).toBe(ACTION_ID);
      expect(actions[0]?.status).toBe('pending');
      expect(actions[0]?.approvedBy).toBeNull();
    });

    it('adds status filter to query when provided', async () => {
      const responses: QueryResult[] = [ok([]), ok([])];
      let call = 0;
      const pool: Pool = {
        query: vi.fn(() => {
          const resp = responses[call] ?? ok([]);
          call++;
          return Promise.resolve(resp);
        }),
      } as unknown as Pool;

      const svc = new DigitalCOOService(pool);
      await svc.listActions(ORG_ID, 'approved');

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
      expect(calls[1]?.[0]).toContain('status');
      expect((calls[1]?.[1] ?? [])[1]).toBe('approved');
    });
  });

  describe('approveAction', () => {
    it('marks action approved and returns it', async () => {
      const row = makeActionRow({
        status: 'approved',
        approved_by: ACTOR_ID,
        approved_at: new Date('2026-06-01'),
      });
      const responses: QueryResult[] = [ok([]), ok([row])];
      let call = 0;
      const pool: Pool = {
        query: vi.fn(() => {
          const resp = responses[call] ?? ok([]);
          call++;
          return Promise.resolve(resp);
        }),
      } as unknown as Pool;

      const svc = new DigitalCOOService(pool);
      const action = await svc.approveAction(ORG_ID, ACTION_ID, ACTOR_ID);

      expect(action.status).toBe('approved');
      expect(action.approvedBy).toBe(ACTOR_ID);
      expect(action.approvedAt).toBeDefined();

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
      expect(calls[1]?.[0]).toContain("'approved'");
      expect((calls[1]?.[1] ?? [])[0]).toBe(ACTOR_ID);
    });

    it('throws when action not found', async () => {
      const responses: QueryResult[] = [ok([]), ok([])];
      let call = 0;
      const pool: Pool = {
        query: vi.fn(() => {
          const resp = responses[call] ?? ok([]);
          call++;
          return Promise.resolve(resp);
        }),
      } as unknown as Pool;

      const svc = new DigitalCOOService(pool);
      await expect(svc.approveAction(ORG_ID, ACTION_ID, ACTOR_ID)).rejects.toThrow(
        'COO action not found',
      );
    });
  });

  describe('rejectAction', () => {
    it('marks action rejected with reason', async () => {
      const row = makeActionRow({
        status: 'rejected',
        rejected_by: ACTOR_ID,
        rejected_at: new Date('2026-06-01'),
        rejection_reason: 'Not needed',
      });
      const responses: QueryResult[] = [ok([]), ok([row])];
      let call = 0;
      const pool: Pool = {
        query: vi.fn(() => {
          const resp = responses[call] ?? ok([]);
          call++;
          return Promise.resolve(resp);
        }),
      } as unknown as Pool;

      const svc = new DigitalCOOService(pool);
      const action = await svc.rejectAction(ORG_ID, ACTION_ID, ACTOR_ID, 'Not needed');

      expect(action.status).toBe('rejected');
      expect(action.rejectedBy).toBe(ACTOR_ID);
      expect(action.rejectionReason).toBe('Not needed');

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
      expect(calls[1]?.[0]).toContain("'rejected'");
    });

    it('throws when action not found', async () => {
      const responses: QueryResult[] = [ok([]), ok([])];
      let call = 0;
      const pool: Pool = {
        query: vi.fn(() => {
          const resp = responses[call] ?? ok([]);
          call++;
          return Promise.resolve(resp);
        }),
      } as unknown as Pool;

      const svc = new DigitalCOOService(pool);
      await expect(svc.rejectAction(ORG_ID, ACTION_ID, ACTOR_ID, 'reason')).rejects.toThrow(
        'COO action not found',
      );
    });
  });
});
