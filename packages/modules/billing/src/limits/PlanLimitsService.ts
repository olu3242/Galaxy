import type { Pool } from 'pg';
import type { PlanLimits, PlanTier } from '../types.js';

interface PlanLimitsRow {
  tier: string;
  max_members: number;
  max_workflows: number;
  max_agents: number;
  api_calls_per_month: number;
  storage_mb: number;
}

interface CountRow {
  count: string;
}

export interface LimitCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  resource: string;
}

const DEFAULT_PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  starter: {
    maxMembers: 10,
    maxWorkflows: 5,
    maxAgents: 2,
    apiCallsPerMonth: 1000,
    storageMb: 1024,
  },
  professional: {
    maxMembers: 50,
    maxWorkflows: 50,
    maxAgents: 10,
    apiCallsPerMonth: 50000,
    storageMb: 10240,
  },
  enterprise: {
    maxMembers: 9999,
    maxWorkflows: 9999,
    maxAgents: 9999,
    apiCallsPerMonth: 9999999,
    storageMb: 1048576,
  },
};

export class PlanLimitsService {
  constructor(private readonly pool: Pool) {}

  async getPlanLimits(orgId: string): Promise<PlanLimits> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<PlanLimitsRow>(
      `SELECT p.tier, p.max_members, p.max_workflows, p.max_agents,
              p.api_calls_per_month, p.storage_mb
       FROM plans p
       JOIN subscriptions s ON s.plan_id = p.id
       WHERE s.organization_id = $1
         AND s.status IN ('active', 'trialing')
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [orgId],
    );

    const row = result.rows[0];
    if (!row) {
      return DEFAULT_PLAN_LIMITS.starter;
    }

    return {
      maxMembers: row.max_members,
      maxWorkflows: row.max_workflows,
      maxAgents: row.max_agents,
      apiCallsPerMonth: row.api_calls_per_month,
      storageMb: row.storage_mb,
    };
  }

  async checkMemberLimit(orgId: string): Promise<LimitCheckResult> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const limits = await this.getPlanLimits(orgId);

    const countResult = await this.pool.query<CountRow>(
      "SELECT COUNT(*) as count FROM members WHERE organization_id = $1 AND status = 'active'",
      [orgId],
    );
    const countRow = countResult.rows[0];
    const current = countRow ? Number(countRow.count) : 0;

    return {
      allowed: current < limits.maxMembers,
      current,
      limit: limits.maxMembers,
      resource: 'members',
    };
  }

  async checkWorkflowLimit(orgId: string): Promise<LimitCheckResult> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const limits = await this.getPlanLimits(orgId);

    const countResult = await this.pool.query<CountRow>(
      'SELECT COUNT(*) as count FROM workflows WHERE organization_id = $1',
      [orgId],
    );
    const countRow = countResult.rows[0];
    const current = countRow ? Number(countRow.count) : 0;

    return {
      allowed: current < limits.maxWorkflows,
      current,
      limit: limits.maxWorkflows,
      resource: 'workflows',
    };
  }

  async checkAgentLimit(orgId: string): Promise<LimitCheckResult> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const limits = await this.getPlanLimits(orgId);

    const countResult = await this.pool.query<CountRow>(
      'SELECT COUNT(*) as count FROM agents WHERE organization_id = $1 AND is_active = true',
      [orgId],
    );
    const countRow = countResult.rows[0];
    const current = countRow ? Number(countRow.count) : 0;

    return {
      allowed: current < limits.maxAgents,
      current,
      limit: limits.maxAgents,
      resource: 'agents',
    };
  }

  async checkApiCallLimit(orgId: string, subscriptionId: string): Promise<LimitCheckResult> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const limits = await this.getPlanLimits(orgId);

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const usageResult = await this.pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(quantity), 0) as total
       FROM usage_events
       WHERE organization_id = $1
         AND subscription_id = $2
         AND event_type = 'api_call'
         AND recorded_at >= $3`,
      [orgId, subscriptionId, periodStart.toISOString()],
    );

    const usageRow = usageResult.rows[0];
    const current = usageRow ? Number(usageRow.total) : 0;

    return {
      allowed: current < limits.apiCallsPerMonth,
      current,
      limit: limits.apiCallsPerMonth,
      resource: 'api_calls',
    };
  }
}
