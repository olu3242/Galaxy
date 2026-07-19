import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ApprovalMatrixService } from '../ApprovalMatrixService.js';

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

const baseRuleRow = {
  id: 'rule-1',
  organization_id: ORG,
  workflow_type: 'expense',
  department_id: null,
  min_amount: null,
  max_amount: null,
  min_risk_score: null,
  max_risk_score: null,
  required_role: 'manager',
  tier: 2,
  requires_multiple_approvers: false,
  approver_count: 1,
  escalation_after_hours: 24,
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('ApprovalMatrixService', () => {
  describe('evaluate', () => {
    it('sets tenant context as first query', async () => {
      // evaluate: setTenant + query rules + findApprovers
      const pool = makePool([ok([]), ok([baseRuleRow]), ok([{ user_id: 'u-1' }])]);
      const svc = new ApprovalMatrixService(pool);

      await svc.evaluate({ organizationId: ORG, workflowType: 'expense' });

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    });

    it('returns null when no matching rules', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ApprovalMatrixService(pool);

      const result = await svc.evaluate({ organizationId: ORG });
      expect(result).toBeNull();
    });

    it('returns evaluation with tier, approvers, and escalation deadline', async () => {
      const pool = makePool([ok([]), ok([baseRuleRow]), ok([{ user_id: 'manager-1' }])]);
      const svc = new ApprovalMatrixService(pool);

      const result = await svc.evaluate({ organizationId: ORG, workflowType: 'expense' });

      expect(result).not.toBeNull();
      expect(result?.tier).toBe(2);
      expect(result?.requiredApprovers).toEqual(['manager-1']);
      expect(result?.rules).toHaveLength(1);
      expect(result?.escalationDeadline).toBeDefined();
    });

    it('returns empty approvers when no members have the required role', async () => {
      const pool = makePool([ok([]), ok([baseRuleRow]), ok([])]);
      const svc = new ApprovalMatrixService(pool);

      const result = await svc.evaluate({ organizationId: ORG, workflowType: 'expense' });

      expect(result?.requiredApprovers).toEqual([]);
    });
  });

  describe('upsertRule', () => {
    it('sets tenant context and returns mapped rule', async () => {
      const pool = makePool([ok([]), ok([baseRuleRow])]);
      const svc = new ApprovalMatrixService(pool);

      const rule = await svc.upsertRule(ORG, {
        workflowType: 'expense',
        requiredRole: 'manager',
        tier: 2,
        requiresMultipleApprovers: false,
        approverCount: 1,
        escalationAfterHours: 24,
      });

      expect(rule.id).toBe('rule-1');
      expect(rule.tier).toBe(2);
      expect(rule.workflowType).toBe('expense');
    });

    it('throws when upsert returns no rows', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ApprovalMatrixService(pool);

      await expect(
        svc.upsertRule(ORG, {
          requiredRole: 'manager',
          tier: 1,
          requiresMultipleApprovers: false,
          approverCount: 1,
          escalationAfterHours: 8,
        }),
      ).rejects.toThrow('Failed to upsert approval rule');
    });
  });
});
