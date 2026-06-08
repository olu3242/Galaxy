import { createHash, randomBytes } from 'crypto';
import type { Pool } from 'pg';
import type {
  OAuthApp,
  OAuthToken,
  OAuthTokenStatus,
  OAuthAuthorizationCode,
  RegisterOAuthAppInput,
} from '../types.js';

interface OAuthAppRow {
  id: string;
  organization_id: string;
  name: string;
  client_id: string;
  hashed_client_secret: string;
  redirect_uris: string[];
  scopes: string[];
  grant_types: string[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface OAuthTokenRow {
  id: string;
  organization_id: string;
  oauth_app_id: string;
  member_id: string | null;
  access_token: string;
  refresh_token: string | null;
  scopes: string[];
  status: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

// In-memory store for authorization codes (short-lived, ~10 min)
const authCodes = new Map<string, OAuthAuthorizationCode>();

function rowToApp(row: OAuthAppRow): OAuthApp {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    clientId: row.client_id,
    hashedClientSecret: row.hashed_client_secret,
    redirectUris: row.redirect_uris,
    scopes: row.scopes,
    grantTypes: row.grant_types as OAuthApp['grantTypes'],
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToToken(row: OAuthTokenRow): OAuthToken {
  const token: OAuthToken = {
    id: row.id,
    organizationId: row.organization_id,
    oauthAppId: row.oauth_app_id,
    accessToken: row.access_token,
    scopes: row.scopes,
    status: row.status as OAuthTokenStatus,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.member_id !== null) {
    token.memberId = row.member_id;
  }
  if (row.refresh_token !== null) {
    token.refreshToken = row.refresh_token;
  }
  return token;
}

export class OAuthService {
  constructor(private readonly pool: Pool) {}

  async registerApp(
    input: RegisterOAuthAppInput,
  ): Promise<{ app: OAuthApp; clientSecret: string }> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    const clientId = randomBytes(16).toString('hex');
    const clientSecret = randomBytes(32).toString('hex');
    const hashedClientSecret = createHash('sha256').update(clientSecret).digest('hex');

    const result = await this.pool.query<OAuthAppRow>(
      `INSERT INTO oauth_apps (organization_id, name, client_id, hashed_client_secret, redirect_uris, scopes, grant_types, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
       RETURNING *`,
      [
        input.organizationId,
        input.name,
        clientId,
        hashedClientSecret,
        input.redirectUris,
        input.scopes,
        input.grantTypes,
        input.createdBy,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to register OAuth app');

    return { app: rowToApp(row), clientSecret };
  }

  async getApp(orgId: string, appId: string): Promise<OAuthApp | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<OAuthAppRow>(
      'SELECT * FROM oauth_apps WHERE id = $1 AND organization_id = $2',
      [appId, orgId],
    );

    const row = result.rows[0];
    if (!row) return null;
    return rowToApp(row);
  }

  async listApps(orgId: string): Promise<OAuthApp[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<OAuthAppRow>(
      'SELECT * FROM oauth_apps WHERE organization_id = $1 AND is_active = true ORDER BY created_at DESC',
      [orgId],
    );

    return result.rows.map(rowToApp);
  }

  createAuthorizationCode(
    clientId: string,
    orgId: string,
    memberId: string,
    scopes: string[],
    redirectUri: string,
  ): string {
    const code = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    authCodes.set(code, {
      code,
      clientId,
      organizationId: orgId,
      memberId,
      scopes,
      redirectUri,
      expiresAt,
    });

    return code;
  }

  async exchangeCodeForToken(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ): Promise<OAuthToken> {
    const authCode = authCodes.get(code);
    if (!authCode) throw new Error('Invalid or expired authorization code');
    if (authCode.clientId !== clientId) throw new Error('Client ID mismatch');
    if (authCode.redirectUri !== redirectUri) throw new Error('Redirect URI mismatch');
    if (new Date(authCode.expiresAt) < new Date()) throw new Error('Authorization code expired');

    authCodes.delete(code);

    const appResult = await this.pool.query<OAuthAppRow>(
      'SELECT * FROM oauth_apps WHERE client_id = $1 AND is_active = true',
      [clientId],
    );

    const appRow = appResult.rows[0];
    if (!appRow) throw new Error('OAuth app not found');

    const hashedSecret = createHash('sha256').update(clientSecret).digest('hex');
    if (hashedSecret !== appRow.hashed_client_secret) throw new Error('Invalid client secret');

    const accessToken = randomBytes(32).toString('hex');
    const refreshToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      authCode.organizationId,
    ]);

    const result = await this.pool.query<OAuthTokenRow>(
      `INSERT INTO oauth_tokens (organization_id, oauth_app_id, member_id, access_token, refresh_token, scopes, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
       RETURNING *`,
      [
        authCode.organizationId,
        appRow.id,
        authCode.memberId,
        accessToken,
        refreshToken,
        authCode.scopes,
        expiresAt,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to create token');
    return rowToToken(row);
  }

  async revokeToken(orgId: string, tokenId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    await this.pool.query(
      "UPDATE oauth_tokens SET status = 'revoked', updated_at = NOW() WHERE id = $1 AND organization_id = $2",
      [tokenId, orgId],
    );
  }

  async validateToken(accessToken: string): Promise<OAuthToken | null> {
    const result = await this.pool.query<OAuthTokenRow>(
      `SELECT * FROM oauth_tokens
       WHERE access_token = $1
         AND status = 'active'
         AND expires_at > NOW()`,
      [accessToken],
    );

    const row = result.rows[0];
    if (!row) return null;
    return rowToToken(row);
  }
}
