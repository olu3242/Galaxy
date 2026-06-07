/**
 * Authentication abstractions for the Identity OS.
 */

export interface AuthCredentials {
  type: string;
}

export interface EmailPasswordCredentials extends AuthCredentials {
  type: 'email_password';
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  userId?: string;
  error?: string;
}

/**
 * AuthProvider interface — implemented by each authentication strategy.
 */
export interface AuthProvider {
  readonly type: string;
  authenticate(credentials: AuthCredentials): Promise<AuthResult>;
}
