import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { BillingService } from '../BillingService.js';

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

const accountRow = {
  id: 'acct-1',
  organization_id: 'org-1',
  status: 'active',
  currency: 'USD',
  created_at: '2024-01-01T00:00:00Z',
};

const profileRow = {
  id: 'prof-1',
  organization_id: 'org-1',
  billing_name: 'Acme Inc',
  billing_email: 'billing@acme.com',
  address: { city: 'NYC' },
  created_at: '2024-01-01T00:00:00Z',
};

describe('BillingService', () => {
  describe('createAccount', () => {
    it('sets tenant context and returns account', async () => {
      const pool = makePool([ok([]), ok([accountRow])]);
      const svc = new BillingService(pool);
      const result = await svc.createAccount({ organizationId: 'org-1' });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.id).toBe('acct-1');
      expect(result.status).toBe('active');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new BillingService(pool);
      await expect(svc.createAccount({ organizationId: 'org-1' })).rejects.toThrow(
        'Failed to create billing account',
      );
    });
  });

  describe('getAccount', () => {
    it('sets tenant context and returns account', async () => {
      const pool = makePool([ok([]), ok([accountRow])]);
      const svc = new BillingService(pool);
      const result = await svc.getAccount('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result?.currency).toBe('USD');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new BillingService(pool);
      const result = await svc.getAccount('org-missing');
      expect(result).toBeNull();
    });
  });

  describe('listAccounts', () => {
    it('returns accounts list', async () => {
      const pool = makePool([ok([accountRow])]);
      const svc = new BillingService(pool);
      const result = await svc.listAccounts({ limit: 10 });
      expect(result[0]?.id).toBe('acct-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[0]?.[1] ?? []) as unknown[];
      expect(params).toContain(10);
    });
  });

  describe('createProfile', () => {
    it('sets tenant context and returns profile', async () => {
      const pool = makePool([ok([]), ok([profileRow])]);
      const svc = new BillingService(pool);
      const result = await svc.createProfile({
        organizationId: 'org-1',
        billingName: 'Acme Inc',
        billingEmail: 'billing@acme.com',
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.billingName).toBe('Acme Inc');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new BillingService(pool);
      await expect(
        svc.createProfile({
          organizationId: 'org-1',
          billingName: 'x',
          billingEmail: 'x@x.com',
        }),
      ).rejects.toThrow('Failed to create billing profile');
    });
  });
});
