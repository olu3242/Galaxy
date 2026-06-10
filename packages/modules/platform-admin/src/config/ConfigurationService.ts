import type { Pool } from 'pg';

export type ConfigScope = 'workflow' | 'approval' | 'notification' | 'security' | 'policy';

export interface OrgConfiguration {
  id: string;
  organizationId: string;
  scope: ConfigScope;
  key: string;
  value: unknown;
  updatedBy: string;
  updatedAt: string;
}

interface ConfigRow {
  id: string;
  organization_id: string;
  scope: string;
  key: string;
  value: unknown;
  updated_by: string;
  updated_at: string;
}

export class ConfigurationService {
  constructor(private readonly pool: Pool) {}

  async getConfig(orgId: string, scope: ConfigScope, key: string): Promise<OrgConfiguration | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<ConfigRow>(
      'SELECT * FROM org_configurations WHERE organization_id = $1 AND scope = $2 AND key = $3 LIMIT 1',
      [orgId, scope, key],
    );
    const row = result.rows[0];
    if (!row) return null;
    return this.rowToConfig(row);
  }

  async setConfig(
    orgId: string,
    scope: ConfigScope,
    key: string,
    value: unknown,
    updatedBy: string,
  ): Promise<OrgConfiguration> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<ConfigRow>(
      `INSERT INTO org_configurations (organization_id, scope, key, value, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, scope, key) DO UPDATE SET
         value = EXCLUDED.value,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [orgId, scope, key, JSON.stringify(value), updatedBy],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Config upsert failed');
    return this.rowToConfig(row);
  }

  async listConfigs(orgId: string, scope?: ConfigScope): Promise<OrgConfiguration[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const params: unknown[] = [orgId];
    const scopeClause = scope !== undefined ? ' AND scope = $2' : '';
    if (scope !== undefined) params.push(scope);
    const result = await this.pool.query<ConfigRow>(
      `SELECT * FROM org_configurations WHERE organization_id = $1${scopeClause} ORDER BY scope, key`,
      params,
    );
    return result.rows.map((row) => this.rowToConfig(row));
  }

  async deleteConfig(orgId: string, scope: ConfigScope, key: string): Promise<boolean> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query(
      'DELETE FROM org_configurations WHERE organization_id = $1 AND scope = $2 AND key = $3',
      [orgId, scope, key],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private rowToConfig(row: ConfigRow): OrgConfiguration {
    return {
      id: row.id,
      organizationId: row.organization_id,
      scope: row.scope as ConfigScope,
      key: row.key,
      value: row.value,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    };
  }
}
