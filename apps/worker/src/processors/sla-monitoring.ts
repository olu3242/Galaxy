import type { Pool } from 'pg';

interface OverdueRun {
  id: string;
  organization_id: string;
  status: string;
}

export function createSlaProcessor(pool: Pool): () => Promise<number> {
  return async (): Promise<number> => {
    // Find all overdue workflow runs across all tenants
    const { rows } = await pool.query<OverdueRun>(
      `SELECT id, organization_id, status
       FROM workflow_runs
       WHERE sla_due_at < NOW()
         AND status IN ('pending', 'running', 'waiting')`,
    );

    let escalatedCount = 0;

    for (const run of rows) {
      // Set tenant context for each row's org
      await pool.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        run.organization_id,
      ]);

      await pool.query(
        `INSERT INTO workflow_history
           (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
         VALUES ($1, $2, $3, 'escalated', 'system', 'sla-monitor', 'SLA breached')`,
        [run.organization_id, run.id, run.status],
      );

      await pool.query(
        `UPDATE workflow_runs
         SET status = 'escalated', escalated_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [run.id, run.organization_id],
      );

      escalatedCount += 1;
    }

    return escalatedCount;
  };
}
