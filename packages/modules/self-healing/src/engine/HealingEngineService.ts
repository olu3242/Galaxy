import type { Pool } from 'pg';
import { HealingIncidentService } from '../incidents/HealingIncidentService.js';
import { HealingRuleService } from '../rules/HealingRuleService.js';
import type { HealingLevel } from '../types.js';

interface IncidentRow {
  id: string;
  organization_id: string;
  level: string;
  attempt_count: number;
}

interface StatusCountRow {
  status: string;
  count: string;
}

interface LevelCountRow {
  level: string;
  count: string;
}

export class HealingEngineService {
  private readonly incidentSvc: HealingIncidentService;
  private readonly ruleSvc: HealingRuleService;

  constructor(private readonly pool: Pool) {
    this.incidentSvc = new HealingIncidentService(pool);
    this.ruleSvc = new HealingRuleService(pool);
  }

  async runHealingCycle(
    orgId: string,
  ): Promise<{ processed: number; healed: number; failed: number }> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const detected = await this.pool.query<IncidentRow>(
      `SELECT id, organization_id, level, attempt_count
       FROM healing_incidents
       WHERE organization_id = $1 AND status = 'detected'`,
      [orgId],
    );

    let healed = 0;
    let failed = 0;

    for (const incident of detected.rows) {
      await this.incidentSvc.diagnose(
        orgId,
        incident.id,
        'Automated diagnosis initiated by healing engine',
      );

      const rules = await this.ruleSvc.listRules(orgId, incident.level as HealingLevel);
      const matchingRule = rules.find((r) => r.enabled);

      if (matchingRule !== undefined) {
        await this.incidentSvc.heal(orgId, incident.id, matchingRule.action);
        healed++;
      } else {
        const attempts = incident.attempt_count + 1;
        if (attempts > 3) {
          await this.incidentSvc.escalate(orgId, incident.id);
        } else {
          await this.incidentSvc.failIncident(orgId, incident.id);
        }
        failed++;
      }
    }

    return { processed: detected.rows.length, healed, failed };
  }

  async getHealingStats(orgId: string): Promise<Record<string, unknown>> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const byStatus = await this.pool.query<StatusCountRow>(
      `SELECT status, COUNT(*) as count
       FROM healing_incidents
       WHERE organization_id = $1
       GROUP BY status`,
      [orgId],
    );

    const byLevel = await this.pool.query<LevelCountRow>(
      `SELECT level, COUNT(*) as count
       FROM healing_incidents
       WHERE organization_id = $1
       GROUP BY level`,
      [orgId],
    );

    const statusCounts: Record<string, number> = {};
    for (const row of byStatus.rows) {
      statusCounts[row.status] = parseInt(row.count, 10);
    }

    const levelCounts: Record<string, number> = {};
    for (const row of byLevel.rows) {
      levelCounts[row.level] = parseInt(row.count, 10);
    }

    return { byStatus: statusCounts, byLevel: levelCounts };
  }
}
