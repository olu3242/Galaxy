import { createHash, randomBytes } from 'crypto';
import type { Pool } from 'pg';
import type { APIKey, APIKeyWithSecret, APIKeyStatus, CreateAPIKeyInput } from '../types.js';

interface APIKeyRow {
  id: string;
  organization_id: string;
  name: string;
  prefix: string;
  hashed_secret: string;
  scopes: string[];
  status: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function rowToAPIKey(row: APIKeyRow): APIKey {
  const key: APIKey = {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    prefix: row.prefix,
    hashedSecret: row.hashed_secret,
    scopes: row.scopes,
    status: row.status as APIKeyStatus,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.last_used_at !== null) {
    key.lastUsedAt = row.last_used_at;
  }
  if (row.expires_at !== null) {
    key.expiresAt = row.expires_at;
  }
  return key;
}

export class APIKeyService {
  constructor(private readonly pool: Pool) {}

  async generateKey(input: CreateAPIKeyInput): Promise<APIKeyWithSecret> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    const prefix = 'gx_' + randomBytes(4).toString('hex');
    const secret = randomBytes(32).toString('hex');
    const plainSecret = `${prefix}_${secret}`;
    const hashedSecret = createHash('sha256').update(plainSecret).digest('hex');

    const result = await this.pool.query<APIKeyRow>(
      `INSERT INTO api_keys (organization_id, name, prefix, hashed_secret, scopes, status, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)
       RETURNING *`,
      [
        input.organizationId,
        input.name,
        prefix,
        hashedSecret,
        input.scopes,
        input.expiresAt ?? null,
        input.createdBy,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to generate API key');

    return { ...rowToAPIKey(row), plainSecret };
  }

  async rotateKey(orgId: string, keyId: string): Promise<APIKeyWithSecret> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const existing = await this.getKey(orgId, keyId);
    if (!existing) throw new Error('API key not found');

    const secret = randomBytes(32).toString('hex');
    const plainSecret = `${existing.prefix}_${secret}`;
    const hashedSecret = createHash('sha256').update(plainSecret).digest('hex');

    const result = await this.pool.query<APIKeyRow>(
      `UPDATE api_keys SET hashed_secret = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [hashedSecret, keyId, orgId],
    );

    const row = result.rows[0];
    if (!row) throw new Error('API key not found');

    return { ...rowToAPIKey(row), plainSecret };
  }

  async revokeKey(orgId: string, keyId: string): Promise<APIKey> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<APIKeyRow>(
      `UPDATE api_keys SET status = 'revoked', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [keyId, orgId],
    );

    const row = result.rows[0];
    if (!row) throw new Error('API key not found');
    return rowToAPIKey(row);
  }

  async listKeys(orgId: string): Promise<APIKey[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<APIKeyRow>(
      "SELECT * FROM api_keys WHERE organization_id = $1 AND status != 'revoked' ORDER BY created_at DESC",
      [orgId],
    );

    return result.rows.map(rowToAPIKey);
  }

  async getKey(orgId: string, keyId: string): Promise<APIKey | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<APIKeyRow>(
      'SELECT * FROM api_keys WHERE id = $1 AND organization_id = $2',
      [keyId, orgId],
    );

    const row = result.rows[0];
    if (!row) return null;
    return rowToAPIKey(row);
  }

  async validateKey(plainKey: string): Promise<APIKey | null> {
    const hashedSecret = createHash('sha256').update(plainKey).digest('hex');

    const result = await this.pool.query<APIKeyRow>(
      `SELECT * FROM api_keys
       WHERE hashed_secret = $1
         AND status = 'active'
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [hashedSecret],
    );

    const row = result.rows[0];
    if (!row) return null;

    await this.pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [row.id]);

    return rowToAPIKey(row);
  }

  hasScope(key: APIKey, requiredScope: string): boolean {
    return key.scopes.includes(requiredScope) || key.scopes.includes('*');
  }
}
