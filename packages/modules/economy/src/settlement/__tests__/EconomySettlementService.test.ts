import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { EconomySettlementService } from '../EconomySettlementService.js';

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

describe('EconomySettlementService', () => {
  describe('getPendingSettlement', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([{ total: '0', count: '0' }])]);
      const svc = new EconomySettlementService(pool);
      await svc.getPendingSettlement('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
      expect(((calls[0]?.[1] ?? []) as string[])[1]).toBe('org-1');
    });

    it('returns correct summary with data', async () => {
      const pool = makePool([ok([]), ok([{ total: '250.75', count: '5' }])]);
      const svc = new EconomySettlementService(pool);
      const result = await svc.getPendingSettlement('org-1');
      expect(result.organizationId).toBe('org-1');
      expect(result.pendingAmount).toBe(250.75);
      expect(result.transactionCount).toBe(5);
      expect(result.period).toMatch(/^\d{4}-\d{2}$/);
    });

    it('returns zero amounts when no transactions', async () => {
      const pool = makePool([ok([]), ok([{ total: '0', count: '0' }])]);
      const svc = new EconomySettlementService(pool);
      const result = await svc.getPendingSettlement('org-1');
      expect(result.pendingAmount).toBe(0);
      expect(result.transactionCount).toBe(0);
    });

    it('returns zero amounts when query returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new EconomySettlementService(pool);
      const result = await svc.getPendingSettlement('org-1');
      expect(result.pendingAmount).toBe(0);
      expect(result.transactionCount).toBe(0);
    });
  });

  describe('runSettlement', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([{ count: '3', total: '100.00' }])]);
      const svc = new EconomySettlementService(pool);
      await svc.runSettlement('org-1', '2024-01');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns settled count and amount', async () => {
      const pool = makePool([ok([]), ok([{ count: '3', total: '150.00' }])]);
      const svc = new EconomySettlementService(pool);
      const result = await svc.runSettlement('org-1', '2024-01');
      expect(result.settled).toBe(3);
      expect(result.amount).toBe(150);
    });

    it('returns zeros when no row returned', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new EconomySettlementService(pool);
      const result = await svc.runSettlement('org-1', '2024-01');
      expect(result.settled).toBe(0);
      expect(result.amount).toBe(0);
    });
  });
});
