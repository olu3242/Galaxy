import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ReliabilityScoreService } from '../ReliabilityScoreService.js';
import type { ReliabilityMetric } from '../types.js';

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

const metrics: ReliabilityMetric[] = [
  { name: 'workflow_success', value: 1.0, target: 0.95, passing: true },
  { name: 'recovery_success', value: 1.0, target: 0.9, passing: true },
  { name: 'escalation_success', value: 1.0, target: 0.95, passing: true },
  { name: 'security_score', value: 1.0, target: 0.95, passing: true },
  { name: 'tenant_isolation', value: 1.0, target: 1.0, passing: true },
  { name: 'auditability', value: 1.0, target: 1.0, passing: true },
];

const reportRow = {
  id: 'report-1',
  organization_id: ORG,
  overall_score: 1.0,
  metrics,
  passing: true,
  generated_at: NOW,
};

// Helper: build the four parallel query results (workflows, failures, escalations, threats)
function buildStatsResponses(opts?: {
  wfTotal?: string;
  wfSuccess?: string;
  failTotal?: string;
  failRecovered?: string;
  escTotal?: string;
  escResolved?: string;
  threatTotal?: string;
  threatBlocked?: string;
}) {
  const o = opts ?? {};
  return [
    ok([{ total: o.wfTotal ?? '10', success: o.wfSuccess ?? '10' }]),
    ok([{ total: o.failTotal ?? '0', recovered: o.failRecovered ?? '0' }]),
    ok([{ total: o.escTotal ?? '0', resolved: o.escResolved ?? '0' }]),
    ok([{ total: o.threatTotal ?? '0', blocked: o.threatBlocked ?? '0' }]),
  ];
}

describe('ReliabilityScoreService', () => {
  describe('computeScore', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([
        ok([]), // set_config
        ...buildStatsResponses(),
        ok([reportRow]),
      ]);
      const svc = new ReliabilityScoreService(pool);
      await svc.computeScore(ORG);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns perfect score when all systems healthy', async () => {
      const pool = makePool([ok([]), ...buildStatsResponses(), ok([reportRow])]);
      const svc = new ReliabilityScoreService(pool);
      const result = await svc.computeScore(ORG);
      expect(result.passing).toBe(true);
      expect(result.overallScore).toBe(1.0);
    });

    it('returns passing=false when workflow success is below target', async () => {
      const failingMetrics = metrics.map((m) =>
        m.name === 'workflow_success' ? { ...m, value: 0.5, passing: false } : m,
      );
      const failingReport = {
        ...reportRow,
        overall_score: 0.9,
        passing: false,
        metrics: failingMetrics,
      };
      const pool = makePool([
        ok([]),
        ...buildStatsResponses({ wfTotal: '10', wfSuccess: '5' }),
        ok([failingReport]),
      ]);
      const svc = new ReliabilityScoreService(pool);
      const result = await svc.computeScore(ORG);
      expect(result.passing).toBe(false);
    });

    it('uses value=1 for metrics when denominator is 0', async () => {
      // All zeros means no data → defaults to 1 for all rates
      const pool = makePool([ok([]), ...buildStatsResponses(), ok([reportRow])]);
      const svc = new ReliabilityScoreService(pool);
      const result = await svc.computeScore(ORG);
      expect(result.metrics.find((m) => m.name === 'workflow_success')?.value).toBe(1);
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ...buildStatsResponses(), ok([])]);
      const svc = new ReliabilityScoreService(pool);
      await expect(svc.computeScore(ORG)).rejects.toThrow('Failed to save reliability report');
    });
  });

  describe('getLatestReport', () => {
    it('sets tenant context and returns latest report', async () => {
      const pool = makePool([ok([]), ok([reportRow])]);
      const svc = new ReliabilityScoreService(pool);
      const result = await svc.getLatestReport(ORG);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result?.id).toBe('report-1');
      expect(result?.passing).toBe(true);
    });

    it('returns null when no report found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ReliabilityScoreService(pool);
      const result = await svc.getLatestReport(ORG);
      expect(result).toBeNull();
    });
  });
});
