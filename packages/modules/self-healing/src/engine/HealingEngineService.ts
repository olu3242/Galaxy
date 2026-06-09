import type { Pool } from 'pg';
import { HealingIncidentService } from '../incidents/HealingIncidentService.js';
import { HealingRuleService } from '../rules/HealingRuleService.js';

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
    const incidents = await this.incidentSvc.listIncidents(orgId, undefined, 'detected', 50);
    let healed = 0;
    let failed = 0;

    for (const incident of incidents) {
      await this.incidentSvc.diagnose(orgId, incident.id, 'Automated diagnosis');
      const rules = await this.ruleSvc.listRules(orgId, incident.level);
      const matchingRule = rules.find((r) => r.enabled);

      if (matchingRule) {
        await this.incidentSvc.heal(orgId, incident.id, `Applied rule: ${matchingRule.action}`);
        healed++;
      } else {
        const updated = await this.incidentSvc.failIncident(orgId, incident.id);
        if (updated.attemptCount >= 3) {
          await this.incidentSvc.escalate(orgId, incident.id);
        }
        failed++;
      }
    }

    return { processed: incidents.length, healed, failed };
  }

  async getHealingStats(orgId: string): Promise<Record<string, unknown>> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<{ status: string; level: string; count: string }>(
      `SELECT status, level, COUNT(*) as count FROM healing_incidents
       WHERE organization_id = $1 GROUP BY status, level`,
      [orgId],
    );
    const byStatus: Record<string, number> = {};
    const byLevel: Record<string, number> = {};
    for (const row of result.rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + parseInt(row.count, 10);
      byLevel[row.level] = (byLevel[row.level] ?? 0) + parseInt(row.count, 10);
    }
    return { byStatus, byLevel, total: result.rows.reduce((s, r) => s + parseInt(r.count, 10), 0) };
  }
}
