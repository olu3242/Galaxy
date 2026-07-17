import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PaymentService } from '../PaymentService.js';

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

const paymentRow = {
  id: 'pay-1',
  organization_id: 'org-1',
  invoice_id: 'inv-1',
  amount_cents: '9900',
  currency: 'USD',
  status: 'succeeded',
  paid_at: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
};

const creditRow = {
  id: 'cred-1',
  organization_id: 'org-1',
  amount_cents: '500',
  reason: 'Promo credit',
  expires_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

describe('PaymentService', () => {
  describe('recordPayment', () => {
    it('sets tenant context and returns payment', async () => {
      const pool = makePool([ok([]), ok([paymentRow])]);
      const svc = new PaymentService(pool);
      const result = await svc.recordPayment({
        organizationId: 'org-1',
        amountCents: 9900,
        status: 'succeeded',
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.id).toBe('pay-1');
      expect(result.amountCents).toBe(9900);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PaymentService(pool);
      await expect(
        svc.recordPayment({ organizationId: 'org-1', amountCents: 100 }),
      ).rejects.toThrow('Failed to record payment');
    });
  });

  describe('listPayments', () => {
    it('sets tenant context and returns payments', async () => {
      const pool = makePool([ok([]), ok([paymentRow])]);
      const svc = new PaymentService(pool);
      const result = await svc.listPayments('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result[0]?.status).toBe('succeeded');
    });

    it('returns empty array when no payments', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PaymentService(pool);
      const result = await svc.listPayments('org-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('issueCredit', () => {
    it('sets tenant context and returns credit', async () => {
      const pool = makePool([ok([]), ok([creditRow])]);
      const svc = new PaymentService(pool);
      const result = await svc.issueCredit({
        organizationId: 'org-1',
        amountCents: 500,
        reason: 'Promo credit',
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.id).toBe('cred-1');
      expect(result.amountCents).toBe(500);
      expect(result.expiresAt).toBeNull();
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PaymentService(pool);
      await expect(
        svc.issueCredit({ organizationId: 'org-1', amountCents: 100, reason: 'x' }),
      ).rejects.toThrow('Failed to issue credit');
    });
  });
});
