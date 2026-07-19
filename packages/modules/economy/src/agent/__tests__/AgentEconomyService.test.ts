import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult, PoolClient } from 'pg';
import { AgentEconomyService } from '../AgentEconomyService.js';
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
  account_type: 'agent_credits',
  transaction_type: 'charge',
  amount: '10.00',
  description: 'Agent execution charge for agent-1',
  reference_type: 'agent',
  reference_id: 'agent-1',
  correlation_id: null,
  created_at: '2024-01-01T00:00:00Z',
};

describe('AgentEconomyService', () => {
  describe('chargeAgentExecution', () => {
    it('sets tenant context via pool.query first', async () => {
      const client = makeClient([
        ok([]),
        ok([{ balance: '200' }]),
        ok([]),
        ok([]),
        ok([{ ...txRow, transaction_type: 'charge' }]),
        ok([]),
      ]);
      const pool = makePool([ok([])], client);
      const svc = new AgentEconomyService(pool);
      await svc.chargeAgentExecution('org-1', 'agent-1', 10);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns mapped charge transaction', async () => {
      const chargeRow: EconomyTransactionRow = { ...txRow, transaction_type: 'charge' };
      const client = makeClient([
        ok([]),
        ok([{ balance: '200' }]),
        ok([]),
        ok([]),
        ok([chargeRow]),
        ok([]),
      ]);
      const pool = makePool([ok([])], client);
      const svc = new AgentEconomyService(pool);
      const result = await svc.chargeAgentExecution('org-1', 'agent-1', 10, 'corr-1');
      expect(result.id).toBe('tx-1');
      expect(result.transactionType).toBe('charge');
      expect(result.referenceId).toBe('agent-1');
    });

    it('throws when balance insufficient', async () => {
      const client = makeClient([ok([]), ok([{ balance: '1' }]), ok([]), ok([])]);
      const pool = makePool([ok([])], client);
      const svc = new AgentEconomyService(pool);
      await expect(svc.chargeAgentExecution('org-1', 'agent-1', 10)).rejects.toThrow(
        'Insufficient balance',
      );
    });
  });

  describe('payPublisherRoyalty', () => {
    it('sets tenant context via pool.query first', async () => {
      const royaltyRow: EconomyTransactionRow = {
        ...txRow,
        account_type: 'publisher_earnings',
        transaction_type: 'royalty',
      };
      const client = makeClient([ok([]), ok([]), ok([]), ok([royaltyRow]), ok([])]);
      const pool = makePool([ok([])], client);
      const svc = new AgentEconomyService(pool);
      await svc.payPublisherRoyalty('org-1', 'agent-1', 5);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns mapped royalty transaction', async () => {
      const royaltyRow: EconomyTransactionRow = {
        ...txRow,
        account_type: 'publisher_earnings',
        transaction_type: 'royalty',
      };
      const client = makeClient([ok([]), ok([]), ok([]), ok([royaltyRow]), ok([])]);
      const pool = makePool([ok([])], client);
      const svc = new AgentEconomyService(pool);
      const result = await svc.payPublisherRoyalty('org-1', 'agent-1', 5, 'corr-1');
      expect(result.id).toBe('tx-1');
      expect(result.transactionType).toBe('royalty');
    });
  });

  describe('getAgentLedger', () => {
    it('sets tenant context as first pool query', async () => {
      // calls: [0] set_config (getAgentLedger), [1] SELECT txtype SUM, [2] set_config (getHistory), [3] SELECT transactions
      const pool = makePool([
        ok([]),
        ok([
          { transaction_type: 'charge', total: '30' },
          { transaction_type: 'royalty', total: '10' },
        ]),
        ok([]),
        ok([txRow]),
      ]);
      const svc = new AgentEconomyService(pool);
      await svc.getAgentLedger('org-1', 'agent-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns correct totals and filters transactions by agentId', async () => {
      const agentTx: EconomyTransactionRow = {
        ...txRow,
        reference_type: 'agent',
        reference_id: 'agent-1',
      };
      const otherTx: EconomyTransactionRow = { ...txRow, id: 'tx-2', reference_id: 'agent-other' };
      const pool = makePool([
        ok([]),
        ok([
          { transaction_type: 'charge', total: '30' },
          { transaction_type: 'royalty', total: '10' },
        ]),
        ok([]),
        ok([agentTx, otherTx]),
      ]);
      const svc = new AgentEconomyService(pool);
      const ledger = await svc.getAgentLedger('org-1', 'agent-1');
      expect(ledger.agentId).toBe('agent-1');
      expect(ledger.organizationId).toBe('org-1');
      expect(ledger.totalCharged).toBe(30);
      expect(ledger.totalRoyalties).toBe(10);
      expect(ledger.transactions).toHaveLength(1);
      expect(ledger.transactions[0]?.referenceId).toBe('agent-1');
    });

    it('returns zero totals when no transactions exist', async () => {
      const pool = makePool([ok([]), ok([]), ok([]), ok([])]);
      const svc = new AgentEconomyService(pool);
      const ledger = await svc.getAgentLedger('org-1', 'agent-1');
      expect(ledger.totalCharged).toBe(0);
      expect(ledger.totalRoyalties).toBe(0);
      expect(ledger.transactions).toHaveLength(0);
    });
  });
});
