import type { Pool, PoolClient } from 'pg';
import type { AofObservation, AofOutcome, AofActorType } from '@galaxy/types';
import type { UUID } from '@galaxy/types';

interface ObservationRow {
  id: string;
  organization_id: string;
  event_id: string;
  event_type: string;
  workflow_id: string | null;
  stage_id: string | null;
  actor_type: string;
  duration_ms: number | null;
  outcome: string;
  metadata: Record<string, unknown>;
  observed_at: string;
}

export class ObservabilityService {
  constructor(private readonly pool: Pool) {}

  async ingestObservation(
    client: PoolClient,
    opts: {
      organizationId: UUID;
      eventId: UUID;
      eventType: string;
      workflowId?: UUID;
      stageId?: UUID;
      actorType: AofActorType;
      durationMs?: number;
      outcome: AofOutcome;
      metadata?: Record<string, unknown>;
    },
  ): Promise<AofObservation> {
    const result = await client.query<{ id: string; observed_at: string }>(
      `INSERT INTO aof_observations
         (organization_id, event_id, event_type, workflow_id, stage_id,
          actor_type, duration_ms, outcome, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, observed_at`,
      [
        opts.organizationId,
        opts.eventId,
        opts.eventType,
        opts.workflowId ?? null,
        opts.stageId ?? null,
        opts.actorType,
        opts.durationMs ?? null,
        opts.outcome,
        JSON.stringify(opts.metadata ?? {}),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('aof_observations INSERT returned no row');

    return {
      id: row.id,
      organizationId: opts.organizationId,
      eventId: opts.eventId,
      eventType: opts.eventType,
      workflowId: opts.workflowId ?? null,
      stageId: opts.stageId ?? null,
      actorType: opts.actorType,
      durationMs: opts.durationMs ?? null,
      outcome: opts.outcome,
      metadata: opts.metadata ?? {},
      observedAt: row.observed_at,
    };
  }

  async listObservations(
    client: PoolClient,
    organizationId: UUID,
    opts: { windowMinutes?: number; eventType?: string; limit?: number } = {},
  ): Promise<AofObservation[]> {
    const windowMinutes = opts.windowMinutes ?? 60;
    const limit = opts.limit ?? 100;

    const rows = opts.eventType
      ? await client.query<ObservationRow>(
          `SELECT * FROM aof_observations
           WHERE organization_id = $1
             AND event_type = $2
             AND observed_at > NOW() - ($3 || ' minutes')::INTERVAL
           ORDER BY observed_at DESC
           LIMIT $4`,
          [organizationId, opts.eventType, windowMinutes, limit],
        )
      : await client.query<ObservationRow>(
          `SELECT * FROM aof_observations
           WHERE organization_id = $1
             AND observed_at > NOW() - ($2 || ' minutes')::INTERVAL
           ORDER BY observed_at DESC
           LIMIT $3`,
          [organizationId, windowMinutes, limit],
        );

    return rows.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      eventId: row.event_id,
      eventType: row.event_type,
      workflowId: row.workflow_id,
      stageId: row.stage_id,
      actorType: row.actor_type as AofActorType,
      durationMs: row.duration_ms,
      outcome: row.outcome as AofOutcome,
      metadata: row.metadata,
      observedAt: row.observed_at,
    }));
  }

  async getObservationStats(windowMinutes = 60): Promise<{
    totalObservations: number;
    successRate: number;
    avgDurationMs: number;
    byOutcome: Record<string, number>;
  }> {
    const result = await this.pool.query<{
      outcome: string;
      count: string;
      avg_duration: string;
    }>(
      `SELECT outcome, COUNT(*) AS count, AVG(duration_ms) AS avg_duration
       FROM aof_observations
       WHERE observed_at > NOW() - ($1 || ' minutes')::INTERVAL
       GROUP BY outcome`,
      [windowMinutes],
    );

    const byOutcome: Record<string, number> = {};
    let total = 0;
    let successCount = 0;
    let totalDuration = 0;
    let durationCount = 0;

    for (const row of result.rows) {
      const count = Number(row.count);
      byOutcome[row.outcome] = count;
      total += count;
      if (row.outcome === 'success') successCount = count;
      if (row.avg_duration) {
        totalDuration += Number(row.avg_duration) * count;
        durationCount += count;
      }
    }

    return {
      totalObservations: total,
      successRate: total > 0 ? successCount / total : 1,
      avgDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
      byOutcome,
    };
  }
}
