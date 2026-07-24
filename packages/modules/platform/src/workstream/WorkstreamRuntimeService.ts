import type { Pool, PoolClient } from 'pg';
import crypto from 'node:crypto';
import type {
  WorkstreamRuntime,
  WorkstreamStage,
  WorkstreamExecutionState,
  WorkstreamChannel,
  WorkstreamCheckpoint,
  WorkstreamTelemetry,
  WorkstreamError,
  DependencyName,
  DependencyHealth,
} from '@galaxy/types';
import type { UUID } from '@galaxy/types';

interface CheckpointRow {
  id: string;
  workstream_id: string;
  organization_id: string;
  stage: string;
  execution_state: string;
  state: Record<string, unknown>;
  retry_count: number;
  channel: string;
  intent: string | null;
  workflow_id: string | null;
  actor_id: string | null;
  correlation_id: string;
  request_id: string;
  agent_ids: string[];
  warnings: string[];
  errors: WorkstreamError[];
  saved_at: string;
}

interface TelemetryRow {
  id: string;
  workstream_id: string;
  organization_id: string;
  stage: string;
  duration_ms: number;
  success: boolean;
  error_code: string | null;
  dependency: string | null;
  agent_id: string | null;
  retry_count: number;
  channel: string;
  intent: string | null;
  correlation_id: string;
  recorded_at: string;
}

/**
 * WorkstreamRuntimeService
 *
 * Manages the lifecycle of a WRF workstream:
 * - Saving and restoring checkpoints for crash recovery
 * - Recording per-stage telemetry for Mission Control dashboards
 * - Advancing execution state through the 17-stage lifecycle
 * - Building a WorkstreamRuntime snapshot for any active workstream
 */
export class WorkstreamRuntimeService {
  constructor(private readonly pool: Pool) {}

  /**
   * Save a checkpoint for the current workstream state.
   * Must be called on a PoolClient that already has tenant context set.
   */
  async saveCheckpoint(
    client: PoolClient,
    runtime: Pick<
      WorkstreamRuntime,
      | 'workstreamId'
      | 'organizationId'
      | 'workspaceId'
      | 'actorId'
      | 'channel'
      | 'intent'
      | 'workflowId'
      | 'currentStage'
      | 'executionState'
      | 'correlationId'
      | 'requestId'
      | 'agentIds'
      | 'retryCount'
      | 'warnings'
      | 'errors'
    >,
    stageState: Record<string, unknown> = {},
  ): Promise<WorkstreamCheckpoint> {
    const result = await client.query<{ id: string; saved_at: string }>(
      `INSERT INTO workstream_checkpoints
         (organization_id, workstream_id, stage, execution_state, state,
          retry_count, channel, intent, workflow_id, actor_id,
          correlation_id, request_id, agent_ids, warnings, errors)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, saved_at`,
      [
        runtime.organizationId,
        runtime.workstreamId,
        runtime.currentStage,
        runtime.executionState,
        JSON.stringify(stageState),
        runtime.retryCount,
        runtime.channel,
        runtime.intent,
        runtime.workflowId,
        runtime.actorId,
        runtime.correlationId,
        runtime.requestId,
        runtime.agentIds,
        runtime.warnings,
        JSON.stringify(runtime.errors),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('workstream_checkpoints INSERT returned no row');

    return {
      id: row.id,
      workstreamId: runtime.workstreamId,
      organizationId: runtime.organizationId,
      stage: runtime.currentStage,
      state: stageState,
      retryCount: runtime.retryCount,
      savedAt: row.saved_at,
    };
  }

  /**
   * Load the latest checkpoint for a workstream — used by the self-healing
   * engine to resume after a crash without re-executing completed stages.
   */
  async loadLatestCheckpoint(
    client: PoolClient,
    workstreamId: UUID,
  ): Promise<WorkstreamCheckpoint | null> {
    const result = await client.query<CheckpointRow>(
      `SELECT * FROM workstream_checkpoints
       WHERE workstream_id = $1
       ORDER BY saved_at DESC
       LIMIT 1`,
      [workstreamId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      workstreamId: row.workstream_id,
      organizationId: row.organization_id,
      stage: row.stage as WorkstreamStage,
      state: row.state,
      retryCount: row.retry_count,
      savedAt: row.saved_at,
    };
  }

  /**
   * Record a stage telemetry event. Non-fatal — should be called in a catch
   * so a telemetry failure never blocks workstream execution.
   */
  async recordTelemetry(
    client: PoolClient,
    opts: {
      workstreamId: UUID;
      organizationId: UUID;
      stage: WorkstreamStage;
      durationMs: number;
      success: boolean;
      errorCode?: string;
      dependency?: DependencyName;
      agentId?: UUID;
      retryCount?: number;
      channel?: WorkstreamChannel;
      intent?: string;
      correlationId: UUID;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO workstream_telemetry
         (organization_id, workstream_id, stage, duration_ms, success,
          error_code, dependency, agent_id, retry_count, channel, intent, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        opts.organizationId,
        opts.workstreamId,
        opts.stage,
        opts.durationMs,
        opts.success,
        opts.errorCode ?? null,
        opts.dependency ?? null,
        opts.agentId ?? null,
        opts.retryCount ?? 0,
        opts.channel ?? 'internal',
        opts.intent ?? null,
        opts.correlationId,
      ],
    );
  }

  /**
   * Create a fresh WorkstreamRuntime for a new workstream execution.
   */
  static create(opts: {
    organizationId: UUID;
    channel: WorkstreamChannel;
    correlationId?: UUID;
    workspaceId?: UUID;
    actorId?: UUID;
  }): WorkstreamRuntime {
    const now = new Date().toISOString();
    return {
      workstreamId: crypto.randomUUID(),
      organizationId: opts.organizationId,
      workspaceId: opts.workspaceId ?? null,
      actorId: opts.actorId ?? null,
      channel: opts.channel,
      intent: null,
      workflowId: null,
      executionState: 'queued',
      currentStage: 'event_received',
      correlationId: opts.correlationId ?? crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      agentIds: [],
      workflowGraph: [],
      retryCount: 0,
      latencyMs: 0,
      dependencies: [],
      warnings: [],
      errors: [],
      health: 'healthy',
      lastCheckpoint: null,
      startedAt: now,
      completedAt: null,
    };
  }

  /**
   * Advance the runtime to the next stage and update computed fields.
   */
  static advance(
    runtime: WorkstreamRuntime,
    stage: WorkstreamStage,
    updates: Partial<Omit<WorkstreamRuntime, 'workstreamId' | 'organizationId' | 'startedAt'>> = {},
  ): WorkstreamRuntime {
    return {
      ...runtime,
      ...updates,
      currentStage: stage,
      latencyMs: Date.now() - new Date(runtime.startedAt).getTime(),
    };
  }

  /**
   * Mark the runtime as failed with a structured error.
   */
  static fail(
    runtime: WorkstreamRuntime,
    error: Omit<WorkstreamError, 'occurredAt'>,
  ): WorkstreamRuntime {
    const wrfError: WorkstreamError = { ...error, occurredAt: new Date().toISOString() };
    const health: DependencyHealth = runtime.errors.length >= 2 ? 'unavailable' : 'degraded';
    return {
      ...runtime,
      executionState: 'failed',
      errors: [...runtime.errors, wrfError],
      health,
      completedAt: new Date().toISOString(),
      latencyMs: Date.now() - new Date(runtime.startedAt).getTime(),
    };
  }

  /**
   * Mark the runtime as completed.
   */
  static complete(runtime: WorkstreamRuntime): WorkstreamRuntime {
    return {
      ...runtime,
      executionState: 'completed',
      currentStage: 'completed',
      completedAt: new Date().toISOString(),
      latencyMs: Date.now() - new Date(runtime.startedAt).getTime(),
    };
  }

  /**
   * List active workstream checkpoints for Mission Control.
   * Runs as superuser (no RLS) — admin-only endpoint.
   */
  async listActiveWorkstreams(opts: {
    limit?: number;
    states?: WorkstreamExecutionState[];
  }): Promise<CheckpointRow[]> {
    const states = opts.states ?? ['queued', 'planning', 'running', 'waiting', 'degraded'];
    const result = await this.pool.query<CheckpointRow>(
      `SELECT DISTINCT ON (workstream_id) *
       FROM workstream_checkpoints
       WHERE execution_state = ANY($1)
       ORDER BY workstream_id, saved_at DESC
       LIMIT $2`,
      [states, opts.limit ?? 100],
    );
    return result.rows;
  }

  /**
   * Compute latency percentiles from workstream_telemetry for a time window.
   * Runs as superuser (admin-only). Returns p50/p95/p99 in milliseconds.
   */
  async getLatencyPercentiles(windowMinutes = 60): Promise<{
    p50: number;
    p95: number;
    p99: number;
    errorRate: number;
    throughputPerMinute: number;
  }> {
    const result = await this.pool.query<{
      p50: string;
      p95: string;
      p99: string;
      error_count: string;
      total_count: string;
    }>(
      `SELECT
         percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
         percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99,
         COUNT(*) FILTER (WHERE NOT success) AS error_count,
         COUNT(*) AS total_count
       FROM workstream_telemetry
       WHERE recorded_at > NOW() - ($1 || ' minutes')::INTERVAL`,
      [windowMinutes],
    );

    const row = result.rows[0];
    const total = Number(row?.total_count ?? 0);
    const errors = Number(row?.error_count ?? 0);

    return {
      p50: Number(row?.p50 ?? 0),
      p95: Number(row?.p95 ?? 0),
      p99: Number(row?.p99 ?? 0),
      errorRate: total > 0 ? errors / total : 0,
      throughputPerMinute: total / windowMinutes,
    };
  }

  /**
   * Get telemetry rows for a specific workstream (for drill-down in Mission Control).
   */
  async getWorkstreamTelemetry(
    client: PoolClient,
    workstreamId: UUID,
  ): Promise<WorkstreamTelemetry[]> {
    const result = await client.query<TelemetryRow>(
      `SELECT * FROM workstream_telemetry
       WHERE workstream_id = $1
       ORDER BY recorded_at ASC`,
      [workstreamId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      workstreamId: row.workstream_id,
      organizationId: row.organization_id,
      stage: row.stage as WorkstreamStage,
      durationMs: row.duration_ms,
      success: row.success,
      errorCode: row.error_code,
      dependency: row.dependency as DependencyName | null,
      agentId: row.agent_id,
      retryCount: row.retry_count,
      recordedAt: row.recorded_at,
    }));
  }
}
