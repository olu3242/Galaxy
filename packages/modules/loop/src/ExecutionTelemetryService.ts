import type { Pool } from 'pg';

export interface ExecutionTelemetryEntry {
  id: string;
  organizationId: string;
  workflowRunId: string;
  workflowDefinitionId: string;
  correlationId: string;
  durationMs: number;
  stepCount: number;
  completedSteps: number;
  failedSteps: number;
  agentTypes: string[];
  approvalWaitMs: number;
  retryCount: number;
  outcome: 'completed' | 'failed' | 'cancelled' | 'timeout';
  bottlenecks: string[];
  errorMessages: string[];
  costTokens: number;
  recordedAt: string;
}

export interface WorkflowStats {
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  successRate: number;
  commonBottlenecks: string[];
  totalRuns: number;
}

interface TelemetryRow {
  id: string;
  organization_id: string;
  workflow_run_id: string;
  workflow_definition_id: string;
  correlation_id: string;
  duration_ms: number;
  step_count: number;
  completed_steps: number;
  failed_steps: number;
  agent_types: string[];
  approval_wait_ms: number;
  retry_count: number;
  outcome: string;
  bottlenecks: string[];
  error_messages: string[];
  cost_tokens: number;
  recorded_at: string;
}

interface StatsRow {
  avg_duration_ms: string | null;
  p50_duration_ms: string | null;
  p95_duration_ms: string | null;
  success_rate: string | null;
  total_runs: string;
}

interface BottleneckRow {
  bottleneck: string;
  frequency: string;
}

interface HealthRow {
  success_rate: string | null;
}

function _rowToEntry(row: TelemetryRow): ExecutionTelemetryEntry {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workflowRunId: row.workflow_run_id,
    workflowDefinitionId: row.workflow_definition_id,
    correlationId: row.correlation_id,
    durationMs: row.duration_ms,
    stepCount: row.step_count,
    completedSteps: row.completed_steps,
    failedSteps: row.failed_steps,
    agentTypes: row.agent_types,
    approvalWaitMs: row.approval_wait_ms,
    retryCount: row.retry_count,
    outcome: row.outcome as ExecutionTelemetryEntry['outcome'],
    bottlenecks: row.bottlenecks,
    errorMessages: row.error_messages,
    costTokens: row.cost_tokens,
    recordedAt: row.recorded_at,
  };
}

export class ExecutionTelemetryService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async record(
    entry: Omit<ExecutionTelemetryEntry, 'id' | 'recordedAt'>,
  ): Promise<void> {
    await this.setTenantContext(entry.organizationId);
    await this.pool.query(
      `INSERT INTO execution_telemetry
         (organization_id, workflow_run_id, workflow_definition_id, correlation_id,
          duration_ms, step_count, completed_steps, failed_steps, agent_types,
          approval_wait_ms, retry_count, outcome, bottlenecks, error_messages, cost_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        entry.organizationId,
        entry.workflowRunId,
        entry.workflowDefinitionId,
        entry.correlationId,
        entry.durationMs,
        entry.stepCount,
        entry.completedSteps,
        entry.failedSteps,
        entry.agentTypes,
        entry.approvalWaitMs,
        entry.retryCount,
        entry.outcome,
        entry.bottlenecks,
        entry.errorMessages,
        entry.costTokens,
      ],
    );
  }

  async getWorkflowStats(
    organizationId: string,
    workflowDefinitionId: string,
    days: number,
  ): Promise<WorkflowStats> {
    await this.setTenantContext(organizationId);

    const [statsResult, bottleneckResult] = await Promise.all([
      this.pool.query<StatsRow>(
        `SELECT
           AVG(duration_ms)::text AS avg_duration_ms,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)::text AS p50_duration_ms,
           PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::text AS p95_duration_ms,
           AVG(CASE WHEN outcome = 'completed' THEN 1.0 ELSE 0.0 END)::text AS success_rate,
           COUNT(*)::text AS total_runs
         FROM execution_telemetry
         WHERE organization_id = $1
           AND workflow_definition_id = $2
           AND recorded_at > NOW() - ($3 || ' days')::interval`,
        [organizationId, workflowDefinitionId, days],
      ),
      this.pool.query<BottleneckRow>(
        `SELECT
           unnest(bottlenecks) AS bottleneck,
           COUNT(*)::text AS frequency
         FROM execution_telemetry
         WHERE organization_id = $1
           AND workflow_definition_id = $2
           AND recorded_at > NOW() - ($3 || ' days')::interval
           AND array_length(bottlenecks, 1) > 0
         GROUP BY bottleneck
         ORDER BY COUNT(*) DESC
         LIMIT 5`,
        [organizationId, workflowDefinitionId, days],
      ),
    ]);

    const stats = statsResult.rows[0];
    const commonBottlenecks = bottleneckResult.rows.map((r) => r.bottleneck);

    return {
      avgDurationMs: stats?.avg_duration_ms != null ? parseFloat(stats.avg_duration_ms) : 0,
      p50DurationMs: stats?.p50_duration_ms != null ? parseFloat(stats.p50_duration_ms) : 0,
      p95DurationMs: stats?.p95_duration_ms != null ? parseFloat(stats.p95_duration_ms) : 0,
      successRate: stats?.success_rate != null ? parseFloat(stats.success_rate) : 0,
      commonBottlenecks,
      totalRuns: stats?.total_runs != null ? parseInt(stats.total_runs, 10) : 0,
    };
  }

  async detectBottlenecks(
    organizationId: string,
    workflowDefinitionId: string,
  ): Promise<string[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<BottleneckRow>(
      `SELECT
         unnest(bottlenecks) AS bottleneck,
         COUNT(*)::text AS frequency
       FROM execution_telemetry
       WHERE organization_id = $1
         AND workflow_definition_id = $2
         AND recorded_at > NOW() - INTERVAL '7 days'
         AND array_length(bottlenecks, 1) > 0
       GROUP BY bottleneck
       ORDER BY COUNT(*) DESC
       LIMIT 10`,
      [organizationId, workflowDefinitionId],
    );
    return result.rows.map((r) => r.bottleneck);
  }

  async getOrgHealthScore(organizationId: string): Promise<number> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<HealthRow>(
      `SELECT
         AVG(CASE WHEN outcome = 'completed' THEN 1.0 ELSE 0.0 END)::text AS success_rate
       FROM execution_telemetry
       WHERE organization_id = $1
         AND recorded_at > NOW() - INTERVAL '7 days'`,
      [organizationId],
    );
    const row = result.rows[0];
    if (row?.success_rate == null) return 100;
    return Math.round(parseFloat(row.success_rate) * 100);
  }
}
