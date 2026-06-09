import type { Pool } from 'pg';
import type { HealthDimension, HealthScore, HealthStatus, HealthTrend } from '../types.js';

interface HealthScoreRow {
  id: string;
  organization_id: string;
  dimension: string;
  score: number;
  status: string;
  indicators: Record<string, unknown>;
  recommendations: string[];
  measured_at: Date;
}

function rowToScore(row: HealthScoreRow): HealthScore {
  return {
    id: row.id,
    organizationId: row.organization_id,
    dimension: row.dimension as HealthDimension,
    score: row.score,
    status: row.status as HealthStatus,
    indicators: row.indicators,
    recommendations: row.recommendations,
    measuredAt: row.measured_at,
  };
}

export class HealthScoringService {
  constructor(private readonly pool: Pool) {}

  async recordScore(
    orgId: string,
    dimension: HealthDimension,
    score: number,
    indicators: Record<string, unknown>,
    recommendations: string[],
  ): Promise<HealthScore> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const status: HealthStatus = score >= 70 ? 'healthy' : score >= 40 ? 'at_risk' : 'critical';
    const result = await this.pool.query<HealthScoreRow>(
      `INSERT INTO org_health_scores (organization_id, dimension, score, status, indicators, recommendations)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        orgId,
        dimension,
        score,
        status,
        JSON.stringify(indicators),
        JSON.stringify(recommendations),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record health score');
    return rowToScore(row);
  }

  async getLatestScore(orgId: string, dimension: HealthDimension): Promise<HealthScore | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<HealthScoreRow>(
      `SELECT * FROM org_health_scores WHERE organization_id = $1 AND dimension = $2
       ORDER BY measured_at DESC LIMIT 1`,
      [orgId, dimension],
    );
    const row = result.rows[0];
    return row ? rowToScore(row) : null;
  }

  async getAllLatestScores(orgId: string): Promise<HealthScore[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<HealthScoreRow>(
      `SELECT DISTINCT ON (dimension) * FROM org_health_scores
       WHERE organization_id = $1 ORDER BY dimension, measured_at DESC`,
      [orgId],
    );
    return result.rows.map(rowToScore);
  }

  async getTrend(orgId: string, dimension: HealthDimension, days = 30): Promise<HealthTrend> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<{ score: number; measured_at: Date }>(
      `SELECT score, measured_at FROM org_health_scores
       WHERE organization_id = $1 AND dimension = $2
         AND measured_at > NOW() - ($3 || ' days')::INTERVAL
       ORDER BY measured_at ASC`,
      [orgId, dimension, String(days)],
    );
    const scores = result.rows.map((r) => ({ score: r.score, measuredAt: r.measured_at }));
    const first = scores[0]?.score ?? 0;
    const last = scores[scores.length - 1]?.score ?? 0;
    const trend = last > first + 5 ? 'improving' : last < first - 5 ? 'declining' : 'stable';
    return { organizationId: orgId, dimension, scores, trend };
  }
}
