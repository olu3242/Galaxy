import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
CREATE TABLE IF NOT EXISTS knowledge_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  parent_id UUID REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE knowledge_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON knowledge_categories
  USING (organization_id::text = current_setting('app.current_tenant', true));

CREATE TABLE IF NOT EXISTS knowledge_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

ALTER TABLE knowledge_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON knowledge_tags
  USING (organization_id::text = current_setting('app.current_tenant', true));

CREATE INDEX idx_knowledge_categories_org ON knowledge_categories (organization_id);
CREATE INDEX idx_knowledge_tags_org ON knowledge_tags (organization_id);

ALTER TABLE knowledge_documents
  ADD CONSTRAINT fk_knowledge_documents_category
  FOREIGN KEY (category_id) REFERENCES knowledge_categories(id) ON DELETE SET NULL;
  `);
}

export async function down(_pool: Pool): Promise<void> {
  // no-op: destructive rollback not implemented for this migration
}
