import type { Pool, PoolClient } from 'pg';
import type { AofPrediction } from '@galaxy/types';
import type { UUID } from '@galaxy/types';

interface PredictionRow {
  id: string;
  organization_id: string;
  prediction_type: string;
  horizon_minutes: number;
  payload: Record<string, unknown>;
  confidence: string;
  created_at: string;
}

export class PredictiveIntelligenceService {
  constructor(private readonly pool: Pool) {}

  async predict(
    client: PoolClient,
    opts: {
      organizationId: UUID;
      predictionType: string;
      horizonMinutes: number;
      payload: Record<string, unknown>;
      confidence: number;
    },
  ): Promise<AofPrediction> {
    const result = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO aof_predictions
         (organization_id, prediction_type, horizon_minutes, payload, confidence)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [
        opts.organizationId,
        opts.predictionType,
        opts.horizonMinutes,
        JSON.stringify(opts.payload),
        opts.confidence,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('aof_predictions INSERT returned no row');

    return {
      id: row.id,
      organizationId: opts.organizationId,
      predictionType: opts.predictionType,
      horizonMinutes: opts.horizonMinutes,
      payload: opts.payload,
      confidence: opts.confidence,
      createdAt: row.created_at,
    };
  }

  async getLatestPredictions(
    client: PoolClient,
    organizationId: UUID,
    opts: { predictionType?: string; limit?: number } = {},
  ): Promise<AofPrediction[]> {
    const limit = opts.limit ?? 20;

    const result = opts.predictionType
      ? await client.query<PredictionRow>(
          `SELECT * FROM aof_predictions
           WHERE organization_id = $1 AND prediction_type = $2
           ORDER BY created_at DESC LIMIT $3`,
          [organizationId, opts.predictionType, limit],
        )
      : await client.query<PredictionRow>(
          `SELECT * FROM aof_predictions
           WHERE organization_id = $1
           ORDER BY created_at DESC LIMIT $2`,
          [organizationId, limit],
        );

    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      predictionType: row.prediction_type,
      horizonMinutes: row.horizon_minutes,
      payload: row.payload,
      confidence: Number(row.confidence),
      createdAt: row.created_at,
    }));
  }

  async forecastLoad(windowMinutes = 60): Promise<{
    projectedThroughputPerMinute: number;
    projectedP95LatencyMs: number;
    slaBreachProbability: number;
  }> {
    const result = await this.pool.query<{
      throughput: string;
      p95: string;
      error_rate: string;
    }>(
      `SELECT
         COUNT(*) / $1::FLOAT AS throughput,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
         AVG(CASE WHEN NOT success THEN 1.0 ELSE 0.0 END) AS error_rate
       FROM workstream_telemetry
       WHERE recorded_at > NOW() - ($1 || ' minutes')::INTERVAL`,
      [windowMinutes],
    );

    const row = result.rows[0];
    const p95 = Number(row?.p95 ?? 0);
    const throughput = Number(row?.throughput ?? 0);
    const errorRate = Number(row?.error_rate ?? 0);

    return {
      projectedThroughputPerMinute: throughput * 1.1,
      projectedP95LatencyMs: p95 * 1.05,
      slaBreachProbability: errorRate > 0.1 ? errorRate * 1.5 : errorRate,
    };
  }
}
