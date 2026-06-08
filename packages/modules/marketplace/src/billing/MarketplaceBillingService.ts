import type { Pool } from 'pg';
import type { MarketplaceBilling, MarketplaceBillingRow } from '../types.js';

function rowToBilling(row: MarketplaceBillingRow): MarketplaceBilling {
  return {
    id: row.id,
    organizationId: row.organization_id,
    installationId: row.installation_id,
    marketplaceItemId: row.marketplace_item_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    usageUnits: parseInt(row.usage_units, 10),
    feeAmount: parseFloat(row.fee_amount),
    feeCurrency: row.fee_currency,
    status: row.status as 'pending' | 'invoiced' | 'paid',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface RecordUsageInput {
  organizationId: string;
  installationId: string;
  marketplaceItemId: string;
  periodStart: string;
  periodEnd: string;
  usageUnits: number;
  feeAmount: number;
  feeCurrency: string;
}

export class MarketplaceBillingService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async recordUsage(input: RecordUsageInput): Promise<MarketplaceBilling> {
    await this.setTenantContext(input.organizationId);
    const result = await this.pool.query<MarketplaceBillingRow>(
      `INSERT INTO marketplace_billing
        (organization_id, installation_id, marketplace_item_id, period_start, period_end,
         usage_units, fee_amount, fee_currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [
        input.organizationId,
        input.installationId,
        input.marketplaceItemId,
        input.periodStart,
        input.periodEnd,
        input.usageUnits,
        input.feeAmount,
        input.feeCurrency,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record usage');
    return rowToBilling(row);
  }

  async listBilling(
    organizationId: string,
    options: { installationId?: string; limit?: number; offset?: number },
  ): Promise<MarketplaceBilling[]> {
    await this.setTenantContext(organizationId);
    const params: unknown[] = [organizationId];
    let sql = 'SELECT * FROM marketplace_billing WHERE organization_id = $1';
    if (options.installationId !== undefined) {
      params.push(options.installationId);
      sql += ` AND installation_id = $${String(params.length)}`;
    }
    sql += ' ORDER BY period_start DESC';
    if (options.limit !== undefined) {
      params.push(options.limit);
      sql += ` LIMIT $${String(params.length)}`;
    }
    if (options.offset !== undefined) {
      params.push(options.offset);
      sql += ` OFFSET $${String(params.length)}`;
    }
    const result = await this.pool.query<MarketplaceBillingRow>(sql, params);
    return result.rows.map(rowToBilling);
  }

  async markInvoiced(
    organizationId: string,
    billingId: string,
  ): Promise<MarketplaceBilling | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<MarketplaceBillingRow>(
      `UPDATE marketplace_billing SET status = 'invoiced', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'pending'
       RETURNING *`,
      [billingId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToBilling(row) : null;
  }

  async markPaid(organizationId: string, billingId: string): Promise<MarketplaceBilling | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<MarketplaceBillingRow>(
      `UPDATE marketplace_billing SET status = 'paid', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'invoiced'
       RETURNING *`,
      [billingId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToBilling(row) : null;
  }

  async calculateTotalFees(
    organizationId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<number> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(fee_amount), 0) AS total
       FROM marketplace_billing
       WHERE organization_id = $1
         AND period_start >= $2
         AND period_end <= $3`,
      [organizationId, periodStart, periodEnd],
    );
    const row = result.rows[0];
    return row ? parseFloat(row.total) : 0;
  }
}
