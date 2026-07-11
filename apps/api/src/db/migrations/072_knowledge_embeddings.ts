import type { Pool } from 'pg';

async function pgvectorAvailable(pool: Pool): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM pg_available_extensions WHERE name = 'vector'`,
  );
  return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
}

export async function up(pool: Pool): Promise<void> {
  const hasVector = await pgvectorAvailable(pool);

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
    // pgvector not installed — create chunks table without vector columns for CI compatibility
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
  await pool.query(`
    ALTER TABLE knowledge_documents
    DROP COLUMN IF EXISTS ingested_at
  `);
  const hasVector = await pgvectorAvailable(pool);
  if (hasVector) {
    await pool.query(`
      ALTER TABLE knowledge_documents
      DROP COLUMN IF EXISTS embedding
    `);
  }
}
