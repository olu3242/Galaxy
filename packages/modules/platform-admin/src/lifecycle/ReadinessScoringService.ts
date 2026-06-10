import type { Pool } from 'pg';

export interface ReadinessScore {
  organizationId: string;
  score: number;
  breakdown: {
    memberScore: number;
    workflowScore: number;
    activityScore: number;
    configurationScore: number;
  };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  computedAt: string;
}

export class ReadinessScoringService {
  constructor(private readonly pool: Pool) {}

  async computeScore(orgId: string): Promise<ReadinessScore> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<{
      member_count: string;
      workflow_count: string;
      active_workflows: string;
      last_activity_days: string | null;
    }>(
      `SELECT
         COUNT(DISTINCT m.id)::text AS member_count,
         COUNT(DISTINCT w.id)::text AS workflow_count,
         COUNT(DISTINCT w.id) FILTER (WHERE w.status = 'active')::text AS active_workflows,
         EXTRACT(EPOCH FROM (NOW() - MAX(al.created_at))) / 86400 AS last_activity_days
       FROM organizations o
       LEFT JOIN members m ON m.organization_id = o.id
       LEFT JOIN workflows w ON w.organization_id = o.id
       LEFT JOIN audit_logs al ON al.organization_id = o.id
       WHERE o.id = $1`,
      [orgId],
    );

    const row = result.rows[0];
    const memberCount = parseInt(row?.member_count ?? '0', 10);
    const workflowCount = parseInt(row?.workflow_count ?? '0', 10);
    const activeWorkflows = parseInt(row?.active_workflows ?? '0', 10);
    const daysSinceActivity = parseFloat(row?.last_activity_days ?? '999');

    const memberScore = Math.min(25, memberCount * 5);
    const workflowScore = Math.min(25, workflowCount * 3 + activeWorkflows * 2);
    const activityScore = daysSinceActivity < 1 ? 25 : daysSinceActivity < 7 ? 20 : daysSinceActivity < 30 ? 10 : 0;
    const configurationScore = memberCount > 0 && workflowCount > 0 ? 25 : 0;

    const score = memberScore + workflowScore + activityScore + configurationScore;
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

    return {
      organizationId: orgId,
      score,
      breakdown: { memberScore, workflowScore, activityScore, configurationScore },
      grade,
      computedAt: new Date().toISOString(),
    };
  }
}
