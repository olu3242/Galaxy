import type { Pool } from 'pg';
import type { Plan, PlanTier } from '../types.js';

interface PlanRow {
  id: string;
  name: string;
  tier: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  max_members: number;
  max_workflows: number;
  max_agents: number;
  api_calls_per_month: number;
  storage_mb: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function rowToPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier as PlanTier,
    monthlyPriceCents: row.monthly_price_cents,
    annualPriceCents: row.annual_price_cents,
    limits: {
      maxMembers: row.max_members,
      maxWorkflows: row.max_workflows,
      maxAgents: row.max_agents,
      apiCallsPerMonth: row.api_calls_per_month,
      storageMb: row.storage_mb,
    },
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreatePlanInput {
  name: string;
  tier: PlanTier;
  monthlyPriceCents: number;
  annualPriceCents: number;
  maxMembers: number;
  maxWorkflows: number;
  maxAgents: number;
  apiCallsPerMonth: number;
  storageMb: number;
}

export class PlanService {
  constructor(private readonly pool: Pool) {}

  async listPlans(activeOnly = true): Promise<Plan[]> {
    const where = activeOnly ? 'WHERE is_active = true' : '';
    const result = await this.pool.query<PlanRow>(
      `SELECT * FROM plans ${where} ORDER BY monthly_price_cents ASC`,
    );
    return result.rows.map(rowToPlan);
  }

  async getPlan(planId: string): Promise<Plan | null> {
    const result = await this.pool.query<PlanRow>('SELECT * FROM plans WHERE id = $1', [planId]);
    const row = result.rows[0];
    if (!row) return null;
    return rowToPlan(row);
  }

  async createPlan(input: CreatePlanInput): Promise<Plan> {
    const result = await this.pool.query<PlanRow>(
      `INSERT INTO plans
         (name, tier, monthly_price_cents, annual_price_cents, max_members, max_workflows, max_agents, api_calls_per_month, storage_mb, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       RETURNING *`,
      [
        input.name,
        input.tier,
        input.monthlyPriceCents,
        input.annualPriceCents,
        input.maxMembers,
        input.maxWorkflows,
        input.maxAgents,
        input.apiCallsPerMonth,
        input.storageMb,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Plan creation failed');
    return rowToPlan(row);
  }

  async updatePlan(planId: string, updates: Partial<CreatePlanInput>): Promise<Plan | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      tier: 'tier',
      monthlyPriceCents: 'monthly_price_cents',
      annualPriceCents: 'annual_price_cents',
      maxMembers: 'max_members',
      maxWorkflows: 'max_workflows',
      maxAgents: 'max_agents',
      apiCallsPerMonth: 'api_calls_per_month',
      storageMb: 'storage_mb',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      const val = (updates as Record<string, unknown>)[key];
      if (val !== undefined) {
        fields.push(`${col} = $${String(idx++)}`);
        values.push(val);
      }
    }

    if (fields.length === 0) return this.getPlan(planId);

    fields.push('updated_at = NOW()');
    values.push(planId);

    const result = await this.pool.query<PlanRow>(
      `UPDATE plans SET ${fields.join(', ')} WHERE id = $${String(idx)} RETURNING *`,
      values,
    );
    const row = result.rows[0];
    if (!row) return null;
    return rowToPlan(row);
  }

  async deactivatePlan(planId: string): Promise<boolean> {
    const result = await this.pool.query(
      'UPDATE plans SET is_active = false, updated_at = NOW() WHERE id = $1',
      [planId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
