import type { Pool } from 'pg';

export interface PlatformAuditLog {
  id: string;
  organizationId: string | null;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface CreateAuditLogInput {
  organizationId?: string;
  actorType: string;
  actorId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

interface AuditRow {
  id: string;
  organization_id: string | null;
  actor_type: string;
  actor_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export class AuditService {
  constructor(private readonly pool: Pool) {}

  async log(input: CreateAuditLogInput): Promise<PlatformAuditLog> {
    const result = await this.pool.query<AuditRow>(
      `INSERT INTO platform_audit_logs
         (organization_id, actor_type, actor_id, action, resource_type, resource_id, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.organizationId ?? null,
        input.actorType,
        input.actorId,
        input.action,
        input.resourceType ?? null,
        input.resourceId ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.ipAddress ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Audit log insert failed');
    return this.rowToLog(row);
  }

  async queryLogs(opts: {
    organizationId?: string;
    actorId?: string;
    action?: string;
    limit?: number;
    offset?: number;
  }): Promise<PlatformAuditLog[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts.organizationId !== undefined) {
      conditions.push(`organization_id = $${String(idx)}`);
      params.push(opts.organizationId);
      idx++;
    }
    if (opts.actorId !== undefined) {
      conditions.push(`actor_id = $${String(idx)}`);
      params.push(opts.actorId);
      idx++;
    }
    if (opts.action !== undefined) {
      conditions.push(`action = $${String(idx)}`);
      params.push(opts.action);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = opts.limit !== undefined ? ` LIMIT $${String(idx)}` : '';
    if (opts.limit !== undefined) {
      params.push(opts.limit);
      idx++;
    }
    const offsetClause = opts.offset !== undefined ? ` OFFSET $${String(idx)}` : '';
    if (opts.offset !== undefined) params.push(opts.offset);

    const result = await this.pool.query<AuditRow>(
      `SELECT * FROM platform_audit_logs ${whereClause} ORDER BY created_at DESC${limitClause}${offsetClause}`,
      params,
    );
    return result.rows.map((row) => this.rowToLog(row));
  }

  private rowToLog(row: AuditRow): PlatformAuditLog {
    return {
      id: row.id,
      organizationId: row.organization_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: row.metadata,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
    };
  }
}
