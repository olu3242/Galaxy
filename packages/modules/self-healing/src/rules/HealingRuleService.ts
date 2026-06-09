import type { Pool } from 'pg';
import type { HealingRule, HealingLevel } from '../types.js';

interface RuleRow {
  id: string;
  organization_id: string;
  level: string;
  name: string;
  condition: Record<string, unknown>;
  action: string;
  priority: number;
  enabled: boolean;
  created_at: Date;
}

function mapRule(row: RuleRow): HealingRule {
  return {
    id: row.id,
    organizationId: row.organization_id,
    level: row.level as HealingLevel,
    name: row.name,
    condition: row.condition,
    action: row.action,
    priority: row.priority,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}

export class HealingRuleService {
  constructor(private readonly pool: Pool) {}

  async createRule(
    orgId: string,
    level: HealingLevel,
    name: string,
    condition: Record<string, unknown>,
    action: string,
    priority = 0,
  ): Promise<HealingRule> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<RuleRow>(
      `INSERT INTO healing_rules (organization_id, level, name, condition, action, priority)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [orgId, level, name, JSON.stringify(condition), action, priority],
    );

    const row = result.rows[0];
    if (row === undefined) throw new Error('Failed to create healing rule');
    return mapRule(row);
  }

  async listRules(orgId: string, level?: HealingLevel): Promise<HealingRule[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    if (level !== undefined) {
      const result = await this.pool.query<RuleRow>(
        'SELECT * FROM healing_rules WHERE organization_id = $1 AND level = $2 ORDER BY priority DESC',
        [orgId, level],
      );
      return result.rows.map(mapRule);
    }

    const result = await this.pool.query<RuleRow>(
      'SELECT * FROM healing_rules WHERE organization_id = $1 ORDER BY priority DESC',
      [orgId],
    );
    return result.rows.map(mapRule);
  }

  async toggleRule(orgId: string, ruleId: string, enabled: boolean): Promise<HealingRule> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<RuleRow>(
      `UPDATE healing_rules SET enabled = $3
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [ruleId, orgId, enabled],
    );

    const row = result.rows[0];
    if (row === undefined) throw new Error('Healing rule not found');
    return mapRule(row);
  }

  async deleteRule(orgId: string, ruleId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    await this.pool.query('DELETE FROM healing_rules WHERE id = $1 AND organization_id = $2', [
      ruleId,
      orgId,
    ]);
  }
}
