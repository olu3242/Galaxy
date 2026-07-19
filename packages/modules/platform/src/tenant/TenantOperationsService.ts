import type { Pool } from 'pg';

export type TenantStatus = 'active' | 'suspended' | 'trial' | 'churned';

export interface Tenant {
  id: string;
  name: string;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSetting {
  tenantId: string;
  key: string;
  value: string;
}

interface TenantRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TenantSettingRow {
  tenant_id: string;
  key: string;
  value: string;
}

export class TenantOperationsService {
  constructor(private readonly pool: Pool) {}

  async createTenant(input: { name: string; status?: TenantStatus }): Promise<Tenant> {
    const result = await this.pool.query<TenantRow>(
      `INSERT INTO tenants (name, status)
       VALUES ($1, $2)
       RETURNING *`,
      [input.name, input.status ?? 'trial'],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create tenant');
    return this.mapTenant(row);
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const result = await this.pool.query<TenantRow>(`SELECT * FROM tenants WHERE id = $1`, [
      tenantId,
    ]);
    const row = result.rows[0];
    return row ? this.mapTenant(row) : null;
  }

  async listTenants(opts?: {
    status?: TenantStatus;
    limit?: number;
    offset?: number;
  }): Promise<Tenant[]> {
    const params: unknown[] = [];
    let idx = 1;
    const where = opts?.status !== undefined ? `WHERE status = $${String(idx++)}` : '';
    if (opts?.status !== undefined) params.push(opts.status);
    const limit = opts?.limit !== undefined ? ` LIMIT $${String(idx++)}` : '';
    if (opts?.limit !== undefined) params.push(opts.limit);
    const offset = opts?.offset !== undefined ? ` OFFSET $${String(idx++)}` : '';
    if (opts?.offset !== undefined) params.push(opts.offset);

    const result = await this.pool.query<TenantRow>(
      `SELECT * FROM tenants ${where} ORDER BY created_at DESC${limit}${offset}`,
      params,
    );
    return result.rows.map((r) => this.mapTenant(r));
  }

  async updateTenantStatus(tenantId: string, status: TenantStatus): Promise<Tenant | null> {
    const result = await this.pool.query<TenantRow>(
      `UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, tenantId],
    );
    const row = result.rows[0];
    return row ? this.mapTenant(row) : null;
  }

  async setSetting(tenantId: string, key: string, value: string): Promise<TenantSetting> {
    const result = await this.pool.query<TenantSettingRow>(
      `INSERT INTO tenant_settings (tenant_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value
       RETURNING *`,
      [tenantId, key, value],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to set tenant setting');
    return { tenantId: row.tenant_id, key: row.key, value: row.value };
  }

  async getSettings(tenantId: string): Promise<TenantSetting[]> {
    const result = await this.pool.query<TenantSettingRow>(
      `SELECT * FROM tenant_settings WHERE tenant_id = $1`,
      [tenantId],
    );
    return result.rows.map((r) => ({ tenantId: r.tenant_id, key: r.key, value: r.value }));
  }

  private mapTenant(row: TenantRow): Tenant {
    return {
      id: row.id,
      name: row.name,
      status: row.status as TenantStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
