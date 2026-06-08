import type { MessageContent, MessageResult } from '../types.js';
import type { ProviderRegistry } from './ProviderRegistry.js';

/**
 * MessageDispatcher — dispatches messages via registered provider.
 */
export class MessageDispatcher {
  constructor(private readonly registry: ProviderRegistry) {}

  async dispatch(
    providerName: string,
    to: string,
    content: MessageContent,
  ): Promise<MessageResult> {
    const provider = this.registry.getOrThrow(providerName);
    return provider.send(to, content);
  }
}
