-- Galaxy PostgreSQL initialization script
-- Runs once when the container is first created.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";      -- pgvector for embeddings (V1)

-- Create test database for CI / local testing
CREATE DATABASE galaxy_test
  WITH OWNER = galaxy
  ENCODING = 'UTF8'
  LC_COLLATE = 'en_US.utf8'
  LC_CTYPE = 'en_US.utf8';

-- Connect to test DB and enable extensions there too
\c galaxy_test
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

\c galaxy_dev

-- Note: application schema (tables, RLS policies) are created via migrations.
-- See apps/api/src/db/migrations/
