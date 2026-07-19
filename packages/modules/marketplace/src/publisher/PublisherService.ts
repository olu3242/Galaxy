import type { Pool } from 'pg';
import type { Publisher, PublisherRow, PublisherStatus } from '../types.js';

function rowToPublisher(row: PublisherRow): Publisher {
  return {
    id: row.id,
    organizationId: row.organization_id,
    displayName: row.display_name,
    email: row.email,
    status: row.status as PublisherStatus,
    verifiedAt: row.verified_at,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface RegisterPublisherInput {
  organizationId: string;
  displayName: string;
  email: string;
  metadata: Record<string, unknown>;
}

export class PublisherService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async registerPublisher(input: RegisterPublisherInput): Promise<Publisher> {
    await this.setTenantContext(input.organizationId);
    const result = await this.pool.query<PublisherRow>(
      `INSERT INTO publishers (organization_id, display_name, email, status, metadata)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING *`,
      [input.organizationId, input.displayName, input.email, JSON.stringify(input.metadata)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to register publisher');
    return rowToPublisher(row);
  }

  async getPublisher(organizationId: string, publisherId: string): Promise<Publisher | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<PublisherRow>(
      'SELECT * FROM publishers WHERE id = $1 AND organization_id = $2',
      [publisherId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToPublisher(row) : null;
  }

  async listPublishers(organizationId: string): Promise<Publisher[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<PublisherRow>(
      'SELECT * FROM publishers WHERE organization_id = $1 ORDER BY created_at DESC',
      [organizationId],
    );
    return result.rows.map(rowToPublisher);
  }

  async approvePublisher(organizationId: string, publisherId: string): Promise<Publisher | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<PublisherRow>(
      `UPDATE publishers SET status = 'approved', verified_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [publisherId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToPublisher(row) : null;
  }

  async suspendPublisher(organizationId: string, publisherId: string): Promise<Publisher | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<PublisherRow>(
      `UPDATE publishers SET status = 'suspended', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [publisherId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToPublisher(row) : null;
  }
}
