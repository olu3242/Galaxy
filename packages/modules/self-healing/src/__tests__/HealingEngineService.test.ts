import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { HealingEngineService } from '../engine/HealingEngineService.js';

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

const ORG = 'org-engine';

function makeIncidentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inc-1',
    organization_id: ORG,
    level: 'workflow',
    trigger: 'automatic',
    status: 'detected',
    description: 'Test',
    diagnosis: null,
    resolution: null,
    affected_resource_type: null,
    affected_resource_id: null,
    attempt_count: 0,
    detected_at: new Date(),
    healed_at: null,
    failed_at: null,
    ...overrides,
  };
}

function makeRuleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    organization_id: ORG,
    level: 'workflow',
    name: 'Auto Retry',
    condition: {},
    action: 'retry',
    priority: 10,
    enabled: true,
    created_at: new Date(),
    ...overrides,
  };
}

describe('HealingEngineService', () => {
  describe('runHealingCycle', () => {
    it('returns zero counts when no detected incidents', async () => {
      // set_config, detected query (empty)
      const pool = makePool([ok([]), ok([])]);
      const svc = new HealingEngineService(pool);
      const result = await svc.runHealingCycle(ORG);
      expect(result.processed).toBe(0);
      expect(result.healed).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('heals incident when matching enabled rule exists', async () => {
      const incidentRow = makeIncidentRow();
      const diagnosedRow = makeIncidentRow({ status: 'diagnosing' });
      const rulesRow = makeRuleRow();
      const healedRow = makeIncidentRow({ status: 'healed' });

      // set_config, detected, [for incident: diagnose set_config + UPDATE, listRules set_config + SELECT, heal set_config + UPDATE]
      const pool = makePool([
        ok([]), // engine set_config
        ok([incidentRow]), // detected incidents
        ok([]), // diagnose: set_config
        ok([diagnosedRow]), // diagnose: UPDATE
        ok([]), // listRules: set_config
        ok([rulesRow]), // listRules: SELECT
        ok([]), // heal: set_config
        ok([healedRow]), // heal: UPDATE
      ]);
      const svc = new HealingEngineService(pool);
      const result = await svc.runHealingCycle(ORG);
      expect(result.processed).toBe(1);
      expect(result.healed).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('fails incident when no matching rule and attempt_count <= 3', async () => {
      const incidentRow = makeIncidentRow({ attempt_count: 1 });
      const diagnosedRow = makeIncidentRow({ status: 'diagnosing' });
      const failedRow = makeIncidentRow({ status: 'failed', attempt_count: 2 });

      const pool = makePool([
        ok([]), // engine set_config
        ok([incidentRow]), // detected
        ok([]), // diagnose set_config
        ok([diagnosedRow]), // diagnose UPDATE
        ok([]), // listRules set_config
        ok([]), // listRules: no rules
        ok([]), // failIncident set_config
        ok([failedRow]), // failIncident UPDATE
      ]);
      const svc = new HealingEngineService(pool);
      const result = await svc.runHealingCycle(ORG);
      expect(result.processed).toBe(1);
      expect(result.healed).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('escalates when no rule and attempt_count > 3', async () => {
      const incidentRow = makeIncidentRow({ attempt_count: 4 });
      const diagnosedRow = makeIncidentRow({ status: 'diagnosing' });
      const escalatedRow = makeIncidentRow({ status: 'escalated' });

      const pool = makePool([
        ok([]), // engine set_config
        ok([incidentRow]), // detected
        ok([]), // diagnose set_config
        ok([diagnosedRow]), // diagnose UPDATE
        ok([]), // listRules set_config
        ok([]), // listRules: no rules
        ok([]), // escalate set_config
        ok([escalatedRow]), // escalate UPDATE
      ]);
      const svc = new HealingEngineService(pool);
      const result = await svc.runHealingCycle(ORG);
      expect(result.failed).toBe(1);
    });
  });

  describe('getHealingStats', () => {
    it('sets tenant context and returns stats', async () => {
      const statusRows = [
        { status: 'healed', count: '10' },
        { status: 'failed', count: '3' },
      ];
      const levelRows = [
        { level: 'workflow', count: '8' },
        { level: 'queue', count: '5' },
      ];
      const pool = makePool([ok([]), ok(statusRows), ok(levelRows)]);
      const svc = new HealingEngineService(pool);
      const stats = await svc.getHealingStats(ORG);
      expect(stats['byStatus']).toEqual({ healed: 10, failed: 3 });
      expect(stats['byLevel']).toEqual({ workflow: 8, queue: 5 });
    });

    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new HealingEngineService(pool);
      await svc.getHealingStats(ORG);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    });
  });
});
