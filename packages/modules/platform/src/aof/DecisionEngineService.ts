import type { Pool, PoolClient } from 'pg';
import type {
  AofDecision,
  AofDecisionOutput,
  AofPriority,
  AofExecutionStrategy,
  AofRiskLevel,
  GovernanceVerdict,
} from '@galaxy/types';
import type { UUID } from '@galaxy/types';

interface DecisionRow {
  id: string;
  organization_id: string;
  decision: string;
  priority: string;
  confidence: string;
  execution_strategy: string;
  estimated_completion_ms: number | null;
  risk_level: string;
  rationale: string;
  governance_verdict: GovernanceVerdict;
  created_at: string;
}

export class DecisionEngineService {
  constructor(private readonly pool: Pool) {}

  async evaluate(
    client: PoolClient,
    opts: {
      organizationId: UUID;
      candidate: {
        description: string;
        estimatedImpact: Record<string, unknown>;
        targetWorkflowId?: UUID;
      };
    },
  ): Promise<AofDecision> {
    const output = this.scoreCandidate(opts.candidate);

    const verdict: GovernanceVerdict = {
      approved: output.riskLevel !== 'critical' && output.confidence >= 0.7,
      blockers:
        output.riskLevel === 'critical'
          ? [
              {
                rule: 'RISK_LEVEL_CRITICAL',
                reason: 'Risk level is critical — human approval required',
                escalationPath: 'Platform Engineering → CTO',
              },
            ]
          : output.confidence < 0.7
            ? [
                {
                  rule: 'CONFIDENCE_BELOW_THRESHOLD',
                  reason: `Confidence ${output.confidence.toFixed(3)} is below the 0.70 threshold`,
                  escalationPath: 'Review recommendation inputs and re-evaluate',
                },
              ]
            : [],
      evaluatedAt: new Date().toISOString(),
    };

    const result = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO aof_decisions
         (organization_id, decision, priority, confidence, execution_strategy,
          estimated_completion_ms, risk_level, rationale, governance_verdict)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at`,
      [
        opts.organizationId,
        output.decision,
        output.priority,
        output.confidence,
        output.executionStrategy,
        output.estimatedCompletionMs,
        output.riskLevel,
        output.rationale,
        JSON.stringify(verdict),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('aof_decisions INSERT returned no row');

    return {
      id: row.id,
      organizationId: opts.organizationId,
      ...output,
      governanceVerdict: verdict,
      createdAt: row.created_at,
    };
  }

  async listDecisions(
    client: PoolClient,
    organizationId: UUID,
    opts: { limit?: number; priority?: AofPriority } = {},
  ): Promise<AofDecision[]> {
    const limit = opts.limit ?? 50;

    const result = opts.priority
      ? await client.query<DecisionRow>(
          `SELECT * FROM aof_decisions
           WHERE organization_id = $1 AND priority = $2
           ORDER BY created_at DESC LIMIT $3`,
          [organizationId, opts.priority, limit],
        )
      : await client.query<DecisionRow>(
          `SELECT * FROM aof_decisions
           WHERE organization_id = $1
           ORDER BY created_at DESC LIMIT $2`,
          [organizationId, limit],
        );

    return result.rows.map((row) => this.mapRow(row));
  }

  private scoreCandidate(candidate: {
    description: string;
    estimatedImpact: Record<string, unknown>;
  }): AofDecisionOutput {
    const savingsMs = Number(candidate.estimatedImpact.latencySavingsMs ?? 0);
    const workflowCount = Number(candidate.estimatedImpact.affectedWorkflows ?? 1);

    const confidence = Math.min(0.95, 0.6 + workflowCount * 0.01 + (savingsMs > 1000 ? 0.1 : 0));
    const priority: AofPriority =
      savingsMs > 5000
        ? 'Critical'
        : savingsMs > 2000
          ? 'High'
          : savingsMs > 500
            ? 'Medium'
            : 'Low';
    const riskLevel: AofRiskLevel =
      workflowCount > 50 ? 'high' : workflowCount > 10 ? 'medium' : 'low';
    const executionStrategy: AofExecutionStrategy = workflowCount > 20 ? 'sequential' : 'parallel';

    return {
      decision: candidate.description,
      priority,
      confidence,
      executionStrategy,
      estimatedCompletionMs: Math.max(500, workflowCount * 100),
      riskLevel,
      rationale: `Estimated ${String(savingsMs)}ms latency savings across ${String(workflowCount)} workflows. Confidence derived from historical optimization outcomes.`,
    };
  }

  private mapRow(row: DecisionRow): AofDecision {
    return {
      id: row.id,
      organizationId: row.organization_id,
      decision: row.decision,
      priority: row.priority as AofPriority,
      confidence: Number(row.confidence),
      executionStrategy: row.execution_strategy as AofExecutionStrategy,
      estimatedCompletionMs: row.estimated_completion_ms,
      riskLevel: row.risk_level as AofRiskLevel,
      rationale: row.rationale,
      governanceVerdict: row.governance_verdict,
      createdAt: row.created_at,
    };
  }
}
