import type { Pool } from 'pg';
import type { RiskIndicator, RiskLevel } from '../types.js';

interface RiskIndicatorRow {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  level: string;
  affected_entity_id: string | null;
  affected_entity_type: string | null;
  signals: Record<string, unknown>;
  detected_at: string;
  resolved_at: string | null;
  created_at: string;
}

function rowToRisk(row: RiskIndicatorRow): RiskIndicator {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    level: row.level as RiskLevel,
    affectedEntityId: row.affected_entity_id,
    affectedEntityType: row.affected_entity_type,
    signals: row.signals,
    detectedAt: row.detected_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

export class RiskDetectionService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async detectRisks(organizationId: string): Promise<RiskIndicator[]> {
    await this.setTenantContext(organizationId);

    const [workflowResult, approvalResult] = await Promise.all([
      this.pool.query<{ count: string }>(
        "SELECT COUNT(*) as count FROM workflows WHERE organization_id = $1 AND status = 'failed'",
        [organizationId],
      ),
      this.pool.query<{ count: string }>(
        "SELECT COUNT(*) as count FROM approvals WHERE organization_id = $1 AND status = 'rejected' AND created_at > NOW() - INTERVAL '7 days'",
        [organizationId],
      ),
    ]);

    const risks: RiskIndicator[] = [];
    const failedWorkflows = parseInt(workflowResult.rows[0]?.count ?? '0', 10);
    const rejectedApprovals = parseInt(approvalResult.rows[0]?.count ?? '0', 10);

    if (failedWorkflows > 5) {
      const r = await this.flagRiskIndicators(organizationId, {
        name: 'High workflow failure rate',
        description: `${failedWorkflows} workflows have failed`,
        level: failedWorkflows > 20 ? 'critical' : 'high',
        signals: { failedWorkflows },
      });
      risks.push(r);
    }

    if (rejectedApprovals > 10) {
      const r = await this.flagRiskIndicators(organizationId, {
        name: 'High approval rejection rate',
        description: `${rejectedApprovals} approvals rejected in the last 7 days`,
        level: 'medium',
        signals: { rejectedApprovals },
      });
      risks.push(r);
    }

    return risks;
  }

  assessRiskLevel(signals: Record<string, unknown>): RiskLevel {
    const score = typeof signals['score'] === 'number' ? signals['score'] : 0;
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  async flagRiskIndicators(
    organizationId: string,
    input: {
      name: string;
      description: string;
      level: RiskLevel;
      signals: Record<string, unknown>;
      affectedEntityId?: string;
      affectedEntityType?: string;
    },
  ): Promise<RiskIndicator> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<RiskIndicatorRow>(
      `INSERT INTO risk_indicators
         (organization_id, name, description, level, affected_entity_id, affected_entity_type, signals, detected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        organizationId,
        input.name,
        input.description,
        input.level,
        input.affectedEntityId ?? null,
        input.affectedEntityType ?? null,
        JSON.stringify(input.signals),
      ],
    );

    return rowToRisk(result.rows[0]!);
  }

  async listRisks(organizationId: string, level?: RiskLevel): Promise<RiskIndicator[]> {
    await this.setTenantContext(organizationId);

    const conditions = ['organization_id = $1', 'resolved_at IS NULL'];
    const params: unknown[] = [organizationId];

    if (level) {
      conditions.push('level = $2');
      params.push(level);
    }

    const result = await this.pool.query<RiskIndicatorRow>(
      `SELECT * FROM risk_indicators WHERE ${conditions.join(' AND ')} ORDER BY detected_at DESC`,
      params,
    );

    return result.rows.map(rowToRisk);
  }
}
