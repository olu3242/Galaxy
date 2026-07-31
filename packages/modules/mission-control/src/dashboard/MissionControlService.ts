import type { Pool } from 'pg';
import type {
  MissionControlDashboard,
  OperationalSnapshot,
  LearningSnapshot,
  GuardianSnapshot,
  DigitalTwinSnapshot,
} from '../types.js';

export class MissionControlService {
  constructor(private readonly pool: Pool) {}

  private async setTenant(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async getOperationalSnapshot(orgId: string): Promise<OperationalSnapshot> {
    await this.setTenant(orgId);
    const [workflows, conversations, agents, health] = await Promise.all([
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM workflow_runs WHERE organization_id = $1 AND status = 'running'`,
        [orgId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM conversation_sessions WHERE organization_id = $1 AND status IN ('OPEN', 'ACTIVE')`,
        [orgId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM autonomous_agents WHERE organization_id = $1 AND status = 'running'`,
        [orgId],
      ),
      this.pool.query<{ score: number }>(
        `SELECT COALESCE(AVG(score), 50) as score FROM org_health_scores WHERE organization_id = $1 AND dimension = 'overall'`,
        [orgId],
      ),
    ]);
    return {
      organizationId: orgId,
      activeWorkflows: parseInt(workflows.rows[0]?.count ?? '0', 10),
      pendingApprovals: 0,
      openConversations: parseInt(conversations.rows[0]?.count ?? '0', 10),
      activeAgents: parseInt(agents.rows[0]?.count ?? '0', 10),
      healthScore: health.rows[0]?.score ?? 50,
      generatedAt: new Date(),
    };
  }

  async getLearningSnapshot(orgId: string): Promise<LearningSnapshot> {
    await this.setTenant(orgId);
    const result = await this.pool.query<{ total: string; applied: string }>(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE applied_at IS NOT NULL) as applied
       FROM agent_insights WHERE organization_id = $1`,
      [orgId],
    );
    const row = result.rows[0];
    return {
      organizationId: orgId,
      totalInsights: parseInt(row?.total ?? '0', 10),
      appliedInsights: parseInt(row?.applied ?? '0', 10),
      pendingImprovements: 0,
      generatedAt: new Date(),
    };
  }

  async getGuardianSnapshot(orgId: string): Promise<GuardianSnapshot> {
    await this.setTenant(orgId);
    const [incidents, riskAlerts] = await Promise.all([
      this.pool.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) as count FROM healing_incidents
         WHERE organization_id = $1 AND detected_at > NOW() - INTERVAL '24 hours'
         GROUP BY status`,
        [orgId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM risk_alerts WHERE organization_id = $1 AND is_resolved = false`,
        [orgId],
      ),
    ]);
    let activeIncidents = 0;
    let healedToday = 0;
    let escalatedToday = 0;
    for (const row of incidents.rows) {
      const n = parseInt(row.count, 10);
      if (row.status === 'detected' || row.status === 'diagnosing') activeIncidents += n;
      if (row.status === 'healed') healedToday += n;
      if (row.status === 'escalated') escalatedToday += n;
    }
    return {
      organizationId: orgId,
      activeIncidents,
      healedToday,
      escalatedToday,
      riskAlerts: parseInt(riskAlerts.rows[0]?.count ?? '0', 10),
      generatedAt: new Date(),
    };
  }

  async getDigitalTwinSnapshot(orgId: string): Promise<DigitalTwinSnapshot> {
    await this.setTenant(orgId);
    const [nodes, relationships, snapshot] = await Promise.all([
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM twin_nodes WHERE organization_id = $1`,
        [orgId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM twin_relationships WHERE organization_id = $1`,
        [orgId],
      ),
      this.pool.query<{ health_score: number; created_at: Date }>(
        `SELECT health_score, created_at FROM twin_snapshots WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [orgId],
      ),
    ]);
    const snap = snapshot.rows[0];
    return {
      organizationId: orgId,
      nodeCount: parseInt(nodes.rows[0]?.count ?? '0', 10),
      relationshipCount: parseInt(relationships.rows[0]?.count ?? '0', 10),
      overallHealthScore: snap?.health_score ?? 0,
      ...(snap !== undefined ? { lastSnapshotAt: snap.created_at } : {}),
      generatedAt: new Date(),
    };
  }

  async getDashboard(orgId: string): Promise<MissionControlDashboard> {
    const [operational, learning, guardian, digitalTwin] = await Promise.all([
      this.getOperationalSnapshot(orgId),
      this.getLearningSnapshot(orgId),
      this.getGuardianSnapshot(orgId),
      this.getDigitalTwinSnapshot(orgId),
    ]);
    return { operational, learning, guardian, digitalTwin, generatedAt: new Date() };
  }
}
