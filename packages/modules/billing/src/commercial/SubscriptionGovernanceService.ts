import type { Pool } from 'pg';
import type { Subscription } from '../types.js';

export interface ContractTerm {
  id: string;
  organizationId: string;
  subscriptionId: string;
  termType: string;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  notes: string | null;
  createdAt: string;
}

interface SubRow {
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

export class SubscriptionGovernanceService {
  constructor(private readonly pool: Pool) {}

  async enforceRenewal(orgId: string): Promise<Subscription[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<SubRow>(
      `SELECT * FROM subscriptions
       WHERE organization_id = $1
         AND status = 'active'
         AND cancel_at_period_end = false
         AND current_period_end < NOW() + INTERVAL '3 days'`,
      [orgId],
    );

    const renewed: Subscription[] = [];
    for (const row of result.rows) {
      const newStart = new Date(row.current_period_end);
      const newEnd = new Date(newStart);
      newEnd.setMonth(newEnd.getMonth() + 1);

      const updatedRow = await this.pool.query<SubRow>(
        `UPDATE subscriptions SET
           current_period_start = $1, current_period_end = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [newStart.toISOString(), newEnd.toISOString(), row.id],
      );

      const updated = updatedRow.rows[0];
      if (updated) {
        renewed.push({
          id: updated.id,
          organizationId: updated.organization_id,
          planId: updated.plan_id,
          status: updated.status as Subscription['status'],
          currentPeriodStart: updated.current_period_start,
          currentPeriodEnd: updated.current_period_end,
          cancelAtPeriodEnd: updated.cancel_at_period_end,
          metadata: updated.metadata,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
        });
      }
    }
    return renewed;
  }

  async validateEnterpriseAccess(orgId: string, requiredFeature: string): Promise<boolean> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<{ tier: string }>(
      `SELECT p.tier FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.organization_id = $1 AND s.status = 'active'
       LIMIT 1`,
      [orgId],
    );
    const tier = result.rows[0]?.tier;
    if (!tier) return false;
    const enterpriseFeatures = [
      'advanced_analytics',
      'custom_workflows',
      'sso',
      'dedicated_support',
    ];
    if (enterpriseFeatures.includes(requiredFeature)) {
      return tier === 'enterprise';
    }
    return true;
  }
}
