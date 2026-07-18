import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { EmailPasswordProvider } from '../EmailPasswordProvider.js';
import type { EmailPasswordCredentials } from '../AuthProvider.js';
import { hashPassword } from '../crypto.js';

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

const EMAIL = 'test@example.com';
const PASSWORD = 'super-secret-pw';

describe('EmailPasswordProvider', () => {
  it('has type "email_password"', () => {
    const provider = new EmailPasswordProvider(makePool([]));
    expect(provider.type).toBe('email_password');
  });

  it('returns error for wrong credential type', async () => {
    const provider = new EmailPasswordProvider(makePool([]));
    const result = await provider.authenticate({ type: 'sso' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid credential type');
  });

  it('returns error when email is missing', async () => {
    const provider = new EmailPasswordProvider(makePool([]));
    const result = await provider.authenticate({
      type: 'email_password',
      email: '',
      password: PASSWORD,
    } as never);
    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });

  it('returns error when password is missing', async () => {
    const provider = new EmailPasswordProvider(makePool([]));
    const result = await provider.authenticate({
      type: 'email_password',
      email: EMAIL,
      password: '',
    } as never);
    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });

  it('returns "Invalid credentials" when no user found (no enumeration)', async () => {
    const pool = makePool([ok([])]);
    const provider = new EmailPasswordProvider(pool);
    const result = await provider.authenticate({
      type: 'email_password',
      email: EMAIL,
      password: PASSWORD,
    } as EmailPasswordCredentials);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid credentials');
  });

  it('returns "Invalid credentials" when password does not match', async () => {
    const hash = await hashPassword('different-password');
    const pool = makePool([ok([{ id: 'u1', password_hash: hash, status: 'active' }])]);
    const provider = new EmailPasswordProvider(pool);
    const result = await provider.authenticate({
      type: 'email_password',
      email: EMAIL,
      password: PASSWORD,
    } as EmailPasswordCredentials);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid credentials');
  });

  it('returns success with userId on correct credentials', async () => {
    const hash = await hashPassword(PASSWORD);
    const pool = makePool([ok([{ id: 'user-abc', password_hash: hash, status: 'active' }])]);
    const provider = new EmailPasswordProvider(pool);
    const result = await provider.authenticate({
      type: 'email_password',
      email: EMAIL,
      password: PASSWORD,
    } as EmailPasswordCredentials);
    expect(result.success).toBe(true);
    expect(result.userId).toBe('user-abc');
  });

  it('returns error when account is suspended', async () => {
    const hash = await hashPassword(PASSWORD);
    const pool = makePool([ok([{ id: 'user-abc', password_hash: hash, status: 'suspended' }])]);
    const provider = new EmailPasswordProvider(pool);
    const result = await provider.authenticate({
      type: 'email_password',
      email: EMAIL,
      password: PASSWORD,
    } as EmailPasswordCredentials);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Account suspended');
  });

  it('queries with parameterized email — no interpolation', async () => {
    const pool = makePool([ok([])]);
    const provider = new EmailPasswordProvider(pool);
    await provider.authenticate({
      type: 'email_password',
      email: EMAIL,
      password: PASSWORD,
    } as EmailPasswordCredentials);
    const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
    expect(calls[0]?.[0]).not.toContain(EMAIL);
    expect(calls[0]?.[1]).toContain(EMAIL);
  });
});
