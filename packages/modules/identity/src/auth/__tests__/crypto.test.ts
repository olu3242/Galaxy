import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../crypto.js';

describe('hashPassword', () => {
  it('returns a salt:hash string', async () => {
    const result = await hashPassword('secret123');
    expect(result).toContain(':');
    const parts = result.split(':');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(64); // 32 bytes hex
    expect(parts[1]).toHaveLength(128); // 64 bytes hex
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const h1 = await hashPassword('password');
    const h2 = await hashPassword('password');
    expect(h1).not.toBe(h2);
  });
});

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const hash = await hashPassword('correct-horse');
    const result = await verifyPassword('correct-horse', hash);
    expect(result).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('correct-horse');
    const result = await verifyPassword('wrong-horse', hash);
    expect(result).toBe(false);
  });

  it('returns false when hash has invalid format (no separator)', async () => {
    const result = await verifyPassword('password', 'invalidhashwithnoseparator');
    expect(result).toBe(false);
  });

  it('returns false when hash is empty', async () => {
    const result = await verifyPassword('password', '');
    expect(result).toBe(false);
  });

  it('returns false when stored hash length mismatches', async () => {
    // craft a hash with a valid salt but truncated key
    const result = await verifyPassword('password', 'a'.repeat(64) + ':' + 'b'.repeat(10));
    expect(result).toBe(false);
  });
});
