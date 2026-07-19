import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { HealingRuleService } from '../rules/HealingRuleService.js';

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

const ORG = 'org-rules';

function makeRuleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    organization_id: ORG,
    level: 'workflow',
    name: 'Auto Retry',
    condition: { type: 'timeout' },
    action: 'retry',
    priority: 10,
    enabled: true,
    created_at: new Date('2026-07-01'),
    ...overrides,
  };
}

describe('HealingRuleService', () => {
  describe('createRule', () => {
    it('sets tenant context before inserting', async () => {
      const row = makeRuleRow();
      const pool = makePool([ok([]), ok([row])]);
      const svc = new HealingRuleService(pool);
      await svc.createRule(ORG, 'workflow', 'Auto Retry', { type: 'timeout' }, 'retry', 10);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns mapped rule', async () => {
      const row = makeRuleRow();
      const pool = makePool([ok([]), ok([row])]);
      const svc = new HealingRuleService(pool);
      const rule = await svc.createRule(
        ORG,
        'workflow',
        'Auto Retry',
        { type: 'timeout' },
        'retry',
      );
      expect(rule.id).toBe('rule-1');
      expect(rule.name).toBe('Auto Retry');
      expect(rule.action).toBe('retry');
      expect(rule.enabled).toBe(true);
      expect(rule.priority).toBe(10);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new HealingRuleService(pool);
      await expect(svc.createRule(ORG, 'queue', 'X', {}, 'escalate')).rejects.toThrow(
        'Failed to create',
      );
    });
  });

  describe('listRules', () => {
    it('lists all rules without level filter', async () => {
      const rows = [makeRuleRow({ id: 'r1' }), makeRuleRow({ id: 'r2', level: 'queue' })];
      const pool = makePool([ok([]), ok(rows)]);
      const svc = new HealingRuleService(pool);
      const rules = await svc.listRules(ORG);
      expect(rules).toHaveLength(2);
    });

    it('filters by level when specified', async () => {
      const rows = [makeRuleRow({ id: 'r1', level: 'workflow' })];
      const pool = makePool([ok([]), ok(rows)]);
      const svc = new HealingRuleService(pool);
      const rules = await svc.listRules(ORG, 'workflow');
      expect(rules).toHaveLength(1);
      expect(rules[0]?.level).toBe('workflow');
    });
  });

  describe('toggleRule', () => {
    it('returns rule with updated enabled state', async () => {
      const row = makeRuleRow({ enabled: false });
      const pool = makePool([ok([]), ok([row])]);
      const svc = new HealingRuleService(pool);
      const rule = await svc.toggleRule(ORG, 'rule-1', false);
      expect(rule.enabled).toBe(false);
    });

    it('throws when rule not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new HealingRuleService(pool);
      await expect(svc.toggleRule(ORG, 'missing', true)).rejects.toThrow('not found');
    });
  });

  describe('deleteRule', () => {
    it('calls delete query with correct params', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new HealingRuleService(pool);
      await svc.deleteRule(ORG, 'rule-1');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(String(calls[1]?.[0])).toContain('DELETE');
    });
  });
});
