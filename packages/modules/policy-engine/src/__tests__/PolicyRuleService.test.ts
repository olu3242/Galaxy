import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PolicyRuleService } from '../rules/PolicyRuleService.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const POLICY_ID = '00000000-0000-0000-0000-000000000002';
const RULE_ID = '00000000-0000-0000-0000-000000000003';

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

const ruleRow = {
  id: RULE_ID,
  organization_id: ORG_ID,
  policy_id: POLICY_ID,
  field: 'amount',
  operator: 'greater_than',
  value: 1000,
  action: 'deny',
  priority: 10,
  created_at: new Date('2026-01-01T00:00:00Z'),
};

describe('PolicyRuleService', () => {
  describe('addRule', () => {
    it('sets tenant context before insert', async () => {
      const pool = makePool([ok([]), ok([ruleRow])]);
      const svc = new PolicyRuleService(pool);
      await svc.addRule(ORG_ID, POLICY_ID, 'amount', 'greater_than', 1000, 'deny', 10);

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(
        1,
        'SELECT set_config($1, $2, true)',
        ['app.current_tenant', ORG_ID],
      );
    });

    it('returns a typed PolicyRule on success', async () => {
      const pool = makePool([ok([]), ok([ruleRow])]);
      const svc = new PolicyRuleService(pool);
      const rule = await svc.addRule(ORG_ID, POLICY_ID, 'amount', 'greater_than', 1000, 'deny', 10);

      expect(rule.id).toBe(RULE_ID);
      expect(rule.organizationId).toBe(ORG_ID);
      expect(rule.policyId).toBe(POLICY_ID);
      expect(rule.field).toBe('amount');
      expect(rule.operator).toBe('greater_than');
      expect(rule.value).toBe(1000);
      expect(rule.action).toBe('deny');
      expect(rule.priority).toBe(10);
    });

    it('defaults priority to 0 when not provided', async () => {
      const pool = makePool([ok([]), ok([{ ...ruleRow, priority: 0 }])]);
      const svc = new PolicyRuleService(pool);
      await svc.addRule(ORG_ID, POLICY_ID, 'amount', 'equals', 'X', 'deny');

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO policy_rules'),
        [ORG_ID, POLICY_ID, 'amount', 'equals', JSON.stringify('X'), 'deny', 0],
      );
    });

    it('JSON-stringifies value before passing to query', async () => {
      const complexValue = { min: 100, max: 500 };
      const pool = makePool([ok([]), ok([{ ...ruleRow, value: complexValue }])]);
      const svc = new PolicyRuleService(pool);
      await svc.addRule(ORG_ID, POLICY_ID, 'range', 'equals', complexValue, 'deny', 5);

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO policy_rules'),
        expect.arrayContaining([JSON.stringify(complexValue)]),
      );
    });

    it('throws when insert returns no rows', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PolicyRuleService(pool);
      await expect(
        svc.addRule(ORG_ID, POLICY_ID, 'field', 'equals', 'val', 'deny'),
      ).rejects.toThrow('Failed to add policy rule');
    });

    it('uses parameterized query — no string interpolation', async () => {
      const maliciousField = "'; DROP TABLE policy_rules; --";
      const pool = makePool([ok([]), ok([ruleRow])]);
      const svc = new PolicyRuleService(pool);
      await svc.addRule(ORG_ID, POLICY_ID, maliciousField, 'equals', 'val', 'deny').catch(
        () => undefined,
      );

      const mock = pool.query as ReturnType<typeof vi.fn>;
      const calls = mock.mock.calls as Array<[string, unknown[]]>;
      for (const [sql] of calls) {
        expect(sql).not.toContain(maliciousField);
      }
    });
  });

  describe('getRules', () => {
    it('sets tenant context before select', async () => {
      const pool = makePool([ok([]), ok([ruleRow])]);
      const svc = new PolicyRuleService(pool);
      await svc.getRules(ORG_ID, POLICY_ID);

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(
        1,
        'SELECT set_config($1, $2, true)',
        ['app.current_tenant', ORG_ID],
      );
    });

    it('returns rules sorted by priority (caller trusts DB ordering)', async () => {
      const rule1 = { ...ruleRow, id: 'r1', priority: 1 };
      const rule2 = { ...ruleRow, id: 'r2', priority: 5 };
      const pool = makePool([ok([]), ok([rule1, rule2])]);
      const svc = new PolicyRuleService(pool);
      const rules = await svc.getRules(ORG_ID, POLICY_ID);

      expect(rules).toHaveLength(2);
      expect(rules[0]?.id).toBe('r1');
      expect(rules[1]?.id).toBe('r2');
    });

    it('returns empty array when no rules exist', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PolicyRuleService(pool);
      const rules = await svc.getRules(ORG_ID, POLICY_ID);

      expect(rules).toEqual([]);
    });

    it('passes orgId and policyId as parameters', async () => {
      const pool = makePool([ok([]), ok([ruleRow])]);
      const svc = new PolicyRuleService(pool);
      await svc.getRules(ORG_ID, POLICY_ID);

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('FROM policy_rules'),
        [ORG_ID, POLICY_ID],
      );
    });

    it('maps all operator types correctly', async () => {
      const operators = [
        'equals',
        'not_equals',
        'contains',
        'greater_than',
        'less_than',
        'in',
        'not_in',
      ] as const;
      for (const operator of operators) {
        const pool = makePool([ok([]), ok([{ ...ruleRow, operator }])]);
        const svc = new PolicyRuleService(pool);
        const rules = await svc.getRules(ORG_ID, POLICY_ID);
        expect(rules[0]?.operator).toBe(operator);
      }
    });
  });

  describe('deleteRule', () => {
    it('sets tenant context before delete', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PolicyRuleService(pool);
      await svc.deleteRule(ORG_ID, RULE_ID);

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(
        1,
        'SELECT set_config($1, $2, true)',
        ['app.current_tenant', ORG_ID],
      );
    });

    it('issues DELETE with parameterized orgId and ruleId', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PolicyRuleService(pool);
      await svc.deleteRule(ORG_ID, RULE_ID);

      const mock = pool.query as ReturnType<typeof vi.fn>;
      expect(mock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('DELETE FROM policy_rules'),
        [ORG_ID, RULE_ID],
      );
    });

    it('resolves without error on success', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PolicyRuleService(pool);
      await expect(svc.deleteRule(ORG_ID, RULE_ID)).resolves.toBeUndefined();
    });
  });
});
