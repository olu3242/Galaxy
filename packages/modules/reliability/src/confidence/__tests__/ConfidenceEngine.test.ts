import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ConfidenceEngine } from '../ConfidenceEngine.js';

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

const scoreRow = {
  id: 'score-1',
  organization_id: ORG,
  resource_type: 'workflow',
  resource_id: 'wf-1',
  score: 0.97,
  decision: 'auto_execute',
  factors: {},
  review_request_id: null,
  created_at: NOW,
};

const thresholdRow = {
  id: 'thr-1',
  organization_id: ORG,
  auto_execute_min: 0.95,
  confirmation_min: 0.8,
  created_at: NOW,
  updated_at: NOW,
};

const reviewRow = {
  id: 'rev-1',
  organization_id: ORG,
  confidence_score_id: 'score-1',
  resource_type: 'workflow',
  resource_id: 'wf-1',
  reason: 'low score',
  status: 'pending',
  reviewed_by: null,
  reviewed_at: null,
  created_at: NOW,
};

describe('ConfidenceEngine', () => {
  describe('score', () => {
    it('sets tenant context as first query', async () => {
      // set_config, getThreshold, INSERT score
      const pool = makePool([ok([]), ok([thresholdRow]), ok([scoreRow])]);
      const engine = new ConfidenceEngine(pool);
      await engine.score(ORG, 'workflow', 'wf-1', 0.97);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns auto_execute decision when score >= autoExecuteMin', async () => {
      const pool = makePool([ok([]), ok([thresholdRow]), ok([scoreRow])]);
      const engine = new ConfidenceEngine(pool);
      const result = await engine.score(ORG, 'workflow', 'wf-1', 0.97);
      expect(result.decision).toBe('auto_execute');
      expect(result.score).toBe(0.97);
    });

    it('returns request_confirmation when score is between thresholds', async () => {
      const confirmationRow = { ...scoreRow, score: 0.85, decision: 'request_confirmation' };
      const pool = makePool([ok([]), ok([thresholdRow]), ok([confirmationRow])]);
      const engine = new ConfidenceEngine(pool);
      const result = await engine.score(ORG, 'workflow', 'wf-1', 0.85);
      expect(result.decision).toBe('request_confirmation');
    });

    it('returns human_review when score < confirmationMin', async () => {
      const humanRow = { ...scoreRow, score: 0.5, decision: 'human_review' };
      const pool = makePool([ok([]), ok([thresholdRow]), ok([humanRow])]);
      const engine = new ConfidenceEngine(pool);
      const result = await engine.score(ORG, 'workflow', 'wf-1', 0.5);
      expect(result.decision).toBe('human_review');
    });

    it('uses default thresholds when no threshold row found', async () => {
      const autoRow = { ...scoreRow, score: 0.96, decision: 'auto_execute' };
      // getThreshold returns empty => defaults apply (autoExecuteMin=0.95)
      const pool = makePool([ok([]), ok([]), ok([autoRow])]);
      const engine = new ConfidenceEngine(pool);
      const result = await engine.score(ORG, 'workflow', 'wf-1', 0.96);
      expect(result.decision).toBe('auto_execute');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([thresholdRow]), ok([])]);
      const engine = new ConfidenceEngine(pool);
      await expect(engine.score(ORG, 'workflow', 'wf-1', 0.97)).rejects.toThrow(
        'Failed to record confidence score',
      );
    });
  });

  describe('createReviewRequest', () => {
    it('sets tenant context and inserts review request', async () => {
      const pool = makePool([ok([]), ok([reviewRow])]);
      const engine = new ConfidenceEngine(pool);
      const result = await engine.createReviewRequest(
        ORG,
        'score-1',
        'workflow',
        'wf-1',
        'low score',
      );
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result.status).toBe('pending');
      expect(result.reason).toBe('low score');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new ConfidenceEngine(pool);
      await expect(
        engine.createReviewRequest(ORG, 'score-1', 'workflow', 'wf-1', 'reason'),
      ).rejects.toThrow('Failed to create review request');
    });
  });

  describe('resolveReview', () => {
    it('sets tenant context and returns updated review', async () => {
      const resolvedRow = {
        ...reviewRow,
        status: 'approved',
        reviewed_by: 'user-1',
        reviewed_at: NOW,
      };
      const pool = makePool([ok([]), ok([resolvedRow])]);
      const engine = new ConfidenceEngine(pool);
      const result = await engine.resolveReview(ORG, 'rev-1', 'approved', 'user-1');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result.status).toBe('approved');
      expect(result.reviewedBy).toBe('user-1');
    });

    it('throws when review not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new ConfidenceEngine(pool);
      await expect(engine.resolveReview(ORG, 'missing', 'approved', 'user-1')).rejects.toThrow(
        'Review request not found',
      );
    });
  });

  describe('setThreshold', () => {
    it('sets tenant context and upserts threshold', async () => {
      const pool = makePool([ok([]), ok([thresholdRow])]);
      const engine = new ConfidenceEngine(pool);
      const result = await engine.setThreshold(ORG, 0.95, 0.8);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result.autoExecuteMin).toBe(0.95);
      expect(result.confirmationMin).toBe(0.8);
    });

    it('throws when upsert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new ConfidenceEngine(pool);
      await expect(engine.setThreshold(ORG, 0.95, 0.8)).rejects.toThrow('Failed to set threshold');
    });
  });
});
