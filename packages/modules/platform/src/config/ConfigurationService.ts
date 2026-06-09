import type { Pool } from 'pg';

export interface OrgConfiguration {
  organizationId: string;
  namespace: string;
  key: string;
  value: string;
  updatedAt: string;
}

interface OrgConfigRow {
  organization_id: string;
  namespace: string;
  key: string;
  value: string;
  updated_at: string;
}

export class ConfigurationService {
  constructor(private readonly pool: Pool) {}

  async set(input: {
    organizationId: string;
    namespace: string;
    key: string;
    value: string;
  }): Promise<OrgConfiguration> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<OrgConfigRow>(
      `INSERT INTO org_configurations (organization_id, namespace, key, value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, namespace, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING *`,
      [input.organizationId, input.namespace, input.key, input.value],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to set configuration');
    return this.mapConfig(row);
  }

  async get(organizationId: string, namespace: string, key: string): Promise<string | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<{ value: string }>(
      `SELECT value FROM org_configurations WHERE organization_id = $1 AND namespace = $2 AND key = $3`,
      [organizationId, namespace, key],
    );
    return result.rows[0]?.value ?? null;
  }

  async listNamespace(organizationId: string, namespace: string): Promise<OrgConfiguration[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<OrgConfigRow>(
      `SELECT * FROM org_configurations WHERE organization_id = $1 AND namespace = $2 ORDER BY key`,
      [organizationId, namespace],
    );
    return result.rows.map((r) => this.mapConfig(r));
  }

  async listAll(organizationId: string): Promise<OrgConfiguration[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<OrgConfigRow>(
      `SELECT * FROM org_configurations WHERE organization_id = $1 ORDER BY namespace, key`,
      [organizationId],
    );
    return result.rows.map((r) => this.mapConfig(r));
  }

  private mapConfig(row: OrgConfigRow): OrgConfiguration {
    return {
      organizationId: row.organization_id,
      namespace: row.namespace,
      key: row.key,
      value: row.value,
      updatedAt: row.updated_at,
    };
  }
}
