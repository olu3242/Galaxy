import type { Pool } from 'pg';
import type { InsightSnapshot, InsightSnapshotRow, InsightType } from '../types.js';

function rowToSnapshot(row: InsightSnapshotRow): InsightSnapshot {
  return {
    id: row.id,
    organizationId: row.organization_id,
    type: row.type as InsightType,
    title: row.title,
    summary: row.summary,
    data: row.data,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
  };
}

export class InsightService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async generateInsights(
    organizationId: string,
    type: InsightType,
    data: Record<string, unknown>,
  ): Promise<InsightSnapshot> {
    await this.setTenantContext(organizationId);

    const title = this.buildTitle(type);
    const summary = this.buildSummary(type, data);

    const result = await this.pool.query<InsightSnapshotRow>(
      `INSERT INTO intelligence_snapshots
         (organization_id, type, title, summary, data, generated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [organizationId, type, title, summary, JSON.stringify(data)],
    );

    const row = result.rows[0];
    if (!row) throw new Error('INSERT RETURNING returned no row');
    return rowToSnapshot(row);
  }

  async listInsights(
    organizationId: string,
    type?: InsightType,
    limit = 20,
  ): Promise<InsightSnapshot[]> {
    await this.setTenantContext(organizationId);

    const conditions = ['organization_id = $1'];
    const params: unknown[] = [organizationId];

    if (type) {
      conditions.push('type = $2');
      params.push(type);
      params.push(limit);
    } else {
      params.push(limit);
    }

    const result = await this.pool.query<InsightSnapshotRow>(
      `SELECT * FROM intelligence_snapshots WHERE ${conditions.join(' AND ')} ORDER BY generated_at DESC LIMIT $${String(params.length)}`,
      params,
    );

    return result.rows.map(rowToSnapshot);
  }

  private buildTitle(type: InsightType): string {
    const titles: Record<InsightType, string> = {
      operational: 'Operational Performance Insight',
      department: 'Department Health Insight',
      workflow: 'Workflow Efficiency Insight',
      engagement: 'Member Engagement Insight',
      communication: 'Communication Effectiveness Insight',
      compliance: 'Compliance Status Insight',
      risk: 'Risk Assessment Insight',
      executive: 'Executive Summary Insight',
    };
    return titles[type];
  }

  private buildSummary(type: InsightType, data: Record<string, unknown>): string {
    const score = typeof data.score === 'number' ? data.score : null;
    if (score !== null) {
      return `${type} score: ${score.toFixed(1)}`;
    }
    return `Generated ${type} insight based on current operational data.`;
  }
}
