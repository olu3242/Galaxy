import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { AgentRegistryService } from '../agents/AgentRegistryService.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const AGENT_ID = '00000000-0000-0000-0000-000000000002';

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

function makeAgentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: AGENT_ID,
    organization_id: ORG_ID,
    agent_type: 'learning',
    status: 'idle',
    last_run_at: null,
    next_run_at: null,
    config: { interval: 60 },
    metrics: {},
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('AgentRegistryService', () => {
  describe('registerAgent', () => {
    it('inserts and returns an agent', async () => {
      const row = makeAgentRow();
      const pool = makePool([ok([]), ok([row])]);
      const svc = new AgentRegistryService(pool);
      const agent = await svc.registerAgent(ORG_ID, 'learning', { interval: 60 });

      expect(agent.id).toBe(AGENT_ID);
      expect(agent.organizationId).toBe(ORG_ID);
      expect(agent.agentType).toBe('learning');
      expect(agent.status).toBe('idle');
      expect(agent.lastRunAt).toBeUndefined();
      expect(agent.nextRunAt).toBeUndefined();

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
      expect(calls).toHaveLength(2);
      // first call: set_config
      expect(calls[0]?.[0]).toContain('set_config');
      // second call: INSERT
      expect(calls[1]?.[0]).toContain('INSERT');
      expect((calls[1]?.[1] ?? [])[0]).toBe(ORG_ID);
      expect((calls[1]?.[1] ?? [])[1]).toBe('learning');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentRegistryService(pool);
      await expect(svc.registerAgent(ORG_ID, 'guardian', {})).rejects.toThrow(
        'INSERT INTO autonomous_agents returned no row',
      );
    });

    it('maps optional date fields when present', async () => {
      const row = makeAgentRow({
        last_run_at: new Date('2026-06-01'),
        next_run_at: new Date('2026-06-02'),
      });
      const pool = makePool([ok([]), ok([row])]);
      const svc = new AgentRegistryService(pool);
      const agent = await svc.registerAgent(ORG_ID, 'learning', {});

      expect(agent.lastRunAt).toBeInstanceOf(Date);
      expect(agent.nextRunAt).toBeInstanceOf(Date);
    });
  });

  describe('getAgent', () => {
    it('returns an agent by id', async () => {
      const row = makeAgentRow();
      const pool = makePool([ok([]), ok([row])]);
      const svc = new AgentRegistryService(pool);
      const agent = await svc.getAgent(ORG_ID, AGENT_ID);

      expect(agent.id).toBe(AGENT_ID);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
      expect((calls[1]?.[1] ?? [])[1]).toBe(AGENT_ID);
    });

    it('throws when agent not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentRegistryService(pool);
      await expect(svc.getAgent(ORG_ID, AGENT_ID)).rejects.toThrow(`Agent not found: ${AGENT_ID}`);
    });
  });

  describe('listAgents', () => {
    it('returns all agents for org', async () => {
      const row1 = makeAgentRow({ id: AGENT_ID, agent_type: 'learning' });
      const row2 = makeAgentRow({ id: 'other-id', agent_type: 'guardian' });
      const pool = makePool([ok([]), ok([row1, row2])]);
      const svc = new AgentRegistryService(pool);
      const agents = await svc.listAgents(ORG_ID);

      expect(agents).toHaveLength(2);
      expect(agents[0]?.agentType).toBe('learning');
      expect(agents[1]?.agentType).toBe('guardian');
    });

    it('returns empty array when no agents', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentRegistryService(pool);
      const agents = await svc.listAgents(ORG_ID);
      expect(agents).toEqual([]);
    });
  });

  describe('updateAgentStatus', () => {
    it('updates and returns agent with new status', async () => {
      const row = makeAgentRow({ status: 'running' });
      const pool = makePool([ok([]), ok([row])]);
      const svc = new AgentRegistryService(pool);
      const agent = await svc.updateAgentStatus(ORG_ID, AGENT_ID, 'running');

      expect(agent.status).toBe('running');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
      expect(calls[1]?.[0]).toContain('UPDATE');
      expect((calls[1]?.[1] ?? [])[2]).toBe('running');
    });

    it('throws when agent not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentRegistryService(pool);
      await expect(svc.updateAgentStatus(ORG_ID, AGENT_ID, 'paused')).rejects.toThrow(
        `Agent not found: ${AGENT_ID}`,
      );
    });
  });

  describe('updateAgentMetrics', () => {
    it('updates metrics and returns agent', async () => {
      const row = makeAgentRow({ metrics: { runs: 5 } });
      const pool = makePool([ok([]), ok([row])]);
      const svc = new AgentRegistryService(pool);
      const agent = await svc.updateAgentMetrics(ORG_ID, AGENT_ID, { runs: 5 });

      expect(agent.metrics).toEqual({ runs: 5 });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
      expect(calls[1]?.[0]).toContain('UPDATE');
    });

    it('throws when agent not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentRegistryService(pool);
      await expect(svc.updateAgentMetrics(ORG_ID, AGENT_ID, {})).rejects.toThrow(
        `Agent not found: ${AGENT_ID}`,
      );
    });
  });
});
