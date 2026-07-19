import type { Pool } from 'pg';
import type {
  Alert,
  AlertRow,
  AlertRule,
  AlertRuleRow,
  AlertSeverity,
  AlertState,
} from '../types.js';

function rowToAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    organizationId: row.organization_id,
    alertRuleId: row.alert_rule_id,
    severity: row.severity as AlertSeverity,
    state: row.state as AlertState,
    title: row.title,
    description: row.description,
    firedAt: row.fired_at,
    resolvedAt: row.resolved_at,
    metadata: row.metadata,
  };
}

function rowToRule(row: AlertRuleRow): AlertRule {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    metricName: row.metric_name,
    threshold: parseFloat(row.threshold),
    operator: row.operator as AlertRule['operator'],
    severity: row.severity as AlertSeverity,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateAlertRuleInput {
  organizationId: string;
  name: string;
  metricName: string;
  threshold: number;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  severity: AlertSeverity;
}

export class AlertService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async createRule(input: CreateAlertRuleInput): Promise<AlertRule> {
    await this.setTenantContext(input.organizationId);
    const result = await this.pool.query<AlertRuleRow>(
      `INSERT INTO alert_rules (organization_id, name, metric_name, threshold, operator, severity, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [
        input.organizationId,
        input.name,
        input.metricName,
        input.threshold,
        input.operator,
        input.severity,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create alert rule');
    return rowToRule(row);
  }

  async listRules(organizationId: string): Promise<AlertRule[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<AlertRuleRow>(
      'SELECT * FROM alert_rules WHERE organization_id = $1 ORDER BY created_at DESC',
      [organizationId],
    );
    return result.rows.map(rowToRule);
  }

  async fireAlert(
    organizationId: string,
    ruleId: string,
    title: string,
    description: string,
    metadata: Record<string, unknown>,
  ): Promise<Alert> {
    await this.setTenantContext(organizationId);
    const ruleResult = await this.pool.query<AlertRuleRow>(
      'SELECT * FROM alert_rules WHERE id = $1 AND organization_id = $2',
      [ruleId, organizationId],
    );
    const rule = ruleResult.rows[0];
    if (!rule) throw new Error('Alert rule not found');

    const result = await this.pool.query<AlertRow>(
      `INSERT INTO alerts (organization_id, alert_rule_id, severity, state, title, description, metadata)
       VALUES ($1, $2, $3, 'firing', $4, $5, $6)
       RETURNING *`,
      [organizationId, ruleId, rule.severity, title, description, JSON.stringify(metadata)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to fire alert');
    return rowToAlert(row);
  }

  async resolveAlert(organizationId: string, alertId: string): Promise<Alert | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<AlertRow>(
      `UPDATE alerts SET state = 'resolved', resolved_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND state = 'firing'
       RETURNING *`,
      [alertId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToAlert(row) : null;
  }

  async listAlerts(
    organizationId: string,
    options: { state?: AlertState; severity?: AlertSeverity; limit?: number; offset?: number },
  ): Promise<Alert[]> {
    await this.setTenantContext(organizationId);
    const params: unknown[] = [organizationId];
    let sql = 'SELECT * FROM alerts WHERE organization_id = $1';
    if (options.state !== undefined) {
      params.push(options.state);
      sql += ` AND state = $${String(params.length)}`;
    }
    if (options.severity !== undefined) {
      params.push(options.severity);
      sql += ` AND severity = $${String(params.length)}`;
    }
    sql += ' ORDER BY fired_at DESC';
    if (options.limit !== undefined) {
      params.push(options.limit);
      sql += ` LIMIT $${String(params.length)}`;
    }
    if (options.offset !== undefined) {
      params.push(options.offset);
      sql += ` OFFSET $${String(params.length)}`;
    }
    const result = await this.pool.query<AlertRow>(sql, params);
    return result.rows.map(rowToAlert);
  }

  async evaluateRules(organizationId: string, metricName: string, value: number): Promise<Alert[]> {
    await this.setTenantContext(organizationId);
    const rulesResult = await this.pool.query<AlertRuleRow>(
      `SELECT * FROM alert_rules
       WHERE organization_id = $1 AND metric_name = $2 AND is_active = true`,
      [organizationId, metricName],
    );

    const firedAlerts: Alert[] = [];
    for (const rule of rulesResult.rows) {
      const threshold = parseFloat(rule.threshold);
      let triggered = false;
      if (rule.operator === 'gt') triggered = value > threshold;
      else if (rule.operator === 'lt') triggered = value < threshold;
      else if (rule.operator === 'gte') triggered = value >= threshold;
      else if (rule.operator === 'lte') triggered = value <= threshold;
      else if (rule.operator === 'eq') triggered = value === threshold;

      if (triggered) {
        const alert = await this.fireAlert(
          organizationId,
          rule.id,
          `Alert: ${rule.name}`,
          `Metric ${metricName} value ${String(value)} triggered rule (${rule.operator} ${String(threshold)})`,
          { metricName, value, threshold, operator: rule.operator },
        );
        firedAlerts.push(alert);
      }
    }
    return firedAlerts;
  }
}
