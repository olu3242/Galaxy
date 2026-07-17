import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { RiskIntelligenceService } from '../RiskIntelligenceService.js';

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

const ORG = 'org-risk';

describe('RiskIntelligenceService', () => {
  describe('computeOrgRiskProfile', () => {
    it('sets tenant context before querying', async () => {
      const opsRow = { breached: '0', total: '10' };
      const compRow = { failed: '0', total: '5' };
      const taskRow = { overdue: '0', total: '20' };
      // set_config then 3 parallel queries
      const pool = makePool([ok([]), ok([opsRow]), ok([compRow]), ok([taskRow])]);
      const svc = new RiskIntelligenceService(pool);
      await svc.computeOrgRiskProfile(ORG);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns low overall risk when all metrics are zero', async () => {
      const opsRow = { breached: '0', total: '10' };
      const compRow = { failed: '0', total: '5' };
      const taskRow = { overdue: '0', total: '20' };
      const pool = makePool([ok([]), ok([opsRow]), ok([compRow]), ok([taskRow])]);
      const svc = new RiskIntelligenceService(pool);
      const profile = await svc.computeOrgRiskProfile(ORG);
      expect(profile.organizationId).toBe(ORG);
      expect(profile.overallLevel).toBe('low');
      expect(profile.domainScores).toHaveLength(5);
    });

    it('flags high operational risk when SLA breach rate > 10%', async () => {
      const opsRow = { breached: '5', total: '10' }; // 50%
      const compRow = { failed: '0', total: '5' };
      const taskRow = { overdue: '0', total: '20' };
      const pool = makePool([ok([]), ok([opsRow]), ok([compRow]), ok([taskRow])]);
      const svc = new RiskIntelligenceService(pool);
      const profile = await svc.computeOrgRiskProfile(ORG);
      const opsScore = profile.domainScores.find((d) => d.domain === 'operational');
      expect(opsScore?.score).toBe(50);
      expect(opsScore?.factors).toContain('high_sla_breach_rate');
    });

    it('flags compliance risk when rejection rate > 20%', async () => {
      const opsRow = { breached: '0', total: '10' };
      const compRow = { failed: '3', total: '10' }; // 30%
      const taskRow = { overdue: '0', total: '20' };
      const pool = makePool([ok([]), ok([opsRow]), ok([compRow]), ok([taskRow])]);
      const svc = new RiskIntelligenceService(pool);
      const profile = await svc.computeOrgRiskProfile(ORG);
      const compScore = profile.domainScores.find((d) => d.domain === 'compliance');
      expect(compScore?.factors).toContain('high_rejection_rate');
    });

    it('flags reputational risk when task overdue rate > 30%', async () => {
      const opsRow = { breached: '0', total: '10' };
      const compRow = { failed: '0', total: '5' };
      const taskRow = { overdue: '4', total: '10' }; // 40%
      const pool = makePool([ok([]), ok([opsRow]), ok([compRow]), ok([taskRow])]);
      const svc = new RiskIntelligenceService(pool);
      const profile = await svc.computeOrgRiskProfile(ORG);
      const repScore = profile.domainScores.find((d) => d.domain === 'reputational');
      expect(repScore?.factors).toContain('high_task_overdue_rate');
    });

    it('handles zero totals gracefully', async () => {
      const opsRow = { breached: '0', total: '0' };
      const compRow = { failed: '0', total: '0' };
      const taskRow = { overdue: '0', total: '0' };
      const pool = makePool([ok([]), ok([opsRow]), ok([compRow]), ok([taskRow])]);
      const svc = new RiskIntelligenceService(pool);
      const profile = await svc.computeOrgRiskProfile(ORG);
      expect(profile.overallScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getRiskTrend', () => {
    it('sets tenant context before querying', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new RiskIntelligenceService(pool);
      await svc.getRiskTrend(ORG, 'operational');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    });

    it('returns trend points with correct shape', async () => {
      const rows = [
        { period: '2026-07-01', score: '42.5' },
        { period: '2026-06-30', score: '38.0' },
      ];
      const pool = makePool([ok([]), ok(rows)]);
      const svc = new RiskIntelligenceService(pool);
      const trend = await svc.getRiskTrend(ORG, 'compliance');
      expect(trend).toHaveLength(2);
      expect(trend[0]?.period).toBe('2026-07-01');
      expect(trend[0]?.score).toBe(43);
      expect(trend[0]?.domain).toBe('compliance');
    });

    it('returns empty array when no trend data', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new RiskIntelligenceService(pool);
      const trend = await svc.getRiskTrend(ORG, 'security');
      expect(trend).toEqual([]);
    });
  });
});
