import type { Pool } from 'pg';

export interface ItemAnalytics {
  itemId: string;
  itemName: string;
  installCount: number;
  activeInstallCount: number;
  totalRevenue: number;
  averageRating: number;
  reviewCount: number;
}

export interface MarketplaceOverview {
  totalItems: number;
  totalInstalls: number;
  totalRevenue: number;
  topItems: ItemAnalytics[];
}

interface ItemAnalyticsRow {
  id: string;
  name: string;
  install_count: string;
  average_rating: string;
  review_count: string;
}

interface ActiveCountRow {
  marketplace_item_id: string;
  active_count: string;
}

interface RevenueRow {
  marketplace_item_id: string;
  revenue: string;
}

interface OverviewRow {
  total_items: string;
  total_installs: string;
  total_revenue: string;
}

export class MarketplaceAnalyticsService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async getItemAnalytics(organizationId: string, itemId: string): Promise<ItemAnalytics | null> {
    await this.setTenantContext(organizationId);
    const itemResult = await this.pool.query<ItemAnalyticsRow>(
      `SELECT id, name, install_count, average_rating, review_count
       FROM marketplace_items
       WHERE id = $1 AND organization_id = $2`,
      [itemId, organizationId],
    );
    const item = itemResult.rows[0];
    if (!item) return null;

    const activeResult = await this.pool.query<{ active_count: string }>(
      `SELECT COUNT(*) AS active_count FROM installations
       WHERE marketplace_item_id = $1 AND organization_id = $2 AND status = 'active'`,
      [itemId, organizationId],
    );
    const revenueResult = await this.pool.query<{ revenue: string }>(
      `SELECT COALESCE(SUM(fee_amount), 0) AS revenue FROM marketplace_billing
       WHERE marketplace_item_id = $1 AND organization_id = $2`,
      [itemId, organizationId],
    );

    return {
      itemId: item.id,
      itemName: item.name,
      installCount: parseInt(item.install_count, 10),
      activeInstallCount: parseInt(activeResult.rows[0]?.active_count ?? '0', 10),
      totalRevenue: parseFloat(revenueResult.rows[0]?.revenue ?? '0'),
      averageRating: parseFloat(item.average_rating),
      reviewCount: parseInt(item.review_count, 10),
    };
  }

  async getMarketplaceOverview(organizationId: string, topN = 10): Promise<MarketplaceOverview> {
    await this.setTenantContext(organizationId);

    const overviewResult = await this.pool.query<OverviewRow>(
      `SELECT
         COUNT(DISTINCT mi.id) AS total_items,
         COALESCE(SUM(mi.install_count), 0) AS total_installs,
         COALESCE(SUM(mb.fee_amount), 0) AS total_revenue
       FROM marketplace_items mi
       LEFT JOIN marketplace_billing mb ON mb.marketplace_item_id = mi.id AND mb.organization_id = mi.organization_id
       WHERE mi.organization_id = $1`,
      [organizationId],
    );

    const topItemsResult = await this.pool.query<ItemAnalyticsRow>(
      `SELECT id, name, install_count, average_rating, review_count
       FROM marketplace_items
       WHERE organization_id = $1
       ORDER BY install_count DESC, average_rating DESC
       LIMIT $2`,
      [organizationId, topN],
    );

    const itemIds = topItemsResult.rows.map((r) => r.id);
    let activeCountMap = new Map<string, number>();
    let revenueMap = new Map<string, number>();

    if (itemIds.length > 0) {
      const activeResult = await this.pool.query<ActiveCountRow>(
        `SELECT marketplace_item_id, COUNT(*) AS active_count
         FROM installations
         WHERE organization_id = $1 AND status = 'active' AND marketplace_item_id = ANY($2::uuid[])
         GROUP BY marketplace_item_id`,
        [organizationId, itemIds],
      );
      activeCountMap = new Map(
        activeResult.rows.map((r) => [r.marketplace_item_id, parseInt(r.active_count, 10)]),
      );

      const revResult = await this.pool.query<RevenueRow>(
        `SELECT marketplace_item_id, COALESCE(SUM(fee_amount), 0) AS revenue
         FROM marketplace_billing
         WHERE organization_id = $1 AND marketplace_item_id = ANY($2::uuid[])
         GROUP BY marketplace_item_id`,
        [organizationId, itemIds],
      );
      revenueMap = new Map(
        revResult.rows.map((r) => [r.marketplace_item_id, parseFloat(r.revenue)]),
      );
    }

    const topItems: ItemAnalytics[] = topItemsResult.rows.map((row) => ({
      itemId: row.id,
      itemName: row.name,
      installCount: parseInt(row.install_count, 10),
      activeInstallCount: activeCountMap.get(row.id) ?? 0,
      totalRevenue: revenueMap.get(row.id) ?? 0,
      averageRating: parseFloat(row.average_rating),
      reviewCount: parseInt(row.review_count, 10),
    }));

    const overview = overviewResult.rows[0];
    return {
      totalItems: parseInt(overview?.total_items ?? '0', 10),
      totalInstalls: parseInt(overview?.total_installs ?? '0', 10),
      totalRevenue: parseFloat(overview?.total_revenue ?? '0'),
      topItems,
    };
  }
}
