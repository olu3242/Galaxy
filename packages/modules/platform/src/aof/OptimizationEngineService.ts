import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
  AofOptimization,
  AofOptimizationStatus,
  AofLearningRecord,
  OptimizationRecommendation,
  AofPriority,
} from '@galaxy/types';
import type { UUID } from '@galaxy/types';

interface OptimizationRow {
  id: string;
  organization_id: string;
  optimization_type: string;
  status: string;
  target_workflow: string | null;
  before_metrics: Record<string, unknown>;
  after_metrics: Record<string, unknown>;
  certification_id: string | null;
  applied_at: string | null;
  verified_at: string | null;
  created_at: string;
}

export class OptimizationEngineService {
  constructor(private readonly pool: Pool) {}

  async proposeOptimization(
    client: PoolClient,
    opts: {
      organizationId: UUID;
      optimizationType: string;
      targetWorkflow?: UUID;
      beforeMetrics: Record<string, unknown>;
    },
  ): Promise<AofOptimization> {
    const result = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO aof_optimizations
         (organization_id, optimization_type, target_workflow, before_metrics)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [
        opts.organizationId,
        opts.optimizationType,
        opts.targetWorkflow ?? null,
        JSON.stringify(opts.beforeMetrics),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('aof_optimizations INSERT returned no row');

    return {
      id: row.id,
      organizationId: opts.organizationId,
      optimizationType: opts.optimizationType,
      status: 'Detected',
      targetWorkflow: opts.targetWorkflow ?? null,
      beforeMetrics: opts.beforeMetrics,
      afterMetrics: {},
      certificationId: null,
      appliedAt: null,
      verifiedAt: null,
      createdAt: row.created_at,
    };
  }

  async advanceStatus(
    client: PoolClient,
    optimizationId: UUID,
    status: AofOptimizationStatus,
    updates: {
      certificationId?: UUID;
      afterMetrics?: Record<string, unknown>;
      appliedAt?: boolean;
      verifiedAt?: boolean;
    } = {},
  ): Promise<void> {
    await client.query(
      `UPDATE aof_optimizations SET
         status = $1,
         certification_id = COALESCE($2, certification_id),
         after_metrics = COALESCE($3, after_metrics),
         applied_at = CASE WHEN $4 THEN NOW() ELSE applied_at END,
         verified_at = CASE WHEN $5 THEN NOW() ELSE verified_at END
       WHERE id = $6`,
      [
        status,
        updates.certificationId ?? null,
        updates.afterMetrics ? JSON.stringify(updates.afterMetrics) : null,
        updates.appliedAt ?? false,
        updates.verifiedAt ?? false,
        optimizationId,
      ],
    );
  }

  async recordLearning(
    client: PoolClient,
    opts: {
      organizationId: UUID;
      optimizationId: UUID;
      predictedMetrics: Record<string, unknown>;
      actualMetrics: Record<string, unknown>;
    },
  ): Promise<AofLearningRecord> {
    const delta: Record<string, unknown> = {};
    for (const key of Object.keys(opts.predictedMetrics)) {
      const predicted = Number(opts.predictedMetrics[key] ?? 0);
      const actual = Number(opts.actualMetrics[key] ?? 0);
      delta[key] = {
        predicted,
        actual,
        deltaPercent: predicted !== 0 ? ((actual - predicted) / predicted) * 100 : 0,
      };
    }

    const result = await client.query<{ id: string; recorded_at: string }>(
      `INSERT INTO aof_learning_records
         (organization_id, optimization_id, predicted_metrics, actual_metrics, delta)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, recorded_at`,
      [
        opts.organizationId,
        opts.optimizationId,
        JSON.stringify(opts.predictedMetrics),
        JSON.stringify(opts.actualMetrics),
        JSON.stringify(delta),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('aof_learning_records INSERT returned no row');

    return {
      id: row.id,
      organizationId: opts.organizationId,
      optimizationId: opts.optimizationId,
      predictedMetrics: opts.predictedMetrics,
      actualMetrics: opts.actualMetrics,
      delta,
      recordedAt: row.recorded_at,
    };
  }

  async listOptimizations(
    client: PoolClient,
    organizationId: UUID,
    opts: { status?: AofOptimizationStatus; limit?: number } = {},
  ): Promise<AofOptimization[]> {
    const limit = opts.limit ?? 50;

    const result = opts.status
      ? await client.query<OptimizationRow>(
          `SELECT * FROM aof_optimizations
           WHERE organization_id = $1 AND status = $2
           ORDER BY created_at DESC LIMIT $3`,
          [organizationId, opts.status, limit],
        )
      : await client.query<OptimizationRow>(
          `SELECT * FROM aof_optimizations
           WHERE organization_id = $1
           ORDER BY created_at DESC LIMIT $2`,
          [organizationId, limit],
        );

    return result.rows.map((row) => this.mapOptimizationRow(row));
  }

  async generateRecommendations(windowMinutes = 60): Promise<OptimizationRecommendation[]> {
    const result = await this.pool.query<{
      stage: string;
      avg_latency: string;
      error_rate: string;
      count: string;
    }>(
      `SELECT
         stage,
         AVG(duration_ms) AS avg_latency,
         AVG(CASE WHEN NOT success THEN 1.0 ELSE 0.0 END) AS error_rate,
         COUNT(*) AS count
       FROM workstream_telemetry
       WHERE recorded_at > NOW() - ($1 || ' minutes')::INTERVAL
       GROUP BY stage
       HAVING AVG(duration_ms) > 2000 OR AVG(CASE WHEN NOT success THEN 1.0 ELSE 0.0 END) > 0.05
       ORDER BY AVG(duration_ms) DESC
       LIMIT 10`,
      [windowMinutes],
    );

    return result.rows.map((row) => {
      const avgLatency = Number(row.avg_latency);
      const errorRate = Number(row.error_rate);
      const priority: AofPriority =
        avgLatency > 10000 || errorRate > 0.2
          ? 'Critical'
          : avgLatency > 5000 || errorRate > 0.1
            ? 'High'
            : avgLatency > 2000 || errorRate > 0.05
              ? 'Medium'
              : 'Low';

      return {
        id: crypto.randomUUID(),
        type: errorRate > 0.05 ? 'error_rate_reduction' : 'latency_optimization',
        priority,
        confidence: Math.min(0.95, 0.5 + Number(row.count) * 0.001),
        estimatedSavingsMs: Math.max(0, Math.round(avgLatency - 1000)),
        rationale: `Stage "${row.stage}" has avg latency ${String(Math.round(avgLatency))}ms and error rate ${(errorRate * 100).toFixed(1)}% over the last ${String(windowMinutes)} minutes.`,
      } satisfies OptimizationRecommendation;
    });
  }

  private mapOptimizationRow(row: OptimizationRow): AofOptimization {
    return {
      id: row.id,
      organizationId: row.organization_id,
      optimizationType: row.optimization_type,
      status: row.status as AofOptimizationStatus,
      targetWorkflow: row.target_workflow,
      beforeMetrics: row.before_metrics,
      afterMetrics: row.after_metrics,
      certificationId: row.certification_id,
      appliedAt: row.applied_at,
      verifiedAt: row.verified_at,
      createdAt: row.created_at,
    };
  }
}
