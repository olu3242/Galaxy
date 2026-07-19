import type { Pool } from 'pg';
import type { Invoice, InvoiceLineItem, InvoiceStatus, GenerateInvoiceInput } from '../types.js';

interface InvoiceRow {
  id: string;
  organization_id: string;
  subscription_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  period_start: string;
  period_end: string;
  due_date: string;
  paid_at: string | null;
  line_items: InvoiceLineItem[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function rowToInvoice(row: InvoiceRow): Invoice {
  const invoice: Invoice = {
    id: row.id,
    organizationId: row.organization_id,
    subscriptionId: row.subscription_id,
    status: row.status as InvoiceStatus,
    amountCents: row.amount_cents,
    currency: row.currency,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dueDate: row.due_date,
    lineItems: row.line_items,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.paid_at !== null) {
    invoice.paidAt = row.paid_at;
  }
  return invoice;
}

export class InvoiceService {
  constructor(private readonly pool: Pool) {}

  async generateInvoice(input: GenerateInvoiceInput): Promise<Invoice> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    const usageResult = await this.pool.query<{
      event_type: string;
      total_quantity: string;
    }>(
      `SELECT event_type, SUM(quantity) as total_quantity
       FROM usage_events
       WHERE organization_id = $1
         AND subscription_id = $2
         AND recorded_at >= $3
         AND recorded_at <= $4
       GROUP BY event_type`,
      [input.organizationId, input.subscriptionId, input.periodStart, input.periodEnd],
    );

    const lineItems: InvoiceLineItem[] = usageResult.rows.map((row) => ({
      description: row.event_type.replace(/_/g, ' '),
      quantity: Number(row.total_quantity),
      unitAmountCents: 0,
      totalCents: 0,
    }));

    const totalCents = lineItems.reduce((sum, item) => sum + item.totalCents, 0);

    const result = await this.pool.query<InvoiceRow>(
      `INSERT INTO invoices (
        organization_id, subscription_id, status, amount_cents, currency,
        period_start, period_end, due_date, paid_at, line_items, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        input.organizationId,
        input.subscriptionId,
        'open',
        totalCents,
        'usd',
        input.periodStart,
        input.periodEnd,
        input.dueDate,
        null,
        JSON.stringify(lineItems),
        JSON.stringify({}),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to generate invoice');
    return rowToInvoice(row);
  }

  async markPaid(orgId: string, invoiceId: string): Promise<Invoice> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<InvoiceRow>(
      `UPDATE invoices
       SET status = 'paid', paid_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [invoiceId, orgId],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Invoice not found');
    return rowToInvoice(row);
  }

  async listByOrg(orgId: string, limit = 20, offset = 0): Promise<Invoice[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<InvoiceRow>(
      `SELECT * FROM invoices
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [orgId, limit, offset],
    );

    return result.rows.map(rowToInvoice);
  }

  async getInvoice(orgId: string, invoiceId: string): Promise<Invoice | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<InvoiceRow>(
      'SELECT * FROM invoices WHERE id = $1 AND organization_id = $2',
      [invoiceId, orgId],
    );

    const row = result.rows[0];
    if (!row) return null;
    return rowToInvoice(row);
  }
}
