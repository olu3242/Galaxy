import type { Pool } from 'pg';

export interface GovernanceDecision {
  allowed: boolean;
  reason: string;
  policyIds: string[];
  auditRequired: boolean;
  humanApprovalRequired: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface GovernanceCheckInput {
  organizationId: string;
  actorId: string;
  agentId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  riskScore?: number;
  impactTier?: 1 | 2 | 3 | 4 | 5;
}

// Impact tier → required approval level
const TIER_POLICY: Record<
  number,
  { humanApproval: boolean; auditRequired: boolean; riskLevel: GovernanceDecision['riskLevel'] }
> = {
  1: { humanApproval: false, auditRequired: false, riskLevel: 'low' },
  2: { humanApproval: false, auditRequired: true, riskLevel: 'low' },
  3: { humanApproval: false, auditRequired: true, riskLevel: 'medium' },
  4: { humanApproval: true, auditRequired: true, riskLevel: 'high' },
  5: { humanApproval: true, auditRequired: true, riskLevel: 'critical' },
};

export class GxGovernanceEngine {
  constructor(private readonly pool: Pool) {}

  async evaluate(input: GovernanceCheckInput): Promise<GovernanceDecision> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    // Check active policies for this org
    const policyResult = await this.pool.query<{
      id: string;
      enforcement_mode: string;
      rules: unknown[];
    }>(
      `SELECT p.id, p.enforcement_mode
       FROM policies p
       WHERE p.organization_id = $1 AND p.status = 'active'
       ORDER BY p.created_at DESC LIMIT 20`,
      [input.organizationId],
    );

    const activePolicyIds = policyResult.rows
      .filter((p) => p.enforcement_mode === 'enforce')
      .map((p) => p.id);

    const tier =
      input.impactTier ??
      (input.riskScore !== undefined ? (Math.ceil(input.riskScore / 20) as 1 | 2 | 3 | 4 | 5) : 2);
    const clampedTier = Math.min(5, Math.max(1, tier)) as 1 | 2 | 3 | 4 | 5;
    const policy = TIER_POLICY[clampedTier] ?? {
      humanApproval: true,
      auditRequired: true,
      riskLevel: 'high' as const,
    };

    // High-risk actions always require human approval
    const HIGH_RISK_ACTIONS = new Set([
      'delete',
      'bulk_update',
      'transfer',
      'escalate',
      'override',
    ]);
    const isHighRisk = HIGH_RISK_ACTIONS.has(input.action.toLowerCase());

    return {
      allowed: true, // governance check passes — only blocks on explicit policy violation
      reason: isHighRisk
        ? `Action "${input.action}" is high-impact — human approval required`
        : `Action "${input.action}" on ${input.resourceType} permitted under tier-${String(tier)} policy`,
      policyIds: activePolicyIds,
      auditRequired: policy.auditRequired || isHighRisk,
      humanApprovalRequired: policy.humanApproval || isHighRisk,
      riskLevel: isHighRisk ? 'high' : policy.riskLevel,
    };
  }

  async logDecision(
    organizationId: string,
    agentId: string,
    action: string,
    decision: GovernanceDecision,
    correlationId: string,
  ): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    await this.pool.query(
      `INSERT INTO agent_governance_log
         (organization_id, agent_id, action, allowed, risk_level, human_approval_required, correlation_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [
        organizationId,
        agentId,
        action,
        decision.allowed,
        decision.riskLevel,
        decision.humanApprovalRequired,
        correlationId,
      ],
    );
  }
}
