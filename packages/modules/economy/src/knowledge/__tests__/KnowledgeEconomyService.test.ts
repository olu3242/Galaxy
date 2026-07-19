import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult, PoolClient } from 'pg';
import { KnowledgeEconomyService } from '../KnowledgeEconomyService.js';
import type { EconomyTransactionRow } from '../../types.js';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makeClient(responses: QueryResult[]): PoolClient {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
    release: vi.fn(),
  } as unknown as PoolClient;
}

function makePool(poolResponses: QueryResult[], client?: PoolClient): Pool {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = poolResponses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
    connect: vi.fn(() => Promise.resolve(client ?? makeClient([]))),
  } as unknown as Pool;
}

const txRow: EconomyTransactionRow = {
  id: 'tx-1',
  organization_id: 'org-1',
  account_type: 'knowledge_rewards',
  transaction_type: 'reward',
  amount: '5.00',
  description: 'Knowledge contribution reward for document doc-1',
  reference_type: 'knowledge_document',
  reference_id: 'doc-1',
  correlation_id: null,
  created_at: '2024-01-01T00:00:00Z',
};

describe('KnowledgeEconomyService', () => {
  describe('rewardContribution', () => {
    it('sets tenant context as first pool query', async () => {
      const client = makeClient([ok([]), ok([]), ok([]), ok([txRow]), ok([])]);
      const pool = makePool([ok([])], client);
      const svc = new KnowledgeEconomyService(pool);
      await svc.rewardContribution('org-1', 'doc-1', 5);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns mapped reward transaction', async () => {
      const client = makeClient([ok([]), ok([]), ok([]), ok([txRow]), ok([])]);
      const pool = makePool([ok([])], client);
      const svc = new KnowledgeEconomyService(pool);
      const result = await svc.rewardContribution('org-1', 'doc-1', 5, 'corr-1');
      expect(result.id).toBe('tx-1');
      expect(result.transactionType).toBe('reward');
      expect(result.referenceType).toBe('knowledge_document');
      expect(result.referenceId).toBe('doc-1');
    });

    it('throws when INSERT returns no row', async () => {
      const client = makeClient([ok([]), ok([]), ok([]), ok([]), ok([])]);
      const pool = makePool([ok([])], client);
      const svc = new KnowledgeEconomyService(pool);
      await expect(svc.rewardContribution('org-1', 'doc-1', 5)).rejects.toThrow(
        'Failed to record earn transaction',
      );
    });
  });

  describe('chargeKnowledgeQuery', () => {
    it('sets tenant context as first pool query', async () => {
      const chargeRow: EconomyTransactionRow = {
        ...txRow,
        transaction_type: 'charge',
        reference_type: 'knowledge_query',
        reference_id: 'query-1',
      };
      const client = makeClient([
        ok([]),
        ok([{ balance: '50' }]),
        ok([]),
        ok([]),
        ok([chargeRow]),
        ok([]),
      ]);
      const pool = makePool([ok([])], client);
      const svc = new KnowledgeEconomyService(pool);
      await svc.chargeKnowledgeQuery('org-1', 'query-1', 2);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns mapped charge transaction', async () => {
      const chargeRow: EconomyTransactionRow = {
        ...txRow,
        transaction_type: 'charge',
        reference_type: 'knowledge_query',
        reference_id: 'query-1',
      };
      const client = makeClient([
        ok([]),
        ok([{ balance: '50' }]),
        ok([]),
        ok([]),
        ok([chargeRow]),
        ok([]),
      ]);
      const pool = makePool([ok([])], client);
      const svc = new KnowledgeEconomyService(pool);
      const result = await svc.chargeKnowledgeQuery('org-1', 'query-1', 2, 'corr-1');
      expect(result.id).toBe('tx-1');
      expect(result.transactionType).toBe('charge');
    });

    it('throws when insufficient balance', async () => {
      const client = makeClient([ok([]), ok([{ balance: '1' }]), ok([]), ok([])]);
      const pool = makePool([ok([])], client);
      const svc = new KnowledgeEconomyService(pool);
      await expect(svc.chargeKnowledgeQuery('org-1', 'query-1', 10)).rejects.toThrow(
        'Insufficient balance',
      );
    });
  });

  describe('getKnowledgeEarnings', () => {
    it('returns list of knowledge earning transactions', async () => {
      const pool = makePool([ok([]), ok([txRow])]);
      const svc = new KnowledgeEconomyService(pool);
      const results = await svc.getKnowledgeEarnings('org-1');
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('tx-1');
    });

    it('returns empty array when no earnings', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new KnowledgeEconomyService(pool);
      const results = await svc.getKnowledgeEarnings('org-1');
      expect(results).toHaveLength(0);
    });
  });
});
