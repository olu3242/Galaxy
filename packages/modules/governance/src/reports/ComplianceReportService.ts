import type { Pool } from 'pg';
import type { ComplianceReport, AuditExport, AuditExportEntry } from '../types.js';

interface ComplianceReportRow {
  id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  total_checks: number;
  passed: number;
  failed: number;
  warnings: number;
  summary: Record<string, unknown>;
  generated_by: string;
  generated_at: string;
}

interface AuditLogRow {
  id: string;
  actor_id: string;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

function mapReport(row: ComplianceReportRow): ComplianceReport {
  return {
    id: row.id,
    organizationId: row.organization_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    totalChecks: row.total_checks,
    passed: row.passed,
    failed: row.failed,
    warnings: row.warnings,
    summary: row.summary,
    generatedBy: row.generated_by,
    generatedAt: row.generated_at,
  };
}

export class ComplianceReportService {
  constructor(private readonly pool: Pool) {}

  async generateReport(
    organizationId: string,
    periodStart: string,
    periodEnd: string,
    generatedBy: string,
  ): Promise<ComplianceReport> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const checksResult = await this.pool.query<{
      status: string;
      check_type: string;
      cnt: string;
    }>(
      `SELECT status, check_type, COUNT(*) as cnt
       FROM compliance_checks
       WHERE organization_id = $1
         AND run_at >= $2::timestamptz
         AND run_at <= $3::timestamptz
       GROUP BY status, check_type`,
      [organizationId, periodStart, periodEnd],
    );

    let passed = 0;
    let failed = 0;
    let warnings = 0;
    const checkTypeSummary: Record<string, Record<string, number>> = {};

    for (const row of checksResult.rows) {
      const cnt = parseInt(row.cnt, 10);
      if (row.status === 'pass') passed += cnt;
      else if (row.status === 'fail') failed += cnt;
      else if (row.status === 'warning') warnings += cnt;

      checkTypeSummary[row.check_type] ??= {};
      const typeEntry = checkTypeSummary[row.check_type];
      if (typeEntry) {
        typeEntry[row.status] = cnt;
      }
    }

    const totalChecks = passed + failed + warnings;

    const result = await this.pool.query<ComplianceReportRow>(
      `INSERT INTO compliance_reports
        (organization_id, period_start, period_end, total_checks, passed, failed, warnings, summary, generated_by)
       VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        organizationId,
        periodStart,
        periodEnd,
        totalChecks,
        passed,
        failed,
        warnings,
        JSON.stringify({ checkTypeSummary }),
        generatedBy,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO compliance_reports returned no row');
    return mapReport(row);
  }

  async getReport(organizationId: string, reportId: string): Promise<ComplianceReport | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const result = await this.pool.query<ComplianceReportRow>(
      `SELECT * FROM compliance_reports WHERE id = $1 AND organization_id = $2`,
      [reportId, organizationId],
    );

    return result.rows[0] ? mapReport(result.rows[0]) : null;
  }

  async listReports(
    organizationId: string,
    opts?: { limit?: number },
  ): Promise<ComplianceReport[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const params: unknown[] = [organizationId];
    const limitClause = opts?.limit !== undefined ? ' LIMIT $2' : '';
    if (opts?.limit !== undefined) params.push(opts.limit);

    const result = await this.pool.query<ComplianceReportRow>(
      `SELECT * FROM compliance_reports WHERE organization_id = $1 ORDER BY generated_at DESC${limitClause}`,
      params,
    );

    return result.rows.map(mapReport);
  }

  async exportAuditTrail(
    organizationId: string,
    periodStart: string,
    periodEnd: string,
    exportedBy: string,
  ): Promise<AuditExport> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const result = await this.pool.query<AuditLogRow>(
      `SELECT id, actor_id, actor_type, action, resource_type, resource_id, metadata, created_at
       FROM audit_logs
       WHERE organization_id = $1
         AND created_at >= $2::timestamptz
         AND created_at <= $3::timestamptz
       ORDER BY created_at ASC`,
      [organizationId, periodStart, periodEnd],
    );

    const entries: AuditExportEntry[] = result.rows.map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      actorType: row.actor_type,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));

    return {
      organizationId,
      periodStart,
      periodEnd,
      entries,
      exportedAt: new Date().toISOString(),
      exportedBy,
    };
  }
}
