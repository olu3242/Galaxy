import type { Pool } from 'pg';
import type { SystemConfig, UpsertSystemConfigInput } from '../types.js';

interface SystemConfigRow {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string;
  updated_at: string;
}

function mapConfig(row: SystemConfigRow): SystemConfig {
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    description: row.description,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export class SystemConfigService {
  constructor(private readonly pool: Pool) {}

  async upsertConfig(input: UpsertSystemConfigInput): Promise<SystemConfig> {
    const result = await this.pool.query<SystemConfigRow>(
      `INSERT INTO system_config (key, value, description, updated_by)
       VALUES ($1, $2::jsonb, $3, $4)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             description = COALESCE(EXCLUDED.description, system_config.description),
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
       RETURNING *`,
      [input.key, JSON.stringify(input.value), input.description ?? null, input.updatedBy],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Upsert into system_config returned no row');
    return mapConfig(row);
  }

  async getConfig(key: string): Promise<SystemConfig | null> {
    const result = await this.pool.query<SystemConfigRow>(
      `SELECT * FROM system_config WHERE key = $1`,
      [key],
    );

    return result.rows[0] ? mapConfig(result.rows[0]) : null;
  }

  async getConfigValue<T = unknown>(key: string): Promise<T | null> {
    const config = await this.getConfig(key);
    return config ? (config.value as T) : null;
  }

  async listConfigs(): Promise<SystemConfig[]> {
    const result = await this.pool.query<SystemConfigRow>(
      `SELECT * FROM system_config ORDER BY key ASC`,
    );

    return result.rows.map(mapConfig);
  }

  async deleteConfig(key: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM system_config WHERE key = $1`, [key]);
    return (result.rowCount ?? 0) > 0;
  }

  async isMaintenanceMode(): Promise<boolean> {
    const val = await this.getConfigValue<boolean>('maintenance_mode');
    return val === true;
  }
}
