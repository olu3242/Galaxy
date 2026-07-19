import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS economy_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      account_type TEXT NOT NULL CHECK (
        account_type IN ('publisher_earnings','workflow_credits','agent_credits','knowledge_rewards','platform_fees')
      ),
      balance NUMERIC(20,6) NOT NULL DEFAULT 0,
      total_earned NUMERIC(20,6) NOT NULL DEFAULT 0,
      total_spent NUMERIC(20,6) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, account_type)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS economy_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      account_type TEXT NOT NULL,
      transaction_type TEXT NOT NULL CHECK (
        transaction_type IN ('earn','spend','royalty','reward','charge','settlement','refund')
      ),
      amount NUMERIC(20,6) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      reference_type TEXT,
      reference_id TEXT,
      correlation_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const table of ['economy_accounts', 'economy_transactions']) {
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`
      CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (organization_id::text = current_setting('app.current_tenant', true))
    `);
  }

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_economy_accounts_org ON economy_accounts(organization_id)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_economy_transactions_org ON economy_transactions(organization_id)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_economy_transactions_type ON economy_transactions(organization_id, account_type)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_economy_transactions_ref ON economy_transactions(organization_id, reference_type, reference_id)',
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS economy_transactions CASCADE');
  await pool.query('DROP TABLE IF EXISTS economy_accounts CASCADE');
}
