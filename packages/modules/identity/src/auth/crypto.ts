import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

const SALT_BYTES = 32;
const KEY_LENGTH = 64;
const SEPARATOR = ':';

/**
 * Hashes a password using Node.js built-in scrypt.
 * Returns a string in the format "salt:hash" (both hex-encoded).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}${SEPARATOR}${derivedKey.toString('hex')}`;
}

/**
 * Verifies a password against a previously hashed value.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parts = hash.split(SEPARATOR);
  if (parts.length !== 2) return false;

  const [salt, storedHash] = parts as [string, string];
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (derivedKey.length !== storedBuffer.length) return false;

  return timingSafeEqual(derivedKey, storedBuffer);
}
