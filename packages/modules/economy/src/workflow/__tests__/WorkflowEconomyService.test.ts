import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult, PoolClient } from 'pg';
import { WorkflowEconomyService } from '../WorkflowEconomyService.js';
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
  amount: '20.00',
  description: 'Publisher earning for workflow run wf-1',
  reference_type: 'workflow',
  reference_id: 'wf-1',
  correlation_id: null,
  created_at: '2024-01-01T00:00:00Z',
};

describe('WorkflowEconomyService', () => {
  describe('recordPublisherEarning', () => {
    // Happy path: set_config, dupCheck → count=0, txService.earn (set_config + connect)
    it('sets tenant context as first query', async () => {
      const client = makeClient([ok([]), ok([]), ok([]), ok([txRow]), ok([])]);
      const pool = makePool([ok([]), ok([{ count: '0' }]), ok([])], client);
      const svc = new WorkflowEconomyService(pool);
      await svc.recordPublisherEarning('org-1', 'wf-1', 20);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns mapped earn transaction when no duplicate', async () => {
      const client = makeClient([ok([]), ok([]), ok([]), ok([txRow]), ok([])]);
      const pool = makePool([ok([]), ok([{ count: '0' }]), ok([])], client);
      const svc = new WorkflowEconomyService(pool);
      const result = await svc.recordPublisherEarning('org-1', 'wf-1', 20, 'corr-1');
      expect(result.id).toBe('tx-1');
      expect(result.transactionType).toBe('earn');
      expect(result.referenceId).toBe('wf-1');
    });

    it('throws on duplicate earning detected within 1 hour', async () => {
      const pool = makePool([ok([]), ok([{ count: '1' }])]);
      const svc = new WorkflowEconomyService(pool);
      await expect(svc.recordPublisherEarning('org-1', 'wf-1', 20)).rejects.toThrow(
        'Duplicate earning detected for workflow wf-1',
      );
    });
  });

  describe('chargeWorkflowRun', () => {
    it('sets tenant context as first query', async () => {
      const chargeRow: EconomyTransactionRow = {
        ...txRow,
        account_type: 'workflow_credits',
        transaction_type: 'charge',
      };
      const client = makeClient([
        ok([]),
        ok([{ balance: '100' }]),
        ok([]),
        ok([]),
        ok([chargeRow]),
        ok([]),
      ]);
      const pool = makePool([ok([])], client);
      const svc = new WorkflowEconomyService(pool);
      await svc.chargeWorkflowRun('org-1', 'wf-1', 10);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns mapped charge transaction', async () => {
      const chargeRow: EconomyTransactionRow = {
        ...txRow,
        account_type: 'workflow_credits',
        transaction_type: 'charge',
      };
      const client = makeClient([
        ok([]),
        ok([{ balance: '100' }]),
        ok([]),
        ok([]),
        ok([chargeRow]),
        ok([]),
      ]);
      const pool = makePool([ok([])], client);
      const svc = new WorkflowEconomyService(pool);
      const result = await svc.chargeWorkflowRun('org-1', 'wf-1', 10, 'corr-1');
      expect(result.id).toBe('tx-1');
      expect(result.transactionType).toBe('charge');
    });

    it('throws when insufficient balance', async () => {
      const client = makeClient([ok([]), ok([{ balance: '5' }]), ok([]), ok([])]);
      const pool = makePool([ok([])], client);
      const svc = new WorkflowEconomyService(pool);
      await expect(svc.chargeWorkflowRun('org-1', 'wf-1', 50)).rejects.toThrow(
        'Insufficient balance',
      );
    });
  });

  describe('getPublisherEarnings', () => {
    it('returns mapped transaction list', async () => {
      const pool = makePool([ok([]), ok([txRow])]);
      const svc = new WorkflowEconomyService(pool);
      const results = await svc.getPublisherEarnings('org-1');
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('tx-1');
    });

    it('returns empty array when no earnings', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new WorkflowEconomyService(pool);
      const results = await svc.getPublisherEarnings('org-1');
      expect(results).toHaveLength(0);
    });
  });
});
