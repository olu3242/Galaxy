import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_graph_nodes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      node_type TEXT NOT NULL,
      external_id TEXT NOT NULL,
      properties JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, node_type, external_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_graph_edges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      edge_type TEXT NOT NULL,
      source_node_id UUID NOT NULL REFERENCES org_graph_nodes(id) ON DELETE CASCADE,
      target_node_id UUID NOT NULL REFERENCES org_graph_nodes(id) ON DELETE CASCADE,
      weight NUMERIC(5,2) NOT NULL DEFAULT 1.0,
      properties JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_graph_nodes_org_type ON org_graph_nodes(organization_id, node_type)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON org_graph_edges(organization_id, source_node_id)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON org_graph_edges(organization_id, target_node_id)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON org_graph_edges(organization_id, edge_type)',
  );

  await pool.query('ALTER TABLE org_graph_nodes ENABLE ROW LEVEL SECURITY');
  await pool.query('ALTER TABLE org_graph_edges ENABLE ROW LEVEL SECURITY');

  await pool.query(`
    CREATE POLICY tenant_isolation ON org_graph_nodes
    USING (organization_id::text = current_setting('app.current_tenant', true))
  `);
  await pool.query(`
    CREATE POLICY tenant_isolation ON org_graph_edges
    USING (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP POLICY IF EXISTS tenant_isolation ON org_graph_edges');
  await pool.query('DROP POLICY IF EXISTS tenant_isolation ON org_graph_nodes');
  await pool.query('DROP TABLE IF EXISTS org_graph_edges');
  await pool.query('DROP TABLE IF EXISTS org_graph_nodes');
}
