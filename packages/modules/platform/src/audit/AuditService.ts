import type { Pool } from 'pg';

export interface AuditLogEntry {
  id: string;
  organizationId: string;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface AuditLogRow {
  id: string;
  organization_id: string;
  actor_type: string;
  actor_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export class AuditService {
  constructor(private readonly pool: Pool) {}

  async queryLogs(input: {
    organizationId: string;
    actorId?: string;
    action?: string;
    resourceType?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogEntry[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [input.organizationId];
    let idx = 2;

    if (input.actorId !== undefined) {
      conditions.push(`actor_id = $${String(idx++)}`);
      params.push(input.actorId);
    }
    if (input.action !== undefined) {
      conditions.push(`action = $${String(idx++)}`);
      params.push(input.action);
    }
    if (input.resourceType !== undefined) {
      conditions.push(`resource_type = $${String(idx++)}`);
      params.push(input.resourceType);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const limit = input.limit !== undefined ? ` LIMIT $${String(idx++)}` : '';
    if (input.limit !== undefined) params.push(input.limit);
    const offset = input.offset !== undefined ? ` OFFSET $${String(idx++)}` : '';
    if (input.offset !== undefined) params.push(input.offset);

    const result = await this.pool.query<AuditLogRow>(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC${limit}${offset}`,
      params,
    );
    return result.rows.map((r) => this.mapEntry(r));
  }

  private mapEntry(row: AuditLogRow): AuditLogEntry {
    return {
      id: row.id,
      organizationId: row.organization_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }
}
