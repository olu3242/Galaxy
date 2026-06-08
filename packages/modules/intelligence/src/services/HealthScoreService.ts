import type { Pool } from 'pg';
import type { HealthCategory, HealthScore, HealthScoreRow } from '../types.js';

function rowToHealthScore(row: HealthScoreRow): HealthScore {
  return {
    id: row.id,
    organizationId: row.organization_id,
    category: row.category as HealthCategory,
    entityId: row.entity_id,
    score: parseFloat(row.score),
    components: row.components,
    computedAt: row.computed_at,
    createdAt: row.created_at,
  };
}

async function insertHealthScore(
  pool: Pool,
  organizationId: string,
  category: HealthCategory,
  entityId: string | null,
  score: number,
  components: Record<string, number>,
): Promise<HealthScore> {
  const result = await pool.query<HealthScoreRow>(
    `INSERT INTO health_scores
       (organization_id, category, entity_id, score, components, computed_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [organizationId, category, entityId, score, JSON.stringify(components)],
  );
  const row = result.rows[0];
  if (!row) throw new Error('INSERT RETURNING returned no row');
  return rowToHealthScore(row);
}

export class HealthScoreService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async computeOrganizationHealth(organizationId: string): Promise<HealthScore> {
    await this.setTenantContext(organizationId);

    const [workflowResult, memberResult] = await Promise.all([
      this.pool.query<{ count: string }>(
        "SELECT COUNT(*) as count FROM workflows WHERE organization_id = $1 AND status = 'active'",
        [organizationId],
      ),
      this.pool.query<{ count: string }>(
        "SELECT COUNT(*) as count FROM members WHERE organization_id = $1 AND status = 'active'",
        [organizationId],
      ),
    ]);

    const activeWorkflows = parseInt(workflowResult.rows[0]?.count ?? '0', 10);
    const activeMembers = parseInt(memberResult.rows[0]?.count ?? '0', 10);

    const workflowScore = Math.min(100, activeWorkflows * 10);
    const memberScore = Math.min(100, activeMembers * 5);
    const score = (workflowScore + memberScore) / 2;

    return insertHealthScore(this.pool, organizationId, 'organization', null, score, {
      workflowScore,
      memberScore,
    });
  }

  async computeDepartmentHealth(
    organizationId: string,
    departmentId: string,
  ): Promise<HealthScore> {
    await this.setTenantContext(organizationId);

    const memberResult = await this.pool.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM members WHERE organization_id = $1 AND department_id = $2 AND status = 'active'",
      [organizationId, departmentId],
    );

    const memberCount = parseInt(memberResult.rows[0]?.count ?? '0', 10);
    const score = Math.min(100, memberCount * 10);

    return insertHealthScore(this.pool, organizationId, 'department', departmentId, score, {
      memberCount,
    });
  }

  async computeWorkflowEffectiveness(organizationId: string): Promise<HealthScore> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<{ total: string; completed: string }>(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'completed') as completed
       FROM workflows WHERE organization_id = $1`,
      [organizationId],
    );

    const total = parseInt(result.rows[0]?.total ?? '0', 10);
    const completed = parseInt(result.rows[0]?.completed ?? '0', 10);
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    return insertHealthScore(this.pool, organizationId, 'workflow', null, completionRate, {
      total,
      completed,
      completionRate,
    });
  }

  async computeCommunicationEffectiveness(organizationId: string): Promise<HealthScore> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM messages WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '7 days'",
      [organizationId],
    );

    const recentMessages = parseInt(result.rows[0]?.count ?? '0', 10);
    const score = Math.min(100, recentMessages * 2);

    return insertHealthScore(this.pool, organizationId, 'communication', null, score, {
      recentMessages,
    });
  }

  async computeMemberEngagement(organizationId: string): Promise<HealthScore> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<{ total: string; active: string }>(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'active') as active
       FROM members WHERE organization_id = $1`,
      [organizationId],
    );

    const total = parseInt(result.rows[0]?.total ?? '0', 10);
    const active = parseInt(result.rows[0]?.active ?? '0', 10);
    const engagementRate = total > 0 ? (active / total) * 100 : 0;

    return insertHealthScore(this.pool, organizationId, 'engagement', null, engagementRate, {
      total,
      active,
      engagementRate,
    });
  }
}
