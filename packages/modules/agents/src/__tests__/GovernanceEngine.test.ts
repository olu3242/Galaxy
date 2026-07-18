import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { GovernanceEngine } from '../governance/GovernanceEngine.js';

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
const ACTOR_ID = '00000000-0000-0000-0000-000000000002';

const memberRow = { id: ACTOR_ID, role: 'manager' };

describe('GovernanceEngine', () => {
  describe('validateCapability', () => {
    it('allows manager to use write_tasks capability', async () => {
      const pool = makePool([ok([]), ok([memberRow])]);
      const engine = new GovernanceEngine(pool);

      const result = await engine.validateCapability(ORG, ACTOR_ID, 'write_tasks');

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('manager');

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]).toEqual(['app.current_tenant', ORG]);
      expect(calls[1]![1]).toEqual([ORG, ACTOR_ID]);
    });

    it('allows member to read workflows', async () => {
      const pool = makePool([ok([]), ok([{ id: ACTOR_ID, role: 'member' }])]);
      const engine = new GovernanceEngine(pool);

      const result = await engine.validateCapability(ORG, ACTOR_ID, 'read_workflows');
      expect(result.allowed).toBe(true);
    });

    it('denies member from using write_tasks', async () => {
      const pool = makePool([ok([]), ok([{ id: ACTOR_ID, role: 'member' }])]);
      const engine = new GovernanceEngine(pool);

      const result = await engine.validateCapability(ORG, ACTOR_ID, 'write_tasks');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not authorized');
    });

    it('denies when actor is not a member', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new GovernanceEngine(pool);

      const result = await engine.validateCapability(ORG, ACTOR_ID, 'approve_decisions');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not an active member');
    });

    it('defaults to member role when role is null', async () => {
      const pool = makePool([ok([]), ok([{ id: ACTOR_ID, role: null }])]);
      const engine = new GovernanceEngine(pool);

      // read_workflows is allowed for member role
      const result = await engine.validateCapability(ORG, ACTOR_ID, 'read_workflows');
      expect(result.allowed).toBe(true);
    });
  });

  describe('validateAgentWriteAction', () => {
    it('returns allowed for a manager performing create_task', async () => {
      // setTenantContext (1) + validateCapability setTenantContext (2) + member query (3)
      const pool = makePool([ok([]), ok([]), ok([memberRow])]);
      const engine = new GovernanceEngine(pool);

      const result = await engine.validateAgentWriteAction(ORG, ACTOR_ID, 'create_task', {});

      expect(result.allowed).toBe(true);
      expect(result.auditTrail).toMatchObject({ actorId: ACTOR_ID, action: 'create_task' });
    });

    it('returns not allowed for unknown action', async () => {
      const pool = makePool([ok([])]);
      const engine = new GovernanceEngine(pool);

      const result = await engine.validateAgentWriteAction(ORG, ACTOR_ID, 'unknown_action', {});

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Unknown action');
    });

    it('maps approve_decision to approve_decisions capability', async () => {
      const pool = makePool([ok([]), ok([]), ok([memberRow])]);
      const engine = new GovernanceEngine(pool);

      const result = await engine.validateAgentWriteAction(ORG, ACTOR_ID, 'approve_decision', {});
      expect(result.allowed).toBe(true);
    });

    it('includes context in audit trail', async () => {
      const pool = makePool([ok([]), ok([]), ok([memberRow])]);
      const engine = new GovernanceEngine(pool);

      const ctx = { workflowId: 'wf-1' };
      const result = await engine.validateAgentWriteAction(ORG, ACTOR_ID, 'trigger_workflow', ctx);

      expect(result.auditTrail).toMatchObject({ context: ctx });
    });
  });
});
