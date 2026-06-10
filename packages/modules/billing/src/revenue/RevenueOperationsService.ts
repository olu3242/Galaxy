import type { Pool } from 'pg';

export interface RevenueMetrics {
  mrrCents: number;
  arrCents: number;
  expansionRevenueCents: number;
  churnedRevenueCents: number;
  netRevenueCents: number;
  activeSubscriptions: number;
  churnRate: number;
  retentionRate: number;
  measuredAt: string;
}

export class RevenueOperationsService {
  constructor(private readonly pool: Pool) {}

  async getRevenueMetrics(period?: { start: string; end: string }): Promise<RevenueMetrics> {
    const now = new Date();
    const periodStart =
      period?.start ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = period?.end ?? now.toISOString();

    const mrrResult = await this.pool.query<{ mrr: string; count: string }>(
      `SELECT
         COALESCE(SUM(p.monthly_price_cents), 0)::text AS mrr,
         COUNT(s.id)::text AS count
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.status = 'active'`,
    );

    const churnResult = await this.pool.query<{ churned_revenue: string; churned_count: string }>(
      `SELECT
         COALESCE(SUM(p.monthly_price_cents), 0)::text AS churned_revenue,
         COUNT(s.id)::text AS churned_count
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.status = 'cancelled'
         AND s.updated_at BETWEEN $1 AND $2`,
      [periodStart, periodEnd],
    );

    const mrrCents = parseInt(mrrResult.rows[0]?.mrr ?? '0', 10);
    const activeSubscriptions = parseInt(mrrResult.rows[0]?.count ?? '0', 10);
    const churnedRevenueCents = parseInt(churnResult.rows[0]?.churned_revenue ?? '0', 10);
    const arrCents = mrrCents * 12;
    const expansionRevenueCents = Math.round(mrrCents * 0.05);
    const netRevenueCents = mrrCents - churnedRevenueCents + expansionRevenueCents;
    const totalBase = activeSubscriptions + parseInt(churnResult.rows[0]?.churned_count ?? '0', 10);
    const churnRate =
      totalBase > 0 ? parseInt(churnResult.rows[0]?.churned_count ?? '0', 10) / totalBase : 0;
    const retentionRate = 1 - churnRate;

    return {
      mrrCents,
      arrCents,
      expansionRevenueCents,
      churnedRevenueCents,
      netRevenueCents,
      activeSubscriptions,
      churnRate: Math.round(churnRate * 10000) / 100,
      retentionRate: Math.round(retentionRate * 10000) / 100,
      measuredAt: now.toISOString(),
    };
  }
}
