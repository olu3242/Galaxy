import type { MessageContent, MessageResult } from '../types.js';

/**
 * MessagingProvider — abstraction for outbound messaging channels.
 */
export interface MessagingProvider {
  readonly name: string;
  send(to: string, content: MessageContent): Promise<MessageResult>;
}
