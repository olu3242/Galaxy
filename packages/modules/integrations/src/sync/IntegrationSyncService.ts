import type { Pool } from 'pg';
import type { SyncLog, SyncLogRow, SyncDirection } from '../types.js';

function rowToSyncLog(row: SyncLogRow): SyncLog {
  return {
    id: row.id,
    organizationId: row.organization_id,
    connectorId: row.connector_id,
    direction: row.direction as SyncDirection,
    recordsSynced: parseInt(row.records_synced, 10),
    errorCount: parseInt(row.error_count, 10),
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export interface TriggerSyncInput {
  organizationId: string;
  connectorId: string;
  direction: SyncDirection;
}

export class IntegrationSyncService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async triggerSync(input: TriggerSyncInput): Promise<SyncLog> {
    await this.setTenantContext(input.organizationId);
    const result = await this.pool.query<SyncLogRow>(
      `INSERT INTO integration_sync_logs
        (organization_id, connector_id, direction, records_synced, error_count, started_at)
       VALUES ($1, $2, $3, 0, 0, NOW())
       RETURNING *`,
      [input.organizationId, input.connectorId, input.direction],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create sync log');
    return rowToSyncLog(row);
  }

  async completeSyncLog(
    orgId: string,
    syncLogId: string,
    recordsSynced: number,
    errorCount: number,
  ): Promise<SyncLog> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<SyncLogRow>(
      `UPDATE integration_sync_logs
       SET records_synced = $3, error_count = $4, completed_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [syncLogId, orgId, recordsSynced, errorCount],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Sync log not found');

    // Update last_sync_at on connector
    await this.pool.query(
      `UPDATE integration_connectors SET last_sync_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [row.connector_id, orgId],
    );

    return rowToSyncLog(row);
  }

  async listSyncLogs(
    orgId: string,
    connectorId: string,
    limit = 50,
    offset = 0,
  ): Promise<SyncLog[]> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<SyncLogRow>(
      `SELECT * FROM integration_sync_logs
       WHERE organization_id = $1 AND connector_id = $2
       ORDER BY started_at DESC
       LIMIT $3 OFFSET $4`,
      [orgId, connectorId, limit, offset],
    );
    return result.rows.map(rowToSyncLog);
  }
}
