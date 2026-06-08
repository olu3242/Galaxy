import type { MessageContent } from '../types.js';

export interface InboundWebhookPayload {
  from: string;
  messageId: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string };
  audio?: { id: string; mime_type: string };
  document?: { id: string; mime_type: string; filename: string };
}

export interface NormalizedInboundMessage {
  externalId: string;
  senderPhone: string;
  receivedAt: string;
  content: MessageContent;
}

/**
 * InboundMessageProcessor — normalizes incoming provider webhook payloads to internal format.
 */
export class InboundMessageProcessor {
  process(payload: InboundWebhookPayload): NormalizedInboundMessage {
    let content: MessageContent;

    switch (payload.type) {
      case 'text':
        content = { type: 'text', text: payload.text?.body ?? '' };
        break;
      case 'image':
        content = { type: 'image', mediaUrl: payload.image?.id };
        break;
      case 'audio':
        content = { type: 'audio', mediaUrl: payload.audio?.id };
        break;
      case 'document':
        content = { type: 'file', mediaUrl: payload.document?.id };
        break;
      default:
        content = { type: 'text', text: '' };
    }

    return {
      externalId: payload.messageId,
      senderPhone: payload.from,
      receivedAt: payload.timestamp,
      content,
    };
  }
}
