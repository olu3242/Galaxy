import type { Pool } from 'pg';
import type { AgentInsight } from '../types.js';

interface InsightRow {
  id: string;
  organization_id: string;
  agent_id: string;
  insight_type: string;
  title: string;
  description: string;
  confidence: number;
  data: Record<string, unknown>;
  applied_at: Date | null;
  created_at: Date;
}

function rowToInsight(row: InsightRow): AgentInsight {
  return {
    id: row.id,
    organizationId: row.organization_id,
    agentId: row.agent_id,
    insightType: row.insight_type,
    title: row.title,
    description: row.description,
    confidence: row.confidence,
    data: row.data,
    createdAt: row.created_at,
    ...(row.applied_at !== null ? { appliedAt: row.applied_at } : {}),
  };
}

export class AgentInsightService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async recordInsight(
    orgId: string,
    agentId: string,
    insightType: string,
    title: string,
    description: string,
    confidence: number,
    data: Record<string, unknown>,
  ): Promise<AgentInsight> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<InsightRow>(
      `INSERT INTO agent_insights
         (organization_id, agent_id, insight_type, title, description, confidence, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [orgId, agentId, insightType, title, description, confidence, JSON.stringify(data)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO agent_insights returned no row');
    return rowToInsight(row);
  }

  async getInsights(orgId: string, agentId?: string, limit = 50): Promise<AgentInsight[]> {
    await this.setTenantContext(orgId);
    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [orgId];
    let idx = 2;
    if (agentId !== undefined) {
      conditions.push(`agent_id = $${String(idx)}`);
      params.push(agentId);
      idx++;
    }
    params.push(limit);
    const result = await this.pool.query<InsightRow>(
      `SELECT * FROM agent_insights
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${String(idx)}`,
      params,
    );
    return result.rows.map(rowToInsight);
  }

  async applyInsight(orgId: string, insightId: string): Promise<AgentInsight> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<InsightRow>(
      `UPDATE agent_insights
       SET applied_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, insightId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`AgentInsight not found: ${insightId}`);
    return rowToInsight(row);
  }
}
