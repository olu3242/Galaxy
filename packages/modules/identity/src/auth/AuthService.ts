import type { AuthCredentials, AuthProvider, AuthResult } from './AuthProvider.js';

export interface JwtPayload {
  sub: string;
  organizationId: string;
  role: string;
  iat: number;
  exp: number;
}

/**
 * AuthService — delegates authentication to registered providers.
 *
 * JWT signing/verification is handled by @fastify/jwt in the API layer.
 * This service handles the credential verification layer only.
 */
export class AuthService {
  private readonly providers = new Map<string, AuthProvider>();

  /**
   * Registers an authentication provider.
   */
  registerProvider(provider: AuthProvider): void {
    this.providers.set(provider.type, provider);
  }

  /**
   * Authenticates credentials using the appropriate provider.
   */
  async authenticate(credentials: AuthCredentials): Promise<AuthResult> {
    const provider = this.providers.get(credentials.type);

    if (!provider) {
      return { success: false, error: `Unknown auth provider: ${credentials.type}` };
    }

    return provider.authenticate(credentials);
  }

  /**
   * Returns whether a provider type is registered.
   */
  hasProvider(type: string): boolean {
    return this.providers.has(type);
  }
}
