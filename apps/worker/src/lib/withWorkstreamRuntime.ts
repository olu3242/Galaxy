import type { Pool } from 'pg';
import type { Job } from 'bullmq';
import crypto from 'node:crypto';
import { withTenantClient } from './withTenantClient.js';
import { WorkstreamRuntimeService } from '@galaxy/platform';
import type {
  WorkstreamRuntime,
  WorkstreamStage,
  WorkstreamChannel,
  WorkstreamError,
  DependencyName,
} from '@galaxy/types';

export type { WorkstreamRuntime };

interface WorkstreamJobData {
  organizationId: string;
  correlationId?: string;
  actorId?: string;
  workspaceId?: string;
  channel?: WorkstreamChannel;
  intent?: string;
  workflowId?: string;
}

export interface WorkstreamContext {
  runtime: WorkstreamRuntime;
  /** Advance to the next stage and save a checkpoint */
  advance(stage: WorkstreamStage, stageState?: Record<string, unknown>): Promise<void>;
  /** Record a warning without failing the workstream */
  warn(message: string): void;
  /** Record a structured telemetry event for the current stage */
  telemetry(opts: {
    stage: WorkstreamStage;
    durationMs: number;
    success: boolean;
    errorCode?: string;
    dependency?: DependencyName;
    agentId?: string;
  }): Promise<void>;
}

const MAX_RETRIES = 3;
const RETRY_STAGES: WorkstreamStage[] = [
  'knowledge_retrieval',
  'ai_planning',
  'notification_delivery',
  'task_execution',
];

type CreateOpts = Parameters<typeof WorkstreamRuntimeService.create>[0];

const VALID_CHANNELS: WorkstreamChannel[] = [
  'whatsapp',
  'web',
  'api',
  'scheduler',
  'webhook',
  'internal',
];

function toChannel(ch: WorkstreamChannel | undefined): WorkstreamChannel {
  if (ch && (VALID_CHANNELS as string[]).includes(ch)) return ch;
  return 'internal';
}

function buildCreateOpts(
  organizationId: string,
  channel: WorkstreamChannel,
  correlationId: string,
  data: WorkstreamJobData,
): CreateOpts {
  const opts: CreateOpts = { organizationId, channel, correlationId };
  if (data.workspaceId) opts.workspaceId = data.workspaceId;
  if (data.actorId) opts.actorId = data.actorId;
  return opts;
}

/**
 * withWorkstreamRuntime
 *
 * The unified BullMQ job wrapper for the WRF. Wraps any worker processor with:
 *
 * 1. WorkstreamRuntime initialisation (or checkpoint restoration on retry)
 * 2. Dedicated PoolClient with session-level RLS context
 * 3. Auto-checkpoint on stage advance
 * 4. Structured telemetry recording per stage
 * 5. Enterprise error enrichment on failure
 * 6. Self-healing: retryable stages attempt recovery before marking failed
 * 7. Audit log entry on completion/failure
 *
 * Usage:
 *   return withWorkstreamRuntime(job, pool, async (ctx) => {
 *     await ctx.advance('intent_detection');
 *     // processor logic using ctx.runtime
 *   });
 */
export async function withWorkstreamRuntime(
  job: Job,
  pool: Pool,
  fn: (ctx: WorkstreamContext) => Promise<void>,
): Promise<void> {
  const data = job.data as WorkstreamJobData;
  const { organizationId } = data;

  if (!organizationId) {
    throw new Error(`WRF: job ${String(job.id)} has no organizationId in payload`);
  }

  const isRetry = job.attemptsMade > 0;
  const svc = new WorkstreamRuntimeService(pool);

  await withTenantClient(pool, organizationId, async (client) => {
    // ── Initialise or restore runtime ────────────────────────────────────────
    let runtime: WorkstreamRuntime;

    if (isRetry && data.correlationId) {
      const checkpoint = await svc
        .loadLatestCheckpoint(client, data.correlationId)
        .catch(() => null);

      runtime = WorkstreamRuntimeService.create(
        buildCreateOpts(organizationId, toChannel(data.channel), data.correlationId, data),
      );

      if (checkpoint) {
        runtime = WorkstreamRuntimeService.advance(runtime, checkpoint.stage, {
          workflowId: data.workflowId ?? null,
          intent: data.intent ?? null,
          retryCount: checkpoint.retryCount + 1,
          lastCheckpoint: checkpoint,
        });
      }
    } else {
      runtime = WorkstreamRuntimeService.create(
        buildCreateOpts(
          organizationId,
          toChannel(data.channel),
          data.correlationId ?? crypto.randomUUID(),
          data,
        ),
      );
    }

    if (data.intent) runtime = { ...runtime, intent: data.intent };
    if (data.workflowId) runtime = { ...runtime, workflowId: data.workflowId };

    // ── Build the context object passed to the processor ─────────────────────
    const warnings: string[] = [];
    let stageStartMs = Date.now();

    const ctx: WorkstreamContext = {
      get runtime() {
        return runtime;
      },

      async advance(stage: WorkstreamStage, stageState: Record<string, unknown> = {}) {
        const stageDurationMs = Date.now() - stageStartMs;

        const advanceTelemetry: Parameters<typeof svc.recordTelemetry>[1] = {
          workstreamId: runtime.workstreamId,
          organizationId,
          stage: runtime.currentStage,
          durationMs: stageDurationMs,
          success: true,
          correlationId: runtime.correlationId,
          channel: runtime.channel,
        };
        if (runtime.intent) advanceTelemetry.intent = runtime.intent;

        await svc.recordTelemetry(client, advanceTelemetry).catch(() => null);

        // Advance state
        runtime = WorkstreamRuntimeService.advance(runtime, stage, { warnings: [...warnings] });

        // Save checkpoint
        await svc.saveCheckpoint(client, runtime, stageState).catch(() => null);
        runtime = {
          ...runtime,
          lastCheckpoint: await svc
            .loadLatestCheckpoint(client, runtime.workstreamId)
            .catch(() => null),
        };

        stageStartMs = Date.now();
      },

      warn(message: string) {
        warnings.push(message);
        runtime = { ...runtime, warnings: [...warnings] };
      },

      async telemetry(opts) {
        const telemetryOpts: Parameters<typeof svc.recordTelemetry>[1] = {
          workstreamId: runtime.workstreamId,
          organizationId,
          stage: opts.stage,
          durationMs: opts.durationMs,
          success: opts.success,
          correlationId: runtime.correlationId,
          channel: runtime.channel,
        };
        if (opts.errorCode) telemetryOpts.errorCode = opts.errorCode;
        if (opts.dependency) telemetryOpts.dependency = opts.dependency;
        if (opts.agentId) telemetryOpts.agentId = opts.agentId;
        if (runtime.intent) telemetryOpts.intent = runtime.intent;

        await svc.recordTelemetry(client, telemetryOpts).catch(() => null);
      },
    };

    // ── Execute the processor ─────────────────────────────────────────────────
    let success = false;
    let processorError: unknown;

    try {
      await fn(ctx);
      success = true;
    } catch (err) {
      processorError = err;
    }

    // ── Post-execution: telemetry + audit + checkpoint finalization ───────────
    const totalDurationMs = Date.now() - new Date(runtime.startedAt).getTime();

    if (success) {
      runtime = WorkstreamRuntimeService.complete(runtime);

      const completedTelemetry: Parameters<typeof svc.recordTelemetry>[1] = {
        workstreamId: runtime.workstreamId,
        organizationId,
        stage: 'completed',
        durationMs: totalDurationMs,
        success: true,
        correlationId: runtime.correlationId,
        channel: runtime.channel,
      };
      if (runtime.intent) completedTelemetry.intent = runtime.intent;

      await svc.recordTelemetry(client, completedTelemetry).catch(() => null);

      await client
        .query(
          `INSERT INTO audit_logs
             (organization_id, actor_type, actor_id, action, resource_type, resource_id, correlation_id)
           VALUES ($1, 'system', $2, 'workstream.completed', 'workstream', $3, $4)`,
          [organizationId, runtime.actorId, runtime.workstreamId, runtime.correlationId],
        )
        .catch(() => null);
    } else {
      const isRetryable =
        RETRY_STAGES.includes(runtime.currentStage) && runtime.retryCount < MAX_RETRIES;

      const wrfError: Omit<WorkstreamError, 'occurredAt'> = {
        stage: runtime.currentStage,
        dependency: null,
        errorCode: 'WORKSTREAM_EXECUTION_ERROR',
        httpStatus: 500,
        message:
          processorError instanceof Error
            ? processorError.message
            : `Workstream failed at ${runtime.currentStage}`,
        recoveryAction: isRetryable
          ? `Retry ${String(runtime.retryCount + 1)}/${String(MAX_RETRIES)} scheduled`
          : 'Manual intervention required',
        retryable: isRetryable,
      };

      runtime = WorkstreamRuntimeService.fail(runtime, wrfError);

      const failedTelemetry: Parameters<typeof svc.recordTelemetry>[1] = {
        workstreamId: runtime.workstreamId,
        organizationId,
        stage: runtime.currentStage,
        durationMs: totalDurationMs,
        success: false,
        errorCode: wrfError.errorCode,
        correlationId: runtime.correlationId,
        channel: runtime.channel,
      };
      if (runtime.intent) failedTelemetry.intent = runtime.intent;

      await svc.recordTelemetry(client, failedTelemetry).catch(() => null);

      await client
        .query(
          `INSERT INTO audit_logs
             (organization_id, actor_type, actor_id, action, resource_type, resource_id, correlation_id)
           VALUES ($1, 'system', $2, 'workstream.failed', 'workstream', $3, $4)`,
          [organizationId, runtime.actorId, runtime.workstreamId, runtime.correlationId],
        )
        .catch(() => null);

      if (isRetryable) {
        throw processorError; // BullMQ will retry
      }
    }
  });
}
