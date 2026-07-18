import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { DigitalTwin } from '../twin/DigitalTwin.js';

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

const ORG = '00000000-0000-0000-0000-000000000001';

// capture fires: 1 set_config + 5 parallel queries = 6 total
function makeCapturePool(overrides?: {
  statusRows?: object[];
  completedRow?: object;
  approvalRow?: object;
  memberRow?: object;
  agentRow?: object;
}): Pool {
  return makePool([
    ok([]), // set_config
    ok(
      overrides?.statusRows ?? [
        { status: 'running', count: '3' },
        { status: 'pending', count: '2' },
        { status: 'failed', count: '1' },
      ],
    ),
    ok(overrides?.completedRow !== undefined ? [overrides.completedRow] : [{ count: '10' }]),
    ok(
      overrides?.approvalRow !== undefined
        ? [overrides.approvalRow]
        : [{ pending: '4', overdue: '1', avg_resolution_hours: '2.5' }],
    ),
    ok(
      overrides?.memberRow !== undefined
        ? [overrides.memberRow]
        : [{ total: '20', active: '18', departments: '3' }],
    ),
    ok(
      overrides?.agentRow !== undefined
        ? [overrides.agentRow]
        : [{ active_executions: '2', completed_last24h: '5', failed_last24h: '1' }],
    ),
  ]);
}

describe('DigitalTwin', () => {
  describe('capture', () => {
    it('returns a complete snapshot with parsed numeric values', async () => {
      const pool = makeCapturePool();
      const twin = new DigitalTwin(pool);

      const snapshot = await twin.capture(ORG);

      expect(snapshot.organizationId).toBe(ORG);
      expect(snapshot.capturedAt).toBeDefined();

      expect(snapshot.workflowSummary.running).toBe(3);
      expect(snapshot.workflowSummary.pending).toBe(2);
      expect(snapshot.workflowSummary.failed).toBe(1);
      expect(snapshot.workflowSummary.total).toBe(6);
      expect(snapshot.workflowSummary.completedLast24h).toBe(10);

      expect(snapshot.approvalSummary.pending).toBe(4);
      expect(snapshot.approvalSummary.overdueCount).toBe(1);
      expect(snapshot.approvalSummary.avgResolutionHours).toBe(2.5);

      expect(snapshot.memberSummary.total).toBe(20);
      expect(snapshot.memberSummary.active).toBe(18);
      expect(snapshot.memberSummary.departments).toBe(3);

      expect(snapshot.agentActivity.activeExecutions).toBe(2);
      expect(snapshot.agentActivity.completedLast24h).toBe(5);
      expect(snapshot.agentActivity.failedLast24h).toBe(1);

      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0][0]).toContain('set_config');
    });

    it('handles empty result sets with zero defaults', async () => {
      const pool = makePool([
        ok([]), // set_config
        ok([]), // no workflow statuses
        ok([]), // no completed
        ok([{ pending: '0', overdue: '0', avg_resolution_hours: null }]),
        ok([{ total: '0', active: '0', departments: '0' }]),
        ok([{ active_executions: '0', completed_last24h: '0', failed_last24h: '0' }]),
      ]);
      const twin = new DigitalTwin(pool);

      const snapshot = await twin.capture(ORG);

      expect(snapshot.workflowSummary.total).toBe(0);
      expect(snapshot.workflowSummary.completedLast24h).toBe(0);
      expect(snapshot.approvalSummary.avgResolutionHours).toBe(0);
    });

    it('sets riskIndicators to zero (not yet implemented in DB)', async () => {
      const pool = makeCapturePool();
      const twin = new DigitalTwin(pool);

      const snapshot = await twin.capture(ORG);

      expect(snapshot.riskIndicators.highRiskWorkflows).toBe(0);
      expect(snapshot.riskIndicators.complianceFlags).toBe(0);
      expect(snapshot.riskIndicators.pendingEscalations).toBe(0);
    });
  });

  describe('snapshot', () => {
    it('returns the twin as a plain object', () => {
      const twin = new DigitalTwin({} as Pool);
      const data = {
        organizationId: ORG,
        capturedAt: '2026-01-01T00:00:00.000Z',
        workflowSummary: { total: 1, running: 0, pending: 1, failed: 0, completedLast24h: 0 },
        approvalSummary: { pending: 0, overdueCount: 0, avgResolutionHours: 0 },
        memberSummary: { total: 5, active: 5, departments: 1 },
        riskIndicators: { highRiskWorkflows: 0, complianceFlags: 0, pendingEscalations: 0 },
        agentActivity: { activeExecutions: 0, completedLast24h: 0, failedLast24h: 0 },
      };

      const result = twin.snapshot(data);
      expect(result).toMatchObject({ organizationId: ORG });
    });
  });
});
