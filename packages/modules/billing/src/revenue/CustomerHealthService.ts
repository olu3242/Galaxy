import type { Pool } from 'pg';

export interface CustomerHealth {
  organizationId: string;
  healthScore: number;
  activityScore: number;
  engagementScore: number;
  paymentScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  lastPaymentAt: string | null;
  lastActivityAt: string | null;
  measuredAt: string;
}

export class CustomerHealthService {
  constructor(private readonly pool: Pool) {}

  async computeHealth(orgId: string): Promise<CustomerHealth> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const activityResult = await this.pool.query<{
      last_activity: string | null;
      event_count: string;
    }>(
      `SELECT MAX(created_at) AS last_activity, COUNT(*)::text AS event_count
       FROM audit_logs WHERE organization_id = $1`,
      [orgId],
    );

    const paymentResult = await this.pool.query<{
      last_payment: string | null;
      failed_count: string;
    }>(
      `SELECT MAX(paid_at) AS last_payment,
              COUNT(*) FILTER (WHERE status = 'failed')::text AS failed_count
       FROM payments WHERE organization_id = $1`,
      [orgId],
    );

    const actRow = activityResult.rows[0];
    const payRow = paymentResult.rows[0];

    const eventCount = parseInt(actRow?.event_count ?? '0', 10);
    const failedPayments = parseInt(payRow?.failed_count ?? '0', 10);
    const lastActivity = actRow?.last_activity ?? null;
    const lastPayment = payRow?.last_payment ?? null;

    const daysSinceActivity = lastActivity
      ? (Date.now() - new Date(lastActivity).getTime()) / 86400000
      : 999;

    const activityScore = Math.min(33, eventCount > 100 ? 33 : Math.round((eventCount / 100) * 33));
    const engagementScore =
      daysSinceActivity < 1 ? 33 : daysSinceActivity < 7 ? 25 : daysSinceActivity < 30 ? 15 : 0;
    const paymentScore = failedPayments === 0 ? 34 : failedPayments === 1 ? 20 : 0;
    const healthScore = activityScore + engagementScore + paymentScore;

    const grade =
      healthScore >= 90
        ? 'A'
        : healthScore >= 75
          ? 'B'
          : healthScore >= 60
            ? 'C'
            : healthScore >= 40
              ? 'D'
              : 'F';

    return {
      organizationId: orgId,
      healthScore,
      activityScore,
      engagementScore,
      paymentScore,
      grade,
      lastPaymentAt: lastPayment,
      lastActivityAt: lastActivity,
      measuredAt: new Date().toISOString(),
    };
  }
}
