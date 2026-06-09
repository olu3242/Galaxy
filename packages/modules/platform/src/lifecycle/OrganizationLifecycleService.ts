import type { Pool } from 'pg';

export type LifecycleEventType =
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'activated'
  | 'suspended'
  | 'offboarding_started'
  | 'offboarding_completed'
  | 'reactivated';

export interface OrgLifecycleEvent {
  id: string;
  organizationId: string;
  eventType: LifecycleEventType;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface OrgHealthCheckpoint {
  id: string;
  organizationId: string;
  checkpointType: string;
  passed: boolean;
  notes: string | null;
  checkedAt: string;
}

interface LifecycleEventRow {
  id: string;
  organization_id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

interface HealthCheckpointRow {
  id: string;
  organization_id: string;
  checkpoint_type: string;
  passed: boolean;
  notes: string | null;
  checked_at: string;
}

export class OrganizationLifecycleService {
  constructor(private readonly pool: Pool) {}

  async recordEvent(input: {
    organizationId: string;
    eventType: LifecycleEventType;
    metadata?: Record<string, unknown>;
  }): Promise<OrgLifecycleEvent> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<LifecycleEventRow>(
      `INSERT INTO org_lifecycle_events (organization_id, event_type, metadata)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.organizationId, input.eventType, JSON.stringify(input.metadata ?? {})],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record lifecycle event');
    return this.mapEvent(row);
  }

  async listEvents(
    organizationId: string,
    opts?: { limit?: number },
  ): Promise<OrgLifecycleEvent[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const params: unknown[] = [organizationId];
    const limit = opts?.limit !== undefined ? ` LIMIT $2` : '';
    if (opts?.limit !== undefined) params.push(opts.limit);

    const result = await this.pool.query<LifecycleEventRow>(
      `SELECT * FROM org_lifecycle_events WHERE organization_id = $1 ORDER BY occurred_at DESC${limit}`,
      params,
    );
    return result.rows.map((r) => this.mapEvent(r));
  }

  async recordHealthCheckpoint(input: {
    organizationId: string;
    checkpointType: string;
    passed: boolean;
    notes?: string;
  }): Promise<OrgHealthCheckpoint> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<HealthCheckpointRow>(
      `INSERT INTO org_health_checkpoints (organization_id, checkpoint_type, passed, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.organizationId, input.checkpointType, input.passed, input.notes ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record health checkpoint');
    return this.mapCheckpoint(row);
  }

  private mapEvent(row: LifecycleEventRow): OrgLifecycleEvent {
    return {
      id: row.id,
      organizationId: row.organization_id,
      eventType: row.event_type as LifecycleEventType,
      metadata: row.metadata,
      occurredAt: row.occurred_at,
    };
  }

  private mapCheckpoint(row: HealthCheckpointRow): OrgHealthCheckpoint {
    return {
      id: row.id,
      organizationId: row.organization_id,
      checkpointType: row.checkpoint_type,
      passed: row.passed,
      notes: row.notes,
      checkedAt: row.checked_at,
    };
  }
}
