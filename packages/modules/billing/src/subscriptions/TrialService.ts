import type { Pool } from 'pg';
import type { Subscription } from '../types.js';

export interface Trial {
  id: string;
  organizationId: string;
  planId: string;
  trialStart: string;
  trialEnd: string;
  isConverted: boolean;
  convertedAt: string | null;
  createdAt: string;
}

interface TrialRow {
  id: string;
  organization_id: string;
  plan_id: string;
  trial_start: string;
  trial_end: string;
  is_converted: boolean;
  converted_at: string | null;
  created_at: string;
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

export class TrialService {
  constructor(private readonly pool: Pool) {}

  async startTrial(orgId: string, planId: string, trialDays = 14): Promise<Trial> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const trialStart = new Date();
    const trialEnd = new Date(trialStart);
    trialEnd.setDate(trialEnd.getDate() + trialDays);

    const result = await this.pool.query<TrialRow>(
      `INSERT INTO trials (organization_id, plan_id, trial_start, trial_end, is_converted)
       VALUES ($1, $2, $3, $4, false)
       RETURNING *`,
      [orgId, planId, trialStart.toISOString(), trialEnd.toISOString()],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Trial creation failed');

    await this.pool.query<SubRow>(
      `INSERT INTO subscriptions
         (organization_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, trial_end, metadata)
       VALUES ($1, $2, 'trialing', $3, $4, false, $4, '{}')
       ON CONFLICT DO NOTHING`,
      [orgId, planId, trialStart.toISOString(), trialEnd.toISOString()],
    );

    return this.rowToTrial(row);
  }

  async getTrialStatus(orgId: string): Promise<Trial | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<TrialRow>(
      'SELECT * FROM trials WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1',
      [orgId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return this.rowToTrial(row);
  }

  async convertTrialToPaid(orgId: string, planId: string): Promise<Subscription> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    await this.pool.query(
      `UPDATE trials SET is_converted = true, converted_at = NOW()
       WHERE organization_id = $1 AND is_converted = false`,
      [orgId],
    );

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const result = await this.pool.query<SubRow>(
      `UPDATE subscriptions SET
         plan_id = $1, status = 'active', current_period_start = $2, current_period_end = $3,
         trial_end = NULL, updated_at = NOW()
       WHERE organization_id = $4 AND status = 'trialing'
       RETURNING *`,
      [planId, now.toISOString(), periodEnd.toISOString(), orgId],
    );

    const row = result.rows[0];
    if (!row) throw new Error('No active trial found to convert');

    return {
      id: row.id,
      organizationId: row.organization_id,
      planId: row.plan_id,
      status: 'active',
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToTrial(row: TrialRow): Trial {
    return {
      id: row.id,
      organizationId: row.organization_id,
      planId: row.plan_id,
      trialStart: row.trial_start,
      trialEnd: row.trial_end,
      isConverted: row.is_converted,
      convertedAt: row.converted_at,
      createdAt: row.created_at,
    };
  }
}
