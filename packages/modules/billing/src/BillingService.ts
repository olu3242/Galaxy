import type { Pool } from 'pg';

export type BillingAccountStatus = 'active' | 'suspended' | 'closed';

export interface BillingAccount {
  id: string;
  organizationId: string;
  status: BillingAccountStatus;
  currency: string;
  billingEmail: string;
  billingName: string;
  billingAddress: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBillingAccountInput {
  organizationId: string;
  billingEmail: string;
  billingName: string;
  currency?: string;
  billingAddress?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateBillingAccountInput {
  billingEmail?: string;
  billingName?: string;
  currency?: string;
  billingAddress?: Record<string, unknown>;
  status?: BillingAccountStatus;
  metadata?: Record<string, unknown>;
}

interface AccountRow {
  id: string;
  organization_id: string;
  status: string;
  currency: string;
  billing_email: string;
  billing_name: string;
  billing_address: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export class BillingService {
  constructor(private readonly pool: Pool) {}

  async createBillingAccount(input: CreateBillingAccountInput): Promise<BillingAccount> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', input.organizationId]);
    const result = await this.pool.query<AccountRow>(
      `INSERT INTO billing_accounts
         (organization_id, status, currency, billing_email, billing_name, billing_address, metadata)
       VALUES ($1, 'active', $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.organizationId,
        input.currency ?? 'usd',
        input.billingEmail,
        input.billingName,
        JSON.stringify(input.billingAddress ?? {}),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Billing account creation failed');
    return this.rowToAccount(row);
  }

  async getBillingAccount(orgId: string): Promise<BillingAccount | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<AccountRow>(
      'SELECT * FROM billing_accounts WHERE organization_id = $1 LIMIT 1',
      [orgId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return this.rowToAccount(row);
  }

  async updateBillingAccount(
    orgId: string,
    input: UpdateBillingAccountInput,
  ): Promise<BillingAccount | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.billingEmail !== undefined) {
      fields.push(`billing_email = $${String(idx++)}`);
      values.push(input.billingEmail);
    }
    if (input.billingName !== undefined) {
      fields.push(`billing_name = $${String(idx++)}`);
      values.push(input.billingName);
    }
    if (input.currency !== undefined) {
      fields.push(`currency = $${String(idx++)}`);
      values.push(input.currency);
    }
    if (input.billingAddress !== undefined) {
      fields.push(`billing_address = $${String(idx++)}`);
      values.push(JSON.stringify(input.billingAddress));
    }
    if (input.status !== undefined) {
      fields.push(`status = $${String(idx++)}`);
      values.push(input.status);
    }
    if (input.metadata !== undefined) {
      fields.push(`metadata = $${String(idx++)}`);
      values.push(JSON.stringify(input.metadata));
    }

    if (fields.length === 0) return this.getBillingAccount(orgId);

    fields.push('updated_at = NOW()');
    values.push(orgId);

    const result = await this.pool.query<AccountRow>(
      `UPDATE billing_accounts SET ${fields.join(', ')}
       WHERE organization_id = $${String(idx)}
       RETURNING *`,
      values,
    );
    const row = result.rows[0];
    if (!row) return null;
    return this.rowToAccount(row);
  }

  private rowToAccount(row: AccountRow): BillingAccount {
    return {
      id: row.id,
      organizationId: row.organization_id,
      status: row.status as BillingAccountStatus,
      currency: row.currency,
      billingEmail: row.billing_email,
      billingName: row.billing_name,
      billingAddress: row.billing_address ?? {},
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
