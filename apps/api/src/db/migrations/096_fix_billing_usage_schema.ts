import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  // invoices.subscription_id was NOT NULL from migration 038, but InvoiceService
  // creates invoices independently of subscriptions — make it optional.
  await pool.query(`ALTER TABLE invoices ALTER COLUMN subscription_id DROP NOT NULL`);

  // plans.tier was NOT NULL from migration 038, but PlanService.createPlan does not
  // accept a tier parameter — make it optional.
  await pool.query(`ALTER TABLE plans ALTER COLUMN tier DROP NOT NULL`);

  // usage_events was created by migration 038 for billing-oriented subscription events.
  // Migration 069 intended to create a metering-oriented version (no subscription_id,
  // has resource_type) but was a no-op. Fix the existing table to support metering:
  await pool.query(`ALTER TABLE usage_events ALTER COLUMN subscription_id DROP NOT NULL`);
  await pool.query(`ALTER TABLE usage_events ALTER COLUMN event_type DROP NOT NULL`);
  await pool.query(
    `ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT ''`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE usage_events DROP COLUMN IF EXISTS resource_type`);
  await pool.query(`ALTER TABLE usage_events ALTER COLUMN event_type SET NOT NULL`);
  await pool.query(`ALTER TABLE usage_events ALTER COLUMN subscription_id SET NOT NULL`);
  await pool.query(`ALTER TABLE plans ALTER COLUMN tier SET NOT NULL`);
  await pool.query(`ALTER TABLE invoices ALTER COLUMN subscription_id SET NOT NULL`);
}
