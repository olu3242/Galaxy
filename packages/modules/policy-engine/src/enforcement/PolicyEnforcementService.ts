import type { Pool } from 'pg';
import type { PolicyEnforcementLog, PolicyRuleOperator } from '../types.js';
import { PolicyRuleService } from '../rules/PolicyRuleService.js';

interface LogRow {
  id: string;
  organization_id: string;
  policy_id: string;
  rule_id: string | null;
  resource_type: string;
  resource_id: string;
  action: string;
  outcome: string;
  context: Record<string, unknown>;
  created_at: Date;
}

function rowToLog(row: LogRow): PolicyEnforcementLog {
  return {
    id: row.id,
    organizationId: row.organization_id,
    policyId: row.policy_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    action: row.action,
    outcome: row.outcome as PolicyEnforcementLog['outcome'],
    context: row.context,
    createdAt: row.created_at,
    ...(row.rule_id !== null ? { ruleId: row.rule_id } : {}),
  };
}

function evaluateOperator(
  operator: PolicyRuleOperator,
  fieldValue: unknown,
  ruleValue: unknown,
): boolean {
  switch (operator) {
    case 'equals':
      return fieldValue === ruleValue;
    case 'not_equals':
      return fieldValue !== ruleValue;
    case 'contains':
      return (
        typeof fieldValue === 'string' &&
        typeof ruleValue === 'string' &&
        fieldValue.includes(ruleValue)
      );
    case 'greater_than':
      return (
        typeof fieldValue === 'number' && typeof ruleValue === 'number' && fieldValue > ruleValue
      );
    case 'less_than':
      return (
        typeof fieldValue === 'number' && typeof ruleValue === 'number' && fieldValue < ruleValue
      );
    case 'in':
      return Array.isArray(ruleValue) && ruleValue.includes(fieldValue);
    case 'not_in':
      return Array.isArray(ruleValue) && !ruleValue.includes(fieldValue);
    default:
      return false;
  }
}

export interface EvaluationResult {
  outcome: 'allowed' | 'denied' | 'audited';
  reason?: string;
}

export class PolicyEnforcementService {
  private readonly ruleService: PolicyRuleService;

  constructor(private readonly pool: Pool) {
    this.ruleService = new PolicyRuleService(pool);
  }

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async evaluate(
    orgId: string,
    policyId: string,
    resourceType: string,
    resourceId: string,
    context: Record<string, unknown>,
  ): Promise<EvaluationResult> {
    await this.setTenantContext(orgId);

    const policyResult = await this.pool.query<{
      enforcement_mode: string;
      status: string;
    }>('SELECT enforcement_mode, status FROM policies WHERE organization_id = $1 AND id = $2', [
      orgId,
      policyId,
    ]);
    const policyRow = policyResult.rows[0];
    if (!policyRow) throw new Error('Policy not found');

    if (policyRow.status !== 'active' || policyRow.enforcement_mode === 'disabled') {
      await this.logEnforcement(
        orgId,
        policyId,
        null,
        resourceType,
        resourceId,
        'evaluate',
        'allowed',
        context,
      );
      return { outcome: 'allowed', reason: 'Policy not active or disabled' };
    }

    const rules = await this.ruleService.getRules(orgId, policyId);

    let matchedRuleId: string | null = null;
    let outcome: EvaluationResult['outcome'] = 'allowed';
    let reason: string | undefined;

    for (const rule of rules) {
      const fieldValue = context[rule.field];
      const matches = evaluateOperator(rule.operator, fieldValue, rule.value);
      if (matches) {
        matchedRuleId = rule.id;
        if (rule.action === 'deny') {
          outcome = policyRow.enforcement_mode === 'enforce' ? 'denied' : 'audited';
          reason = `Rule matched: field '${rule.field}' ${rule.operator} value`;
          break;
        } else if (rule.action === 'audit') {
          outcome = 'audited';
          reason = `Audit rule matched: field '${rule.field}'`;
        }
      }
    }

    await this.logEnforcement(
      orgId,
      policyId,
      matchedRuleId,
      resourceType,
      resourceId,
      'evaluate',
      outcome,
      context,
    );
    return { outcome, ...(reason !== undefined ? { reason } : {}) };
  }

  private async logEnforcement(
    orgId: string,
    policyId: string,
    ruleId: string | null,
    resourceType: string,
    resourceId: string,
    action: string,
    outcome: 'allowed' | 'denied' | 'audited',
    context: Record<string, unknown>,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO policy_enforcement_logs
         (organization_id, policy_id, rule_id, resource_type, resource_id, action, outcome, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orgId, policyId, ruleId, resourceType, resourceId, action, outcome, JSON.stringify(context)],
    );
  }

  async getEnforcementLog(
    orgId: string,
    policyId: string,
    limit?: number,
  ): Promise<PolicyEnforcementLog[]> {
    await this.setTenantContext(orgId);
    const effectiveLimit = limit ?? 50;
    const result = await this.pool.query<LogRow>(
      `SELECT * FROM policy_enforcement_logs
       WHERE organization_id = $1 AND policy_id = $2
       ORDER BY created_at DESC LIMIT $3`,
      [orgId, policyId, effectiveLimit],
    );
    return result.rows.map(rowToLog);
  }
}
