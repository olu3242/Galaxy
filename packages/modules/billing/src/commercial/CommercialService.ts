import type { Pool } from 'pg';

export interface PricingConfig {
  planId: string;
  planName: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  annualDiscountPercent: number;
  features: string[];
  currency: string;
}

export interface BillingPolicy {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
}

interface PolicyRow {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

export class CommercialService {
  constructor(private readonly pool: Pool) {}

  async getPricingConfig(): Promise<PricingConfig[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      monthly_price_cents: number;
      annual_price_cents: number;
    }>(
      'SELECT id, name, monthly_price_cents, annual_price_cents FROM plans WHERE is_active = true ORDER BY monthly_price_cents ASC',
    );

    return result.rows.map((row) => {
      const annualMonthly = Math.round(row.annual_price_cents / 12);
      const discountPercent = row.monthly_price_cents > 0
        ? Math.round(((row.monthly_price_cents - annualMonthly) / row.monthly_price_cents) * 100)
        : 0;
      return {
        planId: row.id,
        planName: row.name,
        monthlyPriceCents: row.monthly_price_cents,
        annualPriceCents: row.annual_price_cents,
        annualDiscountPercent: discountPercent,
        features: [],
        currency: 'usd',
      };
    });
  }

  async getBillingPolicy(key: string): Promise<BillingPolicy | null> {
    const result = await this.pool.query<PolicyRow>(
      'SELECT * FROM billing_policies WHERE key = $1 LIMIT 1',
      [key],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, key: row.key, value: row.value, description: row.description, updatedAt: row.updated_at };
  }

  async setBillingPolicy(key: string, value: unknown, description?: string): Promise<BillingPolicy> {
    const result = await this.pool.query<PolicyRow>(
      `INSERT INTO billing_policies (key, value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = NOW()
       RETURNING *`,
      [key, JSON.stringify(value), description ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Policy upsert failed');
    return { id: row.id, key: row.key, value: row.value, description: row.description, updatedAt: row.updated_at };
  }
}
