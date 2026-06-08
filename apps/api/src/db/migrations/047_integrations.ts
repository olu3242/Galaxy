import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE integration_connectors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      name TEXT NOT NULL,
      connector_type TEXT NOT NULL CHECK (connector_type IN ('webhook', 'api', 'oauth2', 'whatsapp')),
      status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
      config JSONB NOT NULL DEFAULT '{}',
      credentials JSONB NOT NULL DEFAULT '{}',
      last_sync_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE integration_sync_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      connector_id UUID NOT NULL REFERENCES integration_connectors(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'bidirectional')),
      records_synced INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE integration_event_mappings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      connector_id UUID NOT NULL REFERENCES integration_connectors(id) ON DELETE CASCADE,
      galaxy_event_type TEXT NOT NULL,
      external_event_type TEXT NOT NULL,
      transformation_rules JSONB NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE integration_event_deliveries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mapping_id UUID NOT NULL REFERENCES integration_event_mappings(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE solution_packs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      industry TEXT NOT NULL CHECK (industry IN (
        'fintech', 'healthcare', 'logistics', 'retail', 'manufacturing', 'professional_services'
      )),
      description TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '1.0.0',
      is_published BOOLEAN NOT NULL DEFAULT false,
      pack_data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE solution_pack_installations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      pack_id UUID NOT NULL REFERENCES solution_packs(id) ON DELETE RESTRICT,
      installed_by UUID NOT NULL,
      installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'installed' CHECK (status IN ('installing', 'installed', 'failed'))
    )
  `);

  await pool.query(`
    CREATE TABLE workflow_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID,
      name TEXT NOT NULL,
      industry TEXT CHECK (industry IN (
        'fintech', 'healthcare', 'logistics', 'retail', 'manufacturing', 'professional_services'
      )),
      description TEXT NOT NULL DEFAULT '',
      steps JSONB NOT NULL DEFAULT '{}',
      category TEXT NOT NULL DEFAULT 'general',
      is_system BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Indexes
  await pool.query(
    `CREATE INDEX integration_connectors_org_idx ON integration_connectors(organization_id)`,
  );
  await pool.query(
    `CREATE INDEX integration_sync_logs_org_connector_idx ON integration_sync_logs(organization_id, connector_id)`,
  );
  await pool.query(
    `CREATE INDEX solution_pack_installations_org_idx ON solution_pack_installations(organization_id)`,
  );
  await pool.query(
    `CREATE INDEX workflow_templates_org_idx ON workflow_templates(organization_id)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS workflow_templates`);
  await pool.query(`DROP TABLE IF EXISTS solution_pack_installations`);
  await pool.query(`DROP TABLE IF EXISTS solution_packs`);
  await pool.query(`DROP TABLE IF EXISTS integration_event_deliveries`);
  await pool.query(`DROP TABLE IF EXISTS integration_event_mappings`);
  await pool.query(`DROP TABLE IF EXISTS integration_sync_logs`);
  await pool.query(`DROP TABLE IF EXISTS integration_connectors`);
}
