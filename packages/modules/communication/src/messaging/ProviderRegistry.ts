import type { MessagingProvider } from './MessagingProvider.js';

/**
 * ProviderRegistry — registers and retrieves messaging providers by name.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, MessagingProvider>();

  register(provider: MessagingProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): MessagingProvider | undefined {
    return this.providers.get(name);
  }

  getOrThrow(name: string): MessagingProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`MessagingProvider '${name}' is not registered`);
    }
    return provider;
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }
}
