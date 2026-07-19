import type { Pool } from 'pg';
import type { Incident, IncidentRow, IncidentStatus, IncidentSeverity } from '../types.js';

function rowToIncident(row: IncidentRow): Incident {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description,
    status: row.status as IncidentStatus,
    severity: row.severity as IncidentSeverity,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    postmortemUrl: row.postmortem_url,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateIncidentInput {
  organizationId: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  metadata: Record<string, unknown>;
}

export class IncidentService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async createIncident(input: CreateIncidentInput): Promise<Incident> {
    await this.setTenantContext(input.organizationId);
    const result = await this.pool.query<IncidentRow>(
      `INSERT INTO incidents (organization_id, title, description, status, severity, metadata)
       VALUES ($1, $2, $3, 'open', $4, $5)
       RETURNING *`,
      [
        input.organizationId,
        input.title,
        input.description,
        input.severity,
        JSON.stringify(input.metadata),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create incident');
    return rowToIncident(row);
  }

  async acknowledgeIncident(organizationId: string, incidentId: string): Promise<Incident | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<IncidentRow>(
      `UPDATE incidents SET status = 'acknowledged', acknowledged_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'open'
       RETURNING *`,
      [incidentId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToIncident(row) : null;
  }

  async resolveIncident(organizationId: string, incidentId: string): Promise<Incident | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<IncidentRow>(
      `UPDATE incidents SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status IN ('open', 'acknowledged')
       RETURNING *`,
      [incidentId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToIncident(row) : null;
  }

  async addPostmortem(
    organizationId: string,
    incidentId: string,
    postmortemUrl: string,
  ): Promise<Incident | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<IncidentRow>(
      `UPDATE incidents SET postmortem_url = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [postmortemUrl, incidentId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToIncident(row) : null;
  }

  async getIncident(organizationId: string, incidentId: string): Promise<Incident | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<IncidentRow>(
      'SELECT * FROM incidents WHERE id = $1 AND organization_id = $2',
      [incidentId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToIncident(row) : null;
  }

  async listIncidents(
    organizationId: string,
    options: {
      status?: IncidentStatus;
      severity?: IncidentSeverity;
      limit?: number;
      offset?: number;
    },
  ): Promise<Incident[]> {
    await this.setTenantContext(organizationId);
    const params: unknown[] = [organizationId];
    let sql = 'SELECT * FROM incidents WHERE organization_id = $1';
    if (options.status !== undefined) {
      params.push(options.status);
      sql += ` AND status = $${String(params.length)}`;
    }
    if (options.severity !== undefined) {
      params.push(options.severity);
      sql += ` AND severity = $${String(params.length)}`;
    }
    sql += ' ORDER BY created_at DESC';
    if (options.limit !== undefined) {
      params.push(options.limit);
      sql += ` LIMIT $${String(params.length)}`;
    }
    if (options.offset !== undefined) {
      params.push(options.offset);
      sql += ` OFFSET $${String(params.length)}`;
    }
    const result = await this.pool.query<IncidentRow>(sql, params);
    return result.rows.map(rowToIncident);
  }
}
