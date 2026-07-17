import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { AgentPermissionService } from '../AgentPermissionService.js';

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

const baseProfileRow = {
  id: 'profile-1',
  organization_id: ORG,
  agent_type: 'loop_agent',
  agent_name: 'Loop Agent v1',
  allowed_tools: ['search', 'summarize'],
  accessible_knowledge_sources: ['kb-1'],
  writable_resources: ['workflow'],
  approval_limits: { approve: 5000 },
  escalation_rules: [
    { condition: 'amount > 10000', escalateTo: 'manager', priority: 'high' as const },
  ],
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('AgentPermissionService', () => {
  describe('create', () => {
    it('sets tenant context and returns mapped profile', async () => {
      const pool = makePool([ok([]), ok([baseProfileRow])]);
      const svc = new AgentPermissionService(pool);

      const profile = await svc.create({
        organizationId: ORG,
        agentType: 'loop_agent',
        agentName: 'Loop Agent v1',
        allowedTools: ['search', 'summarize'],
        accessibleKnowledgeSources: ['kb-1'],
        writableResources: ['workflow'],
        approvalLimits: { approve: 5000 },
        escalationRules: [{ condition: 'amount > 10000', escalateTo: 'manager', priority: 'high' }],
      });

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(profile.id).toBe('profile-1');
      expect(profile.agentType).toBe('loop_agent');
    });

    it('throws when insert returns no rows', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentPermissionService(pool);

      await expect(
        svc.create({
          organizationId: ORG,
          agentType: 'test_agent',
          agentName: 'Test',
          allowedTools: [],
          accessibleKnowledgeSources: [],
          writableResources: [],
          approvalLimits: {},
          escalationRules: [],
        }),
      ).rejects.toThrow('Failed to create agent permission profile');
    });
  });

  describe('getByAgentType', () => {
    it('returns profile when found', async () => {
      const pool = makePool([ok([]), ok([baseProfileRow])]);
      const svc = new AgentPermissionService(pool);

      const profile = await svc.getByAgentType(ORG, 'loop_agent');

      expect(profile).not.toBeNull();
      expect(profile?.agentType).toBe('loop_agent');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentPermissionService(pool);

      const profile = await svc.getByAgentType(ORG, 'unknown_agent');
      expect(profile).toBeNull();
    });
  });

  describe('canWrite', () => {
    it('returns true when resource is in writableResources', async () => {
      const pool = makePool([ok([]), ok([baseProfileRow])]);
      const svc = new AgentPermissionService(pool);

      const result = await svc.canWrite(ORG, 'loop_agent', 'workflow');
      expect(result).toBe(true);
    });

    it('returns false when profile not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentPermissionService(pool);

      const result = await svc.canWrite(ORG, 'unknown_agent', 'workflow');
      expect(result).toBe(false);
    });

    it('returns true when wildcard * is in writableResources', async () => {
      const wildcardRow = { ...baseProfileRow, writable_resources: ['*'] };
      const pool = makePool([ok([]), ok([wildcardRow])]);
      const svc = new AgentPermissionService(pool);

      const result = await svc.canWrite(ORG, 'loop_agent', 'any_resource');
      expect(result).toBe(true);
    });
  });

  describe('canUseTool', () => {
    it('returns true when tool is in allowedTools', async () => {
      const pool = makePool([ok([]), ok([baseProfileRow])]);
      const svc = new AgentPermissionService(pool);

      const result = await svc.canUseTool(ORG, 'loop_agent', 'search');
      expect(result).toBe(true);
    });

    it('returns false when tool not allowed', async () => {
      const pool = makePool([ok([]), ok([baseProfileRow])]);
      const svc = new AgentPermissionService(pool);

      const result = await svc.canUseTool(ORG, 'loop_agent', 'delete');
      expect(result).toBe(false);
    });
  });

  describe('getApprovalLimit', () => {
    it('returns limit for specific action', async () => {
      const pool = makePool([ok([]), ok([baseProfileRow])]);
      const svc = new AgentPermissionService(pool);

      const limit = await svc.getApprovalLimit(ORG, 'loop_agent', 'approve');
      expect(limit).toBe(5000);
    });

    it('returns 0 when profile not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentPermissionService(pool);

      const limit = await svc.getApprovalLimit(ORG, 'unknown_agent', 'approve');
      expect(limit).toBe(0);
    });
  });

  describe('deactivate', () => {
    it('sets tenant context and executes update', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentPermissionService(pool);

      await svc.deactivate(ORG, 'profile-1');

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls).toHaveLength(2);
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    });
  });
});
