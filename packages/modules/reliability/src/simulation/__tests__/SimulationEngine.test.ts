import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { SimulationEngine } from '../SimulationEngine.js';

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

const runRow = {
  id: 'run-1',
  organization_id: ORG,
  simulation_type: 'task',
  status: 'pending',
  config: {},
  results: {},
  duration_ms: null,
  error_message: null,
  created_at: NOW,
  completed_at: null,
};

const completedRunRow = {
  ...runRow,
  status: 'passed',
  results: { steps: 3, checks: ['tenant_isolation', 'data_integrity', 'workflow_completion'] },
  duration_ms: 5,
  completed_at: NOW,
};

const reportRow = {
  id: 'report-1',
  organization_id: ORG,
  run_id: 'run-1',
  summary: 'Simulation task passed in 5ms',
  passed: 1,
  failed: 0,
  coverage: {},
  created_at: NOW,
};

describe('SimulationEngine', () => {
  describe('createRun', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([runRow])]);
      const engine = new SimulationEngine(pool);
      await engine.createRun(ORG, 'task');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns mapped simulation run', async () => {
      const pool = makePool([ok([]), ok([runRow])]);
      const engine = new SimulationEngine(pool);
      const result = await engine.createRun(ORG, 'task');
      expect(result.id).toBe('run-1');
      expect(result.simulationType).toBe('task');
      expect(result.status).toBe('pending');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new SimulationEngine(pool);
      await expect(engine.createRun(ORG, 'task')).rejects.toThrow(
        'Failed to create simulation run',
      );
    });
  });

  describe('executeRun', () => {
    it('sets tenant context, marks running, then marks passed', async () => {
      // set_config, UPDATE running, UPDATE passed
      const pool = makePool([ok([]), ok([]), ok([completedRunRow])]);
      const engine = new SimulationEngine(pool);
      const result = await engine.executeRun(ORG, 'run-1');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result.status).toBe('passed');
      expect(result.durationMs).toBeDefined();
    });

    it('throws when run not found', async () => {
      const pool = makePool([ok([]), ok([]), ok([])]);
      const engine = new SimulationEngine(pool);
      await expect(engine.executeRun(ORG, 'missing')).rejects.toThrow('Simulation run not found');
    });
  });

  describe('listRuns', () => {
    it('sets tenant context and returns runs', async () => {
      const pool = makePool([ok([]), ok([runRow])]);
      const engine = new SimulationEngine(pool);
      const results = await engine.listRuns(ORG);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(results).toHaveLength(1);
    });

    it('adds simulation_type filter when provided', async () => {
      const pool = makePool([ok([]), ok([runRow])]);
      const engine = new SimulationEngine(pool);
      await engine.listRuns(ORG, 'task');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(String(calls[1]?.[0])).toContain('simulation_type');
    });
  });

  describe('generateReport', () => {
    it('sets tenant context and generates report from run data', async () => {
      // set_config, SELECT run, INSERT report
      const pool = makePool([ok([]), ok([completedRunRow]), ok([reportRow])]);
      const engine = new SimulationEngine(pool);
      const result = await engine.generateReport(ORG, 'run-1');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result.id).toBe('report-1');
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.summary).toContain('task');
    });

    it('throws when run not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new SimulationEngine(pool);
      await expect(engine.generateReport(ORG, 'missing')).rejects.toThrow(
        'Simulation run not found',
      );
    });

    it('throws when report INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([completedRunRow]), ok([])]);
      const engine = new SimulationEngine(pool);
      await expect(engine.generateReport(ORG, 'run-1')).rejects.toThrow(
        'Failed to generate report',
      );
    });
  });
});
