import type { Pool } from 'pg';
import type { UsageEventType } from '../types.js';

export interface QuotaCheck {
  organizationId: string;
  eventType: UsageEventType;
  used: number;
  limit: number;
  remaining: number;
  isExceeded: boolean;
  percentUsed: number;
}

export interface UsageAlert {
  id: string;
  organizationId: string;
  eventType: string;
  threshold: number;
  currentValue: number;
  triggeredAt: string;
}

interface LimitRow {
  max_members: number;
  max_workflows: number;
  max_agents: number;
  api_calls_per_month: number;
  storage_mb: number;
}

interface AlertRow {
  id: string;
  organization_id: string;
  event_type: string;
  threshold: number;
  current_value: number;
  triggered_at: string;
}

export class QuotaService {
  constructor(private readonly pool: Pool) {}

  async checkQuota(
    orgId: string,
    eventType: UsageEventType,
    period?: { start: string; end: string },
  ): Promise<QuotaCheck> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const limitResult = await this.pool.query<LimitRow>(
      'SELECT * FROM tenant_limits WHERE organization_id = $1',
      [orgId],
    );

    const limits = limitResult.rows[0];
    const limit = this.getLimitForType(limits, eventType);

    const now = new Date();
    const periodStart =
      period?.start ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd =
      period?.end ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    const usageResult = await this.pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(quantity), 0)::text AS total
       FROM usage_events
       WHERE organization_id = $1 AND event_type = $2
         AND recorded_at BETWEEN $3 AND $4`,
      [orgId, eventType, periodStart, periodEnd],
    );

    const used = parseInt(usageResult.rows[0]?.total ?? '0', 10);
    const remaining = Math.max(0, limit - used);
    const isExceeded = used >= limit;
    const percentUsed = limit > 0 ? Math.round((used / limit) * 100) : 0;

    if (percentUsed >= 80) {
      await this.raiseAlert(orgId, eventType, 80, percentUsed);
    }

    return { organizationId: orgId, eventType, used, limit, remaining, isExceeded, percentUsed };
  }

  async getAlerts(orgId: string): Promise<UsageAlert[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<AlertRow>(
      'SELECT * FROM usage_alerts WHERE organization_id = $1 ORDER BY triggered_at DESC LIMIT 50',
      [orgId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      eventType: row.event_type,
      threshold: row.threshold,
      currentValue: row.current_value,
      triggeredAt: row.triggered_at,
    }));
  }

  private async raiseAlert(
    orgId: string,
    eventType: string,
    threshold: number,
    currentValue: number,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO usage_alerts (organization_id, event_type, threshold, current_value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [orgId, eventType, threshold, currentValue],
    );
  }

  private getLimitForType(limits: LimitRow | undefined, eventType: UsageEventType): number {
    if (!limits) return 0;
    switch (eventType) {
      case 'member_seat':
        return limits.max_members;
      case 'workflow_run':
        return limits.api_calls_per_month;
      case 'agent_execution':
        return limits.max_agents * 1000;
      case 'api_call':
        return limits.api_calls_per_month;
      case 'storage_mb':
        return limits.storage_mb;
    }
  }
}
