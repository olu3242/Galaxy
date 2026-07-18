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
  amount_cents: 5000,
  currency: 'usd',
  status: 'succeeded',
  payment_method: 'card',
  external_id: 'ext-123',
  metadata: {},
  paid_at: '2024-03-01T00:00:00Z',
  created_at: '2024-03-01T00:00:00Z',
};

describe('PaymentService', () => {
  describe('recordPayment', () => {
    it('inserts and returns payment with all fields', async () => {
      const pool = makePool([ok([]), ok([paymentRow])]);
      const svc = new PaymentService(pool);
      const result = await svc.recordPayment({
        organizationId: 'org-1',
        invoiceId: 'inv-1',
        amountCents: 5000,
        paymentMethod: 'card',
        externalId: 'ext-123',
      });
      expect(result.id).toBe('pay-1');
      expect(result.amountCents).toBe(5000);
      expect(result.status).toBe('succeeded');
      expect(result.externalId).toBe('ext-123');
    });

    it('defaults currency to usd', async () => {
      const pool = makePool([ok([]), ok([paymentRow])]);
      const svc = new PaymentService(pool);
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      await svc.recordPayment({
        organizationId: 'org-1',
        invoiceId: 'inv-1',
        amountCents: 5000,
        paymentMethod: 'card',
      });
      expect(calls[1]?.[1]?.[3]).toBe('usd');
    });

    it('sets externalId to null when not provided', async () => {
      const pool = makePool([ok([]), ok([{ ...paymentRow, external_id: null }])]);
      const svc = new PaymentService(pool);
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      await svc.recordPayment({
        organizationId: 'org-1',
        invoiceId: 'inv-1',
        amountCents: 5000,
        paymentMethod: 'card',
      });
      expect(calls[1]?.[1]?.[5]).toBeNull();
    });

    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([paymentRow])]);
      const svc = new PaymentService(pool);
      await svc.recordPayment({
        organizationId: 'org-1',
        invoiceId: 'inv-1',
        amountCents: 5000,
        paymentMethod: 'card',
      });
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]?.[0]).toContain('set_config');
      expect(calls[0]?.[1]).toContain('org-1');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PaymentService(pool);
      await expect(
        svc.recordPayment({
          organizationId: 'org-1',
          invoiceId: 'inv-1',
          amountCents: 5000,
          paymentMethod: 'card',
        }),
      ).rejects.toThrow('Payment record creation failed');
    });
  });

  describe('listPayments', () => {
    it('returns mapped payments', async () => {
      const pool = makePool([ok([]), ok([paymentRow, paymentRow])]);
      const svc = new PaymentService(pool);
      const results = await svc.listPayments({ organizationId: 'org-1' });
      expect(results).toHaveLength(2);
      expect(results[0]?.organizationId).toBe('org-1');
    });

    it('returns empty array when no payments', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PaymentService(pool);
      const results = await svc.listPayments({ organizationId: 'org-1' });
      expect(results).toHaveLength(0);
    });

    it('passes limit and offset parameters', async () => {
      const pool = makePool([ok([]), ok([paymentRow])]);
      const svc = new PaymentService(pool);
      await svc.listPayments({ organizationId: 'org-1', limit: 10, offset: 5 });
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      const params = calls[1]?.[1] as unknown[];
      expect(params).toContain(10);
      expect(params).toContain(5);
    });

    it('omits limit/offset clauses when not provided', async () => {
      const pool = makePool([ok([]), ok([paymentRow])]);
      const svc = new PaymentService(pool);
      await svc.listPayments({ organizationId: 'org-1' });
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      const sql = calls[1]?.[0] as string;
      expect(sql).not.toContain('LIMIT');
      expect(sql).not.toContain('OFFSET');
    });

    it('maps paidAt and externalId correctly', async () => {
      const pool = makePool([ok([]), ok([paymentRow])]);
      const svc = new PaymentService(pool);
      const results = await svc.listPayments({ organizationId: 'org-1' });
      expect(results[0]?.paidAt).toBe('2024-03-01T00:00:00Z');
      expect(results[0]?.externalId).toBe('ext-123');
    });
  });
});
