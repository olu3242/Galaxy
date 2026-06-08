import type { Pool } from 'pg';
import type { Installation, InstallationRow, InstallationStatus } from '../types.js';

function rowToInstallation(row: InstallationRow): Installation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    marketplaceItemId: row.marketplace_item_id,
    installedBy: row.installed_by,
    status: row.status as InstallationStatus,
    installedAt: row.installed_at,
    uninstalledAt: row.uninstalled_at,
    config: row.config,
  };
}

export interface InstallItemInput {
  organizationId: string;
  marketplaceItemId: string;
  installedBy: string;
  config: Record<string, unknown>;
}

export class InstallationService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async installItem(input: InstallItemInput): Promise<Installation> {
    await this.setTenantContext(input.organizationId);

    const existing = await this.pool.query<InstallationRow>(
      `SELECT * FROM installations
       WHERE organization_id = $1 AND marketplace_item_id = $2 AND status = 'active'`,
      [input.organizationId, input.marketplaceItemId],
    );
    if ((existing.rowCount ?? 0) > 0) {
      throw new Error('Item is already installed');
    }

    const result = await this.pool.query<InstallationRow>(
      `INSERT INTO installations (organization_id, marketplace_item_id, installed_by, status, config)
       VALUES ($1, $2, $3, 'active', $4)
       RETURNING *`,
      [
        input.organizationId,
        input.marketplaceItemId,
        input.installedBy,
        JSON.stringify(input.config),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to install item');

    await this.pool.query(
      `UPDATE marketplace_items SET install_count = install_count + 1 WHERE id = $1`,
      [input.marketplaceItemId],
    );

    return rowToInstallation(row);
  }

  async uninstallItem(
    organizationId: string,
    installationId: string,
  ): Promise<Installation | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<InstallationRow>(
      `UPDATE installations SET status = 'uninstalled', uninstalled_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'active'
       RETURNING *`,
      [installationId, organizationId],
    );
    const row = result.rows[0];
    if (row) {
      await this.pool.query(
        `UPDATE marketplace_items SET install_count = GREATEST(install_count - 1, 0) WHERE id = $1`,
        [row.marketplace_item_id],
      );
    }
    return row ? rowToInstallation(row) : null;
  }

  async getInstallation(
    organizationId: string,
    installationId: string,
  ): Promise<Installation | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<InstallationRow>(
      'SELECT * FROM installations WHERE id = $1 AND organization_id = $2',
      [installationId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToInstallation(row) : null;
  }

  async listInstallations(
    organizationId: string,
    options: { status?: InstallationStatus; limit?: number; offset?: number },
  ): Promise<Installation[]> {
    await this.setTenantContext(organizationId);
    const params: unknown[] = [organizationId];
    let sql = 'SELECT * FROM installations WHERE organization_id = $1';
    if (options.status !== undefined) {
      params.push(options.status);
      sql += ` AND status = $${String(params.length)}`;
    }
    sql += ' ORDER BY installed_at DESC';
    if (options.limit !== undefined) {
      params.push(options.limit);
      sql += ` LIMIT $${String(params.length)}`;
    }
    if (options.offset !== undefined) {
      params.push(options.offset);
      sql += ` OFFSET $${String(params.length)}`;
    }
    const result = await this.pool.query<InstallationRow>(sql, params);
    return result.rows.map(rowToInstallation);
  }
}
