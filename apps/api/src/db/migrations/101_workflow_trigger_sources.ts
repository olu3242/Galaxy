import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE intent_detections
      DROP CONSTRAINT IF EXISTS intent_detections_source_type_check
  `);

  await pool.query(`
    ALTER TABLE intent_detections
      ADD CONSTRAINT intent_detections_source_type_check
      CHECK (source_type IN ('whatsapp','api','web','scheduled','scheduler','event'))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    UPDATE intent_detections
       SET source_type = CASE
         WHEN source_type = 'scheduler' THEN 'scheduled'
         WHEN source_type = 'event' THEN 'api'
         ELSE source_type
       END
     WHERE source_type IN ('scheduler', 'event')
  `);

  await pool.query(`
    ALTER TABLE intent_detections
      DROP CONSTRAINT IF EXISTS intent_detections_source_type_check
  `);

  await pool.query(`
    ALTER TABLE intent_detections
      ADD CONSTRAINT intent_detections_source_type_check
      CHECK (source_type IN ('whatsapp','api','web','scheduled'))
  `);
}
