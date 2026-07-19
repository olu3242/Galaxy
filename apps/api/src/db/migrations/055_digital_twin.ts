import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS twin_nodes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      node_type TEXT NOT NULL,
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      properties JSONB NOT NULL DEFAULT '{}',
      health_score FLOAT NOT NULL DEFAULT 1.0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, node_type, external_id)
    );
    ALTER TABLE twin_nodes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON twin_nodes
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS twin_relationships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      source_node_id UUID NOT NULL REFERENCES twin_nodes(id) ON DELETE CASCADE,
      target_node_id UUID NOT NULL REFERENCES twin_nodes(id) ON DELETE CASCADE,
      relationship_type TEXT NOT NULL,
      weight FLOAT NOT NULL DEFAULT 1.0,
      properties JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE twin_relationships ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON twin_relationships
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS twin_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      node_count INT NOT NULL DEFAULT 0,
      relationship_count INT NOT NULL DEFAULT 0,
      health_score FLOAT NOT NULL DEFAULT 1.0,
      insights JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE twin_snapshots ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON twin_snapshots
      USING (organization_id::text = current_setting('app.current_tenant', true));
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS twin_snapshots;
    DROP TABLE IF EXISTS twin_relationships;
    DROP TABLE IF EXISTS twin_nodes;
  `);
}
