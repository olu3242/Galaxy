import type { Pool } from 'pg';

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export interface Payment {
  id: string;
  organizationId: string;
  invoiceId: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod: string;
  externalId: string | null;
  metadata: Record<string, unknown>;
  paidAt: string | null;
  createdAt: string;
}

export interface RecordPaymentInput {
  organizationId: string;
  invoiceId: string;
  amountCents: number;
  currency?: string;
  paymentMethod: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
}

interface PaymentRow {
  id: string;
  organization_id: string;
  invoice_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  payment_method: string;
  external_id: string | null;
  metadata: Record<string, unknown>;
  paid_at: string | null;
  created_at: string;
}

export class PaymentService {
  constructor(private readonly pool: Pool) {}

  async recordPayment(input: RecordPaymentInput): Promise<Payment> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<PaymentRow>(
      `INSERT INTO payments
         (organization_id, invoice_id, amount_cents, currency, status, payment_method, external_id, metadata, paid_at)
       VALUES ($1, $2, $3, $4, 'succeeded', $5, $6, $7, NOW())
       RETURNING *`,
      [
        input.organizationId,
        input.invoiceId,
        input.amountCents,
        input.currency ?? 'usd',
        input.paymentMethod,
        input.externalId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Payment record creation failed');
    return this.rowToPayment(row);
  }

  async listPayments(opts: {
    organizationId: string;
    limit?: number;
    offset?: number;
  }): Promise<Payment[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      opts.organizationId,
    ]);
    const params: unknown[] = [opts.organizationId];
    let idx = 2;

    const limitClause = opts.limit !== undefined ? ` LIMIT $${String(idx)}` : '';
    if (opts.limit !== undefined) {
      params.push(opts.limit);
      idx++;
    }
    const offsetClause = opts.offset !== undefined ? ` OFFSET $${String(idx)}` : '';
    if (opts.offset !== undefined) params.push(opts.offset);

    const result = await this.pool.query<PaymentRow>(
      `SELECT * FROM payments WHERE organization_id = $1 ORDER BY created_at DESC${limitClause}${offsetClause}`,
      params,
    );
    return result.rows.map((row) => this.rowToPayment(row));
  }

  private rowToPayment(row: PaymentRow): Payment {
    return {
      id: row.id,
      organizationId: row.organization_id,
      invoiceId: row.invoice_id,
      amountCents: row.amount_cents,
      currency: row.currency,
      status: row.status as PaymentStatus,
      paymentMethod: row.payment_method,
      externalId: row.external_id,
      metadata: row.metadata,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    };
  }
}
