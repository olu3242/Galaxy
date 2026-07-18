import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { InvoiceService } from '../invoices/InvoiceService.js';

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
  subscription_id: 'sub-1',
  status: 'open',
  amount_cents: 0,
  currency: 'usd',
  period_start: '2024-01-01',
  period_end: '2024-01-31',
  due_date: '2024-02-15',
  paid_at: null,
  line_items: [],
  metadata: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const paidInvoiceRow = {
  ...invoiceRow,
  status: 'paid',
  paid_at: '2024-02-01T00:00:00Z',
};

describe('InvoiceService', () => {
  describe('generateInvoice', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([]), ok([invoiceRow])]);
      const svc = new InvoiceService(pool);
      await svc.generateInvoice({
        organizationId: 'org-1',
        subscriptionId: 'sub-1',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        dueDate: '2024-02-15',
      });
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0]?.[0]).toContain('set_config');
      expect(calls[0]?.[1]).toContain('org-1');
    });

    it('generates invoice from usage events', async () => {
      const usageRows = [{ event_type: 'api_call', total_quantity: '100' }];
      const pool = makePool([ok([]), ok(usageRows), ok([invoiceRow])]);
      const svc = new InvoiceService(pool);
      const invoice = await svc.generateInvoice({
        organizationId: 'org-1',
        subscriptionId: 'sub-1',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        dueDate: '2024-02-15',
      });
      expect(invoice.id).toBe('inv-1');
      expect(invoice.status).toBe('open');
    });

    it('generates invoice with no usage events', async () => {
      const pool = makePool([ok([]), ok([]), ok([invoiceRow])]);
      const svc = new InvoiceService(pool);
      const invoice = await svc.generateInvoice({
        organizationId: 'org-1',
        subscriptionId: 'sub-1',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        dueDate: '2024-02-15',
      });
      expect(invoice.amountCents).toBe(0);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new InvoiceService(pool);
      await expect(
        svc.generateInvoice({
          organizationId: 'org-1',
          subscriptionId: 'sub-1',
          periodStart: '2024-01-01',
          periodEnd: '2024-01-31',
          dueDate: '2024-02-15',
        }),
      ).rejects.toThrow('Failed to generate invoice');
    });

    it('passes period params to usage query', async () => {
      const pool = makePool([ok([]), ok([]), ok([invoiceRow])]);
      const svc = new InvoiceService(pool);
      await svc.generateInvoice({
        organizationId: 'org-1',
        subscriptionId: 'sub-1',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        dueDate: '2024-02-15',
      });
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1]?.[1]).toContain('2024-01-01');
      expect(calls[1]?.[1]).toContain('2024-01-31');
    });
  });

  describe('markPaid', () => {
    it('marks invoice as paid', async () => {
      const pool = makePool([ok([]), ok([paidInvoiceRow])]);
      const svc = new InvoiceService(pool);
      const invoice = await svc.markPaid('org-1', 'inv-1');
      expect(invoice.status).toBe('paid');
      expect(invoice.paidAt).toBe('2024-02-01T00:00:00Z');
    });

    it('sets tenant context first', async () => {
      const pool = makePool([ok([]), ok([paidInvoiceRow])]);
      const svc = new InvoiceService(pool);
      await svc.markPaid('org-1', 'inv-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0]?.[0]).toContain('set_config');
    });

    it('throws when invoice not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new InvoiceService(pool);
      await expect(svc.markPaid('org-1', 'inv-missing')).rejects.toThrow('Invoice not found');
    });

    it('passes invoiceId and orgId as params', async () => {
      const pool = makePool([ok([]), ok([paidInvoiceRow])]);
      const svc = new InvoiceService(pool);
      await svc.markPaid('org-1', 'inv-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1]?.[1]).toContain('inv-1');
      expect(calls[1]?.[1]).toContain('org-1');
    });
  });

  describe('listByOrg', () => {
    it('returns mapped invoices', async () => {
      const pool = makePool([ok([]), ok([invoiceRow, invoiceRow])]);
      const svc = new InvoiceService(pool);
      const invoices = await svc.listByOrg('org-1');
      expect(invoices).toHaveLength(2);
      expect(invoices[0]?.organizationId).toBe('org-1');
    });

    it('returns empty array when no invoices', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new InvoiceService(pool);
      const invoices = await svc.listByOrg('org-1');
      expect(invoices).toHaveLength(0);
    });

    it('passes limit and offset parameters', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new InvoiceService(pool);
      await svc.listByOrg('org-1', 5, 10);
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1]?.[1]).toContain(5);
      expect(calls[1]?.[1]).toContain(10);
    });

    it('uses defaults of 20/0 for limit/offset', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new InvoiceService(pool);
      await svc.listByOrg('org-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1]?.[1]).toContain(20);
      expect(calls[1]?.[1]).toContain(0);
    });
  });

  describe('getInvoice', () => {
    it('returns invoice when found', async () => {
      const pool = makePool([ok([]), ok([invoiceRow])]);
      const svc = new InvoiceService(pool);
      const invoice = await svc.getInvoice('org-1', 'inv-1');
      expect(invoice?.id).toBe('inv-1');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new InvoiceService(pool);
      const invoice = await svc.getInvoice('org-1', 'inv-missing');
      expect(invoice).toBeNull();
    });

    it('passes invoiceId and orgId as params', async () => {
      const pool = makePool([ok([]), ok([invoiceRow])]);
      const svc = new InvoiceService(pool);
      await svc.getInvoice('org-1', 'inv-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1]?.[1]).toContain('inv-1');
      expect(calls[1]?.[1]).toContain('org-1');
    });
  });
});
