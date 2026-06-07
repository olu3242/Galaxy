import type { Pool } from 'pg';
import type {
  AuthCredentials,
  AuthProvider,
  AuthResult,
  EmailPasswordCredentials,
} from './AuthProvider.js';
import { verifyPassword } from './crypto.js';

interface UserRow {
  id: string;
  password_hash: string | null;
  status: string;
}

/**
 * EmailPasswordProvider — authenticates users with email + password.
 */
export class EmailPasswordProvider implements AuthProvider {
  readonly type = 'email_password';

  constructor(private readonly pool: Pool) {}

  async authenticate(credentials: AuthCredentials): Promise<AuthResult> {
    if (credentials.type !== 'email_password') {
      return { success: false, error: 'Invalid credential type' };
    }

    const emailCreds = credentials as EmailPasswordCredentials;

    if (!emailCreds.email || !emailCreds.password) {
      return { success: false, error: 'Email and password are required' };
    }

    const result = await this.pool.query<UserRow>(
      "SELECT id, password_hash, status FROM users WHERE email = $1 AND status != 'archived'",
      [emailCreds.email],
    );

    const user = result.rows[0];

    if (!user || !user.password_hash) {
      // Use same timing to avoid user enumeration
      await verifyPassword(
        emailCreds.password,
        'dummy:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      );
      return { success: false, error: 'Invalid credentials' };
    }

    const valid = await verifyPassword(emailCreds.password, user.password_hash);

    if (!valid) {
      return { success: false, error: 'Invalid credentials' };
    }

    if (user.status === 'suspended') {
      return { success: false, error: 'Account suspended' };
    }

    return { success: true, userId: user.id };
  }
}
