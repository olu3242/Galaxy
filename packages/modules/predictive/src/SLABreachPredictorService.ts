import type { Pool } from 'pg';
import type { PredictedBreach } from './types.js';

interface WorkflowRunRow {
  id: string;
  workflow_id: string;
  created_at: string;
  sla_due_at: string | null;
  status: string;
}

export class SLABreachPredictorService {
  constructor(private readonly pool: Pool) {}

  async computeBreachProbability(organizationId: string): Promise<PredictedBreach[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const result = await this.pool.query<WorkflowRunRow>(
      `SELECT id, workflow_id, created_at, sla_due_at, status
       FROM workflow_runs
       WHERE organization_id = $1
         AND status IN ('pending', 'in_progress')
         AND sla_due_at IS NOT NULL
       ORDER BY sla_due_at ASC
       LIMIT 100`,
      [organizationId],
    );

    const now = Date.now();
    return result.rows.map((row) => {
      const deadline = new Date(row.sla_due_at ?? '').getTime();
      const created = new Date(row.created_at).getTime();
      const totalWindow = deadline - created;
      const elapsed = now - created;
      const timeRatio = totalWindow > 0 ? elapsed / totalWindow : 1;
      // Probability increases non-linearly as we approach deadline
      const breachProbability = Math.min(1, Math.pow(timeRatio, 2));
      return {
        workflowRunId: row.id,
        workflowId: row.workflow_id,
        organizationId,
        breachProbability: Math.round(breachProbability * 100) / 100,
        estimatedBreachAt: row.sla_due_at,
        slaDeadline: row.sla_due_at ?? '',
        factors: { timeRatio: Math.round(timeRatio * 100) / 100, status: row.status },
      };
    });
  }
}
