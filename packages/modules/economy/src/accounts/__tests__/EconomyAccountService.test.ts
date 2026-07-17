import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { EconomyAccountService } from '../EconomyAccountService.js';
import type { EconomyAccountRow } from '../../types.js';

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

const accountRow: EconomyAccountRow = {
  id: 'acc-1',
  organization_id: 'org-1',
  account_type: 'publisher_earnings',
  balance: '100.50',
  total_earned: '200.00',
  total_spent: '99.50',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('EconomyAccountService', () => {
  describe('ensureAccount', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([accountRow])]);
      const svc = new EconomyAccountService(pool);
      await svc.ensureAccount('org-1', 'publisher_earnings');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
      expect(((calls[0]?.[1] ?? []) as string[])[1]).toBe('org-1');
    });

    it('returns mapped account on success', async () => {
      const pool = makePool([ok([]), ok([accountRow])]);
      const svc = new EconomyAccountService(pool);
      const result = await svc.ensureAccount('org-1', 'publisher_earnings');
      expect(result.id).toBe('acc-1');
      expect(result.organizationId).toBe('org-1');
      expect(result.balance).toBe(100.5);
      expect(result.totalEarned).toBe(200);
      expect(result.totalSpent).toBe(99.5);
      expect(result.accountType).toBe('publisher_earnings');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new EconomyAccountService(pool);
      await expect(svc.ensureAccount('org-1', 'publisher_earnings')).rejects.toThrow(
        'Failed to ensure economy account',
      );
    });
  });

  describe('getAccount', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([accountRow])]);
      const svc = new EconomyAccountService(pool);
      await svc.getAccount('org-1', 'publisher_earnings');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns mapped account when row found', async () => {
      const pool = makePool([ok([]), ok([accountRow])]);
      const svc = new EconomyAccountService(pool);
      const result = await svc.getAccount('org-1', 'publisher_earnings');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('acc-1');
    });

    it('returns null when no row found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new EconomyAccountService(pool);
      const result = await svc.getAccount('org-1', 'publisher_earnings');
      expect(result).toBeNull();
    });
  });

  describe('getBalance', () => {
    it('returns numeric balance from account', async () => {
      const pool = makePool([ok([]), ok([accountRow])]);
      const svc = new EconomyAccountService(pool);
      const balance = await svc.getBalance('org-1', 'publisher_earnings');
      expect(balance).toBe(100.5);
    });

    it('returns 0 when account not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new EconomyAccountService(pool);
      const balance = await svc.getBalance('org-1', 'publisher_earnings');
      expect(balance).toBe(0);
    });
  });

  describe('listAccounts', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([accountRow])]);
      const svc = new EconomyAccountService(pool);
      await svc.listAccounts('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns all mapped accounts', async () => {
      const pool = makePool([
        ok([]),
        ok([accountRow, { ...accountRow, id: 'acc-2', account_type: 'workflow_credits' }]),
      ]);
      const svc = new EconomyAccountService(pool);
      const results = await svc.listAccounts('org-1');
      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('acc-1');
      expect(results[1]?.id).toBe('acc-2');
    });

    it('returns empty array when no accounts exist', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new EconomyAccountService(pool);
      const results = await svc.listAccounts('org-1');
      expect(results).toHaveLength(0);
    });
  });
});
