import type { Pool } from 'pg';
import type {
  Deal,
  DealRow,
  DealStage,
  PartnerCommission,
  PartnerCommissionRow,
  CommissionStatus,
} from '../types.js';

const TIER_COMMISSION_RATES: Record<string, number> = {
  registered: 0.05,
  silver: 0.08,
  gold: 0.12,
  platinum: 0.15,
};

function rowToDeal(row: DealRow): Deal {
  return {
    id: row.id,
    partnerId: row.partner_id,
    customerOrgName: row.customer_org_name,
    customerEmail: row.customer_email,
    dealValue: parseFloat(row.deal_value),
    stage: row.stage as DealStage,
    commissionRate: parseFloat(row.commission_rate),
    commissionAmount: parseFloat(row.commission_amount),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToCommission(row: PartnerCommissionRow): PartnerCommission {
  return {
    id: row.id,
    partnerId: row.partner_id,
    dealId: row.deal_id,
    amount: parseFloat(row.amount),
    status: row.status as CommissionStatus,
    period: row.period,
    createdAt: row.created_at,
  };
}

export interface RegisterDealInput {
  partnerId: string;
  organizationId: string;
  customerOrgName: string;
  customerEmail: string;
  dealValue: number;
  notes: string;
  partnerTier?: string;
}

export class PartnerDealService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async registerDeal(input: RegisterDealInput): Promise<Deal> {
    await this.setTenantContext(input.organizationId);
    const commissionRate = TIER_COMMISSION_RATES[input.partnerTier ?? 'registered'] ?? 0.05;
    const commissionAmount = input.dealValue * commissionRate;

    const result = await this.pool.query<DealRow>(
      `INSERT INTO partner_deals
         (partner_id, customer_org_name, customer_email, deal_value, stage,
          commission_rate, commission_amount, notes)
       VALUES ($1, $2, $3, $4, 'registered', $5, $6, $7)
       RETURNING *`,
      [
        input.partnerId,
        input.customerOrgName,
        input.customerEmail,
        input.dealValue,
        commissionRate,
        commissionAmount,
        input.notes,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to register deal');
    return rowToDeal(row);
  }

  async getDeal(organizationId: string, dealId: string): Promise<Deal | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<DealRow>(
      `SELECT pd.* FROM partner_deals pd
       JOIN partners p ON p.id = pd.partner_id
       WHERE pd.id = $1 AND p.organization_id = $2`,
      [dealId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToDeal(row) : null;
  }

  async listDeals(organizationId: string, partnerId: string): Promise<Deal[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<DealRow>(
      `SELECT pd.* FROM partner_deals pd
       JOIN partners p ON p.id = pd.partner_id
       WHERE pd.partner_id = $1 AND p.organization_id = $2
       ORDER BY pd.created_at DESC`,
      [partnerId, organizationId],
    );
    return result.rows.map(rowToDeal);
  }

  async updateDealStage(
    organizationId: string,
    dealId: string,
    stage: DealStage,
  ): Promise<Deal | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<DealRow>(
      `UPDATE partner_deals pd
       SET stage = $2, updated_at = NOW()
       FROM partners p
       WHERE pd.id = $1
         AND pd.partner_id = p.id
         AND p.organization_id = $3
       RETURNING pd.*`,
      [dealId, stage, organizationId],
    );
    const row = result.rows[0];
    if (!row) return null;

    if (stage === 'closed_won') {
      const deal = rowToDeal(row);
      const period = new Date().toISOString().slice(0, 7);
      await this.pool.query(
        `INSERT INTO partner_commissions (partner_id, deal_id, amount, status, period)
         VALUES ($1, $2, $3, 'pending', $4)
         ON CONFLICT DO NOTHING`,
        [deal.partnerId, dealId, deal.commissionAmount, period],
      );
    }

    return rowToDeal(row);
  }

  async listCommissions(organizationId: string, partnerId: string): Promise<PartnerCommission[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<PartnerCommissionRow>(
      `SELECT pc.* FROM partner_commissions pc
       JOIN partners p ON p.id = pc.partner_id
       WHERE pc.partner_id = $1 AND p.organization_id = $2
       ORDER BY pc.created_at DESC`,
      [partnerId, organizationId],
    );
    return result.rows.map(rowToCommission);
  }
}
