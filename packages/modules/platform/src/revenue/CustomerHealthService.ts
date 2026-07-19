import type { Pool } from 'pg';

export interface CustomerHealthScore {
  id: string;
  organizationId: string;
  score: number;
  factors: Record<string, unknown>;
  scoredAt: string;
}

interface CustomerHealthScoreRow {
  id: string;
  organization_id: string;
  score: string;
  factors: Record<string, unknown>;
  scored_at: string;
}

export class CustomerHealthService {
  constructor(private readonly pool: Pool) {}

  async recordScore(input: {
    organizationId: string;
    score: number;
    factors?: Record<string, unknown>;
  }): Promise<CustomerHealthScore> {
    const result = await this.pool.query<CustomerHealthScoreRow>(
      `INSERT INTO customer_health_scores (organization_id, score, factors)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.organizationId, input.score, JSON.stringify(input.factors ?? {})],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record customer health score');
    return this.mapScore(row);
  }

  async getLatestScore(organizationId: string): Promise<CustomerHealthScore | null> {
    const result = await this.pool.query<CustomerHealthScoreRow>(
      `SELECT * FROM customer_health_scores WHERE organization_id = $1 ORDER BY scored_at DESC LIMIT 1`,
      [organizationId],
    );
    const row = result.rows[0];
    return row ? this.mapScore(row) : null;
  }

  async listHealthScores(opts?: {
    minScore?: number;
    maxScore?: number;
    limit?: number;
  }): Promise<CustomerHealthScore[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.minScore !== undefined) {
      conditions.push(`score >= $${String(idx++)}`);
      params.push(opts.minScore);
    }
    if (opts?.maxScore !== undefined) {
      conditions.push(`score <= $${String(idx++)}`);
      params.push(opts.maxScore);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts?.limit !== undefined ? ` LIMIT $${String(idx++)}` : '';
    if (opts?.limit !== undefined) params.push(opts.limit);

    // Get latest score per organization
    const result = await this.pool.query<CustomerHealthScoreRow>(
      `SELECT DISTINCT ON (organization_id) *
       FROM customer_health_scores
       ${where}
       ORDER BY organization_id, scored_at DESC${limit}`,
      params,
    );
    return result.rows.map((r) => this.mapScore(r));
  }

  async calculateHealthScore(organizationId: string): Promise<CustomerHealthScore> {
    // Gather signals
    const [activityResult, subscriptionResult] = await Promise.all([
      this.pool.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM audit_logs
         WHERE organization_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
        [organizationId],
      ),
      this.pool.query<{ status: string }>(
        `SELECT status FROM subscriptions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [organizationId],
      ),
    ]);

    const activityCount = parseInt(activityResult.rows[0]?.cnt ?? '0', 10);
    const subStatus = subscriptionResult.rows[0]?.status ?? 'none';

    const activityScore = Math.min(activityCount / 100, 1) * 50;
    const subscriptionScore = subStatus === 'active' ? 40 : subStatus === 'trialing' ? 20 : 0;
    const baseScore = 10;
    const score = Math.round(baseScore + activityScore + subscriptionScore);

    const factors = {
      activity: { count: activityCount, score: activityScore },
      subscription: { status: subStatus, score: subscriptionScore },
    };

    return this.recordScore({ organizationId, score, factors });
  }

  private mapScore(row: CustomerHealthScoreRow): CustomerHealthScore {
    return {
      id: row.id,
      organizationId: row.organization_id,
      score: parseFloat(row.score),
      factors: row.factors,
      scoredAt: row.scored_at,
    };
  }
}
