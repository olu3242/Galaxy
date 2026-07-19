import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
  GovernanceEnforcementService,
  RESTRICTED_ACTIONS,
} from '../GovernanceEnforcementService.js';

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
const NOW = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

const approvalRow = {
  id: 'appr-1',
  organization_id: ORG,
  action_type: 'terminate_employee',
  requested_by: 'user-1',
  resource_type: 'member',
  resource_id: 'member-1',
  context: {},
  status: 'pending',
  approved_by: null,
  approval_note: null,
  expires_at: FUTURE,
  created_at: NOW,
  resolved_at: null,
};

describe('GovernanceEnforcementService', () => {
  describe('isRestricted', () => {
    const svc = new GovernanceEnforcementService({ query: vi.fn() } as unknown as Pool);

    it('returns true for all restricted actions', () => {
      for (const action of RESTRICTED_ACTIONS) {
        expect(svc.isRestricted(action)).toBe(true);
      }
    });

    it('returns false for non-restricted action', () => {
      expect(svc.isRestricted('send_message' as Parameters<typeof svc.isRestricted>[0])).toBe(
        false,
      );
    });
  });

  describe('requestApproval', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([approvalRow])]);
      const svc = new GovernanceEnforcementService(pool);
      await svc.requestApproval(ORG, 'terminate_employee', 'user-1', 'member', 'member-1');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns approval request for restricted action', async () => {
      const pool = makePool([ok([]), ok([approvalRow])]);
      const svc = new GovernanceEnforcementService(pool);
      const result = await svc.requestApproval(
        ORG,
        'terminate_employee',
        'user-1',
        'member',
        'member-1',
      );
      expect(result.id).toBe('appr-1');
      expect(result.status).toBe('pending');
      expect(result.actionType).toBe('terminate_employee');
    });

    it('throws for non-restricted action type', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new GovernanceEnforcementService(pool);
      await expect(
        svc.requestApproval(
          ORG,
          'send_message' as Parameters<typeof svc.requestApproval>[1],
          'user-1',
          'member',
          'member-1',
        ),
      ).rejects.toThrow('does not require governance approval');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new GovernanceEnforcementService(pool);
      await expect(
        svc.requestApproval(ORG, 'transfer_funds', 'user-1', 'account', 'acc-1'),
      ).rejects.toThrow('Failed to create governance approval request');
    });
  });

  describe('approve', () => {
    it('sets tenant context and returns approved record', async () => {
      const approvedRow = {
        ...approvalRow,
        status: 'approved',
        approved_by: 'approver-1',
        resolved_at: NOW,
      };
      const pool = makePool([ok([]), ok([approvedRow])]);
      const svc = new GovernanceEnforcementService(pool);
      const result = await svc.approve(ORG, 'appr-1', 'approver-1', 'LGTM');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result.status).toBe('approved');
      expect(result.approvedBy).toBe('approver-1');
    });

    it('throws when approval not found or expired', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new GovernanceEnforcementService(pool);
      await expect(svc.approve(ORG, 'missing', 'approver-1')).rejects.toThrow(
        'Approval request not found',
      );
    });
  });

  describe('reject', () => {
    it('sets tenant context and returns rejected record', async () => {
      const rejectedRow = {
        ...approvalRow,
        status: 'rejected',
        approved_by: 'approver-1',
        approval_note: 'no',
        resolved_at: NOW,
      };
      const pool = makePool([ok([]), ok([rejectedRow])]);
      const svc = new GovernanceEnforcementService(pool);
      const result = await svc.reject(ORG, 'appr-1', 'approver-1', 'no');
      expect(result.status).toBe('rejected');
    });

    it('throws when approval not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new GovernanceEnforcementService(pool);
      await expect(svc.reject(ORG, 'missing', 'approver-1')).rejects.toThrow(
        'Approval request not found',
      );
    });
  });

  describe('listPendingApprovals', () => {
    it('sets tenant context and returns pending approvals', async () => {
      const pool = makePool([ok([]), ok([approvalRow])]);
      const svc = new GovernanceEnforcementService(pool);
      const results = await svc.listPendingApprovals(ORG);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(results).toHaveLength(1);
      expect(results[0]?.status).toBe('pending');
    });
  });

  describe('expireStale', () => {
    it('sets tenant context and returns expired count', async () => {
      const pool = makePool([ok([]), { ...ok([]), rowCount: 3 }]);
      const svc = new GovernanceEnforcementService(pool);
      const count = await svc.expireStale(ORG);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(count).toBe(3);
    });
  });
});
