import type { Pool } from 'pg';

export interface CommercialPolicy {
  id: string;
  policyType: string;
  rules: Record<string, unknown>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CommercialPolicyRow {
  id: string;
  policy_type: string;
  rules: Record<string, unknown>;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export class CommercialPolicyService {
  constructor(private readonly pool: Pool) {}

  async createPolicy(input: {
    policyType: string;
    rules: Record<string, unknown>;
  }): Promise<CommercialPolicy> {
    const result = await this.pool.query<CommercialPolicyRow>(
      `INSERT INTO commercial_policies (policy_type, rules, active)
       VALUES ($1, $2, true)
       RETURNING *`,
      [input.policyType, JSON.stringify(input.rules)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create commercial policy');
    return this.mapPolicy(row);
  }

  async listPolicies(policyType?: string): Promise<CommercialPolicy[]> {
    const where = policyType !== undefined ? `WHERE policy_type = $1` : '';
    const params: unknown[] = policyType !== undefined ? [policyType] : [];
    const result = await this.pool.query<CommercialPolicyRow>(
      `SELECT * FROM commercial_policies ${where} ORDER BY created_at DESC`,
      params,
    );
    return result.rows.map((r) => this.mapPolicy(r));
  }

  async togglePolicy(policyId: string, active: boolean): Promise<CommercialPolicy | null> {
    const result = await this.pool.query<CommercialPolicyRow>(
      `UPDATE commercial_policies SET active = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [active, policyId],
    );
    const row = result.rows[0];
    return row ? this.mapPolicy(row) : null;
  }

  async getActivePolicies(policyType: string): Promise<CommercialPolicy[]> {
    const result = await this.pool.query<CommercialPolicyRow>(
      `SELECT * FROM commercial_policies WHERE policy_type = $1 AND active = true ORDER BY created_at DESC`,
      [policyType],
    );
    return result.rows.map((r) => this.mapPolicy(r));
  }

  private mapPolicy(row: CommercialPolicyRow): CommercialPolicy {
    return {
      id: row.id,
      policyType: row.policy_type,
      rules: row.rules,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
