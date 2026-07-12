import type { Pool } from 'pg';
import type { ApprovalRule, ApprovalMatrixEvaluation, ApprovalTier } from '../types/index.js';

interface ApprovalRuleRow {
  id: string;
  organization_id: string;
  workflow_type: string | null;
  department_id: string | null;
  min_amount: number | null;
  max_amount: number | null;
  min_risk_score: number | null;
  max_risk_score: number | null;
  required_role: string;
  tier: number;
  requires_multiple_approvers: boolean;
  approver_count: number;
  escalation_after_hours: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface EvaluateInput {
  organizationId: string;
  workflowType?: string;
  departmentId?: string;
  amount?: number;
  riskScore?: number;
}

export class ApprovalMatrixService {
  constructor(private readonly pool: Pool) {}

  async evaluate(input: EvaluateInput): Promise<ApprovalMatrixEvaluation | null> {
    await this.setTenant(input.organizationId);

    const result = await this.pool.query<ApprovalRuleRow>(
      `SELECT * FROM approval_rules
       WHERE organization_id = $1
         AND is_active = true
         AND (workflow_type IS NULL OR workflow_type = $2)
         AND (department_id IS NULL OR department_id = $3)
         AND (min_amount IS NULL OR $4::numeric >= min_amount)
         AND (max_amount IS NULL OR $4::numeric <= max_amount)
         AND (min_risk_score IS NULL OR $5::numeric >= min_risk_score)
         AND (max_risk_score IS NULL OR $5::numeric <= max_risk_score)
       ORDER BY tier DESC`,
      [
        input.organizationId,
        input.workflowType ?? null,
        input.departmentId ?? null,
        input.amount ?? null,
        input.riskScore ?? null,
      ],
    );

    if (result.rows.length === 0) return null;

    const rules = result.rows.map((r) => this.mapRow(r));
    const topRule = rules[0];
    if (!topRule) return null;

    const requiredApprovers = await this.findApprovers(
      input.organizationId,
      topRule.requiredRole,
      topRule.approverCount,
    );

    const escalationDeadline = new Date(
      Date.now() + topRule.escalationAfterHours * 3_600_000,
    ).toISOString();

    return {
      tier: topRule.tier,
      requiredApprovers,
      rules,
      escalationDeadline,
    };
  }

  async upsertRule(
    organizationId: string,
    rule: Omit<ApprovalRule, 'id' | 'organizationId' | 'isActive' | 'createdAt' | 'updatedAt'>,
  ): Promise<ApprovalRule> {
    await this.setTenant(organizationId);

    const result = await this.pool.query<ApprovalRuleRow>(
      `INSERT INTO approval_rules
         (organization_id, workflow_type, department_id, min_amount, max_amount,
          min_risk_score, max_risk_score, required_role, tier,
          requires_multiple_approvers, approver_count, escalation_after_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (organization_id, workflow_type, tier)
       DO UPDATE SET
         required_role = EXCLUDED.required_role,
         requires_multiple_approvers = EXCLUDED.requires_multiple_approvers,
         approver_count = EXCLUDED.approver_count,
         escalation_after_hours = EXCLUDED.escalation_after_hours,
         updated_at = NOW()
       RETURNING *`,
      [
        organizationId,
        rule.workflowType ?? null,
        rule.departmentId ?? null,
        rule.minAmount ?? null,
        rule.maxAmount ?? null,
        rule.minRiskScore ?? null,
        rule.maxRiskScore ?? null,
        rule.requiredRole,
        rule.tier,
        rule.requiresMultipleApprovers,
        rule.approverCount,
        rule.escalationAfterHours,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to upsert approval rule');
    return this.mapRow(row);
  }

  private async findApprovers(
    organizationId: string,
    requiredRole: string,
    count: number,
  ): Promise<string[]> {
    const result = await this.pool.query<{ user_id: string }>(
      `SELECT m.user_id FROM memberships m
       JOIN org_roles r ON r.id = m.role_id
       WHERE m.organization_id = $1
         AND r.name = $2
         AND m.status = 'active'
         AND r.is_active = true
       LIMIT $3`,
      [organizationId, requiredRole, count],
    );
    return result.rows.map((r) => r.user_id);
  }

  private async setTenant(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  private mapRow(row: ApprovalRuleRow): ApprovalRule {
    const rule: ApprovalRule = {
      id: row.id,
      organizationId: row.organization_id,
      requiredRole: row.required_role,
      tier: row.tier as ApprovalTier,
      requiresMultipleApprovers: row.requires_multiple_approvers,
      approverCount: row.approver_count,
      escalationAfterHours: row.escalation_after_hours,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (row.workflow_type !== null) rule.workflowType = row.workflow_type;
    if (row.department_id !== null) rule.departmentId = row.department_id;
    if (row.min_amount !== null) rule.minAmount = row.min_amount;
    if (row.max_amount !== null) rule.maxAmount = row.max_amount;
    if (row.min_risk_score !== null) rule.minRiskScore = row.min_risk_score;
    if (row.max_risk_score !== null) rule.maxRiskScore = row.max_risk_score;
    return rule;
  }
}
