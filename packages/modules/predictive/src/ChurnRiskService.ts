import type { Pool } from 'pg';
import type { ChurnRiskScore } from './types.js';

interface MemberActivityRow {
  id: string;
  joined_at: string;
  status: string;
  login_count_30d: string;
  task_count_30d: string;
}

export class ChurnRiskService {
  constructor(private readonly pool: Pool) {}

  async computeChurnRisk(organizationId: string): Promise<ChurnRiskScore[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const result = await this.pool.query<MemberActivityRow>(
      `SELECT
         m.id,
         m.created_at as joined_at,
         m.status,
         COALESCE(la.login_count, 0)::text as login_count_30d,
         COALESCE(ta.task_count, 0)::text as task_count_30d
       FROM memberships m
       LEFT JOIN (
         SELECT actor_id as member_id, COUNT(*) as login_count
         FROM audit_logs
         WHERE organization_id = $1 AND action = 'login' AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY actor_id
       ) la ON la.member_id = m.id
       LEFT JOIN (
         SELECT assigned_to as member_id, COUNT(*) as task_count
         FROM tasks
         WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY assigned_to
       ) ta ON ta.member_id = m.id
       WHERE m.organization_id = $1`,
      [organizationId],
    );

    const now = Date.now();
    return result.rows.map((row) => {
      const joined = row.joined_at ? new Date(row.joined_at).getTime() : 0;
      const daysSinceJoined = joined ? (now - joined) / (1000 * 60 * 60 * 24) : 90;
      const isInactive = row.status !== 'active';
      const daysSinceActive = isInactive ? 90 : Math.min(daysSinceJoined, 90);
      const loginCount = parseInt(row.login_count_30d, 10);
      const taskCount = parseInt(row.task_count_30d, 10);

      let score = 0;
      const factors: string[] = [];
      if (isInactive) {
        score += 40;
        factors.push('inactive_status');
      } else if (daysSinceActive > 30) {
        score += 40;
        factors.push('inactive_30d');
      } else if (daysSinceActive > 14) {
        score += 20;
        factors.push('inactive_14d');
      }
      if (loginCount === 0) {
        score += 30;
        factors.push('no_logins_30d');
      } else if (loginCount < 3) {
        score += 15;
        factors.push('low_logins_30d');
      }
      if (taskCount === 0) {
        score += 30;
        factors.push('no_tasks_30d');
      }

      const riskLevel: 'low' | 'medium' | 'high' =
        score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';

      return {
        memberId: row.id,
        organizationId,
        score: Math.min(100, score),
        riskLevel,
        factors,
        computedAt: new Date().toISOString(),
      };
    });
  }
}
