import type { Pool } from 'pg';

export type BillingAccountStatus = 'active' | 'suspended' | 'closed';

export interface BillingAccount {
  id: string;
  organizationId: string;
  status: BillingAccountStatus;
  currency: string;
  createdAt: string;
}

export interface BillingProfile {
  id: string;
  organizationId: string;
  billingName: string;
  billingEmail: string;
  address: Record<string, unknown>;
  createdAt: string;
}

interface BillingAccountRow {
  id: string;
  organization_id: string;
  status: string;
  currency: string;
  created_at: string;
}

interface BillingProfileRow {
  id: string;
  organization_id: string;
  billing_name: string;
  billing_email: string;
  address: Record<string, unknown>;
  created_at: string;
}

export class BillingService {
  constructor(private readonly pool: Pool) {}

  async createAccount(input: {
    organizationId: string;
    currency?: string;
  }): Promise<BillingAccount> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<BillingAccountRow>(
      `INSERT INTO billing_accounts (organization_id, status, currency)
       VALUES ($1, 'active', $2)
       RETURNING *`,
      [input.organizationId, input.currency ?? 'USD'],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create billing account');
    return this.mapAccount(row);
  }

  async getAccount(organizationId: string): Promise<BillingAccount | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<BillingAccountRow>(
      `SELECT * FROM billing_accounts WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [organizationId],
    );
    const row = result.rows[0];
    return row ? this.mapAccount(row) : null;
  }

  async listAccounts(opts?: { limit?: number; offset?: number }): Promise<BillingAccount[]> {
    const params: unknown[] = [];
    let idx = 1;
    const limit = opts?.limit !== undefined ? ` LIMIT $${String(idx++)}` : '';
    if (opts?.limit !== undefined) params.push(opts.limit);
    const offset = opts?.offset !== undefined ? ` OFFSET $${String(idx++)}` : '';
    if (opts?.offset !== undefined) params.push(opts.offset);

    const result = await this.pool.query<BillingAccountRow>(
      `SELECT * FROM billing_accounts ORDER BY created_at DESC${limit}${offset}`,
      params,
    );
    return result.rows.map((r) => this.mapAccount(r));
  }

  async createProfile(input: {
    organizationId: string;
    billingName: string;
    billingEmail: string;
    address?: Record<string, unknown>;
  }): Promise<BillingProfile> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<BillingProfileRow>(
      `INSERT INTO billing_profiles (organization_id, billing_name, billing_email, address)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        input.organizationId,
        input.billingName,
        input.billingEmail,
        JSON.stringify(input.address ?? {}),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create billing profile');
    return this.mapProfile(row);
  }

  private mapAccount(row: BillingAccountRow): BillingAccount {
    return {
      id: row.id,
      organizationId: row.organization_id,
      status: row.status as BillingAccountStatus,
      currency: row.currency,
      createdAt: row.created_at,
    };
  }

  private mapProfile(row: BillingProfileRow): BillingProfile {
    return {
      id: row.id,
      organizationId: row.organization_id,
      billingName: row.billing_name,
      billingEmail: row.billing_email,
      address: row.address,
      createdAt: row.created_at,
    };
  }
}
