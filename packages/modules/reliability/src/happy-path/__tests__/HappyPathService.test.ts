import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { HappyPathService } from '../HappyPathService.js';

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

const steps = [
  {
    order: 1,
    name: 'Submit form',
    action: 'submit',
    expectedOutcome: 'submitted',
    timeoutSeconds: 10,
  },
];

const templateRow = {
  id: 'tpl-1',
  organization_id: ORG,
  scenario: 'task_creation' as const,
  name: 'Submit Workflow',
  description: 'Standard submission',
  steps,
  status: 'active',
  version: 1,
  created_at: NOW,
  updated_at: NOW,
};

const simulationRow = {
  id: 'sim-1',
  organization_id: ORG,
  template_id: 'tpl-1',
  result: 'pass',
  step_results: [{ order: 1, name: 'Submit form', passed: true, durationMs: 42 }],
  duration_ms: 42,
  error_message: null,
  run_at: NOW,
};

describe('HappyPathService', () => {
  describe('registerTemplate', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([templateRow])]);
      const svc = new HappyPathService(pool);
      await svc.registerTemplate(
        ORG,
        'task_creation',
        'Submit Workflow',
        'Standard submission',
        steps,
      );
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns mapped template', async () => {
      const pool = makePool([ok([]), ok([templateRow])]);
      const svc = new HappyPathService(pool);
      const result = await svc.registerTemplate(
        ORG,
        'task_creation',
        'Submit Workflow',
        'Standard submission',
        steps,
      );
      expect(result.id).toBe('tpl-1');
      expect(result.scenario).toBe('task_creation');
      expect(result.status).toBe('active');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new HappyPathService(pool);
      await expect(svc.registerTemplate(ORG, 'task_creation', 'n', 'd', steps)).rejects.toThrow(
        'Failed to create happy path template',
      );
    });
  });

  describe('getTemplate', () => {
    it('sets tenant context and returns template', async () => {
      const pool = makePool([ok([]), ok([templateRow])]);
      const svc = new HappyPathService(pool);
      const result = await svc.getTemplate(ORG, 'tpl-1');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result.id).toBe('tpl-1');
    });

    it('throws when template not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new HappyPathService(pool);
      await expect(svc.getTemplate(ORG, 'missing')).rejects.toThrow('Template not found');
    });
  });

  describe('listTemplates', () => {
    it('returns all templates when no scenario filter', async () => {
      const pool = makePool([ok([]), ok([templateRow])]);
      const svc = new HappyPathService(pool);
      const results = await svc.listTemplates(ORG);
      expect(results).toHaveLength(1);
    });

    it('includes scenario filter when provided', async () => {
      const pool = makePool([ok([]), ok([templateRow])]);
      const svc = new HappyPathService(pool);
      await svc.listTemplates(ORG, 'task_creation');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(String(calls[1]?.[0])).toContain('scenario');
    });
  });

  describe('runSimulation', () => {
    it('sets tenant context and inserts simulation', async () => {
      // set_config (runSimulation), set_config (getTemplate), SELECT template, INSERT simulation
      const pool = makePool([ok([]), ok([]), ok([templateRow]), ok([simulationRow])]);
      const svc = new HappyPathService(pool);
      const result = await svc.runSimulation(ORG, 'tpl-1');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result.result).toBe('pass');
      expect(result.templateId).toBe('tpl-1');
    });

    it('throws when simulation INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([]), ok([templateRow]), ok([])]);
      const svc = new HappyPathService(pool);
      await expect(svc.runSimulation(ORG, 'tpl-1')).rejects.toThrow('Failed to record simulation');
    });
  });

  describe('getMetrics', () => {
    it('sets tenant context and returns metrics', async () => {
      const metricsRow = {
        total_runs: '10',
        pass_count: '8',
        avg_duration: '55.5',
        last_run: NOW,
      };
      const pool = makePool([ok([]), ok([metricsRow])]);
      const svc = new HappyPathService(pool);
      const result = await svc.getMetrics(ORG, 'task_creation');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result.totalRuns).toBe(10);
      expect(result.passRate).toBeCloseTo(0.8);
      expect(result.avgDurationMs).toBeCloseTo(55.5);
      expect(result.lastRunAt).toBe(NOW);
    });

    it('returns zero metrics when no data', async () => {
      const pool = makePool([
        ok([]),
        ok([{ total_runs: '0', pass_count: '0', avg_duration: '0', last_run: null }]),
      ]);
      const svc = new HappyPathService(pool);
      const result = await svc.getMetrics(ORG, 'task_creation');
      expect(result.totalRuns).toBe(0);
      expect(result.passRate).toBe(0);
    });
  });
});
