import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { RecoveryEngine } from '../RecoveryEngine.js';

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

const policyRow = {
  id: 'pol-1',
  organization_id: ORG,
  resource_type: 'workflow',
  max_retries: 3,
  backoff_seconds: 30,
  fallback_channel: null,
  enabled: true,
  created_at: NOW,
  updated_at: NOW,
};

const retryRow = {
  id: 'retry-1',
  organization_id: ORG,
  resource_type: 'workflow',
  resource_id: 'wf-1',
  status: 'retrying',
  attempt_count: 0,
  max_attempts: 3,
  last_attempt_at: null,
  succeeded_at: null,
  error_message: null,
  created_at: NOW,
};

describe('RecoveryEngine', () => {
  describe('setPolicy', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([policyRow])]);
      const engine = new RecoveryEngine(pool);
      await engine.setPolicy(ORG, 'workflow', 3, 30);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns mapped retry policy', async () => {
      const pool = makePool([ok([]), ok([policyRow])]);
      const engine = new RecoveryEngine(pool);
      const result = await engine.setPolicy(ORG, 'workflow', 3, 30);
      expect(result.maxRetries).toBe(3);
      expect(result.backoffSeconds).toBe(30);
      expect(result.enabled).toBe(true);
    });

    it('throws when upsert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new RecoveryEngine(pool);
      await expect(engine.setPolicy(ORG, 'workflow', 3, 30)).rejects.toThrow(
        'Failed to set retry policy',
      );
    });
  });

  describe('initiateRetry', () => {
    it('sets tenant context and uses policy max_retries', async () => {
      // set_config, SELECT policy, INSERT retry
      const pool = makePool([ok([]), ok([policyRow]), ok([retryRow])]);
      const engine = new RecoveryEngine(pool);
      const result = await engine.initiateRetry(ORG, 'workflow', 'wf-1');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result.maxAttempts).toBe(3);
      expect(result.status).toBe('retrying');
    });

    it('defaults to 3 max attempts when no policy found', async () => {
      const pool = makePool([ok([]), ok([]), ok([retryRow])]);
      const engine = new RecoveryEngine(pool);
      const result = await engine.initiateRetry(ORG, 'workflow', 'wf-1');
      expect(result.maxAttempts).toBe(3);
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([policyRow]), ok([])]);
      const engine = new RecoveryEngine(pool);
      await expect(engine.initiateRetry(ORG, 'workflow', 'wf-1')).rejects.toThrow(
        'Failed to initiate retry',
      );
    });
  });

  describe('recordAttempt', () => {
    it('sets tenant context and marks succeeded', async () => {
      const succeededRow = {
        ...retryRow,
        status: 'succeeded',
        attempt_count: 1,
        succeeded_at: NOW,
      };
      // set_config, SELECT current, UPDATE
      const pool = makePool([ok([]), ok([retryRow]), ok([succeededRow])]);
      const engine = new RecoveryEngine(pool);
      const result = await engine.recordAttempt(ORG, 'retry-1', true);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result.status).toBe('succeeded');
    });

    it('marks exhausted when attempts reach max and not succeeded', async () => {
      const currentRow = { ...retryRow, attempt_count: 2, max_attempts: 3 };
      const exhaustedRow = { ...retryRow, status: 'exhausted', attempt_count: 3 };
      const pool = makePool([ok([]), ok([currentRow]), ok([exhaustedRow])]);
      const engine = new RecoveryEngine(pool);
      const result = await engine.recordAttempt(ORG, 'retry-1', false, 'still failing');
      expect(result.status).toBe('exhausted');
    });

    it('throws when retry record not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new RecoveryEngine(pool);
      await expect(engine.recordAttempt(ORG, 'missing', false)).rejects.toThrow(
        'Retry record not found',
      );
    });

    it('throws when UPDATE returns no row', async () => {
      const pool = makePool([ok([]), ok([retryRow]), ok([])]);
      const engine = new RecoveryEngine(pool);
      await expect(engine.recordAttempt(ORG, 'retry-1', true)).rejects.toThrow(
        'Failed to update retry record',
      );
    });
  });

  describe('listRetries', () => {
    it('sets tenant context and returns all retries', async () => {
      const pool = makePool([ok([]), ok([retryRow])]);
      const engine = new RecoveryEngine(pool);
      const results = await engine.listRetries(ORG);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(results).toHaveLength(1);
    });

    it('adds status filter when provided', async () => {
      const pool = makePool([ok([]), ok([retryRow])]);
      const engine = new RecoveryEngine(pool);
      await engine.listRetries(ORG, 'retrying');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(String(calls[1]?.[0])).toContain('status');
    });
  });
});
