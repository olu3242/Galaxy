import type { Pool } from 'pg';

interface OverdueRun {
  id: string;
  organization_id: string;
  status: string;
}

interface OverdueLoopInstance {
  id: string;
  organization_id: string;
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

    // Handle loop instance SLA breaches: verifying instances past their verification deadline
    const { rows: overdueLoops } = await pool.query<OverdueLoopInstance>(
      `SELECT id, organization_id
       FROM loop_instances
       WHERE status = 'verifying'
         AND verification_deadline < NOW()`,
    );

    for (const loop of overdueLoops) {
      await pool.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        loop.organization_id,
      ]);

      await pool.query(
        `UPDATE loop_instances
         SET status = 'escalated',
             outcome_notes = $1,
             updated_at = NOW()
         WHERE id = $2 AND organization_id = $3`,
        ['SLA breach: verification deadline exceeded', loop.id, loop.organization_id],
      );

      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'loop.sla_breach',
          loopInstanceId: loop.id,
          organizationId: loop.organization_id,
          message: 'Loop instance escalated due to SLA breach: verification deadline exceeded',
        }),
      );

      escalatedCount += 1;
    }

    return escalatedCount;
  };
}
