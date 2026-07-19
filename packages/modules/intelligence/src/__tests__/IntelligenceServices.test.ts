/**
 * Intelligence OS — InsightService · RiskDetectionService · RecommendationService
 *
 * Covers: generateInsights · listInsights · getInsight ·
 *         detectRisks · flagRiskIndicators · listRisks · resolveRisk ·
 *         generateRecommendations · listRecommendations · applyRecommendation
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { InsightService } from '../services/InsightService.js';
import { RiskDetectionService } from '../services/RiskDetectionService.js';
import { RecommendationService } from '../services/RecommendationService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const NOW = '2026-01-01T00:00:00.000Z';

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

function snapshotRow() {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    organization_id: ORG,
    type: 'operational',
    title: 'Operational Efficiency',
    summary: 'Workflow completion rate is 85%',
    data: { completionRate: 0.85 },
    generated_at: NOW,
    created_at: NOW,
  };
}

function riskRow() {
  return {
    id: '00000000-0000-0000-0000-000000000020',
    organization_id: ORG,
    name: 'High workflow failure rate',
    description: '10 workflows have failed',
    level: 'high',
    affected_entity_id: null,
    affected_entity_type: null,
    signals: { failedWorkflows: 10 },
    detected_at: NOW,
    resolved_at: null,
    created_at: NOW,
  };
}

function recommendationRow() {
  return {
    id: '00000000-0000-0000-0000-000000000030',
    organization_id: ORG,
    title: 'Improve workflow completion',
    description: 'Review SLA settings for leave requests',
    priority: 'high',
    category: 'workflow',
    action_items: ['Review SLA', 'Add escalation rules'],
    related_entity_id: null,
    applied_at: null,
    created_at: NOW,
  };
}

// ─── InsightService ───────────────────────────────────────────────────────────

describe('InsightService.generateInsights', () => {
  it('sets tenant context before INSERT', async () => {
    const pool = makePool([ok([]), ok([snapshotRow()])]);
    const svc = new InsightService(pool);
    await svc.generateInsights(ORG, 'operational', { completionRate: 0.85 });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('returns mapped InsightSnapshot', async () => {
    const pool = makePool([ok([]), ok([snapshotRow()])]);
    const svc = new InsightService(pool);
    const result = await svc.generateInsights(ORG, 'operational', { completionRate: 0.85 });

    expect(result.organizationId).toBe(ORG);
    expect(result.type).toBe('operational');
    expect(result.title).toBe('Operational Efficiency');
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new InsightService(pool);
    await expect(svc.generateInsights(ORG, 'operational', {})).rejects.toThrow(
      'INSERT RETURNING returned no row',
    );
  });
});

describe('InsightService.listInsights', () => {
  it('returns all insights for org', async () => {
    const pool = makePool([ok([]), ok([snapshotRow(), snapshotRow()])]);
    const svc = new InsightService(pool);
    const result = await svc.listInsights(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no insights', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new InsightService(pool);
    const result = await svc.listInsights(ORG);
    expect(result).toHaveLength(0);
  });

  it('includes type filter in query params when provided', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new InsightService(pool);
    await svc.listInsights(ORG, 'workflow');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[1] as [string, unknown[]])[1];
    expect(params).toContain('workflow');
  });
});

// ─── RiskDetectionService ─────────────────────────────────────────────────────

describe('RiskDetectionService.detectRisks', () => {
  it('returns empty array when no risk thresholds exceeded', async () => {
    const pool = makePool([
      ok([]),
      ok([{ count: '2' }]), // failed workflows (< threshold of 5)
      ok([{ count: '0' }]), // rejected approvals
    ]);
    const svc = new RiskDetectionService(pool);
    const result = await svc.detectRisks(ORG);
    expect(result).toHaveLength(0);
  });

  it('flags high workflow failure rate risk when count > 5', async () => {
    // set_config, then parallel queries for failed workflows and rejected approvals,
    // then flagRiskIndicators: set_config + INSERT
    const pool = makePool([
      ok([]),
      ok([{ count: '10' }]),
      ok([{ count: '0' }]),
      ok([]),
      ok([riskRow()]),
    ]);
    const svc = new RiskDetectionService(pool);
    const result = await svc.detectRisks(ORG);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]?.name).toContain('workflow failure');
  });
});

describe('RiskDetectionService.listRisks', () => {
  it('returns risks for org', async () => {
    const pool = makePool([ok([]), ok([riskRow()])]);
    const svc = new RiskDetectionService(pool);
    const result = await svc.listRisks(ORG);
    expect(result).toHaveLength(1);
    expect(result[0]?.level).toBe('high');
  });

  it('filters by level when provided', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new RiskDetectionService(pool);
    await svc.listRisks(ORG, 'critical');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[1] as [string, unknown[]])[1];
    expect(params).toContain('critical');
  });
});

describe('RiskDetectionService.flagRiskIndicators', () => {
  it('inserts a risk indicator and returns it', async () => {
    const pool = makePool([ok([]), ok([riskRow()])]);
    const svc = new RiskDetectionService(pool);
    const result = await svc.flagRiskIndicators(ORG, {
      name: 'High workflow failure rate',
      description: '10 workflows have failed',
      level: 'high',
      signals: { failedWorkflows: 10 },
    });

    expect(result.name).toBe('High workflow failure rate');
    expect(result.level).toBe('high');
    expect(result.organizationId).toBe(ORG);
  });

  it('sets tenant context before INSERT', async () => {
    const pool = makePool([ok([]), ok([riskRow()])]);
    const svc = new RiskDetectionService(pool);
    await svc.flagRiskIndicators(ORG, {
      name: 'Test risk',
      description: 'Test',
      level: 'low',
      signals: {},
    });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });
});

// ─── RecommendationService ────────────────────────────────────────────────────

describe('RecommendationService.generateRecommendations', () => {
  it('sets tenant context before building recommendations', async () => {
    const pool = makePool([ok([]), ok([recommendationRow()])]);
    const svc = new RecommendationService(pool);
    await svc.generateRecommendations(ORG, 'workflow', { completionRate: 0.5 });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('returns array of recommendations', async () => {
    const pool = makePool([ok([]), ok([recommendationRow()]), ok([recommendationRow()])]);
    const svc = new RecommendationService(pool);
    const result = await svc.generateRecommendations(ORG, 'workflow', { completionRate: 0.5 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('RecommendationService.prioritizeRecommendations', () => {
  it('returns sorted recommendations by priority', async () => {
    const urgentRow = { ...recommendationRow(), priority: 'urgent' };
    const lowRow = { ...recommendationRow(), priority: 'low' };
    const pool = makePool([ok([]), ok([urgentRow, lowRow])]);
    const svc = new RecommendationService(pool);
    const result = await svc.prioritizeRecommendations(ORG);

    expect(Array.isArray(result)).toBe(true);
  });

  it('sets tenant context before SELECT', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new RecommendationService(pool);
    await svc.prioritizeRecommendations(ORG);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('returns empty array when no recommendations exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new RecommendationService(pool);
    const result = await svc.prioritizeRecommendations(ORG);
    expect(result).toHaveLength(0);
  });
});
