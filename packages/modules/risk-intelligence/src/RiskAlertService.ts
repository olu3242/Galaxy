import type { Pool } from 'pg';
import type { RiskAlert, RiskAlertRow, RiskDomain, RiskSeverity } from './types.js';

function rowToAlert(row: RiskAlertRow): RiskAlert {
  return {
    id: row.id,
    organizationId: row.organization_id,
    domain: row.domain as RiskDomain,
    severity: row.severity as RiskSeverity,
    title: row.title,
    description: row.description,
    score: parseFloat(row.score),
    isResolved: row.is_resolved,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

export interface CreateAlertInput {
  organizationId: string;
  domain: RiskDomain;
  severity: RiskSeverity;
  title: string;
  description: string;
  score: number;
}

export class RiskAlertService {
  constructor(private readonly pool: Pool) {}

  async processRiskAlerts(alerts: CreateAlertInput[]): Promise<RiskAlert[]> {
    const created: RiskAlert[] = [];
    for (const alert of alerts) {
      await this.pool.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        alert.organizationId,
      ]);
      // Deduplication: no duplicate alert within 24h for same org+domain+title
      const dupCheck = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM risk_alerts
         WHERE organization_id = $1 AND domain = $2 AND title = $3
           AND created_at > NOW() - INTERVAL '24 hours' AND is_resolved = false`,
        [alert.organizationId, alert.domain, alert.title],
      );
      const dupRow = dupCheck.rows[0];
      if (dupRow && parseInt(dupRow.count, 10) > 0) continue;

      const result = await this.pool.query<RiskAlertRow>(
        `INSERT INTO risk_alerts (organization_id, domain, severity, title, description, score)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          alert.organizationId,
          alert.domain,
          alert.severity,
          alert.title,
          alert.description,
          alert.score,
        ],
      );
      const row = result.rows[0];
      if (row) created.push(rowToAlert(row));
    }
    return created;
  }

  async listAlerts(organizationId: string, includeResolved = false): Promise<RiskAlert[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<RiskAlertRow>(
      `SELECT * FROM risk_alerts
       WHERE organization_id = $1 ${includeResolved ? '' : 'AND is_resolved = false'}
       ORDER BY created_at DESC LIMIT 100`,
      [organizationId],
    );
    return result.rows.map(rowToAlert);
  }

  async resolveAlert(organizationId: string, alertId: string): Promise<RiskAlert> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<RiskAlertRow>(
      `UPDATE risk_alerts SET is_resolved = true, resolved_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [alertId, organizationId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Alert ${alertId} not found`);
    return rowToAlert(row);
  }
}
