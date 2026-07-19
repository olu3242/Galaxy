import type { Pool } from 'pg';
import { ConfigurationService } from './ConfigurationService.js';
import type { OrgConfiguration } from './ConfigurationService.js';

export interface ConfigSchema {
  namespace: string;
  key: string;
  valueType: string;
  defaultValue: string | null;
  description: string | null;
}

interface ConfigSchemaRow {
  namespace: string;
  key: string;
  value_type: string;
  default_value: string | null;
  description: string | null;
}

export class OrganizationSettingsService {
  private readonly configService: ConfigurationService;

  constructor(private readonly pool: Pool) {
    this.configService = new ConfigurationService(pool);
  }

  async getSetting(organizationId: string, namespace: string, key: string): Promise<string | null> {
    const val = await this.configService.get(organizationId, namespace, key);
    if (val !== null) return val;

    // Fall back to schema default
    const schema = await this.getSchema(namespace, key);
    return schema?.defaultValue ?? null;
  }

  async setSetting(
    organizationId: string,
    namespace: string,
    key: string,
    value: string,
  ): Promise<OrgConfiguration> {
    return this.configService.set({ organizationId, namespace, key, value });
  }

  async getSchema(namespace: string, key: string): Promise<ConfigSchema | null> {
    const result = await this.pool.query<ConfigSchemaRow>(
      `SELECT * FROM config_schemas WHERE namespace = $1 AND key = $2`,
      [namespace, key],
    );
    const row = result.rows[0];
    return row ? this.mapSchema(row) : null;
  }

  async listSchemas(namespace?: string): Promise<ConfigSchema[]> {
    const where = namespace !== undefined ? `WHERE namespace = $1` : '';
    const params: unknown[] = namespace !== undefined ? [namespace] : [];
    const result = await this.pool.query<ConfigSchemaRow>(
      `SELECT * FROM config_schemas ${where} ORDER BY namespace, key`,
      params,
    );
    return result.rows.map((r) => this.mapSchema(r));
  }

  async registerSchema(input: {
    namespace: string;
    key: string;
    valueType: string;
    defaultValue?: string;
    description?: string;
  }): Promise<ConfigSchema> {
    const result = await this.pool.query<ConfigSchemaRow>(
      `INSERT INTO config_schemas (namespace, key, value_type, default_value, description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (namespace, key) DO UPDATE
         SET value_type = EXCLUDED.value_type,
             default_value = EXCLUDED.default_value,
             description = EXCLUDED.description
       RETURNING *`,
      [
        input.namespace,
        input.key,
        input.valueType,
        input.defaultValue ?? null,
        input.description ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to register schema');
    return this.mapSchema(row);
  }

  private mapSchema(row: ConfigSchemaRow): ConfigSchema {
    return {
      namespace: row.namespace,
      key: row.key,
      valueType: row.value_type,
      defaultValue: row.default_value,
      description: row.description,
    };
  }
}
