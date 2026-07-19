import type { MessagingProvider } from './MessagingProvider.js';
import type { MessageContent, MessageResult } from '../types.js';

interface SendGridMailBody {
  personalizations: { to: { email: string }[] }[];
  from: { email: string; name?: string };
  subject: string;
  content: { type: string; value: string }[];
}

interface SendGridErrorResponse {
  errors?: { message: string }[];
}

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

export interface SendGridProviderOptions {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
}

export class SendGridProvider implements MessagingProvider {
  readonly name = 'sendgrid';

  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string | undefined;

  constructor(opts: SendGridProviderOptions) {
    this.apiKey = opts.apiKey;
    this.fromEmail = opts.fromEmail;
    this.fromName = opts.fromName;
  }

  async send(to: string, content: MessageContent): Promise<MessageResult> {
    const subject = content.templateName ?? 'Galaxy Notification';
    const body = content.text ?? '';

    const mail: SendGridMailBody = {
      personalizations: [{ to: [{ email: to }] }],
      from: {
        email: this.fromEmail,
        ...(this.fromName !== undefined ? { name: this.fromName } : {}),
      },
      subject,
      content: [{ type: 'text/plain', value: body }],
    };

    // Add HTML version when the message looks like HTML
    if (body.trimStart().startsWith('<')) {
      mail.content.push({ type: 'text/html', value: body });
    }

    const response = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mail),
    });

    if (response.status === 202) {
      // SendGrid returns 202 Accepted with no body on success
      const messageId = response.headers.get('x-message-id');
      return {
        success: true,
        ...(messageId !== null ? { providerMessageId: messageId } : {}),
        sentAt: new Date().toISOString(),
      };
    }

    let errorMessage = `SendGrid error: HTTP ${String(response.status)}`;
    try {
      const errBody = (await response.json()) as SendGridErrorResponse;
      const firstError = errBody.errors?.[0]?.message;
      if (firstError) errorMessage = firstError;
    } catch {
      // ignore parse failure; keep the status-code message
    }

    return { success: false, errorMessage };
  }
}
