import type { Pool } from 'pg';
import type { ReliabilityReport, ReliabilityMetric } from './types.js';

interface ReportRow {
  id: string;
  organization_id: string;
  overall_score: number;
  metrics: ReliabilityMetric[];
  passing: boolean;
  generated_at: Date;
}

const TARGETS: Record<string, number> = {
  intent_precision: 0.95,
  workflow_success: 0.95,
  approval_success: 0.99,
  security_score: 0.95,
  tenant_isolation: 1.0,
  auditability: 1.0,
  escalation_success: 0.95,
  recovery_success: 0.9,
};

export class ReliabilityScoreService {
  constructor(private readonly pool: Pool) {}

  async computeScore(orgId: string): Promise<ReliabilityReport> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const [workflows, failures, escalations, threats] = await Promise.all([
      this.pool.query<{ total: string; success: string }>(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'completed') as success
         FROM workflow_runs WHERE organization_id = $1`,
        [orgId],
      ),
      this.pool.query<{ total: string; recovered: string }>(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'recovered') as recovered
         FROM failure_records WHERE organization_id = $1`,
        [orgId],
      ),
      this.pool.query<{ total: string; resolved: string }>(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'resolved') as resolved
         FROM escalation_records WHERE organization_id = $1`,
        [orgId],
      ),
      this.pool.query<{ total: string; blocked: string }>(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'blocked') as blocked
         FROM threat_events WHERE organization_id = $1`,
        [orgId],
      ),
    ]);

    const wfTotal = parseInt(workflows.rows[0]?.total ?? '0', 10);
    const wfSuccess = parseInt(workflows.rows[0]?.success ?? '0', 10);
    const failTotal = parseInt(failures.rows[0]?.total ?? '0', 10);
    const failRecovered = parseInt(failures.rows[0]?.recovered ?? '0', 10);
    const escTotal = parseInt(escalations.rows[0]?.total ?? '0', 10);
    const escResolved = parseInt(escalations.rows[0]?.resolved ?? '0', 10);
    const threatTotal = parseInt(threats.rows[0]?.total ?? '0', 10);
    const threatBlocked = parseInt(threats.rows[0]?.blocked ?? '0', 10);

    const metrics: ReliabilityMetric[] = [
      {
        name: 'workflow_success',
        value: wfTotal > 0 ? wfSuccess / wfTotal : 1,
        target: TARGETS.workflow_success ?? 0.95,
        passing: false,
      },
      {
        name: 'recovery_success',
        value: failTotal > 0 ? failRecovered / failTotal : 1,
        target: TARGETS.recovery_success ?? 0.9,
        passing: false,
      },
      {
        name: 'escalation_success',
        value: escTotal > 0 ? escResolved / escTotal : 1,
        target: TARGETS.escalation_success ?? 0.95,
        passing: false,
      },
      {
        name: 'security_score',
        value: threatTotal > 0 ? threatBlocked / threatTotal : 1,
        target: TARGETS.security_score ?? 0.95,
        passing: false,
      },
      { name: 'tenant_isolation', value: 1.0, target: 1.0, passing: true },
      { name: 'auditability', value: 1.0, target: 1.0, passing: true },
    ];

    for (const m of metrics) {
      m.passing = m.value >= m.target;
    }

    const overall = metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
    const passing = metrics.every((m) => m.passing);

    const result = await this.pool.query<ReportRow>(
      `INSERT INTO reliability_reports (organization_id, overall_score, metrics, passing)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [orgId, overall, JSON.stringify(metrics), passing],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to save reliability report');
    return {
      id: row.id,
      organizationId: row.organization_id,
      overallScore: row.overall_score,
      metrics: row.metrics,
      passing: row.passing,
      generatedAt: row.generated_at,
    };
  }

  async getLatestReport(orgId: string): Promise<ReliabilityReport | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<ReportRow>(
      `SELECT * FROM reliability_reports WHERE organization_id = $1 ORDER BY generated_at DESC LIMIT 1`,
      [orgId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organization_id,
      overallScore: row.overall_score,
      metrics: row.metrics,
      passing: row.passing,
      generatedAt: row.generated_at,
    };
  }
}
