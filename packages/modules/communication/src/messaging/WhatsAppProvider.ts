import type { MessageContent, MessageResult } from '../types.js';
import type { MessagingProvider } from './MessagingProvider.js';

const WHATSAPP_API_VERSION = 'v19.0';
const BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

export class WhatsAppProvider implements MessagingProvider {
  readonly name = 'whatsapp';

  private readonly accessToken: string;
  private readonly phoneNumberId: string;

  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? '';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  }

  async send(to: string, content: MessageContent): Promise<MessageResult> {
    if (!this.accessToken || !this.phoneNumberId) {
      return {
        success: false,
        errorMessage: 'WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not configured',
      };
    }

    const body = this.buildRequestBody(to, content);
    const url = `${BASE_URL}/${this.phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        errorMessage: `WhatsApp API error ${String(response.status)}: ${text}`,
      };
    }

    const data = (await response.json()) as { messages?: Array<{ id: string }> };
    const messageId = data.messages?.[0]?.id;

    return {
      success: true,
      ...(messageId ? { providerMessageId: messageId } : {}),
      sentAt: new Date().toISOString(),
    };
  }

  private buildRequestBody(to: string, content: MessageContent): Record<string, unknown> {
    const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };

    switch (content.type) {
      case 'text':
        return { ...base, type: 'text', text: { preview_url: false, body: content.text ?? '' } };

      case 'image':
        return {
          ...base,
          type: 'image',
          image: content.mediaUrl ? { link: content.mediaUrl } : { id: '' },
        };

      case 'audio':
        return {
          ...base,
          type: 'audio',
          audio: content.mediaUrl ? { link: content.mediaUrl } : { id: '' },
        };

      case 'file':
        return {
          ...base,
          type: 'document',
          document: content.mediaUrl ? { link: content.mediaUrl } : { id: '' },
        };

      case 'template':
        return {
          ...base,
          type: 'template',
          template: {
            name: content.templateName ?? '',
            language: { code: 'en_US' },
            components: content.templateVariables
              ? [
                  {
                    type: 'body',
                    parameters: Object.values(content.templateVariables).map((v) => ({
                      type: 'text',
                      text: v,
                    })),
                  },
                ]
              : [],
          },
        };

      default:
        return { ...base, type: 'text', text: { body: '' } };
    }
  }
}
