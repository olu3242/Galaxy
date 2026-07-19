import type { Pool } from 'pg';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'unpaid';

export interface Subscription {
  id: string;
  organizationId: string;
  planId: string;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  createdAt: string;
}

export interface SubscriptionEvent {
  id: string;
  organizationId: string;
  subscriptionId: string;
  eventType: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

interface SubscriptionRow {
  id: string;
  organization_id: string;
  plan_id: string;
  status: string;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  cancelled_at: string | null;
  created_at: string;
}

interface SubscriptionEventRow {
  id: string;
  organization_id: string;
  subscription_id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

export class SubscriptionService {
  constructor(private readonly pool: Pool) {}

  async createSubscription(input: {
    organizationId: string;
    planId: string;
    status?: SubscriptionStatus;
    trialEndsAt?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
  }): Promise<Subscription> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const result = await this.pool.query<SubscriptionRow>(
      `INSERT INTO subscriptions
         (organization_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.organizationId,
        input.planId,
        input.status ?? 'active',
        input.trialEndsAt ?? null,
        input.currentPeriodStart ?? now.toISOString(),
        input.currentPeriodEnd ?? periodEnd.toISOString(),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create subscription');

    await this.recordEvent({
      organizationId: input.organizationId,
      subscriptionId: row.id,
      eventType: 'created',
    });

    return this.mapSubscription(row);
  }

  async getSubscription(organizationId: string): Promise<Subscription | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<SubscriptionRow>(
      `SELECT * FROM subscriptions WHERE organization_id = $1 AND status NOT IN ('cancelled')
       ORDER BY created_at DESC LIMIT 1`,
      [organizationId],
    );
    const row = result.rows[0];
    return row ? this.mapSubscription(row) : null;
  }

  async listSubscriptions(opts?: {
    status?: SubscriptionStatus;
    limit?: number;
  }): Promise<Subscription[]> {
    const params: unknown[] = [];
    let idx = 1;
    const where = opts?.status !== undefined ? `WHERE status = $${String(idx++)}` : '';
    if (opts?.status !== undefined) params.push(opts.status);
    const limit = opts?.limit !== undefined ? ` LIMIT $${String(idx++)}` : '';
    if (opts?.limit !== undefined) params.push(opts.limit);

    const result = await this.pool.query<SubscriptionRow>(
      `SELECT * FROM subscriptions ${where} ORDER BY created_at DESC${limit}`,
      params,
    );
    return result.rows.map((r) => this.mapSubscription(r));
  }

  async updateStatus(
    subscriptionId: string,
    status: SubscriptionStatus,
    organizationId: string,
  ): Promise<Subscription | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const cancelledAt = status === 'cancelled' ? 'NOW()' : 'cancelled_at';
    const result = await this.pool.query<SubscriptionRow>(
      `UPDATE subscriptions SET status = $1, cancelled_at = ${cancelledAt} WHERE id = $2 RETURNING *`,
      [status, subscriptionId],
    );
    const row = result.rows[0];
    if (!row) return null;

    await this.recordEvent({
      organizationId,
      subscriptionId,
      eventType: `status_changed_to_${status}`,
    });

    return this.mapSubscription(row);
  }

  private async recordEvent(input: {
    organizationId: string;
    subscriptionId: string;
    eventType: string;
    metadata?: Record<string, unknown>;
  }): Promise<SubscriptionEvent> {
    const result = await this.pool.query<SubscriptionEventRow>(
      `INSERT INTO subscription_events (organization_id, subscription_id, event_type, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        input.organizationId,
        input.subscriptionId,
        input.eventType,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record subscription event');
    return {
      id: row.id,
      organizationId: row.organization_id,
      subscriptionId: row.subscription_id,
      eventType: row.event_type,
      metadata: row.metadata,
      occurredAt: row.occurred_at,
    };
  }

  private mapSubscription(row: SubscriptionRow): Subscription {
    return {
      id: row.id,
      organizationId: row.organization_id,
      planId: row.plan_id,
      status: row.status as SubscriptionStatus,
      trialEndsAt: row.trial_ends_at,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelledAt: row.cancelled_at,
      createdAt: row.created_at,
    };
  }
}
