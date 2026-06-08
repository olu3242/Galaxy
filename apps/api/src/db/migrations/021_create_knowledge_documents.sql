CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  category_id UUID,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  author_id UUID NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON knowledge_documents
  USING (organization_id::text = current_setting('app.current_tenant', true));

CREATE TABLE IF NOT EXISTS knowledge_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  changed_by UUID NOT NULL,
  change_note VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE knowledge_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON knowledge_versions
  USING (organization_id::text = current_setting('app.current_tenant', true));

CREATE TABLE IF NOT EXISTS knowledge_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  document_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE knowledge_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON knowledge_activities
  USING (organization_id::text = current_setting('app.current_tenant', true));

CREATE INDEX idx_knowledge_docs_org ON knowledge_documents (organization_id);
CREATE INDEX idx_knowledge_docs_org_status ON knowledge_documents (organization_id, status);
CREATE INDEX idx_knowledge_versions_doc ON knowledge_versions (organization_id, document_id);
