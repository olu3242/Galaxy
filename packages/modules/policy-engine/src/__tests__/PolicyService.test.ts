import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PolicyService } from '../policies/PolicyService.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const POLICY_ID = '00000000-0000-0000-0000-000000000002';

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

const policyRow = {
  id: POLICY_ID,
  organization_id: ORG_ID,
  name: 'Test Policy',
  description: 'A test policy',
  status: 'draft',
  enforcement_mode: 'enforce',
  version: 1,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
};

describe('PolicyService', () => {
  describe('createPolicy', () => {
    it('sets tenant context before insert', async () => {
      const pool = makePool([ok([]), ok([policyRow])]);
      const svc = new PolicyService(pool);
      await svc.createPolicy(ORG_ID, 'Test Policy', 'A test policy', 'enforce');

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG_ID,
      ]);
    });

    it('returns a typed Policy domain object on success', async () => {
      const pool = makePool([ok([]), ok([policyRow])]);
      const svc = new PolicyService(pool);
      const policy = await svc.createPolicy(ORG_ID, 'Test Policy', 'A test policy', 'enforce');

      expect(policy.id).toBe(POLICY_ID);
      expect(policy.organizationId).toBe(ORG_ID);
      expect(policy.name).toBe('Test Policy');
      expect(policy.description).toBe('A test policy');
      expect(policy.status).toBe('draft');
      expect(policy.enforcementMode).toBe('enforce');
      expect(policy.version).toBe(1);
    });

    it('passes description as null when undefined', async () => {
      const rowNoDesc = { ...policyRow, description: null };
      const pool = makePool([ok([]), ok([rowNoDesc])]);
      const svc = new PolicyService(pool);
      await svc.createPolicy(ORG_ID, 'Test Policy', undefined, 'audit');

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO policies'), [
        ORG_ID,
        'Test Policy',
        null,
        'audit',
      ]);
    });

    it('omits description key when DB returns null', async () => {
      const rowNoDesc = { ...policyRow, description: null };
      const pool = makePool([ok([]), ok([rowNoDesc])]);
      const svc = new PolicyService(pool);
      const policy = await svc.createPolicy(ORG_ID, 'Test Policy', undefined, 'enforce');

      expect('description' in policy).toBe(false);
    });

    it('throws when insert returns no rows', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PolicyService(pool);
      await expect(svc.createPolicy(ORG_ID, 'Bad', undefined, 'enforce')).rejects.toThrow(
        'Failed to create policy',
      );
    });

    it('uses parameterized query — no string interpolation', async () => {
      const maliciousOrgId = "'; DROP TABLE policies; --";
      const pool = makePool([ok([]), ok([policyRow])]);
      const svc = new PolicyService(pool);
      // If this throws due to no row, fine — we only care the query was parameterized
      await svc.createPolicy(maliciousOrgId, 'Test', undefined, 'enforce').catch(() => undefined);

      const mock = pool.query as ReturnType<typeof vi.fn>;
      const calls = mock.mock.calls as unknown as [string, unknown[]][];
      for (const [sql] of calls) {
        expect(sql).not.toContain(maliciousOrgId);
      }
    });
  });

  describe('getPolicy', () => {
    it('sets tenant context before select', async () => {
      const pool = makePool([ok([]), ok([policyRow])]);
      const svc = new PolicyService(pool);
      await svc.getPolicy(ORG_ID, POLICY_ID);

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG_ID,
      ]);
    });

    it('returns the policy when found', async () => {
      const pool = makePool([ok([]), ok([policyRow])]);
      const svc = new PolicyService(pool);
      const policy = await svc.getPolicy(ORG_ID, POLICY_ID);

      expect(policy.id).toBe(POLICY_ID);
      expect(policy.name).toBe('Test Policy');
    });

    it('throws when policy not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PolicyService(pool);
      await expect(svc.getPolicy(ORG_ID, POLICY_ID)).rejects.toThrow('Policy not found');
    });

    it('passes orgId and policyId as parameters', async () => {
      const pool = makePool([ok([]), ok([policyRow])]);
      const svc = new PolicyService(pool);
      await svc.getPolicy(ORG_ID, POLICY_ID);

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(2, expect.stringContaining('FROM policies'), [
        ORG_ID,
        POLICY_ID,
      ]);
    });
  });

  describe('listPolicies', () => {
    it('sets tenant context before select', async () => {
      const pool = makePool([ok([]), ok([policyRow])]);
      const svc = new PolicyService(pool);
      await svc.listPolicies(ORG_ID);

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG_ID,
      ]);
    });

    it('returns all policies mapped to domain objects', async () => {
      const secondRow = { ...policyRow, id: '00000000-0000-0000-0000-000000000099', name: 'P2' };
      const pool = makePool([ok([]), ok([policyRow, secondRow])]);
      const svc = new PolicyService(pool);
      const list = await svc.listPolicies(ORG_ID);

      expect(list).toHaveLength(2);
      expect(list[0]?.id).toBe(POLICY_ID);
      expect(list[1]?.name).toBe('P2');
    });

    it('returns empty array when no policies exist', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PolicyService(pool);
      const list = await svc.listPolicies(ORG_ID);

      expect(list).toEqual([]);
    });
  });

  describe('activatePolicy', () => {
    const activeRow = { ...policyRow, status: 'active' };

    it('sets tenant context before update', async () => {
      const pool = makePool([ok([]), ok([activeRow])]);
      const svc = new PolicyService(pool);
      await svc.activatePolicy(ORG_ID, POLICY_ID);

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG_ID,
      ]);
    });

    it('returns policy with status active', async () => {
      const pool = makePool([ok([]), ok([activeRow])]);
      const svc = new PolicyService(pool);
      const policy = await svc.activatePolicy(ORG_ID, POLICY_ID);

      expect(policy.status).toBe('active');
    });

    it('throws when policy not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PolicyService(pool);
      await expect(svc.activatePolicy(ORG_ID, POLICY_ID)).rejects.toThrow('Policy not found');
    });

    it('issues UPDATE with parameterized orgId and policyId', async () => {
      const pool = makePool([ok([]), ok([activeRow])]);
      const svc = new PolicyService(pool);
      await svc.activatePolicy(ORG_ID, POLICY_ID);

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE policies'), [
        ORG_ID,
        POLICY_ID,
      ]);
    });
  });

  describe('deactivatePolicy', () => {
    const inactiveRow = { ...policyRow, status: 'inactive' };

    it('returns policy with status inactive', async () => {
      const pool = makePool([ok([]), ok([inactiveRow])]);
      const svc = new PolicyService(pool);
      const policy = await svc.deactivatePolicy(ORG_ID, POLICY_ID);

      expect(policy.status).toBe('inactive');
    });

    it('throws when policy not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PolicyService(pool);
      await expect(svc.deactivatePolicy(ORG_ID, POLICY_ID)).rejects.toThrow('Policy not found');
    });

    it('issues UPDATE with parameterized orgId and policyId', async () => {
      const pool = makePool([ok([]), ok([inactiveRow])]);
      const svc = new PolicyService(pool);
      await svc.deactivatePolicy(ORG_ID, POLICY_ID);

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE policies'), [
        ORG_ID,
        POLICY_ID,
      ]);
    });
  });

  describe('cross-tenant isolation', () => {
    it('scopes query to the requesting orgId, not another tenant', async () => {
      const OTHER_ORG = '00000000-0000-0000-0000-000000000099';
      const pool = makePool([ok([]), ok([policyRow])]);
      const svc = new PolicyService(pool);
      await svc.getPolicy(ORG_ID, POLICY_ID);

      const mock = pool.query as ReturnType<typeof vi.fn>;
      const calls = mock.mock.calls as unknown as [string, unknown[]][];
      const tenantCall = calls[0];
      // Tenant context must reference ORG_ID, not OTHER_ORG
      expect(tenantCall).toEqual([
        'SELECT set_config($1, $2, true)',
        ['app.current_tenant', ORG_ID],
      ]);
      const dataCall = calls[1];
      expect(dataCall?.[1]).not.toContain(OTHER_ORG);
    });
  });
});
