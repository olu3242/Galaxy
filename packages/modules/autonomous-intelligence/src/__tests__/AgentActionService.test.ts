import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { AgentActionService } from '../actions/AgentActionService.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const AGENT_ID = '00000000-0000-0000-0000-000000000002';
const ACTION_ID = '00000000-0000-0000-0000-000000000003';

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

function makeActionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ACTION_ID,
    organization_id: ORG_ID,
    agent_id: AGENT_ID,
    action_type: 'fix_workflow',
    status: 'pending',
    payload: { workflowId: 'wf-1' },
    result: null,
    error_message: null,
    created_at: new Date('2026-01-01'),
    completed_at: null,
    ...overrides,
  };
}

describe('AgentActionService', () => {
  describe('recordAction', () => {
    it('inserts and returns an action', async () => {
      const row = makeActionRow();
      const pool = makePool([ok([]), ok([row])]);
      const svc = new AgentActionService(pool);
      const action = await svc.recordAction(ORG_ID, AGENT_ID, 'fix_workflow', {
        workflowId: 'wf-1',
      });

      expect(action.id).toBe(ACTION_ID);
      expect(action.agentId).toBe(AGENT_ID);
      expect(action.actionType).toBe('fix_workflow');
      expect(action.status).toBe('pending');
      expect(action.result).toBeUndefined();
      expect(action.errorMessage).toBeUndefined();
      expect(action.completedAt).toBeUndefined();

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0]?.[0]).toContain('set_config');
      expect(calls[1]?.[0]).toContain('INSERT');
      expect((calls[1]?.[1] ?? [])[0]).toBe(ORG_ID);
      expect((calls[1]?.[1] ?? [])[1]).toBe(AGENT_ID);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentActionService(pool);
      await expect(svc.recordAction(ORG_ID, AGENT_ID, 'action', {})).rejects.toThrow(
        'INSERT INTO agent_actions returned no row',
      );
    });
  });

  describe('completeAction', () => {
    it('marks action completed with result', async () => {
      const row = makeActionRow({
        status: 'completed',
        result: { fixed: true },
        completed_at: new Date('2026-01-02'),
      });
      const pool = makePool([ok([]), ok([row])]);
      const svc = new AgentActionService(pool);
      const action = await svc.completeAction(ORG_ID, ACTION_ID, { fixed: true });

      expect(action.status).toBe('completed');
      expect(action.result).toEqual({ fixed: true });
      expect(action.completedAt).toBeInstanceOf(Date);

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[1]?.[0]).toContain('UPDATE');
      expect(calls[1]?.[0]).toContain("'completed'");
    });

    it('throws when action not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentActionService(pool);
      await expect(svc.completeAction(ORG_ID, ACTION_ID, {})).rejects.toThrow(
        `AgentAction not found: ${ACTION_ID}`,
      );
    });
  });

  describe('failAction', () => {
    it('marks action failed with error message', async () => {
      const row = makeActionRow({
        status: 'failed',
        error_message: 'connection timeout',
        completed_at: new Date('2026-01-02'),
      });
      const pool = makePool([ok([]), ok([row])]);
      const svc = new AgentActionService(pool);
      const action = await svc.failAction(ORG_ID, ACTION_ID, 'connection timeout');

      expect(action.status).toBe('failed');
      expect(action.errorMessage).toBe('connection timeout');
    });

    it('throws when action not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentActionService(pool);
      await expect(svc.failAction(ORG_ID, ACTION_ID, 'err')).rejects.toThrow(
        `AgentAction not found: ${ACTION_ID}`,
      );
    });
  });

  describe('getActions', () => {
    it('returns list of actions for agent', async () => {
      const row1 = makeActionRow({ id: 'a1' });
      const row2 = makeActionRow({
        id: 'a2',
        status: 'completed',
        result: {},
        completed_at: new Date(),
      });
      const pool = makePool([ok([]), ok([row1, row2])]);
      const svc = new AgentActionService(pool);
      const actions = await svc.getActions(ORG_ID, AGENT_ID);

      expect(actions).toHaveLength(2);
      expect(actions[0]?.id).toBe('a1');
      expect(actions[1]?.status).toBe('completed');
    });

    it('passes custom limit to query', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentActionService(pool);
      await svc.getActions(ORG_ID, AGENT_ID, 10);

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[1]?.[1] ?? [])[2]).toBe(10);
    });

    it('returns empty array when no actions', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentActionService(pool);
      const actions = await svc.getActions(ORG_ID, AGENT_ID);
      expect(actions).toEqual([]);
    });
  });
});
