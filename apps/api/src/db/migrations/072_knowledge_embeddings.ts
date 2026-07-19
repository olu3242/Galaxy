import type { Pool } from 'pg';

async function pgvectorAvailable(pool: Pool): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM pg_available_extensions WHERE name = 'vector'`,
  );
  return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
}

async function tableExists(pool: Pool, tableName: string): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],
  );
  return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
}

export async function up(pool: Pool): Promise<void> {
  const hasVector = await pgvectorAvailable(pool);
  const hasKnowledgeDocuments = await tableExists(pool, 'knowledge_documents');

  // Ensure knowledge_documents exists (may not be registered if SQL migrations were skipped)
  if (!hasKnowledgeDocuments) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        category_id     UUID,
        title           TEXT NOT NULL,
        content         TEXT NOT NULL DEFAULT '',
        status          TEXT NOT NULL DEFAULT 'draft',
        author_id       TEXT NOT NULL DEFAULT '',
        tags            TEXT[] DEFAULT '{}',
        metadata        JSONB DEFAULT '{}',
        version         INTEGER NOT NULL DEFAULT 1,
        published_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY`);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'knowledge_documents' AND policyname = 'tenant_isolation'
        ) THEN
          CREATE POLICY tenant_isolation ON knowledge_documents
            USING (organization_id::text = current_setting('app.current_tenant', true));
        END IF;
      END$$
    `);
  }

  if (hasVector) {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await pool.query(`
      ALTER TABLE knowledge_documents
      ADD COLUMN IF NOT EXISTS embedding vector(1536),
      ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        document_id     UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
        chunk_index     INTEGER NOT NULL,
        content         TEXT NOT NULL,
        embedding       vector(1536),
        token_count     INTEGER,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
        ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    `);
  } else {
    await pool.query(`
      ALTER TABLE knowledge_documents
      ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        document_id     UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
        chunk_index     INTEGER NOT NULL,
        content         TEXT NOT NULL,
        token_count     INTEGER,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  await pool.query(`ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY`);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'knowledge_chunks' AND policyname = 'tenant_isolation'
      ) THEN
        CREATE POLICY tenant_isolation ON knowledge_chunks
          USING (organization_id::text = current_setting('app.current_tenant', true));
      END IF;
    END$$
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS knowledge_chunks_document_idx
      ON knowledge_chunks (document_id)
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS knowledge_chunks`);
  const hasVector = await pgvectorAvailable(pool);
  if (hasVector) {
    await pool.query(`
      ALTER TABLE knowledge_documents
      DROP COLUMN IF EXISTS embedding,
      DROP COLUMN IF EXISTS ingested_at
    `);
  } else {
    await pool.query(`
      ALTER TABLE knowledge_documents
      DROP COLUMN IF EXISTS ingested_at
    `);
  }
}
