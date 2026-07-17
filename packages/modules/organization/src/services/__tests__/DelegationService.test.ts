import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { DelegationService } from '../DelegationService.js';

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

const baseDelegationRow = {
  id: 'del-1',
  organization_id: ORG,
  delegator_id: 'user-1',
  delegatee_id: 'user-2',
  role_id: null,
  permissions: ['workflow:approve'],
  reason: 'vacation',
  start_at: '2024-01-01T00:00:00Z',
  end_at: '2024-12-31T23:59:59Z',
  is_active: true,
  approved_by: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('DelegationService', () => {
  describe('create', () => {
    it('sets tenant context and returns mapped delegation', async () => {
      const pool = makePool([ok([]), ok([baseDelegationRow])]);
      const svc = new DelegationService(pool);

      const delegation = await svc.create({
        organizationId: ORG,
        delegatorId: 'user-1',
        delegateeId: 'user-2',
        permissions: ['workflow:approve'],
        reason: 'vacation',
        startAt: '2024-01-01T00:00:00Z',
        endAt: '2024-12-31T23:59:59Z',
      });

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(delegation.id).toBe('del-1');
      expect(delegation.permissions).toEqual(['workflow:approve']);
    });

    it('throws when insert returns no rows', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new DelegationService(pool);

      await expect(
        svc.create({
          organizationId: ORG,
          delegatorId: 'user-1',
          delegateeId: 'user-2',
          permissions: [],
          reason: 'emergency_access',
          startAt: '2024-01-01T00:00:00Z',
          endAt: '2024-01-02T00:00:00Z',
        }),
      ).rejects.toThrow('Failed to create delegation');
    });

    it('maps optional roleId and approvedBy when present', async () => {
      const rowWithRole = { ...baseDelegationRow, role_id: 'role-1', approved_by: 'admin-1' };
      const pool = makePool([ok([]), ok([rowWithRole])]);
      const svc = new DelegationService(pool);

      const delegation = await svc.create({
        organizationId: ORG,
        delegatorId: 'user-1',
        delegateeId: 'user-2',
        roleId: 'role-1',
        permissions: [],
        reason: 'acting_manager',
        startAt: '2024-01-01T00:00:00Z',
        endAt: '2024-01-31T00:00:00Z',
        approvedBy: 'admin-1',
      });

      expect(delegation.roleId).toBe('role-1');
      expect(delegation.approvedBy).toBe('admin-1');
    });
  });

  describe('getActive', () => {
    it('returns active delegations for delegatee', async () => {
      const pool = makePool([ok([]), ok([baseDelegationRow])]);
      const svc = new DelegationService(pool);

      const delegations = await svc.getActive(ORG, 'user-2');

      expect(delegations).toHaveLength(1);
      expect(delegations[0]?.delegateeId).toBe('user-2');
    });

    it('returns empty array when no active delegations', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new DelegationService(pool);

      const delegations = await svc.getActive(ORG, 'user-999');
      expect(delegations).toEqual([]);
    });
  });

  describe('revoke', () => {
    it('sets tenant context and executes update', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new DelegationService(pool);

      await svc.revoke(ORG, 'del-1');

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls).toHaveLength(2);
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    });
  });

  describe('expireStale', () => {
    it('returns count of expired delegations', async () => {
      const pool = makePool([ok([]), ok([{ count: '3' }])]);
      const svc = new DelegationService(pool);

      const count = await svc.expireStale(ORG);
      expect(count).toBe(3);
    });

    it('returns 0 when no stale delegations', async () => {
      const pool = makePool([ok([]), ok([{ count: '0' }])]);
      const svc = new DelegationService(pool);

      const count = await svc.expireStale(ORG);
      expect(count).toBe(0);
    });
  });
});
