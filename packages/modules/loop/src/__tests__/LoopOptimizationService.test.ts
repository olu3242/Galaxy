/**
 * Loop OS — Optimization Phase unit tests
 *
 * Covers LoopOptimizationService:
 *   generateRecommendations → listRecommendations → applyRecommendation → dismissRecommendation
 *
 * All DB calls are mocked via a pool stub; no real database required.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { LoopOptimizationService } from '../services/LoopOptimizationService.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const REC_ID = '00000000-0000-0000-0000-000000000050';
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

function recRow(
  overrides: Partial<{
    id: string;
    recommendation_type: string;
    priority: string;
    status: string;
    workflow_type: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? REC_ID,
    organization_id: ORG,
    workflow_type: overrides.workflow_type ?? 'leave_request',
    recommendation_type: overrides.recommendation_type ?? 'increase_sla_window',
    priority: overrides.priority ?? 'high',
    title: 'Increase SLA window for leave_request',
    rationale: '45% of leave_request workflows breach SLA',
    estimated_impact: 'Reduce SLA breach rate by 30-50%',
    status: overrides.status ?? 'pending',
    created_at: NOW,
  };
}

// ─── generateRecommendations ─────────────────────────────────────────────────

describe('LoopOptimizationService.generateRecommendations', () => {
  it('returns empty array when no workflow instances qualify (sample < 5)', async () => {
    const slaRow = {
      workflow_type: 'leave_request',
      avg_breach_rate: '0.6',
      avg_completion_hours: '8',
      sample_size: '3', // below threshold
    };
    const pool = makePool([ok([]), ok([slaRow]), ok([])]);
    const svc = new LoopOptimizationService(pool);
    const result = await svc.generateRecommendations(ORG);
    expect(result).toEqual([]);
  });

  it('recommends increase_sla_window when breach rate > 40%', async () => {
    const slaRow = {
      workflow_type: 'leave_request',
      avg_breach_rate: '0.45',
      avg_completion_hours: '20',
      sample_size: '10',
    };
    const saved = recRow({ recommendation_type: 'increase_sla_window', priority: 'high' });
    const pool = makePool([ok([]), ok([slaRow]), ok([]), ok([saved])]);
    const svc = new LoopOptimizationService(pool);
    const result = await svc.generateRecommendations(ORG);
    expect(result).toMatchObject([{ recommendationType: 'increase_sla_window', priority: 'high' }]);
  });

  it('recommends reduce_sla_window for fast, low-breach workflows', async () => {
    const slaRow = {
      workflow_type: 'leave_request',
      avg_breach_rate: '0.02', // < 5%
      avg_completion_hours: '1.5', // < 2h
      sample_size: '10',
    };
    const saved = recRow({ recommendation_type: 'reduce_sla_window', priority: 'low' });
    const pool = makePool([ok([]), ok([slaRow]), ok([]), ok([saved])]);
    const svc = new LoopOptimizationService(pool);
    const result = await svc.generateRecommendations(ORG);
    expect(result).toMatchObject([{ recommendationType: 'reduce_sla_window', priority: 'low' }]);
  });

  it('does NOT recommend reduce_sla_window when avg_completion_hours is null', async () => {
    const slaRow = {
      workflow_type: 'leave_request',
      avg_breach_rate: '0.01',
      avg_completion_hours: null, // no timing data
      sample_size: '10',
    };
    const pool = makePool([ok([]), ok([slaRow]), ok([])]);
    const svc = new LoopOptimizationService(pool);
    const result = await svc.generateRecommendations(ORG);
    expect(result).toEqual([]);
  });

  it('recommends enable_auto_approval when >70% approvals are near-instant', async () => {
    const approvalRow = {
      workflow_type: 'expense',
      avg_approval_time_hours: '0.05',
      auto_approvable: '8', // 80% of 10
      sample_size: '10',
    };
    const saved = recRow({
      recommendation_type: 'enable_auto_approval',
      priority: 'medium',
      workflow_type: 'expense',
    });
    const pool = makePool([ok([]), ok([]), ok([approvalRow]), ok([saved])]);
    const svc = new LoopOptimizationService(pool);
    const result = await svc.generateRecommendations(ORG);
    expect(result).toMatchObject([
      {
        recommendationType: 'enable_auto_approval',
        priority: 'medium',
        workflowType: 'expense',
      },
    ]);
  });

  it('does NOT recommend auto_approval when ratio is below 70%', async () => {
    const approvalRow = {
      workflow_type: 'expense',
      avg_approval_time_hours: '2.0',
      auto_approvable: '6', // 60% — below threshold
      sample_size: '10',
    };
    const pool = makePool([ok([]), ok([]), ok([approvalRow])]);
    const svc = new LoopOptimizationService(pool);
    const result = await svc.generateRecommendations(ORG);
    expect(result).toEqual([]);
  });

  it('maps saved recommendation rows to domain objects', async () => {
    const slaRow = {
      workflow_type: 'incident',
      avg_breach_rate: '0.6',
      avg_completion_hours: '12',
      sample_size: '15',
    };
    const saved = recRow({
      id: REC_ID,
      recommendation_type: 'increase_sla_window',
      priority: 'high',
      workflow_type: 'incident',
      status: 'pending',
    });
    const pool = makePool([ok([]), ok([slaRow]), ok([]), ok([saved])]);
    const svc = new LoopOptimizationService(pool);
    const result = await svc.generateRecommendations(ORG);
    expect(result).toMatchObject([
      {
        id: REC_ID,
        organizationId: ORG,
        workflowType: 'incident',
        recommendationType: 'increase_sla_window',
        priority: 'high',
        status: 'pending',
        createdAt: NOW,
      },
    ]);
  });

  it('sets tenant context before running queries', async () => {
    const pool = makePool([ok([]), ok([]), ok([])]);
    const svc = new LoopOptimizationService(pool);
    await svc.generateRecommendations(ORG);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const [sql, params] = calls[0] ?? ['', []];
    expect(sql).toBe('SELECT set_config($1, $2, true)');
    expect(params[1]).toBe(ORG);
  });
});

// ─── listRecommendations ─────────────────────────────────────────────────────

describe('LoopOptimizationService.listRecommendations', () => {
  it('returns all recommendations when no status filter is given', async () => {
    const rows = [recRow({ id: 'r1', status: 'pending' }), recRow({ id: 'r2', status: 'applied' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new LoopOptimizationService(pool);
    const result = await svc.listRecommendations(ORG);
    expect(result).toHaveLength(2);
  });

  it('filters by status when provided', async () => {
    const pool = makePool([ok([]), ok([recRow({ status: 'pending' })])]);
    const svc = new LoopOptimizationService(pool);
    await svc.listRecommendations(ORG, 'pending');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const selectParams = calls[1]?.[1] ?? [];
    expect(selectParams).toContain('pending');
  });

  it('returns empty array when no recommendations exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new LoopOptimizationService(pool);
    const result = await svc.listRecommendations(ORG);
    expect(result).toEqual([]);
  });
});

// ─── applyRecommendation ─────────────────────────────────────────────────────

describe('LoopOptimizationService.applyRecommendation', () => {
  it('returns updated recommendation with status applied', async () => {
    const updated = recRow({ status: 'applied' });
    const pool = makePool([ok([]), ok([updated])]);
    const svc = new LoopOptimizationService(pool);
    const result = await svc.applyRecommendation(ORG, REC_ID);
    expect(result?.status).toBe('applied');
    expect(result?.id).toBe(REC_ID);
  });

  it('returns null when recommendation is not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new LoopOptimizationService(pool);
    const result = await svc.applyRecommendation(ORG, 'nonexistent-id');
    expect(result).toBeNull();
  });

  it('scopes the update to the organization', async () => {
    const pool = makePool([ok([]), ok([recRow({ status: 'applied' })])]);
    const svc = new LoopOptimizationService(pool);
    await svc.applyRecommendation(ORG, REC_ID);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const updateParams = calls[1]?.[1] ?? [];
    expect(updateParams).toContain(ORG);
    expect(updateParams).toContain(REC_ID);
  });
});

// ─── dismissRecommendation ───────────────────────────────────────────────────

describe('LoopOptimizationService.dismissRecommendation', () => {
  it('returns updated recommendation with status dismissed', async () => {
    const updated = recRow({ status: 'dismissed' });
    const pool = makePool([ok([]), ok([updated])]);
    const svc = new LoopOptimizationService(pool);
    const result = await svc.dismissRecommendation(ORG, REC_ID);
    expect(result?.status).toBe('dismissed');
  });

  it('returns null when recommendation not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new LoopOptimizationService(pool);
    const result = await svc.dismissRecommendation(ORG, 'nonexistent-id');
    expect(result).toBeNull();
  });
});
