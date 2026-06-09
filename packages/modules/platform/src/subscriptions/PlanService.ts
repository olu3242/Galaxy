import type { Pool } from 'pg';

export interface Plan {
  id: string;
  name: string;
  displayName: string;
  priceCentsMonthly: number;
  priceCentsAnnual: number;
  features: Record<string, unknown>;
  active: boolean;
  createdAt: string;
}

interface PlanRow {
  id: string;
  name: string;
  display_name: string;
  price_cents_monthly: string;
  price_cents_annual: string;
  features: Record<string, unknown>;
  active: boolean;
  created_at: string;
}

export class PlanService {
  constructor(private readonly pool: Pool) {}

  async createPlan(input: {
    name: string;
    displayName: string;
    priceCentsMonthly: number;
    priceCentsAnnual: number;
    features?: Record<string, unknown>;
  }): Promise<Plan> {
    const result = await this.pool.query<PlanRow>(
      `INSERT INTO plans (name, display_name, price_cents_monthly, price_cents_annual, features, active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [
        input.name,
        input.displayName,
        input.priceCentsMonthly,
        input.priceCentsAnnual,
        JSON.stringify(input.features ?? {}),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create plan');
    return this.mapPlan(row);
  }

  async listPlans(activeOnly = true): Promise<Plan[]> {
    const where = activeOnly ? `WHERE active = true` : '';
    const result = await this.pool.query<PlanRow>(
      `SELECT * FROM plans ${where} ORDER BY price_cents_monthly ASC`,
    );
    return result.rows.map((r) => this.mapPlan(r));
  }

  async getPlanByName(name: string): Promise<Plan | null> {
    const result = await this.pool.query<PlanRow>(`SELECT * FROM plans WHERE name = $1`, [name]);
    const row = result.rows[0];
    return row ? this.mapPlan(row) : null;
  }

  async togglePlan(planId: string, active: boolean): Promise<Plan | null> {
    const result = await this.pool.query<PlanRow>(
      `UPDATE plans SET active = $1 WHERE id = $2 RETURNING *`,
      [active, planId],
    );
    const row = result.rows[0];
    return row ? this.mapPlan(row) : null;
  }

  private mapPlan(row: PlanRow): Plan {
    return {
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      priceCentsMonthly: parseInt(row.price_cents_monthly, 10),
      priceCentsAnnual: parseInt(row.price_cents_annual, 10),
      features: row.features,
      active: row.active,
      createdAt: row.created_at,
    };
  }
}
