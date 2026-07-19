import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { InvoiceService } from '../InvoiceService.js';

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

const invoiceRow = {
  id: 'inv-1',
  organization_id: 'org-1',
  amount_cents: '5000',
  currency: 'USD',
  status: 'draft',
  due_date: null,
  paid_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

const itemRow = {
  id: 'item-1',
  invoice_id: 'inv-1',
  organization_id: 'org-1',
  description: 'Subscription fee',
  quantity: '1',
  unit_price_cents: '5000',
  created_at: '2024-01-01T00:00:00Z',
};

describe('InvoiceService', () => {
  describe('createInvoice', () => {
    it('sets tenant context and returns invoice', async () => {
      const pool = makePool([ok([]), ok([invoiceRow])]);
      const svc = new InvoiceService(pool);
      const result = await svc.createInvoice({ organizationId: 'org-1', amountCents: 5000 });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.id).toBe('inv-1');
      expect(result.amountCents).toBe(5000);
      expect(result.status).toBe('draft');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new InvoiceService(pool);
      await expect(
        svc.createInvoice({ organizationId: 'org-1', amountCents: 100 }),
      ).rejects.toThrow('Failed to create invoice');
    });
  });

  describe('listInvoices', () => {
    it('sets tenant context and returns list', async () => {
      const pool = makePool([ok([]), ok([invoiceRow])]);
      const svc = new InvoiceService(pool);
      const result = await svc.listInvoices('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result[0]?.currency).toBe('USD');
    });

    it('returns empty array when no invoices', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new InvoiceService(pool);
      const result = await svc.listInvoices('org-1');
      expect(result).toHaveLength(0);
    });

    it('passes status filter and limit', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new InvoiceService(pool);
      await svc.listInvoices('org-1', { status: 'paid', limit: 3 });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[1]?.[1] ?? []) as unknown[];
      expect(params).toContain('paid');
      expect(params).toContain(3);
    });
  });

  describe('markPaid', () => {
    it('returns updated invoice', async () => {
      const paid = { ...invoiceRow, status: 'paid', paid_at: '2024-01-02T00:00:00Z' };
      const pool = makePool([ok([paid])]);
      const svc = new InvoiceService(pool);
      const result = await svc.markPaid('inv-1');
      expect(result?.status).toBe('paid');
    });

    it('returns null when invoice not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new InvoiceService(pool);
      const result = await svc.markPaid('missing');
      expect(result).toBeNull();
    });
  });

  describe('addItem', () => {
    it('sets tenant context and returns item', async () => {
      const pool = makePool([ok([]), ok([itemRow])]);
      const svc = new InvoiceService(pool);
      const result = await svc.addItem({
        invoiceId: 'inv-1',
        organizationId: 'org-1',
        description: 'Subscription fee',
        quantity: 1,
        unitPriceCents: 5000,
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.id).toBe('item-1');
      expect(result.unitPriceCents).toBe(5000);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new InvoiceService(pool);
      await expect(
        svc.addItem({
          invoiceId: 'inv-1',
          organizationId: 'org-1',
          description: 'x',
          quantity: 1,
          unitPriceCents: 100,
        }),
      ).rejects.toThrow('Failed to add invoice item');
    });
  });
});
