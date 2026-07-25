import type { Pool } from 'pg';
import type { ComplianceCheck, ComplianceStatus } from '../types.js';

interface ComplianceCheckRow {
  id: string;
  organization_id: string;
  check_type: string;
  status: string;
  details: Record<string, unknown>;
  violations: string[];
  run_at: string;
  run_by: string;
}

function mapCheck(row: ComplianceCheckRow): ComplianceCheck {
  return {
    id: row.id,
    organizationId: row.organization_id,
    checkType: row.check_type,
    status: row.status as ComplianceStatus,
    details: row.details,
    violations: row.violations,
    runAt: row.run_at,
    runBy: row.run_by,
  };
}

export class ComplianceCheckService {
  constructor(private readonly pool: Pool) {}

  async runChecks(organizationId: string, runBy: string): Promise<ComplianceCheck[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const results: ComplianceCheck[] = [];

    results.push(await this.checkMissingApprovals(organizationId, runBy));
    results.push(await this.checkDataRetentionViolations(organizationId, runBy));
    results.push(await this.checkRbacMisconfigurations(organizationId, runBy));

    return results;
  }

  async getCheck(organizationId: string, checkId: string): Promise<ComplianceCheck | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const result = await this.pool.query<ComplianceCheckRow>(
      `SELECT * FROM compliance_checks WHERE id = $1 AND organization_id = $2`,
      [checkId, organizationId],
    );

    return result.rows[0] ? mapCheck(result.rows[0]) : null;
  }

  async listChecks(
    organizationId: string,
    opts?: { checkType?: string; status?: ComplianceStatus; limit?: number },
  ): Promise<ComplianceCheck[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let idx = 2;

    if (opts?.checkType !== undefined) {
      conditions.push(`check_type = $${String(idx)}`);
      params.push(opts.checkType);
      idx++;
    }
    if (opts?.status !== undefined) {
      conditions.push(`status = $${String(idx)}`);
      params.push(opts.status);
      idx++;
    }

    const limitClause = opts?.limit !== undefined ? ` LIMIT $${String(idx)}` : '';
    if (opts?.limit !== undefined) {
      params.push(opts.limit);
    }

    const result = await this.pool.query<ComplianceCheckRow>(
      `SELECT * FROM compliance_checks WHERE ${conditions.join(' AND ')} ORDER BY run_at DESC${limitClause}`,
      params,
    );

    return result.rows.map(mapCheck);
  }

  private async checkMissingApprovals(
    organizationId: string,
    runBy: string,
  ): Promise<ComplianceCheck> {
    const result = await this.pool.query<{ run_id: string; workflow_name: string }>(
      `SELECT wr.id AS run_id, w.name AS workflow_name
       FROM workflow_runs wr
       JOIN workflows w ON w.id = wr.workflow_id
       WHERE wr.organization_id = $1
         AND wr.status = 'completed'
         AND wr.id NOT IN (
           SELECT DISTINCT workflow_run_id FROM approvals
           WHERE organization_id = $1
             AND status = 'approved'
             AND workflow_run_id IS NOT NULL
         )
       LIMIT 50`,
      [organizationId],
    );

    const violations = result.rows.map(
      (r) => `Workflow run "${r.workflow_name}" (${r.run_id}) completed without approval`,
    );
    const status: ComplianceStatus = violations.length === 0 ? 'pass' : 'fail';

    return this.saveCheck(organizationId, 'missing_approvals', status, violations, runBy, {
      checkedAt: new Date().toISOString(),
      violationCount: violations.length,
    });
  }

  private async checkDataRetentionViolations(
    organizationId: string,
    runBy: string,
  ): Promise<ComplianceCheck> {
    const result = await this.pool.query<{
      resource_type: string;
      retention_days: number;
      count: string;
    }>(
      `SELECT drp.resource_type, drp.retention_days,
              COUNT(*) as count
       FROM data_retention_policies drp
       CROSS JOIN LATERAL (
         SELECT 1 FROM audit_logs al
         WHERE al.organization_id = $1
           AND al.resource_type = drp.resource_type
           AND al.created_at < NOW() - (drp.retention_days || ' days')::interval
         LIMIT 1
       ) aged
       WHERE drp.organization_id = $1 AND drp.is_active = true
       GROUP BY drp.resource_type, drp.retention_days`,
      [organizationId],
    );

    const violations = result.rows.map(
      (r) =>
        `Resource type "${r.resource_type}" has records older than ${String(r.retention_days)} days`,
    );
    const status: ComplianceStatus = violations.length === 0 ? 'pass' : 'warning';

    return this.saveCheck(organizationId, 'data_retention_violations', status, violations, runBy, {
      checkedAt: new Date().toISOString(),
      violationCount: violations.length,
    });
  }

  private async checkRbacMisconfigurations(
    organizationId: string,
    runBy: string,
  ): Promise<ComplianceCheck> {
    const result = await this.pool.query<{ id: string; name: string }>(
      `SELECT r.id, r.name FROM roles r
       WHERE r.organization_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id
         )`,
      [organizationId],
    );

    const violations = result.rows.map(
      (r) => `Role "${r.name}" (${r.id}) has no permissions assigned`,
    );
    const status: ComplianceStatus = violations.length === 0 ? 'pass' : 'warning';

    return this.saveCheck(organizationId, 'rbac_misconfigurations', status, violations, runBy, {
      checkedAt: new Date().toISOString(),
      violationCount: violations.length,
    });
  }

  private async saveCheck(
    organizationId: string,
    checkType: string,
    status: ComplianceStatus,
    violations: string[],
    runBy: string,
    details: Record<string, unknown>,
  ): Promise<ComplianceCheck> {
    const result = await this.pool.query<ComplianceCheckRow>(
      `INSERT INTO compliance_checks
        (organization_id, check_type, status, details, violations, run_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        organizationId,
        checkType,
        status,
        JSON.stringify(details),
        JSON.stringify(violations),
        runBy,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Insert returned no row');
    return mapCheck(row);
  }
}
