import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { OAuthService } from '../OAuthService.js';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(responses: QueryResult[]): Pool {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

const baseAppRow = {
  id: 'app-1',
  organization_id: 'org-1',
  name: 'Test App',
  client_id: 'client-abc',
  hashed_client_secret: 'hashed',
  redirect_uris: ['https://example.com/callback'],
  scopes: ['read'],
  grant_types: ['authorization_code'],
  is_active: true,
  created_by: 'user-1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const baseTokenRow = {
  id: 'token-1',
  organization_id: 'org-1',
  oauth_app_id: 'app-1',
  member_id: 'member-1',
  access_token: 'access-tok',
  refresh_token: 'refresh-tok',
  scopes: ['read'],
  status: 'active',
  expires_at: '2099-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('OAuthService', () => {
  describe('registerApp', () => {
    it('inserts app and returns it with clientSecret', async () => {
      const pool = makePool([ok([]), ok([baseAppRow])]);
      const svc = new OAuthService(pool);
      const { app, clientSecret } = await svc.registerApp({
        organizationId: 'org-1',
        name: 'Test App',
        redirectUris: ['https://example.com/callback'],
        scopes: ['read'],
        grantTypes: ['authorization_code'],
        createdBy: 'user-1',
      });
      expect(app.id).toBe('app-1');
      expect(typeof clientSecret).toBe('string');
      expect(clientSecret.length).toBeGreaterThan(0);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new OAuthService(pool);
      await expect(
        svc.registerApp({
          organizationId: 'org-1',
          name: 'Test App',
          redirectUris: [],
          scopes: [],
          grantTypes: ['authorization_code'],
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Failed to register OAuth app');
    });
  });

  describe('getApp', () => {
    it('returns the app when found', async () => {
      const pool = makePool([ok([]), ok([baseAppRow])]);
      const svc = new OAuthService(pool);
      const app = await svc.getApp('org-1', 'app-1');
      expect(app?.id).toBe('app-1');
      expect(app?.isActive).toBe(true);
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new OAuthService(pool);
      const app = await svc.getApp('org-1', 'missing');
      expect(app).toBeNull();
    });
  });

  describe('listApps', () => {
    it('returns all active apps', async () => {
      const pool = makePool([ok([]), ok([baseAppRow])]);
      const svc = new OAuthService(pool);
      const apps = await svc.listApps('org-1');
      expect(apps).toHaveLength(1);
      expect(apps[0]?.name).toBe('Test App');
    });
  });

  describe('createAuthorizationCode', () => {
    it('returns a non-empty code string', () => {
      const pool = makePool([]);
      const svc = new OAuthService(pool);
      const code = svc.createAuthorizationCode(
        'client-abc',
        'org-1',
        'member-1',
        ['read'],
        'https://example.com/callback',
      );
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    });
  });

  describe('exchangeCodeForToken', () => {
    it('throws on invalid code', async () => {
      const pool = makePool([]);
      const svc = new OAuthService(pool);
      await expect(
        svc.exchangeCodeForToken('bad-code', 'client-abc', 'secret', 'https://example.com'),
      ).rejects.toThrow('Invalid or expired authorization code');
    });

    it('throws on client ID mismatch', async () => {
      const pool = makePool([]);
      const svc = new OAuthService(pool);
      const code = svc.createAuthorizationCode(
        'client-abc',
        'org-1',
        'member-1',
        ['read'],
        'https://example.com/callback',
      );
      await expect(
        svc.exchangeCodeForToken(code, 'wrong-client', 'secret', 'https://example.com/callback'),
      ).rejects.toThrow('Client ID mismatch');
    });

    it('throws on redirect URI mismatch', async () => {
      const pool = makePool([]);
      const svc = new OAuthService(pool);
      const code = svc.createAuthorizationCode(
        'client-abc',
        'org-1',
        'member-1',
        ['read'],
        'https://example.com/callback',
      );
      await expect(
        svc.exchangeCodeForToken(code, 'client-abc', 'secret', 'https://wrong.com'),
      ).rejects.toThrow('Redirect URI mismatch');
    });

    it('throws on invalid client secret', async () => {
      const pool = makePool([ok([baseAppRow])]);
      const svc = new OAuthService(pool);
      const code = svc.createAuthorizationCode(
        'client-abc',
        'org-1',
        'member-1',
        ['read'],
        'https://example.com/callback',
      );
      await expect(
        svc.exchangeCodeForToken(
          code,
          'client-abc',
          'wrong-secret',
          'https://example.com/callback',
        ),
      ).rejects.toThrow('Invalid client secret');
    });
  });

  describe('validateToken', () => {
    it('returns token when valid', async () => {
      const pool = makePool([ok([baseTokenRow])]);
      const svc = new OAuthService(pool);
      const token = await svc.validateToken('access-tok');
      expect(token?.id).toBe('token-1');
      expect(token?.memberId).toBe('member-1');
      expect(token?.refreshToken).toBe('refresh-tok');
    });

    it('returns null when no token found', async () => {
      const pool = makePool([ok([])]);
      const svc = new OAuthService(pool);
      const token = await svc.validateToken('bad-token');
      expect(token).toBeNull();
    });

    it('maps token without optional member_id', async () => {
      const rowNoMember = { ...baseTokenRow, member_id: null, refresh_token: null };
      const pool = makePool([ok([rowNoMember])]);
      const svc = new OAuthService(pool);
      const token = await svc.validateToken('access-tok');
      expect(token?.memberId).toBeUndefined();
      expect(token?.refreshToken).toBeUndefined();
    });
  });

  describe('revokeToken', () => {
    it('calls update without throwing', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new OAuthService(pool);
      await expect(svc.revokeToken('org-1', 'token-1')).resolves.toBeUndefined();
    });
  });
});
