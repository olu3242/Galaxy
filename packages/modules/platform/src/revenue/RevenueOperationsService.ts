import type { Pool } from 'pg';

export interface RevenueSnapshot {
  id: string;
  mrrCents: number;
  arrCents: number;
  activeSubscriptions: number;
  churnedThisMonth: number;
  newThisMonth: number;
  snapshotDate: string;
  createdAt: string;
}

interface RevenueSnapshotRow {
  id: string;
  mrr_cents: string;
  arr_cents: string;
  active_subscriptions: string;
  churned_this_month: string;
  new_this_month: string;
  snapshot_date: string;
  created_at: string;
}

export class RevenueOperationsService {
  constructor(private readonly pool: Pool) {}

  async recordSnapshot(input: {
    mrrCents: number;
    arrCents: number;
    activeSubscriptions: number;
    churnedThisMonth: number;
    newThisMonth: number;
    snapshotDate?: string;
  }): Promise<RevenueSnapshot> {
    const result = await this.pool.query<RevenueSnapshotRow>(
      `INSERT INTO revenue_snapshots
         (mrr_cents, arr_cents, active_subscriptions, churned_this_month, new_this_month, snapshot_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.mrrCents,
        input.arrCents,
        input.activeSubscriptions,
        input.churnedThisMonth,
        input.newThisMonth,
        input.snapshotDate ?? new Date().toISOString().split('T')[0],
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record revenue snapshot');
    return this.mapSnapshot(row);
  }

  async listSnapshots(opts?: { limit?: number }): Promise<RevenueSnapshot[]> {
    const limit = opts?.limit !== undefined ? ` LIMIT $1` : '';
    const params: unknown[] = opts?.limit !== undefined ? [opts.limit] : [];
    const result = await this.pool.query<RevenueSnapshotRow>(
      `SELECT * FROM revenue_snapshots ORDER BY snapshot_date DESC${limit}`,
      params,
    );
    return result.rows.map((r) => this.mapSnapshot(r));
  }

  async getLatestSnapshot(): Promise<RevenueSnapshot | null> {
    const result = await this.pool.query<RevenueSnapshotRow>(
      `SELECT * FROM revenue_snapshots ORDER BY snapshot_date DESC LIMIT 1`,
    );
    const row = result.rows[0];
    return row ? this.mapSnapshot(row) : null;
  }

  async getSnapshotHistory(opts?: { limit?: number }): Promise<RevenueSnapshot[]> {
    return this.listSnapshots(opts);
  }

  async getMrrTrend(opts?: {
    limit?: number;
  }): Promise<{ mrrCents: number; snapshotDate: string }[]> {
    const snapshots = await this.listSnapshots(opts);
    return snapshots.map((s) => ({ mrrCents: s.mrrCents, snapshotDate: s.snapshotDate }));
  }

  async calculateCurrentMrr(): Promise<number> {
    const result = await this.pool.query<{ mrr: string }>(
      `SELECT COALESCE(SUM(p.price_cents_monthly), 0) AS mrr
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.status IN ('active', 'trialing')`,
    );
    return parseInt(result.rows[0]?.mrr ?? '0', 10);
  }

  async getChurnRate(): Promise<number> {
    const result = await this.pool.query<{ total: string; churned: string }>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'cancelled'
           AND cancelled_at >= date_trunc('month', NOW())) AS churned
       FROM subscriptions`,
    );
    const row = result.rows[0];
    const total = parseInt(row?.total ?? '0', 10);
    const churned = parseInt(row?.churned ?? '0', 10);
    return total > 0 ? churned / total : 0;
  }

  private mapSnapshot(row: RevenueSnapshotRow): RevenueSnapshot {
    return {
      id: row.id,
      mrrCents: parseInt(row.mrr_cents, 10),
      arrCents: parseInt(row.arr_cents, 10),
      activeSubscriptions: parseInt(row.active_subscriptions, 10),
      churnedThisMonth: parseInt(row.churned_this_month, 10),
      newThisMonth: parseInt(row.new_this_month, 10),
      snapshotDate: row.snapshot_date,
      createdAt: row.created_at,
    };
  }
}
