import type { Pool } from 'pg';
import type { UsageEvent, UsageSummary, RecordUsageInput, BillingPeriod } from '../types.js';

interface UsageEventRow {
  id: string;
  organization_id: string;
  subscription_id: string;
  event_type: string;
  quantity: number;
  metadata: Record<string, unknown>;
  recorded_at: string;
}

interface UsageSummaryRow {
  workflow_runs: string;
  agent_executions: string;
  api_calls: string;
  storage_mb: string;
  member_seats: string;
}

function rowToEvent(row: UsageEventRow): UsageEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    subscriptionId: row.subscription_id,
    eventType: row.event_type as UsageEvent['eventType'],
    quantity: row.quantity,
    metadata: row.metadata,
    recordedAt: row.recorded_at,
  };
}

export class UsageMeteringService {
  constructor(private readonly pool: Pool) {}

  async recordUsage(input: RecordUsageInput): Promise<UsageEvent> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    const result = await this.pool.query<UsageEventRow>(
      `INSERT INTO usage_events (organization_id, subscription_id, event_type, quantity, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.organizationId,
        input.subscriptionId,
        input.eventType,
        input.quantity,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to record usage event');
    return rowToEvent(row);
  }

  async getUsageSummary(
    orgId: string,
    subscriptionId: string,
    period: BillingPeriod,
  ): Promise<UsageSummary> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<UsageSummaryRow>(
      `SELECT
        COALESCE(SUM(CASE WHEN event_type = 'workflow_run' THEN quantity ELSE 0 END), 0) AS workflow_runs,
        COALESCE(SUM(CASE WHEN event_type = 'agent_execution' THEN quantity ELSE 0 END), 0) AS agent_executions,
        COALESCE(SUM(CASE WHEN event_type = 'api_call' THEN quantity ELSE 0 END), 0) AS api_calls,
        COALESCE(SUM(CASE WHEN event_type = 'storage_mb' THEN quantity ELSE 0 END), 0) AS storage_mb,
        COALESCE(SUM(CASE WHEN event_type = 'member_seat' THEN quantity ELSE 0 END), 0) AS member_seats
       FROM usage_events
       WHERE organization_id = $1
         AND subscription_id = $2
         AND recorded_at >= $3
         AND recorded_at <= $4`,
      [orgId, subscriptionId, period.start, period.end],
    );

    const row = result.rows[0];
    if (!row) {
      return {
        organizationId: orgId,
        subscriptionId,
        period,
        workflowRuns: 0,
        agentExecutions: 0,
        apiCalls: 0,
        storageMb: 0,
        memberSeats: 0,
      };
    }

    return {
      organizationId: orgId,
      subscriptionId,
      period,
      workflowRuns: Number(row.workflow_runs),
      agentExecutions: Number(row.agent_executions),
      apiCalls: Number(row.api_calls),
      storageMb: Number(row.storage_mb),
      memberSeats: Number(row.member_seats),
    };
  }

  async listUsageEvents(
    orgId: string,
    subscriptionId: string,
    period: BillingPeriod,
    limit = 100,
    offset = 0,
  ): Promise<UsageEvent[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<UsageEventRow>(
      `SELECT * FROM usage_events
       WHERE organization_id = $1
         AND subscription_id = $2
         AND recorded_at >= $3
         AND recorded_at <= $4
       ORDER BY recorded_at DESC
       LIMIT $5 OFFSET $6`,
      [orgId, subscriptionId, period.start, period.end, limit, offset],
    );

    return result.rows.map(rowToEvent);
  }
}
