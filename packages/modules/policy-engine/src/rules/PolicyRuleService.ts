import type { Pool } from 'pg';
import type { PolicyRule, PolicyRuleOperator } from '../types.js';

interface RuleRow {
  id: string;
  organization_id: string;
  policy_id: string;
  field: string;
  operator: string;
  value: unknown;
  action: string;
  priority: number;
  created_at: Date;
}

function rowToRule(row: RuleRow): PolicyRule {
  return {
    id: row.id,
    organizationId: row.organization_id,
    policyId: row.policy_id,
    field: row.field,
    operator: row.operator as PolicyRuleOperator,
    value: row.value,
    action: row.action,
    priority: row.priority,
    createdAt: row.created_at,
  };
}

export class PolicyRuleService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async addRule(
    orgId: string,
    policyId: string,
    field: string,
    operator: PolicyRuleOperator,
    value: unknown,
    action: string,
    priority?: number,
  ): Promise<PolicyRule> {
    await this.setTenantContext(orgId);
    const effectivePriority = priority ?? 0;
    const result = await this.pool.query<RuleRow>(
      `INSERT INTO policy_rules (organization_id, policy_id, field, operator, value, action, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [orgId, policyId, field, operator, JSON.stringify(value), action, effectivePriority],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to add policy rule');
    return rowToRule(row);
  }

  async getRules(orgId: string, policyId: string): Promise<PolicyRule[]> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<RuleRow>(
      'SELECT * FROM policy_rules WHERE organization_id = $1 AND policy_id = $2 ORDER BY priority ASC, created_at ASC',
      [orgId, policyId],
    );
    return result.rows.map(rowToRule);
  }

  async deleteRule(orgId: string, ruleId: string): Promise<void> {
    await this.setTenantContext(orgId);
    await this.pool.query(
      'DELETE FROM policy_rules WHERE organization_id = $1 AND id = $2',
      [orgId, ruleId],
    );
  }
}
