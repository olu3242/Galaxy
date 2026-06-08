import type { MessageContent } from '../types.js';

export interface FormattedOutboundMessage {
  type: string;
  to: string;
  payload: Record<string, unknown>;
}

/**
 * OutboundMessageProcessor — formats internal messages for provider delivery.
 */
export class OutboundMessageProcessor {
  format(to: string, content: MessageContent): FormattedOutboundMessage {
    switch (content.type) {
      case 'text':
        return {
          type: 'text',
          to,
          payload: { text: { body: content.text ?? '' } },
        };
      case 'image':
        return {
          type: 'image',
          to,
          payload: { image: { link: content.mediaUrl } },
        };
      case 'file':
        return {
          type: 'document',
          to,
          payload: { document: { link: content.mediaUrl } },
        };
      case 'audio':
        return {
          type: 'audio',
          to,
          payload: { audio: { link: content.mediaUrl } },
        };
      case 'template':
        return {
          type: 'template',
          to,
          payload: {
            template: {
              name: content.templateName,
              language: { code: 'en' },
              components: content.templateVariables
                ? [{ type: 'body', parameters: Object.values(content.templateVariables) }]
                : [],
            },
          },
        };
      default:
        return {
          type: 'text',
          to,
          payload: { text: { body: '' } },
        };
    }
  }
}
