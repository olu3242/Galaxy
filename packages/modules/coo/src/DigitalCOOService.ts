import type { Pool } from 'pg';
import { ContextAggregator } from './ContextAggregator.js';
import { InsightEngine } from './InsightEngine.js';
import { ActionPlanner } from './ActionPlanner.js';
import { BriefingComposer } from './BriefingComposer.js';
import type { COOBriefing, COOAction } from './types.js';

interface DbBriefing {
  id: string;
  organization_id: string;
  health_score: string;
  executive_summary: string;
  critical_alert_count: number;
  autonomous_action_count: number;
  pending_action_count: number;
  briefing_data: COOBriefing['briefingData'];
  correlation_id: string;
  created_at: Date;
}

interface DbAction {
  id: string;
  organization_id: string;
  briefing_id: string | null;
  action_type: string;
  subject: string;
  payload: Record<string, unknown>;
  autonomy_level: string;
  status: string;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  rejection_reason: string | null;
  executed_at: Date | null;
  correlation_id: string;
  reasoning: string;
  created_at: Date;
}

function mapBriefing(row: DbBriefing): COOBriefing {
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthScore: parseFloat(row.health_score),
    executiveSummary: row.executive_summary,
    criticalAlertCount: row.critical_alert_count,
    autonomousActionCount: row.autonomous_action_count,
    pendingActionCount: row.pending_action_count,
    briefingData: row.briefing_data,
    correlationId: row.correlation_id,
    createdAt: row.created_at.toISOString(),
  };
}

function mapAction(row: DbAction): COOAction {
  return {
    id: row.id,
    organizationId: row.organization_id,
    briefingId: row.briefing_id,
    actionType: row.action_type as COOAction['actionType'],
    subject: row.subject,
    payload: row.payload,
    autonomyLevel: row.autonomy_level as COOAction['autonomyLevel'],
    status: row.status as COOAction['status'],
    approvedBy: row.approved_by,
    approvedAt: row.approved_at?.toISOString() ?? null,
    rejectedBy: row.rejected_by,
    rejectedAt: row.rejected_at?.toISOString() ?? null,
    rejectionReason: row.rejection_reason,
    executedAt: row.executed_at?.toISOString() ?? null,
    correlationId: row.correlation_id,
    reasoning: row.reasoning,
    createdAt: row.created_at.toISOString(),
  };
}

export class DigitalCOOService {
  private readonly aggregator: ContextAggregator;
  private readonly insightEngine: InsightEngine;
  private readonly actionPlanner: ActionPlanner;
  private readonly composer: BriefingComposer;

  constructor(private readonly pool: Pool) {
    this.aggregator = new ContextAggregator(pool);
    this.insightEngine = new InsightEngine();
    this.actionPlanner = new ActionPlanner();
    this.composer = new BriefingComposer();
  }

  async generateBriefing(
    organizationId: string,
    _actorId: string,
    correlationId: string,
  ): Promise<COOBriefing> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);

    const ctx = await this.aggregator.aggregate(organizationId);
    const { insights, healthScore } = this.insightEngine.analyze(ctx);
    const actionInputs = this.actionPlanner.planActions(organizationId, insights, correlationId);
    const partial = this.composer.compose(organizationId, healthScore, insights, correlationId);

    const briefingResult = await this.pool.query<DbBriefing>(
      `INSERT INTO coo_briefings
        (organization_id, health_score, executive_summary, critical_alert_count,
         autonomous_action_count, pending_action_count, briefing_data, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        organizationId,
        partial.healthScore,
        partial.executiveSummary,
        partial.criticalAlertCount,
        partial.autonomousActionCount,
        partial.pendingActionCount,
        JSON.stringify(partial.briefingData),
        correlationId,
      ],
    );
    const briefingRow = briefingResult.rows[0];
    if (!briefingRow) throw new Error('INSERT INTO coo_briefings returned no row');

    for (const input of actionInputs) {
      await this.pool.query(
        `INSERT INTO coo_actions
          (organization_id, briefing_id, action_type, subject, payload,
           autonomy_level, status, reasoning, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)`,
        [
          organizationId,
          briefingRow.id,
          input.actionType,
          input.subject,
          JSON.stringify(input.payload),
          input.autonomyLevel,
          input.reasoning,
          correlationId,
        ],
      );
    }

    return mapBriefing(briefingRow);
  }

  async getBriefingHistory(organizationId: string, limit = 10): Promise<COOBriefing[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);
    const result = await this.pool.query<DbBriefing>(
      `SELECT * FROM coo_briefings WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [organizationId, limit],
    );
    return result.rows.map(mapBriefing);
  }

  async getBriefing(organizationId: string, briefingId: string): Promise<COOBriefing | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);
    const result = await this.pool.query<DbBriefing>(
      `SELECT * FROM coo_briefings WHERE organization_id = $1 AND id = $2`,
      [organizationId, briefingId],
    );
    const row = result.rows[0];
    return row ? mapBriefing(row) : null;
  }

  async listActions(organizationId: string, status?: string): Promise<COOAction[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);
    const conditions = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    if (status !== undefined) {
      conditions.push(`status = $2`);
      params.push(status);
    }
    const result = await this.pool.query<DbAction>(
      `SELECT * FROM coo_actions WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 50`,
      params,
    );
    return result.rows.map(mapAction);
  }

  async approveAction(
    organizationId: string,
    actionId: string,
    actorId: string,
  ): Promise<COOAction> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);
    const result = await this.pool.query<DbAction>(
      `UPDATE coo_actions
       SET status = 'approved', approved_by = $1, approved_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [actorId, actionId, organizationId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('COO action not found');
    return mapAction(row);
  }

  async rejectAction(
    organizationId: string,
    actionId: string,
    actorId: string,
    reason: string,
  ): Promise<COOAction> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);
    const result = await this.pool.query<DbAction>(
      `UPDATE coo_actions
       SET status = 'rejected', rejected_by = $1, rejected_at = NOW(), rejection_reason = $2
       WHERE id = $3 AND organization_id = $4
       RETURNING *`,
      [actorId, reason, actionId, organizationId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('COO action not found');
    return mapAction(row);
  }
}
