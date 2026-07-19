export type CommunicationChannel = 'whatsapp' | 'email' | 'push' | 'internal' | 'broadcast';

export interface OutboundMessage {
  channel: CommunicationChannel;
  recipientId: string;
  recipientAddress: string; // phone for whatsapp, email for email
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface MessageDeliveryResult {
  messageId: string;
  channel: CommunicationChannel;
  recipientId: string;
  success: boolean;
  errorMessage?: string;
  sentAt: string;
}

export type ChannelAdapter = (msg: OutboundMessage) => Promise<MessageDeliveryResult>;

export class GxCommunicationEngine {
  private readonly adapters = new Map<CommunicationChannel, ChannelAdapter>();

  registerAdapter(channel: CommunicationChannel, adapter: ChannelAdapter): void {
    this.adapters.set(channel, adapter);
  }

  async send(message: OutboundMessage): Promise<MessageDeliveryResult> {
    const adapter = this.adapters.get(message.channel);
    if (!adapter) {
      return {
        messageId: crypto.randomUUID(),
        channel: message.channel,
        recipientId: message.recipientId,
        success: false,
        errorMessage: `No adapter registered for channel: ${message.channel}`,
        sentAt: new Date().toISOString(),
      };
    }

    return adapter(message);
  }

  async sendBatch(messages: OutboundMessage[]): Promise<MessageDeliveryResult[]> {
    return Promise.all(messages.map((m) => this.send(m)));
  }

  async notify(
    recipientId: string,
    recipientAddress: string,
    channel: CommunicationChannel,
    body: string,
    subject?: string,
    metadata?: Record<string, unknown>,
  ): Promise<MessageDeliveryResult> {
    const msg: OutboundMessage = { channel, recipientId, recipientAddress, body };
    if (subject !== undefined) msg.subject = subject;
    if (metadata !== undefined) msg.metadata = metadata;
    return this.send(msg);
  }
}
