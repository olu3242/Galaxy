import type { Pool } from 'pg';
import type { SLODefinition, SLODefinitionRow } from '../types.js';

function rowToSLO(row: SLODefinitionRow): SLODefinition {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    targetPercentage: parseFloat(row.target_percentage),
    windowDays: parseInt(row.window_days, 10),
    currentCompliance: parseFloat(row.current_compliance),
    isBreaching: row.is_breaching,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateSLOInput {
  organizationId: string;
  name: string;
  description: string;
  targetPercentage: number;
  windowDays: number;
}

export class SLOService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async createSLO(input: CreateSLOInput): Promise<SLODefinition> {
    await this.setTenantContext(input.organizationId);
    const result = await this.pool.query<SLODefinitionRow>(
      `INSERT INTO slo_definitions
        (organization_id, name, description, target_percentage, window_days,
         current_compliance, is_breaching)
       VALUES ($1, $2, $3, $4, $5, $4, false)
       RETURNING *`,
      [
        input.organizationId,
        input.name,
        input.description,
        input.targetPercentage,
        input.windowDays,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create SLO');
    return rowToSLO(row);
  }

  async getSLO(organizationId: string, sloId: string): Promise<SLODefinition | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<SLODefinitionRow>(
      'SELECT * FROM slo_definitions WHERE id = $1 AND organization_id = $2',
      [sloId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToSLO(row) : null;
  }

  async listSLOs(organizationId: string): Promise<SLODefinition[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<SLODefinitionRow>(
      'SELECT * FROM slo_definitions WHERE organization_id = $1 ORDER BY created_at DESC',
      [organizationId],
    );
    return result.rows.map(rowToSLO);
  }

  async updateCompliance(
    organizationId: string,
    sloId: string,
    currentCompliance: number,
  ): Promise<SLODefinition | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<SLODefinitionRow>(
      `UPDATE slo_definitions
       SET current_compliance = $1,
           is_breaching = ($1 < target_percentage),
           updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [currentCompliance, sloId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToSLO(row) : null;
  }

  async computeWorkflowSLOCompliance(
    organizationId: string,
    sloId: string,
  ): Promise<SLODefinition | null> {
    await this.setTenantContext(organizationId);

    const sloResult = await this.pool.query<SLODefinitionRow>(
      'SELECT * FROM slo_definitions WHERE id = $1 AND organization_id = $2',
      [sloId, organizationId],
    );
    const slo = sloResult.rows[0];
    if (!slo) return null;

    const windowDays = parseInt(slo.window_days, 10);
    const complianceResult = await this.pool.query<{ compliance: string }>(
      `SELECT
         CASE
           WHEN COUNT(*) = 0 THEN 100
           ELSE (COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*))
         END AS compliance
       FROM workflow_runs
       WHERE organization_id = $1
         AND created_at > NOW() - ($2 || ' days')::interval`,
      [organizationId, String(windowDays)],
    );

    const compliance = parseFloat(complianceResult.rows[0]?.compliance ?? '100');
    return this.updateCompliance(organizationId, sloId, compliance);
  }

  async deleteSLO(organizationId: string, sloId: string): Promise<boolean> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query(
      'DELETE FROM slo_definitions WHERE id = $1 AND organization_id = $2',
      [sloId, organizationId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
