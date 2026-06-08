import type { Pool } from 'pg';
import type { RiskAssessment, RiskFactor, RiskLevel } from '../types.js';

interface RiskAssessmentRow {
  id: string;
  organization_id: string;
  agent_id: string;
  execution_id: string | null;
  subject_type: string;
  subject_id: string;
  risk_score: string;
  risk_level: string;
  risk_factors: RiskFactor[];
  recommended_action: string | null;
  correlation_id: string;
  created_at: string;
}

function scoreToLevel(score: number): RiskLevel {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

function rowToAssessment(row: RiskAssessmentRow): RiskAssessment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    agentId: row.agent_id,
    subjectType: row.subject_type as RiskAssessment['subjectType'],
    subjectId: row.subject_id,
    riskScore: parseFloat(row.risk_score),
    riskLevel: row.risk_level as RiskLevel,
    riskFactors: row.risk_factors,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    ...(row.execution_id !== null ? { executionId: row.execution_id } : {}),
    ...(row.recommended_action !== null ? { recommendedAction: row.recommended_action } : {}),
  };
}

export class RiskScoringEngine {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  computeFactors(subject: Record<string, unknown>): RiskFactor[] {
    const factors: RiskFactor[] = [];

    const amount = typeof subject.amount === 'number' ? subject.amount : 0;
    if (amount > 10000) {
      factors.push({
        name: 'high_value',
        weight: 0.4,
        score: Math.min(100, amount / 200),
        detail: `Amount $${String(amount)} exceeds $10k threshold`,
      });
    } else if (amount > 2500) {
      factors.push({
        name: 'medium_value',
        weight: 0.3,
        score: 50,
        detail: `Amount $${String(amount)} exceeds $2.5k threshold`,
      });
    }

    const slaDueAt = typeof subject.slaDueAt === 'string' ? subject.slaDueAt : null;
    if (slaDueAt) {
      const hoursRemaining = (new Date(slaDueAt).getTime() - Date.now()) / 3_600_000;
      if (hoursRemaining < 0) {
        factors.push({
          name: 'sla_breached',
          weight: 0.35,
          score: 100,
          detail: 'SLA already breached',
        });
      } else if (hoursRemaining < 4) {
        factors.push({
          name: 'sla_critical',
          weight: 0.35,
          score: 80,
          detail: `SLA breach in ${hoursRemaining.toFixed(1)}h`,
        });
      } else if (hoursRemaining < 24) {
        factors.push({
          name: 'sla_warning',
          weight: 0.2,
          score: 50,
          detail: `SLA breach in ${hoursRemaining.toFixed(1)}h`,
        });
      }
    }

    const domain = typeof subject.automationDomain === 'string' ? subject.automationDomain : '';
    if (domain === 'finance' || domain === 'governance' || domain === 'executive') {
      factors.push({
        name: 'sensitive_domain',
        weight: 0.25,
        score: 60,
        detail: `Domain '${domain}' requires elevated scrutiny`,
      });
    }

    if (subject.escalated === true) {
      factors.push({
        name: 'escalation_history',
        weight: 0.2,
        score: 70,
        detail: 'Previously escalated item',
      });
    }

    return factors;
  }

  scoreFromFactors(factors: RiskFactor[]): number {
    if (factors.length === 0) return 0;
    const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
    const weightedScore = factors.reduce((s, f) => s + f.score * f.weight, 0);
    return Math.min(100, totalWeight > 0 ? weightedScore / totalWeight : 0);
  }

  async assessRisk(
    organizationId: string,
    agentId: string,
    subject: {
      subjectType: RiskAssessment['subjectType'];
      subjectId: string;
      data: Record<string, unknown>;
    },
    correlationId: string,
    executionId?: string,
  ): Promise<RiskAssessment> {
    await this.setTenantContext(organizationId);

    const factors = this.computeFactors(subject.data);
    const riskScore = this.scoreFromFactors(factors);
    const riskLevel = scoreToLevel(riskScore);

    const recommendedAction =
      riskLevel === 'critical'
        ? 'Escalate immediately to executive team'
        : riskLevel === 'high'
          ? 'Require senior manager approval'
          : riskLevel === 'medium'
            ? 'Flag for human review'
            : null;

    const result = await this.pool.query<RiskAssessmentRow>(
      `INSERT INTO risk_assessments
         (organization_id, agent_id, execution_id, subject_type, subject_id,
          risk_score, risk_level, risk_factors, recommended_action, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        organizationId,
        agentId,
        executionId ?? null,
        subject.subjectType,
        subject.subjectId,
        riskScore.toFixed(2),
        riskLevel,
        JSON.stringify(factors),
        recommendedAction,
        correlationId,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO risk_assessments returned no row');
    return rowToAssessment(row);
  }

  async listAssessments(
    organizationId: string,
    opts?: { riskLevel?: RiskLevel; limit?: number },
  ): Promise<RiskAssessment[]> {
    await this.setTenantContext(organizationId);
    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let idx = 2;
    if (opts?.riskLevel !== undefined) {
      conditions.push(`risk_level = $${String(idx)}`);
      params.push(opts.riskLevel);
      idx++;
    }
    params.push(opts?.limit ?? 50);
    const result = await this.pool.query<RiskAssessmentRow>(
      `SELECT * FROM risk_assessments WHERE ${conditions.join(' AND ')}
       ORDER BY risk_score DESC, created_at DESC LIMIT $${String(idx)}`,
      params,
    );
    return result.rows.map(rowToAssessment);
  }
}
