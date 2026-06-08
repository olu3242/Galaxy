import type { Pool } from 'pg';
import type {
  AgentDecision,
  DecisionOutcome,
  DecisionRule,
  DecisionType,
  RuleCondition,
} from '../types.js';

interface DecisionRow {
  id: string;
  organization_id: string;
  agent_id: string;
  execution_id: string | null;
  decision_type: string;
  subject: string;
  context: Record<string, unknown>;
  outcome: string;
  confidence_score: string;
  reasoning: string;
  rule_ids: string[];
  requires_human_override: boolean;
  human_override_by: string | null;
  human_override_at: string | null;
  human_override_reason: string | null;
  correlation_id: string;
  created_at: string;
}

interface DecisionRuleRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  automation_domain: string;
  conditions: RuleCondition[];
  action: string;
  priority: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function rowToDecision(row: DecisionRow): AgentDecision {
  return {
    id: row.id,
    organizationId: row.organization_id,
    agentId: row.agent_id,
    decisionType: row.decision_type as DecisionType,
    subject: row.subject,
    context: row.context,
    outcome: row.outcome as DecisionOutcome,
    confidenceScore: parseFloat(row.confidence_score),
    reasoning: row.reasoning,
    ruleIds: row.rule_ids,
    requiresHumanOverride: row.requires_human_override,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    ...(row.execution_id !== null ? { executionId: row.execution_id } : {}),
    ...(row.human_override_by !== null ? { humanOverrideBy: row.human_override_by } : {}),
    ...(row.human_override_at !== null ? { humanOverrideAt: row.human_override_at } : {}),
    ...(row.human_override_reason !== null
      ? { humanOverrideReason: row.human_override_reason }
      : {}),
  };
}

function evaluateCondition(cond: RuleCondition, ctx: Record<string, unknown>): boolean {
  const actual = ctx[cond.field];
  switch (cond.operator) {
    case 'equals':
      return actual === cond.value;
    case 'not_equals':
      return actual !== cond.value;
    case 'gt':
      return typeof actual === 'number' && typeof cond.value === 'number' && actual > cond.value;
    case 'gte':
      return typeof actual === 'number' && typeof cond.value === 'number' && actual >= cond.value;
    case 'lt':
      return typeof actual === 'number' && typeof cond.value === 'number' && actual < cond.value;
    case 'lte':
      return typeof actual === 'number' && typeof cond.value === 'number' && actual <= cond.value;
    case 'contains':
      return (
        typeof actual === 'string' && typeof cond.value === 'string' && actual.includes(cond.value)
      );
    case 'exists':
      return actual !== undefined && actual !== null;
    default:
      return false;
  }
}

export class DecisionEngine {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async loadRules(organizationId: string, automationDomain?: string): Promise<DecisionRule[]> {
    await this.setTenantContext(organizationId);
    const conditions: string[] = ['organization_id = $1', 'is_active = true'];
    const params: unknown[] = [organizationId];
    if (automationDomain !== undefined) {
      conditions.push(`automation_domain = $2`);
      params.push(automationDomain);
    }
    const result = await this.pool.query<DecisionRuleRow>(
      `SELECT * FROM decision_rules WHERE ${conditions.join(' AND ')} ORDER BY priority DESC`,
      params,
    );
    return result.rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      name: r.name,
      automationDomain: r.automation_domain,
      conditions: r.conditions,
      action: r.action,
      priority: r.priority,
      isActive: r.is_active,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ...(r.description !== null ? { description: r.description } : {}),
    }));
  }

  evaluate(
    rules: DecisionRule[],
    context: Record<string, unknown>,
    riskScore: number,
  ): { outcome: DecisionOutcome; confidence: number; reasoning: string; matchedRuleIds: string[] } {
    const matched: DecisionRule[] = [];

    for (const rule of rules) {
      const allMatch = rule.conditions.every((c) => evaluateCondition(c, context));
      if (allMatch) matched.push(rule);
    }

    if (matched.length === 0) {
      if (riskScore >= 70) {
        return {
          outcome: 'escalated',
          confidence: 60,
          reasoning: 'No matching rules; high risk score requires escalation',
          matchedRuleIds: [],
        };
      }
      return {
        outcome: 'deferred',
        confidence: 50,
        reasoning: 'No matching rules found; deferring to default handling',
        matchedRuleIds: [],
      };
    }

    const topRule = matched[0];
    if (!topRule) throw new Error('Matched rules array is unexpectedly empty');
    const outcome = topRule.action as DecisionOutcome;
    const confidence = Math.min(95, 70 + matched.length * 5);

    const reasoning = matched.map((r) => `Rule '${r.name}' matched`).join('; ');

    return { outcome, confidence, reasoning, matchedRuleIds: matched.map((r) => r.id) };
  }

  async recordDecision(
    organizationId: string,
    agentId: string,
    decisionType: DecisionType,
    subject: string,
    context: Record<string, unknown>,
    outcome: DecisionOutcome,
    confidenceScore: number,
    reasoning: string,
    ruleIds: string[],
    correlationId: string,
    executionId?: string,
  ): Promise<AgentDecision> {
    await this.setTenantContext(organizationId);

    const requiresHumanOverride = confidenceScore < 60 || outcome === 'escalated';

    const result = await this.pool.query<DecisionRow>(
      `INSERT INTO decisions
         (organization_id, agent_id, execution_id, decision_type, subject,
          context, outcome, confidence_score, reasoning, rule_ids,
          requires_human_override, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        organizationId,
        agentId,
        executionId ?? null,
        decisionType,
        subject,
        JSON.stringify(context),
        outcome,
        confidenceScore.toFixed(2),
        reasoning,
        ruleIds,
        requiresHumanOverride,
        correlationId,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO decisions returned no row');
    return rowToDecision(row);
  }

  async applyHumanOverride(
    organizationId: string,
    decisionId: string,
    actorId: string,
    outcome: DecisionOutcome,
    reason: string,
  ): Promise<AgentDecision> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<DecisionRow>(
      `UPDATE decisions
       SET outcome = $3, human_override_by = $4, human_override_at = NOW(),
           human_override_reason = $5, requires_human_override = false
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [organizationId, decisionId, outcome, actorId, reason],
    );

    const row = result.rows[0];
    if (!row) throw new Error(`Decision not found: ${decisionId}`);
    return rowToDecision(row);
  }

  async listDecisions(
    organizationId: string,
    opts?: { agentId?: string; requiresHumanOverride?: boolean; limit?: number },
  ): Promise<AgentDecision[]> {
    await this.setTenantContext(organizationId);
    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let idx = 2;
    if (opts?.agentId !== undefined) {
      conditions.push(`agent_id = $${String(idx)}`);
      params.push(opts.agentId);
      idx++;
    }
    if (opts?.requiresHumanOverride !== undefined) {
      conditions.push(`requires_human_override = $${String(idx)}`);
      params.push(opts.requiresHumanOverride);
      idx++;
    }
    params.push(opts?.limit ?? 50);
    const result = await this.pool.query<DecisionRow>(
      `SELECT * FROM decisions WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC LIMIT $${String(idx)}`,
      params,
    );
    return result.rows.map(rowToDecision);
  }

  async createRule(
    organizationId: string,
    input: {
      name: string;
      description?: string;
      automationDomain: string;
      conditions: RuleCondition[];
      action: string;
      priority?: number;
      createdBy: string;
    },
  ): Promise<DecisionRule> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<DecisionRuleRow>(
      `INSERT INTO decision_rules
         (organization_id, name, description, automation_domain, conditions, action, priority, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        organizationId,
        input.name,
        input.description ?? null,
        input.automationDomain,
        JSON.stringify(input.conditions),
        input.action,
        input.priority ?? 0,
        input.createdBy,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO decision_rules returned no row');
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      automationDomain: row.automation_domain,
      conditions: row.conditions,
      action: row.action,
      priority: row.priority,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.description !== null ? { description: row.description } : {}),
    };
  }
}
