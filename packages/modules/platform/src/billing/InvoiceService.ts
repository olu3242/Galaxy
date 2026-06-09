import type { Pool } from 'pg';

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export interface Invoice {
  id: string;
  organizationId: string;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  organizationId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  createdAt: string;
}

interface InvoiceRow {
  id: string;
  organization_id: string;
  amount_cents: string;
  currency: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
}

interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  organization_id: string;
  description: string;
  quantity: string;
  unit_price_cents: string;
  created_at: string;
}

export class InvoiceService {
  constructor(private readonly pool: Pool) {}

  async createInvoice(input: {
    organizationId: string;
    amountCents: number;
    currency?: string;
    dueDate?: string;
  }): Promise<Invoice> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<InvoiceRow>(
      `INSERT INTO invoices (organization_id, amount_cents, currency, status, due_date)
       VALUES ($1, $2, $3, 'draft', $4)
       RETURNING *`,
      [
        input.organizationId,
        input.amountCents,
        input.currency ?? 'USD',
        input.dueDate ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create invoice');
    return this.mapInvoice(row);
  }

  async listInvoices(
    organizationId: string,
    opts?: { status?: InvoiceStatus; limit?: number },
  ): Promise<Invoice[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const params: unknown[] = [organizationId];
    let idx = 2;
    const extraWhere = opts?.status !== undefined ? ` AND status = $${String(idx++)}` : '';
    if (opts?.status !== undefined) params.push(opts.status);
    const limit = opts?.limit !== undefined ? ` LIMIT $${String(idx++)}` : '';
    if (opts?.limit !== undefined) params.push(opts.limit);

    const result = await this.pool.query<InvoiceRow>(
      `SELECT * FROM invoices WHERE organization_id = $1${extraWhere} ORDER BY created_at DESC${limit}`,
      params,
    );
    return result.rows.map((r) => this.mapInvoice(r));
  }

  async markPaid(invoiceId: string): Promise<Invoice | null> {
    const result = await this.pool.query<InvoiceRow>(
      `UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = $1 RETURNING *`,
      [invoiceId],
    );
    const row = result.rows[0];
    return row ? this.mapInvoice(row) : null;
  }

  async addItem(input: {
    invoiceId: string;
    organizationId: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
  }): Promise<InvoiceItem> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<InvoiceItemRow>(
      `INSERT INTO invoice_items (invoice_id, organization_id, description, quantity, unit_price_cents)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.invoiceId,
        input.organizationId,
        input.description,
        input.quantity,
        input.unitPriceCents,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to add invoice item');
    return this.mapItem(row);
  }

  private mapInvoice(row: InvoiceRow): Invoice {
    return {
      id: row.id,
      organizationId: row.organization_id,
      amountCents: parseInt(row.amount_cents, 10),
      currency: row.currency,
      status: row.status as InvoiceStatus,
      dueDate: row.due_date,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    };
  }

  private mapItem(row: InvoiceItemRow): InvoiceItem {
    return {
      id: row.id,
      invoiceId: row.invoice_id,
      organizationId: row.organization_id,
      description: row.description,
      quantity: parseInt(row.quantity, 10),
      unitPriceCents: parseInt(row.unit_price_cents, 10),
      createdAt: row.created_at,
    };
  }
}
