import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { AgentContextEngine } from '../context/AgentContextEngine.js';

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
const AGENT_ID = '00000000-0000-0000-0000-000000000010';
const NOW = '2026-01-01T00:00:00.000Z';

const snapshotRow = {
  id: 'snap-1',
  organization_id: ORG,
  agent_id: AGENT_ID,
  execution_id: null,
  context_data: { organizationId: ORG, memberCount: 5 },
  workflow_runs: [],
  pending_approvals: [],
  recent_decisions: [],
  created_at: NOW,
};

// buildContext fires 4 parallel queries + 1 set_config + 1 INSERT = 6 total
function makeContextPool(snapshotOverride?: object): Pool {
  return makePool([
    ok([]), // set_config (setTenantContext)
    ok([]), // workflow_runs
    ok([]), // approvals
    ok([]), // decisions
    ok([{ member_count: '5', workflow_count: '2' }]), // org stats
    ok([snapshotOverride ?? snapshotRow]), // INSERT context snapshot
  ]);
}

describe('AgentContextEngine', () => {
  describe('buildContext', () => {
    it('returns a context snapshot with mapped fields', async () => {
      const pool = makeContextPool();
      const engine = new AgentContextEngine(pool);

      const snapshot = await engine.buildContext(ORG, AGENT_ID);

      expect(snapshot.id).toBe('snap-1');
      expect(snapshot.organizationId).toBe(ORG);
      expect(snapshot.agentId).toBe(AGENT_ID);
      expect(snapshot.executionId).toBeUndefined();
      expect(snapshot.workflowRuns).toEqual([]);
      expect(snapshot.pendingApprovals).toEqual([]);
    });

    it('includes executionId when provided', async () => {
      const row = { ...snapshotRow, execution_id: 'exec-1' };
      const pool = makeContextPool(row);
      const engine = new AgentContextEngine(pool);

      const snapshot = await engine.buildContext(ORG, AGENT_ID, 'exec-1');
      expect(snapshot.executionId).toBe('exec-1');

      // The INSERT params should include 'exec-1'
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      const insertCall = calls.find((c) =>
        (c[0] as string).includes('INSERT INTO agent_context_snapshots'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall?.[1]).toContain('exec-1');
    });

    it('applies automationDomains filter to workflow query', async () => {
      const pool = makeContextPool();
      const engine = new AgentContextEngine(pool);

      await engine.buildContext(ORG, AGENT_ID, undefined, { automationDomains: ['finance'] });

      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      // The workflow query params should contain ['finance']
      const wfCall = calls.find(
        (c) => (c[0] as string).includes('FROM workflow_runs') && (c[0] as string).includes('ANY('),
      );
      expect(wfCall).toBeDefined();
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([
        ok([]), // set_config
        ok([]), // workflow_runs
        ok([]), // approvals
        ok([]), // decisions
        ok([{ member_count: '0', workflow_count: '0' }]), // org stats
        ok([]), // snapshot INSERT returns nothing
      ]);
      const engine = new AgentContextEngine(pool);

      await expect(engine.buildContext(ORG, AGENT_ID)).rejects.toThrow(
        'INSERT INTO agent_context_snapshots returned no row',
      );
    });
  });
});
