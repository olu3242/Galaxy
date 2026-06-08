import type { Pool } from 'pg';
import type { RiskProfile, RiskScore, RiskDomain, RiskSeverity, RiskTrendPoint } from './types.js';

function scoreToLevel(score: number): RiskSeverity {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

export class RiskIntelligenceService {
  constructor(private readonly pool: Pool) {}

  async computeOrgRiskProfile(organizationId: string): Promise<RiskProfile> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const [opsResult, complianceResult, taskResult] = await Promise.all([
      this.pool.query<{ breached: string; total: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'breached') as breached,
           COUNT(*) as total
         FROM workflow_runs
         WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
        [organizationId],
      ),
      this.pool.query<{ failed: string; total: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE outcome = 'rejected') as failed,
           COUNT(*) as total
         FROM approvals
         WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
        [organizationId],
      ),
      this.pool.query<{ overdue: string; total: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE due_date < NOW() AND status != 'completed') as overdue,
           COUNT(*) as total
         FROM tasks
         WHERE organization_id = $1`,
        [organizationId],
      ),
    ]);

    const opsRow = opsResult.rows[0];
    const compRow = complianceResult.rows[0];
    const taskRow = taskResult.rows[0];

    const opsBreachRate =
      opsRow && parseInt(opsRow.total, 10) > 0
        ? parseInt(opsRow.breached, 10) / parseInt(opsRow.total, 10)
        : 0;
    const compFailRate =
      compRow && parseInt(compRow.total, 10) > 0
        ? parseInt(compRow.failed, 10) / parseInt(compRow.total, 10)
        : 0;
    const taskOverdueRate =
      taskRow && parseInt(taskRow.total, 10) > 0
        ? parseInt(taskRow.overdue, 10) / parseInt(taskRow.total, 10)
        : 0;

    const domains: RiskScore[] = [
      {
        domain: 'operational',
        score: Math.round(opsBreachRate * 100),
        level: scoreToLevel(Math.round(opsBreachRate * 100)),
        factors: opsBreachRate > 0.1 ? ['high_sla_breach_rate'] : [],
      },
      {
        domain: 'compliance',
        score: Math.round(compFailRate * 100),
        level: scoreToLevel(Math.round(compFailRate * 100)),
        factors: compFailRate > 0.2 ? ['high_rejection_rate'] : [],
      },
      {
        domain: 'financial',
        score: 10,
        level: 'low',
        factors: [],
      },
      {
        domain: 'security',
        score: 10,
        level: 'low',
        factors: [],
      },
      {
        domain: 'reputational',
        score: Math.round(taskOverdueRate * 80),
        level: scoreToLevel(Math.round(taskOverdueRate * 80)),
        factors: taskOverdueRate > 0.3 ? ['high_task_overdue_rate'] : [],
      },
    ];

    const overallScore = Math.round(domains.reduce((sum, d) => sum + d.score, 0) / domains.length);

    return {
      organizationId,
      overallScore,
      overallLevel: scoreToLevel(overallScore),
      domainScores: domains,
      computedAt: new Date().toISOString(),
    };
  }

  async getRiskTrend(organizationId: string, domain: RiskDomain): Promise<RiskTrendPoint[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<{ period: string; score: string }>(
      `SELECT to_char(predicted_at, 'YYYY-MM-DD') as period, AVG(score) as score
       FROM predictive_scores
       WHERE organization_id = $1 AND score_type = 'risk' AND subject_type = $2
       GROUP BY to_char(predicted_at, 'YYYY-MM-DD')
       ORDER BY period DESC
       LIMIT 30`,
      [organizationId, domain],
    );
    return result.rows.map((r) => ({
      period: r.period,
      domain,
      score: Math.round(parseFloat(r.score)),
    }));
  }
}
