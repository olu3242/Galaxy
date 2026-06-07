import type { Pool } from 'pg';
import type { AuditLogEntry } from '@galaxy/types';

export interface InsertAuditLogInput {
  organizationId: string;
  actorType: 'member' | 'agent' | 'system';
  actorId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  correlationId: string;
  causationId?: string;
}

/**
 * AuditRepository — INSERT-only repository for audit logs.
 *
 * Enforces the immutability contract at the application layer.
 * The database also enforces this via INSERT-only RLS policy.
 */
export class AuditRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Inserts a new audit log entry. This is the ONLY allowed operation.
   */
  async insert(input: InsertAuditLogInput): Promise<AuditLogEntry> {
    // Set tenant context before insert
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    const result = await this.pool.query<{
      id: number;
      organization_id: string;
      actor_type: string;
      actor_id: string | null;
      action: string;
      resource_type: string | null;
      resource_id: string | null;
      old_value: Record<string, unknown> | null;
      new_value: Record<string, unknown> | null;
      ip_address: string | null;
      correlation_id: string;
      causation_id: string | null;
      created_at: string;
    }>(
      `INSERT INTO audit_logs (
        organization_id, actor_type, actor_id, action, resource_type, resource_id,
        old_value, new_value, ip_address, correlation_id, causation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        input.organizationId,
        input.actorType,
        input.actorId ?? null,
        input.action,
        input.resourceType ?? null,
        input.resourceId ?? null,
        input.oldValue ? JSON.stringify(input.oldValue) : null,
        input.newValue ? JSON.stringify(input.newValue) : null,
        input.ipAddress ?? null,
        input.correlationId,
        input.causationId ?? null,
      ],
    );

    const row = result.rows[0]!;

    return {
      id: row.id,
      organizationId: row.organization_id,
      actorType: row.actor_type as AuditLogEntry['actorType'],
      actorId: row.actor_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      oldValue: row.old_value,
      newValue: row.new_value,
      ipAddress: row.ip_address,
      correlationId: row.correlation_id,
      causationId: row.causation_id,
      createdAt: row.created_at,
    };
  }

  /**
   * Explicitly blocked — audit logs are immutable.
   */
  update(): never {
    throw new Error('AuditRepository: UPDATE operations are not permitted on audit_logs');
  }

  /**
   * Explicitly blocked — audit logs are immutable.
   */
  delete(): never {
    throw new Error('AuditRepository: DELETE operations are not permitted on audit_logs');
  }
}
