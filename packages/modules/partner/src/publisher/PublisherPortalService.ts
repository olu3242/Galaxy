import type { Pool } from 'pg';
import type {
  PublisherAnalytics,
  PublisherPayout,
  PublisherPayoutRow,
  PartnerTier,
} from '../types.js';

interface ItemAnalyticsRow {
  total_earnings: string;
  total_installs: string;
  average_rating: string;
  review_count: string;
  item_count: string;
}

interface PendingEarningsRow {
  pending_amount: string;
}

function rowToPayout(row: PublisherPayoutRow): PublisherPayout {
  return {
    id: row.id,
    organizationId: row.organization_id,
    amount: parseFloat(row.amount),
    status: row.status as PublisherPayout['status'],
    period: row.period,
    settledAt: row.settled_at,
    createdAt: row.created_at,
  };
}

export interface PublisherOnboardingInput {
  organizationId: string;
  displayName: string;
  email: string;
}

export class PublisherPortalService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async onboardPublisher(input: PublisherOnboardingInput): Promise<{ publisherId: string }> {
    await this.setTenantContext(input.organizationId);
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO publishers (organization_id, display_name, email, status, metadata)
       VALUES ($1, $2, $3, 'pending', '{}')
       ON CONFLICT (organization_id) DO UPDATE
         SET display_name = EXCLUDED.display_name, email = EXCLUDED.email
       RETURNING id`,
      [input.organizationId, input.displayName, input.email],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to onboard publisher');
    return { publisherId: row.id };
  }

  async getPublisherAnalytics(organizationId: string): Promise<PublisherAnalytics> {
    await this.setTenantContext(organizationId);

    const itemsResult = await this.pool.query<ItemAnalyticsRow>(
      `SELECT
         COALESCE(SUM(mb.fee_amount), 0)::text AS total_earnings,
         COALESCE(SUM(mi.install_count), 0)::text AS total_installs,
         COALESCE(AVG(mi.average_rating), 0)::text AS average_rating,
         COALESCE(SUM(mi.review_count), 0)::text AS review_count,
         COUNT(mi.id)::text AS item_count
       FROM marketplace_items mi
       LEFT JOIN marketplace_billing mb ON mb.marketplace_item_id = mi.id AND mb.status = 'paid'
       WHERE mi.organization_id = $1`,
      [organizationId],
    );

    const pendingResult = await this.pool.query<PendingEarningsRow>(
      `SELECT COALESCE(SUM(amount), 0)::text AS pending_amount
       FROM publisher_payouts
       WHERE organization_id = $1 AND status = 'pending'`,
      [organizationId],
    );

    const stats = itemsResult.rows[0];
    const pending = pendingResult.rows[0];

    return {
      organizationId,
      totalEarnings: parseFloat(stats?.total_earnings ?? '0'),
      pendingPayouts: parseFloat(pending?.pending_amount ?? '0'),
      totalItems: parseInt(stats?.item_count ?? '0', 10),
      totalInstalls: parseInt(stats?.total_installs ?? '0', 10),
      averageRating: parseFloat(stats?.average_rating ?? '0'),
      reviewCount: parseInt(stats?.review_count ?? '0', 10),
    };
  }

  async listPayouts(organizationId: string): Promise<PublisherPayout[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<PublisherPayoutRow>(
      'SELECT * FROM publisher_payouts WHERE organization_id = $1 ORDER BY created_at DESC',
      [organizationId],
    );
    return result.rows.map(rowToPayout);
  }

  async createPayout(
    organizationId: string,
    amount: number,
    period: string,
  ): Promise<PublisherPayout> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<PublisherPayoutRow>(
      `INSERT INTO publisher_payouts (organization_id, amount, status, period)
       VALUES ($1, $2, 'pending', $3)
       RETURNING *`,
      [organizationId, amount, period],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create payout');
    return rowToPayout(row);
  }

  async settlePayout(organizationId: string, payoutId: string): Promise<PublisherPayout | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<PublisherPayoutRow>(
      `UPDATE publisher_payouts
       SET status = 'settled', settled_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [payoutId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToPayout(row) : null;
  }

  async resolvePublisherTier(organizationId: string): Promise<PartnerTier> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(fee_amount), 0)::text AS total
       FROM marketplace_billing
       WHERE organization_id = $1 AND status = 'paid'`,
      [organizationId],
    );
    const row = result.rows[0];
    const total = parseFloat(row?.total ?? '0');

    if (total >= 100000) return 'platinum';
    if (total >= 25000) return 'gold';
    if (total >= 5000) return 'silver';
    return 'registered';
  }
}
