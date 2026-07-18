import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { AgentRegistryService } from '../registry/AgentRegistryService.js';

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
const ACTOR_ID = '00000000-0000-0000-0000-000000000002';
const NOW = '2026-01-01T00:00:00.000Z';

const agentRow = {
  id: AGENT_ID,
  organization_id: ORG,
  name: 'Test Agent',
  description: 'A test agent',
  agent_type: 'operations_copilot',
  capabilities: ['read_workflows', 'write_tasks'],
  automation_domains: ['operations'],
  config: {},
  is_active: true,
  version: 1,
  created_by: ACTOR_ID,
  created_at: NOW,
  updated_at: NOW,
};

describe('AgentRegistryService', () => {
  describe('registerAgent', () => {
    it('inserts an agent and returns the mapped record', async () => {
      const pool = makePool([ok([]), ok([agentRow])]);
      const svc = new AgentRegistryService(pool);

      const result = await svc.registerAgent({
        organizationId: ORG,
        name: 'Test Agent',
        description: 'A test agent',
        agentType: 'operations_copilot',
        capabilities: ['read_workflows', 'write_tasks'],
        automationDomains: ['operations'],
        createdBy: ACTOR_ID,
      });

      expect(result.id).toBe(AGENT_ID);
      expect(result.organizationId).toBe(ORG);
      expect(result.name).toBe('Test Agent');
      expect(result.description).toBe('A test agent');
      expect(result.agentType).toBe('operations_copilot');
      expect(result.isActive).toBe(true);

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![0]).toContain('set_config');
      expect(calls[0]![1]).toEqual(['app.current_tenant', ORG]);
    });

    it('omits description when not provided', async () => {
      const rowNoDesc = { ...agentRow, description: null };
      const pool = makePool([ok([]), ok([rowNoDesc])]);
      const svc = new AgentRegistryService(pool);

      const result = await svc.registerAgent({
        organizationId: ORG,
        name: 'Test Agent',
        agentType: 'operations_copilot',
        capabilities: ['read_workflows'],
        automationDomains: ['operations'],
        createdBy: ACTOR_ID,
      });

      expect(result.description).toBeUndefined();
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentRegistryService(pool);

      await expect(
        svc.registerAgent({
          organizationId: ORG,
          name: 'X',
          agentType: 'custom',
          capabilities: [],
          automationDomains: [],
          createdBy: ACTOR_ID,
        }),
      ).rejects.toThrow('INSERT INTO agents returned no row');
    });
  });

  describe('getAgent', () => {
    it('returns the agent when found', async () => {
      const pool = makePool([ok([]), ok([agentRow])]);
      const svc = new AgentRegistryService(pool);

      const result = await svc.getAgent(ORG, AGENT_ID);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(AGENT_ID);

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[1]![1]).toEqual([ORG, AGENT_ID]);
    });

    it('returns null when agent not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentRegistryService(pool);

      const result = await svc.getAgent(ORG, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listAgents', () => {
    it('returns all agents for an org', async () => {
      const pool = makePool([ok([]), ok([agentRow])]);
      const svc = new AgentRegistryService(pool);

      const results = await svc.listAgents(ORG);

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe(AGENT_ID);
    });

    it('filters by agentType when provided', async () => {
      const pool = makePool([ok([]), ok([agentRow])]);
      const svc = new AgentRegistryService(pool);

      await svc.listAgents(ORG, { agentType: 'operations_copilot' });

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      const params = calls[1]![1] as unknown[];
      expect(params).toContain('operations_copilot');
    });

    it('filters by isActive when provided', async () => {
      const pool = makePool([ok([]), ok([agentRow])]);
      const svc = new AgentRegistryService(pool);

      await svc.listAgents(ORG, { isActive: true });

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      const params = calls[1]![1] as unknown[];
      expect(params).toContain(true);
    });

    it('returns empty array when no agents found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentRegistryService(pool);

      const results = await svc.listAgents(ORG);
      expect(results).toEqual([]);
    });
  });

  describe('deactivateAgent', () => {
    it('deactivates an agent and returns updated record', async () => {
      const deactivatedRow = { ...agentRow, is_active: false };
      const pool = makePool([ok([]), ok([deactivatedRow])]);
      const svc = new AgentRegistryService(pool);

      const result = await svc.deactivateAgent(ORG, AGENT_ID);

      expect(result.isActive).toBe(false);

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[1]![0]).toContain('UPDATE agents');
      expect(calls[1]![1]).toEqual([ORG, AGENT_ID]);
    });

    it('throws when agent not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentRegistryService(pool);

      await expect(svc.deactivateAgent(ORG, 'bad-id')).rejects.toThrow('Agent not found: bad-id');
    });
  });
});
