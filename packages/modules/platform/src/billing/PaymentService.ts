import type { Pool } from 'pg';

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export interface Payment {
  id: string;
  organizationId: string;
  invoiceId: string | null;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  paidAt: string | null;
  createdAt: string;
}

export interface Credit {
  id: string;
  organizationId: string;
  amountCents: number;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
}

interface PaymentRow {
  id: string;
  organization_id: string;
  invoice_id: string | null;
  amount_cents: string;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

interface CreditRow {
  id: string;
  organization_id: string;
  amount_cents: string;
  reason: string;
  expires_at: string | null;
  created_at: string;
}

export class PaymentService {
  constructor(private readonly pool: Pool) {}

  async recordPayment(input: {
    organizationId: string;
    amountCents: number;
    currency?: string;
    invoiceId?: string;
    status?: PaymentStatus;
  }): Promise<Payment> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<PaymentRow>(
      `INSERT INTO payments (organization_id, invoice_id, amount_cents, currency, status, paid_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'succeeded' THEN NOW() ELSE NULL END)
       RETURNING *`,
      [
        input.organizationId,
        input.invoiceId ?? null,
        input.amountCents,
        input.currency ?? 'USD',
        input.status ?? 'pending',
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record payment');
    return this.mapPayment(row);
  }

  async listPayments(organizationId: string, opts?: { limit?: number }): Promise<Payment[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const params: unknown[] = [organizationId];
    const limit = opts?.limit !== undefined ? ` LIMIT $2` : '';
    if (opts?.limit !== undefined) params.push(opts.limit);

    const result = await this.pool.query<PaymentRow>(
      `SELECT * FROM payments WHERE organization_id = $1 ORDER BY created_at DESC${limit}`,
      params,
    );
    return result.rows.map((r) => this.mapPayment(r));
  }

  async issueCredit(input: {
    organizationId: string;
    amountCents: number;
    reason: string;
    expiresAt?: string;
  }): Promise<Credit> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<CreditRow>(
      `INSERT INTO credits (organization_id, amount_cents, reason, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.organizationId, input.amountCents, input.reason, input.expiresAt ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to issue credit');
    return this.mapCredit(row);
  }

  private mapPayment(row: PaymentRow): Payment {
    return {
      id: row.id,
      organizationId: row.organization_id,
      invoiceId: row.invoice_id,
      amountCents: parseInt(row.amount_cents, 10),
      currency: row.currency,
      status: row.status as PaymentStatus,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    };
  }

  private mapCredit(row: CreditRow): Credit {
    return {
      id: row.id,
      organizationId: row.organization_id,
      amountCents: parseInt(row.amount_cents, 10),
      reason: row.reason,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }
}
