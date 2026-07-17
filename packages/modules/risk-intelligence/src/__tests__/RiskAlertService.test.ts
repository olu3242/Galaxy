import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { RiskAlertService } from '../RiskAlertService.js';
import type { RiskAlertRow } from '../types.js';

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

const ORG = 'org-alert';

function makeAlertRow(overrides: Partial<RiskAlertRow> = {}): RiskAlertRow {
  return {
    id: 'alert-1',
    organization_id: ORG,
    domain: 'operational',
    severity: 'high',
    title: 'High SLA Breach',
    description: 'SLA breach rate exceeded threshold',
    score: '75',
    is_resolved: false,
    resolved_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('RiskAlertService', () => {
  describe('processRiskAlerts', () => {
    it('skips duplicate alerts (count > 0)', async () => {
      // set_config + dupCheck (count=1) for first alert
      const pool = makePool([ok([]), ok([{ count: '1' }])]);
      const svc = new RiskAlertService(pool);
      const result = await svc.processRiskAlerts([
        {
          organizationId: ORG,
          domain: 'operational',
          severity: 'high',
          title: 'T',
          description: 'D',
          score: 75,
        },
      ]);
      expect(result).toHaveLength(0);
    });

    it('inserts alert when no duplicate', async () => {
      const alertRow = makeAlertRow();
      // set_config, dupCheck (count=0), insert
      const pool = makePool([ok([]), ok([{ count: '0' }]), ok([alertRow])]);
      const svc = new RiskAlertService(pool);
      const result = await svc.processRiskAlerts([
        {
          organizationId: ORG,
          domain: 'operational',
          severity: 'high',
          title: 'T',
          description: 'D',
          score: 75,
        },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('alert-1');
      expect(result[0]?.score).toBe(75);
    });

    it('processes multiple alerts correctly', async () => {
      const alertRow1 = makeAlertRow({ id: 'a1', title: 'Alert 1' });
      const alertRow2 = makeAlertRow({ id: 'a2', title: 'Alert 2' });
      // For each alert: set_config, dup check, insert
      const pool = makePool([
        ok([]),
        ok([{ count: '0' }]),
        ok([alertRow1]),
        ok([]),
        ok([{ count: '0' }]),
        ok([alertRow2]),
      ]);
      const svc = new RiskAlertService(pool);
      const result = await svc.processRiskAlerts([
        {
          organizationId: ORG,
          domain: 'operational',
          severity: 'high',
          title: 'Alert 1',
          description: 'D',
          score: 60,
        },
        {
          organizationId: ORG,
          domain: 'compliance',
          severity: 'medium',
          title: 'Alert 2',
          description: 'D',
          score: 40,
        },
      ]);
      expect(result).toHaveLength(2);
    });

    it('returns empty array for empty input', async () => {
      const pool = makePool([]);
      const svc = new RiskAlertService(pool);
      const result = await svc.processRiskAlerts([]);
      expect(result).toEqual([]);
    });
  });

  describe('listAlerts', () => {
    it('sets tenant context and returns mapped alerts', async () => {
      const alertRow = makeAlertRow();
      const pool = makePool([ok([]), ok([alertRow])]);
      const svc = new RiskAlertService(pool);
      const alerts = await svc.listAlerts(ORG);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.domain).toBe('operational');
      expect(alerts[0]?.isResolved).toBe(false);
    });

    it('returns empty array when no alerts', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new RiskAlertService(pool);
      const alerts = await svc.listAlerts(ORG);
      expect(alerts).toEqual([]);
    });
  });

  describe('resolveAlert', () => {
    it('returns resolved alert', async () => {
      const alertRow = makeAlertRow({ is_resolved: true, resolved_at: '2026-07-02T00:00:00.000Z' });
      const pool = makePool([ok([]), ok([alertRow])]);
      const svc = new RiskAlertService(pool);
      const alert = await svc.resolveAlert(ORG, 'alert-1');
      expect(alert.isResolved).toBe(true);
      expect(alert.resolvedAt).toBe('2026-07-02T00:00:00.000Z');
    });

    it('throws when alert not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new RiskAlertService(pool);
      await expect(svc.resolveAlert(ORG, 'missing-alert')).rejects.toThrow('not found');
    });
  });
});
