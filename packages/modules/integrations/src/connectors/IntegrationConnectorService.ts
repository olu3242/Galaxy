import type { Pool } from 'pg';
import type {
  IntegrationConnector,
  IntegrationConnectorRow,
  ConnectorType,
  ConnectorStatus,
} from '../types.js';

function rowToConnector(row: IntegrationConnectorRow): IntegrationConnector {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    connectorType: row.connector_type as ConnectorType,
    status: row.status as ConnectorStatus,
    config: row.config,
    credentials: row.credentials,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
  };
}

export interface CreateConnectorInput {
  organizationId: string;
  name: string;
  connectorType: ConnectorType;
  config: Record<string, unknown>;
  credentials: Record<string, unknown>;
}

export class IntegrationConnectorService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async registerConnector(input: CreateConnectorInput): Promise<IntegrationConnector> {
    await this.setTenantContext(input.organizationId);
    const result = await this.pool.query<IntegrationConnectorRow>(
      `INSERT INTO integration_connectors
        (organization_id, name, connector_type, status, config, credentials)
       VALUES ($1, $2, $3, 'inactive', $4, $5)
       RETURNING *`,
      [
        input.organizationId,
        input.name,
        input.connectorType,
        JSON.stringify(input.config),
        JSON.stringify(input.credentials),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create connector');
    return rowToConnector(row);
  }

  async enableConnector(orgId: string, connectorId: string): Promise<IntegrationConnector> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<IntegrationConnectorRow>(
      `UPDATE integration_connectors SET status = 'active'
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [connectorId, orgId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Connector not found');
    return rowToConnector(row);
  }

  async disableConnector(orgId: string, connectorId: string): Promise<IntegrationConnector> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<IntegrationConnectorRow>(
      `UPDATE integration_connectors SET status = 'inactive'
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [connectorId, orgId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Connector not found');
    return rowToConnector(row);
  }

  async listConnectors(orgId: string): Promise<IntegrationConnector[]> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<IntegrationConnectorRow>(
      `SELECT * FROM integration_connectors
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [orgId],
    );
    return result.rows.map(rowToConnector);
  }

  async getConnector(
    orgId: string,
    connectorId: string,
  ): Promise<IntegrationConnector | undefined> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<IntegrationConnectorRow>(
      `SELECT * FROM integration_connectors WHERE id = $1 AND organization_id = $2`,
      [connectorId, orgId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return rowToConnector(row);
  }

  async updateCredentials(
    orgId: string,
    connectorId: string,
    credentials: Record<string, unknown>,
  ): Promise<IntegrationConnector> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<IntegrationConnectorRow>(
      `UPDATE integration_connectors SET credentials = $3
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [connectorId, orgId, JSON.stringify(credentials)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Connector not found');
    return rowToConnector(row);
  }
}
