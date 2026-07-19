import type { Pool } from 'pg';

export interface OptimizationRecommendation {
  id: string;
  organizationId: string;
  workflowType: string | null;
  recommendationType:
    | 'reduce_sla_window'
    | 'increase_sla_window'
    | 'add_verification_step'
    | 'reduce_approval_levels'
    | 'add_approval_level'
    | 'enable_auto_approval';
  priority: 'low' | 'medium' | 'high';
  title: string;
  rationale: string;
  estimatedImpact: string;
  status: 'pending' | 'applied' | 'dismissed';
  createdAt: string;
}

interface RecommendationRow {
  id: string;
  organization_id: string;
  workflow_type: string | null;
  recommendation_type: string;
  priority: string;
  title: string;
  rationale: string;
  estimated_impact: string;
  status: string;
  created_at: string;
}

interface SlaRow {
  workflow_type: string | null;
  avg_breach_rate: string;
  avg_completion_hours: string | null;
  sample_size: string;
}

interface ApprovalRow {
  workflow_type: string | null;
  avg_approval_time_hours: string | null;
  auto_approvable: string;
  sample_size: string;
}

function rowToRecommendation(row: RecommendationRow): OptimizationRecommendation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workflowType: row.workflow_type,
    recommendationType: row.recommendation_type as OptimizationRecommendation['recommendationType'],
    priority: row.priority as OptimizationRecommendation['priority'],
    title: row.title,
    rationale: row.rationale,
    estimatedImpact: row.estimated_impact,
    status: row.status as OptimizationRecommendation['status'],
    createdAt: row.created_at,
  };
}

export class LoopOptimizationService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async generateRecommendations(organizationId: string): Promise<OptimizationRecommendation[]> {
    await this.setTenantContext(organizationId);

    const [slaResult, approvalResult] = await Promise.all([
      this.pool.query<SlaRow>(
        `SELECT
           wi.type AS workflow_type,
           AVG(CASE WHEN wi.sla_deadline < wi.updated_at AND wi.status = 'completed' THEN 1.0 ELSE 0.0 END)::text AS avg_breach_rate,
           AVG(EXTRACT(EPOCH FROM (wi.updated_at - wi.created_at)) / 3600)::text AS avg_completion_hours,
           COUNT(*)::text AS sample_size
         FROM workflow_instances wi
         WHERE wi.organization_id = $1
           AND wi.created_at > NOW() - INTERVAL '30 days'
           AND wi.status = 'completed'
         GROUP BY wi.type`,
        [organizationId],
      ),
      this.pool.query<ApprovalRow>(
        `SELECT
           wi.type AS workflow_type,
           AVG(EXTRACT(EPOCH FROM (a.updated_at - a.created_at)) / 3600)::text AS avg_approval_time_hours,
           COUNT(*) FILTER (WHERE a.decision = 'approved' AND EXTRACT(EPOCH FROM (a.updated_at - a.created_at)) < 300)::text AS auto_approvable,
           COUNT(*)::text AS sample_size
         FROM approvals a
         JOIN workflow_instances wi ON wi.id = a.workflow_instance_id
         WHERE wi.organization_id = $1
           AND a.created_at > NOW() - INTERVAL '30 days'
         GROUP BY wi.type`,
        [organizationId],
      ),
    ]);

    const recs: Omit<OptimizationRecommendation, 'id' | 'createdAt'>[] = [];

    for (const row of slaResult.rows) {
      if (parseInt(row.sample_size, 10) < 5) continue;
      const breachRate = parseFloat(row.avg_breach_rate);
      const avgHours = row.avg_completion_hours ? parseFloat(row.avg_completion_hours) : null;
      const wfType = row.workflow_type ?? 'unknown';

      if (breachRate > 0.4) {
        recs.push({
          organizationId,
          workflowType: wfType,
          recommendationType: 'increase_sla_window',
          priority: 'high',
          title: `Increase SLA window for ${wfType}`,
          rationale: `${String(Math.round(breachRate * 100))}% of ${wfType} workflows breach SLA, indicating the current deadline is unrealistic`,
          estimatedImpact: 'Reduce SLA breach rate by 30-50%',
          status: 'pending',
        });
      } else if (breachRate < 0.05 && avgHours !== null && avgHours < 2) {
        recs.push({
          organizationId,
          workflowType: wfType,
          recommendationType: 'reduce_sla_window',
          priority: 'low',
          title: `Tighten SLA window for ${wfType}`,
          rationale: `${wfType} completes in avg ${avgHours.toFixed(1)}h with only ${String(Math.round(breachRate * 100))}% breaches — tighter SLA improves accountability`,
          estimatedImpact: 'Increase throughput and member accountability',
          status: 'pending',
        });
      }
    }

    for (const row of approvalResult.rows) {
      if (parseInt(row.sample_size, 10) < 5) continue;
      const autoApprovable = parseInt(row.auto_approvable, 10);
      const total = parseInt(row.sample_size, 10);
      const wfType = row.workflow_type ?? 'unknown';

      if (autoApprovable / total > 0.7) {
        recs.push({
          organizationId,
          workflowType: wfType,
          recommendationType: 'enable_auto_approval',
          priority: 'medium',
          title: `Enable auto-approval for low-risk ${wfType}`,
          rationale: `${String(Math.round((autoApprovable / total) * 100))}% of ${wfType} approvals happen within 5 minutes — automation is safe`,
          estimatedImpact: 'Eliminate approval lag for routine requests',
          status: 'pending',
        });
      }
    }

    if (recs.length === 0) return [];

    const saved: OptimizationRecommendation[] = [];
    for (const rec of recs) {
      const result = await this.pool.query<RecommendationRow>(
        `INSERT INTO loop_optimization_recommendations
           (organization_id, workflow_type, recommendation_type, priority, title, rationale, estimated_impact, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          rec.organizationId,
          rec.workflowType,
          rec.recommendationType,
          rec.priority,
          rec.title,
          rec.rationale,
          rec.estimatedImpact,
          rec.status,
        ],
      );
      const row = result.rows[0];
      if (row) saved.push(rowToRecommendation(row));
    }

    return saved;
  }

  async listRecommendations(
    organizationId: string,
    status?: 'pending' | 'applied' | 'dismissed',
  ): Promise<OptimizationRecommendation[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<RecommendationRow>(
      `SELECT * FROM loop_optimization_recommendations
       WHERE organization_id = $1
         ${status !== undefined ? `AND status = $2` : ''}
       ORDER BY
         CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at DESC`,
      status !== undefined ? [organizationId, status] : [organizationId],
    );
    return result.rows.map(rowToRecommendation);
  }

  async applyRecommendation(
    organizationId: string,
    recommendationId: string,
  ): Promise<OptimizationRecommendation | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<RecommendationRow>(
      `UPDATE loop_optimization_recommendations
       SET status = 'applied', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [recommendationId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToRecommendation(row) : null;
  }

  async dismissRecommendation(
    organizationId: string,
    recommendationId: string,
  ): Promise<OptimizationRecommendation | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<RecommendationRow>(
      `UPDATE loop_optimization_recommendations
       SET status = 'dismissed', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [recommendationId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToRecommendation(row) : null;
  }
}
