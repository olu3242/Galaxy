import type { Pool } from 'pg';

const LEGACY_STEP_TYPES = [
  'manual_task',
  'approval',
  'notification',
  'condition',
  'automation',
] as const;
const EXECUTION_STEP_TYPES = [...LEGACY_STEP_TYPES, 'task', 'agent', 'branch', 'delay'] as const;

function sqlList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(',');
}

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE workflow_steps
      DROP CONSTRAINT IF EXISTS workflow_steps_step_type_check
  `);
  await pool.query(`
    ALTER TABLE workflow_steps
      ADD CONSTRAINT workflow_steps_step_type_check
      CHECK (step_type IN (${sqlList(EXECUTION_STEP_TYPES)}))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    UPDATE workflow_steps
       SET step_type = CASE
         WHEN step_type = 'task' THEN 'manual_task'
         WHEN step_type = 'branch' THEN 'condition'
         WHEN step_type IN ('agent', 'delay') THEN 'automation'
         ELSE step_type
       END
     WHERE step_type IN ('task', 'agent', 'branch', 'delay')
  `);
  await pool.query(`
    ALTER TABLE workflow_steps
      DROP CONSTRAINT IF EXISTS workflow_steps_step_type_check
  `);
  await pool.query(`
    ALTER TABLE workflow_steps
      ADD CONSTRAINT workflow_steps_step_type_check
      CHECK (step_type IN (${sqlList(LEGACY_STEP_TYPES)}))
  `);
}
