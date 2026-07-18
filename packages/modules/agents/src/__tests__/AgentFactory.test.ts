import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { AgentFactory } from '../factory/AgentFactory.js';
import { ALL_MANIFESTS } from '../manifests/index.js';

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
const NOW = '2026-01-01T00:00:00.000Z';

const agentConfigRow = {
  id: 'agent-cfg-1',
  organization_id: ORG,
  name: 'ALICE',
  agent_type: 'alice',
  capabilities: ['read_workflows', 'read_analytics'],
  automation_domains: ['executive', 'governance'],
  config: { manifestId: 'AG-001' },
  is_active: true,
  version: 1,
  created_by: ACTOR_ID,
  created_at: NOW,
  updated_at: NOW,
};

describe('AgentFactory', () => {
  describe('provision', () => {
    it('provisions an agent from a known manifest and returns the agent', async () => {
      const pool = makePool([ok([]), ok([agentConfigRow])]);
      const factory = new AgentFactory(pool);

      const agent = await factory.provision({
        organizationId: ORG,
        agentType: 'alice',
        createdBy: ACTOR_ID,
      });

      expect(agent.id).toBe('agent-cfg-1');
      expect(agent.organizationId).toBe(ORG);
      expect(agent.agentType).toBe('alice');
      expect(agent.isActive).toBe(true);

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      // first call is set_config
      expect(calls[0]![0]).toContain('set_config');
      expect(calls[0]![1]).toEqual(['app.current_tenant', ORG]);
      // second call is INSERT
      expect(calls[1]![0]).toContain('INSERT INTO agent_configs');
    });

    it('uses nameOverride when provided', async () => {
      const pool = makePool([ok([]), ok([{ ...agentConfigRow, name: 'Custom Alice' }])]);
      const factory = new AgentFactory(pool);

      const agent = await factory.provision({
        organizationId: ORG,
        agentType: 'alice',
        createdBy: ACTOR_ID,
        nameOverride: 'Custom Alice',
      });

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      const insertParams = calls[1]![1] as unknown[];
      expect(insertParams[1]).toBe('Custom Alice');
      expect(agent.name).toBe('Custom Alice');
    });

    it('merges configOverride with manifest config', async () => {
      const pool = makePool([ok([]), ok([agentConfigRow])]);
      const factory = new AgentFactory(pool);

      await factory.provision({
        organizationId: ORG,
        agentType: 'alice',
        createdBy: ACTOR_ID,
        configOverride: { customSetting: true },
      });

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      const insertParams = calls[1]![1] as unknown[];
      const configStr = insertParams[5] as string;
      const config = JSON.parse(configStr) as Record<string, unknown>;
      expect(config.customSetting).toBe(true);
      expect(config.manifestId).toBe('AG-001');
    });

    it('throws for unknown agent type', async () => {
      const pool = makePool([ok([])]);
      const factory = new AgentFactory(pool);

      await expect(
        factory.provision({
          organizationId: ORG,
          agentType: 'custom',
          createdBy: ACTOR_ID,
        }),
      ).rejects.toThrow('No manifest found for agent type: custom');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const factory = new AgentFactory(pool);

      await expect(
        factory.provision({
          organizationId: ORG,
          agentType: 'alice',
          createdBy: ACTOR_ID,
        }),
      ).rejects.toThrow('Failed to provision agent — INSERT returned no row');
    });

    it('can provision all manifest agent types without throwing (manifest lookup)', () => {
      const manifestTypes = ALL_MANIFESTS.map((m) => m.agentType);
      expect(manifestTypes).toContain('alice');
      expect(manifestTypes).toContain('guardian');
      expect(manifestTypes).toHaveLength(15);
    });
  });
});
