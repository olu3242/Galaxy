import type { Pool } from 'pg';
import type { HealingIncident, HealingLevel, HealingStatus, HealingTrigger } from '../types.js';

interface IncidentRow {
  id: string;
  organization_id: string;
  level: string;
  trigger: string;
  status: string;
  description: string;
  diagnosis: string | null;
  resolution: string | null;
  affected_resource_type: string | null;
  affected_resource_id: string | null;
  attempt_count: number;
  detected_at: Date;
  healed_at: Date | null;
  failed_at: Date | null;
}

function mapIncident(row: IncidentRow): HealingIncident {
  return {
    id: row.id,
    organizationId: row.organization_id,
    level: row.level as HealingLevel,
    trigger: row.trigger as HealingTrigger,
    status: row.status as HealingStatus,
    description: row.description,
    attemptCount: row.attempt_count,
    detectedAt: row.detected_at,
    ...(row.diagnosis !== null ? { diagnosis: row.diagnosis } : {}),
    ...(row.resolution !== null ? { resolution: row.resolution } : {}),
    ...(row.affected_resource_type !== null
      ? { affectedResourceType: row.affected_resource_type }
      : {}),
    ...(row.affected_resource_id !== null ? { affectedResourceId: row.affected_resource_id } : {}),
    ...(row.healed_at !== null ? { healedAt: row.healed_at } : {}),
    ...(row.failed_at !== null ? { failedAt: row.failed_at } : {}),
  };
}

export class HealingIncidentService {
  constructor(private readonly pool: Pool) {}

  async detectIncident(
    orgId: string,
    level: HealingLevel,
    description: string,
    affectedResourceType?: string,
    affectedResourceId?: string,
  ): Promise<HealingIncident> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<IncidentRow>(
      `INSERT INTO healing_incidents
        (organization_id, level, description, affected_resource_type, affected_resource_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [orgId, level, description, affectedResourceType ?? null, affectedResourceId ?? null],
    );

    const row = result.rows[0];
    if (row === undefined) throw new Error('Failed to create healing incident');
    return mapIncident(row);
  }

  async getIncident(orgId: string, incidentId: string): Promise<HealingIncident> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<IncidentRow>(
      'SELECT * FROM healing_incidents WHERE id = $1 AND organization_id = $2',
      [incidentId, orgId],
    );

    const row = result.rows[0];
    if (row === undefined) throw new Error('Healing incident not found');
    return mapIncident(row);
  }

  async listIncidents(
    orgId: string,
    level?: HealingLevel,
    status?: HealingStatus,
    limit = 50,
  ): Promise<HealingIncident[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [orgId];
    let idx = 2;

    if (level !== undefined) {
      conditions.push(`level = $${String(idx++)}`);
      params.push(level);
    }
    if (status !== undefined) {
      conditions.push(`status = $${String(idx++)}`);
      params.push(status);
    }

    params.push(limit);
    const result = await this.pool.query<IncidentRow>(
      `SELECT * FROM healing_incidents WHERE ${conditions.join(' AND ')} ORDER BY detected_at DESC LIMIT $${String(idx)}`,
      params,
    );

    return result.rows.map(mapIncident);
  }

  async diagnose(orgId: string, incidentId: string, diagnosis: string): Promise<HealingIncident> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<IncidentRow>(
      `UPDATE healing_incidents
       SET status = 'diagnosing', diagnosis = $3
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [incidentId, orgId, diagnosis],
    );

    const row = result.rows[0];
    if (row === undefined) throw new Error('Healing incident not found');
    return mapIncident(row);
  }

  async heal(orgId: string, incidentId: string, resolution: string): Promise<HealingIncident> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<IncidentRow>(
      `UPDATE healing_incidents
       SET status = 'healed', resolution = $3, healed_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [incidentId, orgId, resolution],
    );

    const row = result.rows[0];
    if (row === undefined) throw new Error('Healing incident not found');
    return mapIncident(row);
  }

  async failIncident(orgId: string, incidentId: string): Promise<HealingIncident> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<IncidentRow>(
      `UPDATE healing_incidents
       SET status = 'failed', failed_at = NOW(), attempt_count = attempt_count + 1
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [incidentId, orgId],
    );

    const row = result.rows[0];
    if (row === undefined) throw new Error('Healing incident not found');
    return mapIncident(row);
  }

  async escalate(orgId: string, incidentId: string): Promise<HealingIncident> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<IncidentRow>(
      `UPDATE healing_incidents
       SET status = 'escalated'
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [incidentId, orgId],
    );

    const row = result.rows[0];
    if (row === undefined) throw new Error('Healing incident not found');
    return mapIncident(row);
  }
}
