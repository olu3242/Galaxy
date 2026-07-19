import type { Pool } from 'pg';
import type {
  Subscription,
  Plan,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  SubscriptionStatus,
} from '../types.js';

interface SubscriptionRow {
  id: string;
  organization_id: string;
  plan_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface PlanRow {
  id: string;
  name: string;
  tier: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  max_members: number;
  max_workflows: number;
  max_agents: number;
  api_calls_per_month: number;
  storage_mb: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function rowToSubscription(row: SubscriptionRow): Subscription {
  const sub: Subscription = {
    id: row.id,
    organizationId: row.organization_id,
    planId: row.plan_id,
    status: row.status as SubscriptionStatus,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.trial_end !== null) {
    sub.trialEnd = row.trial_end;
  }
  return sub;
}

function rowToPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier as Plan['tier'],
    monthlyPriceCents: row.monthly_price_cents,
    annualPriceCents: row.annual_price_cents,
    limits: {
      maxMembers: row.max_members,
      maxWorkflows: row.max_workflows,
      maxAgents: row.max_agents,
      apiCallsPerMonth: row.api_calls_per_month,
      storageMb: row.storage_mb,
    },
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SubscriptionService {
  constructor(private readonly pool: Pool) {}

  async listPlans(): Promise<Plan[]> {
    const result = await this.pool.query<PlanRow>(
      'SELECT * FROM plans WHERE is_active = true ORDER BY monthly_price_cents ASC',
    );
    return result.rows.map(rowToPlan);
  }

  async getPlan(planId: string): Promise<Plan | null> {
    const result = await this.pool.query<PlanRow>('SELECT * FROM plans WHERE id = $1', [planId]);
    const row = result.rows[0];
    if (!row) return null;
    return rowToPlan(row);
  }

  async getSubscription(orgId: string): Promise<Subscription | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<SubscriptionRow>(
      "SELECT * FROM subscriptions WHERE organization_id = $1 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 1",
      [orgId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return rowToSubscription(row);
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const result = await this.pool.query<SubscriptionRow>(
      `INSERT INTO subscriptions (
        organization_id, plan_id, status, current_period_start, current_period_end,
        cancel_at_period_end, trial_end, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        input.organizationId,
        input.planId,
        input.trialEnd ? 'trialing' : 'active',
        now.toISOString(),
        periodEnd.toISOString(),
        false,
        input.trialEnd ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to create subscription');
    return rowToSubscription(row);
  }

  async updateSubscription(
    orgId: string,
    subscriptionId: string,
    input: UpdateSubscriptionInput,
  ): Promise<Subscription> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.planId !== undefined) {
      fields.push(`plan_id = $${String(idx++)}`);
      values.push(input.planId);
    }
    if (input.status !== undefined) {
      fields.push(`status = $${String(idx++)}`);
      values.push(input.status);
    }
    if (input.cancelAtPeriodEnd !== undefined) {
      fields.push(`cancel_at_period_end = $${String(idx++)}`);
      values.push(input.cancelAtPeriodEnd);
    }
    if (input.metadata !== undefined) {
      fields.push(`metadata = $${String(idx++)}`);
      values.push(JSON.stringify(input.metadata));
    }

    if (fields.length === 0) {
      const sub = await this.getSubscriptionById(orgId, subscriptionId);
      if (!sub) throw new Error('Subscription not found');
      return sub;
    }

    fields.push(`updated_at = NOW()`);
    values.push(subscriptionId, orgId);

    const result = await this.pool.query<SubscriptionRow>(
      `UPDATE subscriptions SET ${fields.join(', ')}
       WHERE id = $${String(idx++)} AND organization_id = $${String(idx)}
       RETURNING *`,
      values,
    );

    const row = result.rows[0];
    if (!row) throw new Error('Subscription not found');
    return rowToSubscription(row);
  }

  async cancelSubscription(orgId: string, subscriptionId: string): Promise<Subscription> {
    return this.updateSubscription(orgId, subscriptionId, {
      status: 'cancelled',
      cancelAtPeriodEnd: false,
    });
  }

  async upgradeSubscription(
    orgId: string,
    subscriptionId: string,
    newPlanId: string,
  ): Promise<Subscription> {
    return this.updateSubscription(orgId, subscriptionId, { planId: newPlanId });
  }

  async downgradeSubscription(
    orgId: string,
    subscriptionId: string,
    newPlanId: string,
  ): Promise<Subscription> {
    return this.updateSubscription(orgId, subscriptionId, {
      planId: newPlanId,
      cancelAtPeriodEnd: true,
    });
  }

  private async getSubscriptionById(
    orgId: string,
    subscriptionId: string,
  ): Promise<Subscription | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<SubscriptionRow>(
      'SELECT * FROM subscriptions WHERE id = $1 AND organization_id = $2',
      [subscriptionId, orgId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return rowToSubscription(row);
  }
}
