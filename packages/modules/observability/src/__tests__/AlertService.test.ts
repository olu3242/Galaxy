import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { AlertService } from '../alerts/AlertService.js';
import type { AlertRow, AlertRuleRow } from '../types.js';

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

const ORG = 'org-111';
const TENANT_CALL = ok([]);

const ruleRow: AlertRuleRow = {
  id: 'rule-1',
  organization_id: ORG,
  name: 'High CPU',
  metric_name: 'cpu_usage',
  threshold: '80',
  operator: 'gt',
  severity: 'critical',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const alertRow: AlertRow = {
  id: 'alert-1',
  organization_id: ORG,
  alert_rule_id: 'rule-1',
  severity: 'critical',
  state: 'firing',
  title: 'Alert: High CPU',
  description: 'cpu_usage value 90 triggered rule (gt 80)',
  fired_at: '2025-01-01T01:00:00Z',
  resolved_at: null,
  metadata: { metricName: 'cpu_usage', value: 90 },
};

describe('AlertService', () => {
  describe('createRule', () => {
    it('sets tenant context then inserts and returns rule', async () => {
      const pool = makePool([TENANT_CALL, ok([ruleRow])]);
      const svc = new AlertService(pool);
      const rule = await svc.createRule({
        organizationId: ORG,
        name: 'High CPU',
        metricName: 'cpu_usage',
        threshold: 80,
        operator: 'gt',
        severity: 'critical',
      });

      expect(rule.id).toBe('rule-1');
      expect(rule.organizationId).toBe(ORG);
      expect(rule.threshold).toBe(80);
      expect(rule.operator).toBe('gt');
      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG,
      ]);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new AlertService(pool);
      await expect(
        svc.createRule({
          organizationId: ORG,
          name: 'X',
          metricName: 'm',
          threshold: 1,
          operator: 'eq',
          severity: 'info',
        }),
      ).rejects.toThrow('Failed to create alert rule');
    });
  });

  describe('listRules', () => {
    it('returns mapped rules', async () => {
      const pool = makePool([TENANT_CALL, ok([ruleRow])]);
      const svc = new AlertService(pool);
      const rules = await svc.listRules(ORG);
      expect(rules).toHaveLength(1);
      expect(rules[0]?.name).toBe('High CPU');
    });

    it('returns empty array when no rules', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new AlertService(pool);
      const rules = await svc.listRules(ORG);
      expect(rules).toEqual([]);
    });
  });

  describe('fireAlert', () => {
    it('sets context, fetches rule, inserts alert', async () => {
      const pool = makePool([TENANT_CALL, ok([ruleRow]), ok([alertRow])]);
      const svc = new AlertService(pool);
      const alert = await svc.fireAlert(ORG, 'rule-1', 'Alert: High CPU', 'desc', { value: 90 });
      expect(alert.id).toBe('alert-1');
      expect(alert.state).toBe('firing');
      expect(alert.severity).toBe('critical');
      expect(pool.query).toHaveBeenCalledTimes(3);
    });

    it('throws when rule not found', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new AlertService(pool);
      await expect(svc.fireAlert(ORG, 'no-rule', 'T', 'D', {})).rejects.toThrow(
        'Alert rule not found',
      );
    });

    it('throws when alert insert fails', async () => {
      const pool = makePool([TENANT_CALL, ok([ruleRow]), ok([])]);
      const svc = new AlertService(pool);
      await expect(svc.fireAlert(ORG, 'rule-1', 'T', 'D', {})).rejects.toThrow(
        'Failed to fire alert',
      );
    });
  });

  describe('resolveAlert', () => {
    it('returns resolved alert', async () => {
      const resolved: AlertRow = {
        ...alertRow,
        state: 'resolved',
        resolved_at: '2025-01-01T02:00:00Z',
      };
      const pool = makePool([TENANT_CALL, ok([resolved])]);
      const svc = new AlertService(pool);
      const alert = await svc.resolveAlert(ORG, 'alert-1');
      expect(alert?.state).toBe('resolved');
      expect(alert?.resolvedAt).toBe('2025-01-01T02:00:00Z');
    });

    it('returns null when alert not found or not firing', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new AlertService(pool);
      const result = await svc.resolveAlert(ORG, 'missing');
      expect(result).toBeNull();
    });
  });

  describe('listAlerts', () => {
    it('returns all alerts without filters', async () => {
      const pool = makePool([TENANT_CALL, ok([alertRow])]);
      const svc = new AlertService(pool);
      const alerts = await svc.listAlerts(ORG, {});
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.id).toBe('alert-1');
    });

    it('applies state filter', async () => {
      const pool = makePool([TENANT_CALL, ok([alertRow])]);
      const svc = new AlertService(pool);
      await svc.listAlerts(ORG, { state: 'firing' });
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('state = $2'),
        expect.arrayContaining(['firing']),
      );
    });

    it('applies severity filter', async () => {
      const pool = makePool([TENANT_CALL, ok([alertRow])]);
      const svc = new AlertService(pool);
      await svc.listAlerts(ORG, { severity: 'critical' });
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('severity = $'),
        expect.arrayContaining(['critical']),
      );
    });

    it('applies limit and offset', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new AlertService(pool);
      await svc.listAlerts(ORG, { limit: 10, offset: 20 });
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([10, 20]),
      );
    });
  });

  describe('evaluateRules', () => {
    it('fires alert when gt rule triggered', async () => {
      // calls: setTenantContext, fetchRules, then fireAlert (setTenantContext + fetchRule + insert)
      const pool = makePool([
        TENANT_CALL,
        ok([ruleRow]),
        TENANT_CALL,
        ok([ruleRow]),
        ok([alertRow]),
      ]);
      const svc = new AlertService(pool);
      const alerts = await svc.evaluateRules(ORG, 'cpu_usage', 90);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.id).toBe('alert-1');
    });

    it('does not fire when value does not exceed threshold', async () => {
      const pool = makePool([TENANT_CALL, ok([ruleRow])]);
      const svc = new AlertService(pool);
      const alerts = await svc.evaluateRules(ORG, 'cpu_usage', 70);
      expect(alerts).toHaveLength(0);
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('fires alert for lt operator', async () => {
      const ltRule: AlertRuleRow = { ...ruleRow, operator: 'lt', threshold: '20' };
      const ltAlertRow: AlertRow = { ...alertRow };
      const pool = makePool([
        TENANT_CALL,
        ok([ltRule]),
        TENANT_CALL,
        ok([ltRule]),
        ok([ltAlertRow]),
      ]);
      const svc = new AlertService(pool);
      const alerts = await svc.evaluateRules(ORG, 'cpu_usage', 10);
      expect(alerts).toHaveLength(1);
    });

    it('fires alert for gte operator at boundary', async () => {
      const gteRule: AlertRuleRow = { ...ruleRow, operator: 'gte', threshold: '80' };
      const pool = makePool([
        TENANT_CALL,
        ok([gteRule]),
        TENANT_CALL,
        ok([gteRule]),
        ok([alertRow]),
      ]);
      const svc = new AlertService(pool);
      const alerts = await svc.evaluateRules(ORG, 'cpu_usage', 80);
      expect(alerts).toHaveLength(1);
    });

    it('fires alert for eq operator', async () => {
      const eqRule: AlertRuleRow = { ...ruleRow, operator: 'eq', threshold: '50' };
      const pool = makePool([TENANT_CALL, ok([eqRule]), TENANT_CALL, ok([eqRule]), ok([alertRow])]);
      const svc = new AlertService(pool);
      const alerts = await svc.evaluateRules(ORG, 'cpu_usage', 50);
      expect(alerts).toHaveLength(1);
    });

    it('returns empty when no matching rules', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new AlertService(pool);
      const alerts = await svc.evaluateRules(ORG, 'unknown_metric', 100);
      expect(alerts).toHaveLength(0);
    });
  });
});
