import type { Pool } from 'pg';
import type {
  Policy,
  PolicyRule,
  CreatePolicyInput,
  CreatePolicyRuleInput,
  PolicyType,
  PolicyStatus,
} from '../types.js';

interface PolicyRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  policy_type: string;
  status: string;
  config: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface PolicyRuleRow {
  id: string;
  policy_id: string;
  organization_id: string;
  name: string;
  condition: Record<string, unknown>;
  action: string;
  priority: number;
  is_active: boolean;
  created_at: string;
}

function mapPolicy(row: PolicyRow): Policy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    policyType: row.policy_type as PolicyType,
    status: row.status as PolicyStatus,
    config: row.config,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPolicyRule(row: PolicyRuleRow): PolicyRule {
  return {
    id: row.id,
    policyId: row.policy_id,
    organizationId: row.organization_id,
    name: row.name,
    condition: row.condition,
    action: row.action,
    priority: row.priority,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export class PolicyService {
  constructor(private readonly pool: Pool) {}

  async createPolicy(input: CreatePolicyInput): Promise<Policy> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    const result = await this.pool.query<PolicyRow>(
      `INSERT INTO governance_policies
        (organization_id, name, description, policy_type, status, config, created_by)
       VALUES ($1, $2, $3, $4, 'active', $5, $6)
       RETURNING *`,
      [
        input.organizationId,
        input.name,
        input.description ?? null,
        input.policyType,
        JSON.stringify(input.config ?? {}),
        input.createdBy,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Insert returned no row');
    return mapPolicy(row);
  }

  async getPolicy(organizationId: string, policyId: string): Promise<Policy | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const result = await this.pool.query<PolicyRow>(
      `SELECT * FROM governance_policies WHERE id = $1 AND organization_id = $2`,
      [policyId, organizationId],
    );

    return result.rows[0] ? mapPolicy(result.rows[0]) : null;
  }

  async listPolicies(
    organizationId: string,
    opts?: { policyType?: PolicyType; status?: PolicyStatus },
  ): Promise<Policy[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let idx = 2;

    if (opts?.policyType !== undefined) {
      conditions.push(`policy_type = $${String(idx)}`);
      params.push(opts.policyType);
      idx++;
    }
    if (opts?.status !== undefined) {
      conditions.push(`status = $${String(idx)}`);
      params.push(opts.status);
    }

    const result = await this.pool.query<PolicyRow>(
      `SELECT * FROM governance_policies WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params,
    );

    return result.rows.map(mapPolicy);
  }

  async updatePolicy(
    organizationId: string,
    policyId: string,
    updates: Partial<{
      name: string;
      description: string;
      status: PolicyStatus;
      config: Record<string, unknown>;
    }>,
  ): Promise<Policy | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      sets.push(`name = $${String(idx)}`);
      params.push(updates.name);
      idx++;
    }
    if (updates.description !== undefined) {
      sets.push(`description = $${String(idx)}`);
      params.push(updates.description);
      idx++;
    }
    if (updates.status !== undefined) {
      sets.push(`status = $${String(idx)}`);
      params.push(updates.status);
      idx++;
    }
    if (updates.config !== undefined) {
      sets.push(`config = $${String(idx)}`);
      params.push(JSON.stringify(updates.config));
      idx++;
    }

    params.push(policyId, organizationId);

    const result = await this.pool.query<PolicyRow>(
      `UPDATE governance_policies SET ${sets.join(', ')}
       WHERE id = $${String(idx)} AND organization_id = $${String(idx + 1)}
       RETURNING *`,
      params,
    );

    return result.rows[0] ? mapPolicy(result.rows[0]) : null;
  }

  async deletePolicy(organizationId: string, policyId: string): Promise<boolean> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const result = await this.pool.query(
      `DELETE FROM governance_policies WHERE id = $1 AND organization_id = $2`,
      [policyId, organizationId],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async createPolicyRule(input: CreatePolicyRuleInput): Promise<PolicyRule> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    const result = await this.pool.query<PolicyRuleRow>(
      `INSERT INTO policy_rules (policy_id, organization_id, name, condition, action, priority)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.policyId,
        input.organizationId,
        input.name,
        JSON.stringify(input.condition),
        input.action,
        input.priority ?? 0,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Insert returned no row');
    return mapPolicyRule(row);
  }

  async listPolicyRules(organizationId: string, policyId: string): Promise<PolicyRule[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const result = await this.pool.query<PolicyRuleRow>(
      `SELECT * FROM policy_rules WHERE policy_id = $1 AND organization_id = $2 ORDER BY priority ASC`,
      [policyId, organizationId],
    );

    return result.rows.map(mapPolicyRule);
  }

  async evaluatePolicy(
    organizationId: string,
    policyId: string,
    context: Record<string, unknown>,
  ): Promise<{ allowed: boolean; violations: string[] }> {
    const rules = await this.listPolicyRules(organizationId, policyId);
    const violations: string[] = [];

    for (const rule of rules) {
      if (!rule.isActive) continue;
      const cond: Record<string, unknown> = rule.condition;
      const field = cond.field as string | undefined;
      const operator = cond.operator as string | undefined;
      const value = cond.value;

      if (!field || !operator) continue;

      const contextValue = context[field];

      let passes = true;
      if (operator === 'equals') {
        passes = contextValue === value;
      } else if (operator === 'not_equals') {
        passes = contextValue !== value;
      } else if (operator === 'greater_than') {
        passes =
          typeof contextValue === 'number' && typeof value === 'number' && contextValue > value;
      } else if (operator === 'less_than') {
        passes =
          typeof contextValue === 'number' && typeof value === 'number' && contextValue < value;
      }

      if (!passes) {
        violations.push(
          `Rule "${rule.name}" violated: ${field} ${operator} ${JSON.stringify(value)}`,
        );
      }
    }

    return { allowed: violations.length === 0, violations };
  }
}
