import type { Pool } from 'pg';

export interface WorkflowPattern {
  workflowType: string;
  avgFeedbackScore: number;
  completionRate: number;
  avgVerificationCount: number;
  escalationRate: number;
  sampleSize: number;
}

export interface LoopInsight {
  id: string;
  organizationId: string;
  workflowType: string | null;
  insightType: 'low_feedback' | 'high_escalation' | 'verification_bottleneck' | 'positive_pattern';
  severity: 'info' | 'warning' | 'critical';
  summary: string;
  dataPoints: Record<string, unknown>;
  generatedAt: string;
}

interface LoopAggRow {
  workflow_type: string | null;
  avg_score: string | null;
  total: string;
  completed: string;
  escalated: string;
  avg_verifications: string | null;
}

interface InsightRow {
  id: string;
  organization_id: string;
  workflow_type: string | null;
  insight_type: string;
  severity: string;
  summary: string;
  data_points: Record<string, unknown>;
  generated_at: string;
}

function rowToInsight(row: InsightRow): LoopInsight {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workflowType: row.workflow_type,
    insightType: row.insight_type as LoopInsight['insightType'],
    severity: row.severity as LoopInsight['severity'],
    summary: row.summary,
    dataPoints: row.data_points,
    generatedAt: row.generated_at,
  };
}

export class LoopLearningService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async analyzePatterns(organizationId: string): Promise<WorkflowPattern[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<LoopAggRow>(
      `SELECT
         wi.type AS workflow_type,
         AVG(li.feedback_score)::text AS avg_score,
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE li.status = 'completed')::text AS completed,
         COUNT(*) FILTER (WHERE li.status = 'escalated')::text AS escalated,
         AVG(li.verification_count)::text AS avg_verifications
       FROM loop_instances li
       JOIN workflow_instances wi ON wi.id = li.workflow_instance_id
       WHERE li.organization_id = $1
         AND li.created_at > NOW() - INTERVAL '30 days'
       GROUP BY wi.type`,
      [organizationId],
    );

    return result.rows.map((row) => {
      const total = parseInt(row.total, 10);
      const completed = parseInt(row.completed, 10);
      const escalated = parseInt(row.escalated, 10);
      return {
        workflowType: row.workflow_type ?? 'unknown',
        avgFeedbackScore: row.avg_score ? parseFloat(row.avg_score) : 0,
        completionRate: total > 0 ? completed / total : 0,
        avgVerificationCount: row.avg_verifications ? parseFloat(row.avg_verifications) : 0,
        escalationRate: total > 0 ? escalated / total : 0,
        sampleSize: total,
      };
    });
  }

  async generateInsights(organizationId: string): Promise<LoopInsight[]> {
    const patterns = await this.analyzePatterns(organizationId);
    const insights: Omit<LoopInsight, 'id' | 'generatedAt'>[] = [];

    for (const pattern of patterns) {
      if (pattern.sampleSize < 3) continue;

      if (pattern.avgFeedbackScore > 0 && pattern.avgFeedbackScore < 2.5) {
        insights.push({
          organizationId,
          workflowType: pattern.workflowType,
          insightType: 'low_feedback',
          severity: pattern.avgFeedbackScore < 2 ? 'critical' : 'warning',
          summary: `${pattern.workflowType} workflows averaging ${pattern.avgFeedbackScore.toFixed(1)}/5 feedback — review process quality`,
          dataPoints: {
            avgFeedbackScore: pattern.avgFeedbackScore,
            sampleSize: pattern.sampleSize,
          },
        });
      }

      if (pattern.escalationRate > 0.3) {
        insights.push({
          organizationId,
          workflowType: pattern.workflowType,
          insightType: 'high_escalation',
          severity: pattern.escalationRate > 0.5 ? 'critical' : 'warning',
          summary: `${String(Math.round(pattern.escalationRate * 100))}% of ${pattern.workflowType} workflows are escalating — SLA or approval thresholds may need adjustment`,
          dataPoints: {
            escalationRate: pattern.escalationRate,
            sampleSize: pattern.sampleSize,
          },
        });
      }

      if (pattern.avgVerificationCount > 3) {
        insights.push({
          organizationId,
          workflowType: pattern.workflowType,
          insightType: 'verification_bottleneck',
          severity: 'warning',
          summary: `${pattern.workflowType} requires avg ${pattern.avgVerificationCount.toFixed(1)} verifications — consider streamlining the verification chain`,
          dataPoints: {
            avgVerificationCount: pattern.avgVerificationCount,
            sampleSize: pattern.sampleSize,
          },
        });
      }

      if (
        pattern.avgFeedbackScore >= 4 &&
        pattern.completionRate >= 0.9 &&
        pattern.escalationRate <= 0.05
      ) {
        insights.push({
          organizationId,
          workflowType: pattern.workflowType,
          insightType: 'positive_pattern',
          severity: 'info',
          summary: `${pattern.workflowType} is performing well: ${String(Math.round(pattern.completionRate * 100))}% completion, ${pattern.avgFeedbackScore.toFixed(1)}/5 avg score`,
          dataPoints: {
            completionRate: pattern.completionRate,
            avgFeedbackScore: pattern.avgFeedbackScore,
            sampleSize: pattern.sampleSize,
          },
        });
      }
    }

    if (insights.length === 0) return [];

    await this.setTenantContext(organizationId);

    const saved: LoopInsight[] = [];
    for (const insight of insights) {
      const result = await this.pool.query<InsightRow>(
        `INSERT INTO loop_phase_insights
           (organization_id, workflow_type, insight_type, severity, summary, data_points)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          insight.organizationId,
          insight.workflowType,
          insight.insightType,
          insight.severity,
          insight.summary,
          JSON.stringify(insight.dataPoints),
        ],
      );
      const row = result.rows[0];
      if (row) saved.push(rowToInsight(row));
    }

    return saved;
  }

  async listInsights(organizationId: string, limit = 20): Promise<LoopInsight[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<InsightRow>(
      `SELECT * FROM loop_phase_insights
       WHERE organization_id = $1
       ORDER BY generated_at DESC
       LIMIT $2`,
      [organizationId, limit],
    );
    return result.rows.map(rowToInsight);
  }
}
