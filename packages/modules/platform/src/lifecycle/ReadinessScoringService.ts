import type { Pool } from 'pg';

export interface OrgReadinessScore {
  id: string;
  organizationId: string;
  score: number;
  dimensions: Record<string, unknown>;
  scoredAt: string;
}

interface ReadinessScoreRow {
  id: string;
  organization_id: string;
  score: string;
  dimensions: Record<string, unknown>;
  scored_at: string;
}

export class ReadinessScoringService {
  constructor(private readonly pool: Pool) {}

  async recordScore(input: {
    organizationId: string;
    score: number;
    dimensions?: Record<string, unknown>;
  }): Promise<OrgReadinessScore> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<ReadinessScoreRow>(
      `INSERT INTO org_readiness_scores (organization_id, score, dimensions)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.organizationId, input.score, JSON.stringify(input.dimensions ?? {})],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record readiness score');
    return this.mapScore(row);
  }

  async getLatestScore(organizationId: string): Promise<OrgReadinessScore | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<ReadinessScoreRow>(
      `SELECT * FROM org_readiness_scores WHERE organization_id = $1 ORDER BY scored_at DESC LIMIT 1`,
      [organizationId],
    );
    const row = result.rows[0];
    return row ? this.mapScore(row) : null;
  }

  async calculateReadiness(organizationId: string): Promise<OrgReadinessScore> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    // Gather dimensions
    const memberResult = await this.pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM memberships WHERE organization_id = $1`,
      [organizationId],
    );
    const workflowResult = await this.pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM workflows WHERE organization_id = $1`,
      [organizationId],
    );

    const memberCount = parseInt(memberResult.rows[0]?.cnt ?? '0', 10);
    const workflowCount = parseInt(workflowResult.rows[0]?.cnt ?? '0', 10);

    const memberScore = Math.min(memberCount / 5, 1) * 40;
    const workflowScore = Math.min(workflowCount / 3, 1) * 40;
    const baseScore = 20;
    const score = Math.round(baseScore + memberScore + workflowScore);

    const dimensions = {
      members: { count: memberCount, score: memberScore },
      workflows: { count: workflowCount, score: workflowScore },
    };

    return this.recordScore({ organizationId, score, dimensions });
  }

  private mapScore(row: ReadinessScoreRow): OrgReadinessScore {
    return {
      id: row.id,
      organizationId: row.organization_id,
      score: parseFloat(row.score),
      dimensions: row.dimensions,
      scoredAt: row.scored_at,
    };
  }
}
