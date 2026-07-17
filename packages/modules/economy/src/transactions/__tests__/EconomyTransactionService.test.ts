import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult, PoolClient } from 'pg';
import { EconomyTransactionService } from '../EconomyTransactionService.js';
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
  account_type: 'publisher_earnings',
  transaction_type: 'earn',
  amount: '50.00',
  description: 'Test earn',
  reference_type: 'workflow',
  reference_id: 'wf-1',
  correlation_id: 'corr-1',
  created_at: '2024-01-01T00:00:00Z',
};

describe('EconomyTransactionService', () => {
  describe('earn', () => {
    it('sets tenant context as first pool query', async () => {
      const client = makeClient([ok([]), ok([]), ok([]), ok([txRow]), ok([])]);
      const pool = makePool([ok([])], client);
      const svc = new EconomyTransactionService(pool);
      await svc.earn({
        organizationId: 'org-1',
        accountType: 'publisher_earnings',
        transactionType: 'earn',
        amount: 50,
        description: 'Test earn',
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
      expect(((calls[0]?.[1] ?? []) as string[])[1]).toBe('org-1');
    });

    it('returns mapped transaction on success', async () => {
      const client = makeClient([ok([]), ok([]), ok([]), ok([txRow]), ok([])]);
      const pool = makePool([ok([])], client);
      const svc = new EconomyTransactionService(pool);
      const result = await svc.earn({
        organizationId: 'org-1',
        accountType: 'publisher_earnings',
        transactionType: 'earn',
        amount: 50,
        description: 'Test earn',
        referenceType: 'workflow',
        referenceId: 'wf-1',
        correlationId: 'corr-1',
      });
      expect(result.id).toBe('tx-1');
      expect(result.amount).toBe(50);
      expect(result.transactionType).toBe('earn');
      expect(result.referenceType).toBe('workflow');
      expect(result.correlationId).toBe('corr-1');
    });

    it('commits transaction and releases client', async () => {
      const client = makeClient([ok([]), ok([]), ok([]), ok([txRow]), ok([])]);
      const pool = makePool([ok([])], client);
      const svc = new EconomyTransactionService(pool);
      await svc.earn({
        organizationId: 'org-1',
        accountType: 'publisher_earnings',
        transactionType: 'earn',
        amount: 50,
        description: 'Test earn',
      });
      const clientCalls = (client.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(clientCalls[0]?.[0] as string).toBe('BEGIN');
      expect(clientCalls[4]?.[0] as string).toBe('COMMIT');
      expect((client.release as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    });

    it('throws when INSERT returns no row', async () => {
      // Returns no tx row — empty result on the INSERT transactions query
      const client = makeClient([ok([]), ok([]), ok([]), ok([]), ok([])]);
      const pool = makePool([ok([])], client);
      const svc = new EconomyTransactionService(pool);
      await expect(
        svc.earn({
          organizationId: 'org-1',
          accountType: 'publisher_earnings',
          transactionType: 'earn',
          amount: 50,
          description: 'Test earn',
        }),
      ).rejects.toThrow('Failed to record earn transaction');
    });
  });

  describe('spend', () => {
    it('sets tenant context as first pool query', async () => {
      const client = makeClient([
        ok([]),
        ok([{ balance: '200' }]),
        ok([]),
        ok([]),
        ok([{ ...txRow, transaction_type: 'charge' }]),
        ok([]),
      ]);
      const pool = makePool([ok([])], client);
      const svc = new EconomyTransactionService(pool);
      await svc.spend({
        organizationId: 'org-1',
        accountType: 'workflow_credits',
        transactionType: 'charge',
        amount: 50,
        description: 'Test charge',
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns mapped transaction when balance is sufficient', async () => {
      const spendRow: EconomyTransactionRow = {
        ...txRow,
        transaction_type: 'charge',
        account_type: 'workflow_credits',
      };
      const client = makeClient([
        ok([]),
        ok([{ balance: '200' }]),
        ok([]),
        ok([]),
        ok([spendRow]),
        ok([]),
      ]);
      const pool = makePool([ok([])], client);
      const svc = new EconomyTransactionService(pool);
      const result = await svc.spend({
        organizationId: 'org-1',
        accountType: 'workflow_credits',
        transactionType: 'charge',
        amount: 50,
        description: 'Test charge',
      });
      expect(result.id).toBe('tx-1');
      expect(result.transactionType).toBe('charge');
    });

    it('throws Insufficient balance when funds too low', async () => {
      // balance=5, amount=50 → should reject
      const client = makeClient([ok([]), ok([{ balance: '5' }]), ok([]), ok([])]);
      const pool = makePool([ok([])], client);
      const svc = new EconomyTransactionService(pool);
      await expect(
        svc.spend({
          organizationId: 'org-1',
          accountType: 'workflow_credits',
          transactionType: 'charge',
          amount: 50,
          description: 'Test charge',
        }),
      ).rejects.toThrow('Insufficient balance');
    });

    it('allows spend into negative when allowNegative is true', async () => {
      const spendRow: EconomyTransactionRow = { ...txRow, transaction_type: 'charge' };
      const client = makeClient([
        ok([]),
        ok([{ balance: '5' }]),
        ok([]),
        ok([]),
        ok([spendRow]),
        ok([]),
      ]);
      const pool = makePool([ok([])], client);
      const svc = new EconomyTransactionService(pool);
      const result = await svc.spend({
        organizationId: 'org-1',
        accountType: 'workflow_credits',
        transactionType: 'charge',
        amount: 50,
        description: 'Test charge',
        allowNegative: true,
      });
      expect(result.id).toBe('tx-1');
    });
  });

  describe('getHistory', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([txRow])]);
      const svc = new EconomyTransactionService(pool);
      await svc.getHistory('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns all transactions mapped correctly', async () => {
      const pool = makePool([ok([]), ok([txRow])]);
      const svc = new EconomyTransactionService(pool);
      const results = await svc.getHistory('org-1');
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('tx-1');
      expect(results[0]?.amount).toBe(50);
    });

    it('returns empty array when no transactions', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new EconomyTransactionService(pool);
      const results = await svc.getHistory('org-1');
      expect(results).toHaveLength(0);
    });

    it('filters by accountType when provided', async () => {
      const pool = makePool([ok([]), ok([txRow])]);
      const svc = new EconomyTransactionService(pool);
      await svc.getHistory('org-1', 'publisher_earnings');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[1]?.[0] as string).toContain('account_type');
    });
  });
});
