import { describe, it, expect, vi } from 'vitest';
import type { AuthCredentials, AuthProvider, AuthResult } from '../AuthProvider.js';
import { AuthService } from '../AuthService.js';

function makeProvider(type: string, result: AuthResult): AuthProvider {
  return {
    type,
    authenticate: vi.fn().mockResolvedValue(result),
  };
}

describe('AuthService.registerProvider / hasProvider', () => {
  it('returns false for unregistered type', () => {
    const svc = new AuthService();
    expect(svc.hasProvider('email_password')).toBe(false);
  });

  it('returns true after registering a provider', () => {
    const svc = new AuthService();
    svc.registerProvider(makeProvider('email_password', { success: true, userId: 'u1' }));
    expect(svc.hasProvider('email_password')).toBe(true);
  });

  it('registers multiple providers independently', () => {
    const svc = new AuthService();
    svc.registerProvider(makeProvider('email_password', { success: true }));
    svc.registerProvider(makeProvider('sso', { success: true }));
    expect(svc.hasProvider('email_password')).toBe(true);
    expect(svc.hasProvider('sso')).toBe(true);
    expect(svc.hasProvider('oauth')).toBe(false);
  });
});

describe('AuthService.authenticate', () => {
  it('returns error when no matching provider is registered', async () => {
    const svc = new AuthService();
    const result = await svc.authenticate({ type: 'email_password' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown auth provider');
    expect(result.error).toContain('email_password');
  });

  it('delegates to the registered provider and returns its result', async () => {
    const svc = new AuthService();
    const provider = makeProvider('email_password', { success: true, userId: 'user-123' });
    svc.registerProvider(provider);

    const credentials: AuthCredentials = { type: 'email_password' };
    const result = await svc.authenticate(credentials);

    expect(result.success).toBe(true);
    expect(result.userId).toBe('user-123');
    expect(provider.authenticate).toHaveBeenCalledOnce();
    expect(provider.authenticate).toHaveBeenCalledWith(credentials);
  });

  it('forwards failed auth result from provider', async () => {
    const svc = new AuthService();
    svc.registerProvider(makeProvider('email_password', { success: false, error: 'Bad creds' }));

    const result = await svc.authenticate({ type: 'email_password' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Bad creds');
  });

  it('routes to the correct provider when multiple are registered', async () => {
    const svc = new AuthService();
    const ep = makeProvider('email_password', { success: true, userId: 'ep-user' });
    const sso = makeProvider('sso', { success: true, userId: 'sso-user' });
    svc.registerProvider(ep);
    svc.registerProvider(sso);

    const result = await svc.authenticate({ type: 'sso' });
    expect(result.userId).toBe('sso-user');
    expect(ep.authenticate).not.toHaveBeenCalled();
    expect(sso.authenticate).toHaveBeenCalledOnce();
  });
});
