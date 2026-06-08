import type { MessageContent, MessageResult } from '../types.js';
import type { MessagingProvider } from './MessagingProvider.js';

/**
 * WhatsAppProvider — stub implementation of MessagingProvider for WhatsApp.
 *
 * TODO: Replace stub with real Meta WhatsApp Business API calls.
 *       See: https://developers.facebook.com/docs/whatsapp/cloud-api/
 *       Requires WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID env vars.
 */
export class WhatsAppProvider implements MessagingProvider {
  readonly name = 'whatsapp';

  send(to: string, content: MessageContent): Promise<MessageResult> {
    // Stub implementation — logs and returns mock result.
    // TODO: Implement real WhatsApp Cloud API call here.
    console.log(`[WhatsAppProvider] stub send to=${to} type=${content.type}`);

    return Promise.resolve({
      success: true,
      providerMessageId: `stub-${Date.now()}`,
      sentAt: new Date().toISOString(),
    });
  }
}
