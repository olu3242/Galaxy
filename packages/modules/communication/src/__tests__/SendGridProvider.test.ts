/**
 * Communication OS — SendGridProvider unit tests
 *
 * Covers: successful send · send with HTML body · send with template name ·
 *         missing providerMessageId · HTTP error with JSON body · HTTP error without JSON ·
 *         no x-message-id header
 *
 * fetch is mocked globally via vi.stubGlobal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SendGridProvider } from '../messaging/SendGridProvider.js';

function makeFetchOk(status: number, headers: Record<string, string> = {}): typeof fetch {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (key: string) => headers[key] ?? null,
    },
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(''),
  });
}

function makeFetchError(status: number, body: unknown = {}): typeof fetch {
  return vi.fn().mockResolvedValue({
    status,
    ok: false,
    headers: { get: () => null },
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  });
}

const PROVIDER_OPTS = {
  apiKey: 'SG.test-key',
  fromEmail: 'noreply@galaxy.io',
  fromName: 'Galaxy',
};

beforeEach(() => {
  vi.stubGlobal('fetch', makeFetchOk(202, { 'x-message-id': 'sg-abc-123' }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SendGridProvider.send', () => {
  it('returns success with providerMessageId on 202', async () => {
    const provider = new SendGridProvider(PROVIDER_OPTS);
    const result = await provider.send('user@example.com', { type: 'text', text: 'Hello' });

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe('sg-abc-123');
    expect(result.sentAt).toBeDefined();
  });

  it('calls SendGrid endpoint with correct headers and body', async () => {
    const provider = new SendGridProvider(PROVIDER_OPTS);
    await provider.send('user@example.com', { type: 'text', text: 'Test message' });

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const [url, init] = (calls[0] as [string, RequestInit]);

    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer SG.test-key');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body as string) as {
      personalizations: { to: { email: string }[] }[];
      from: { email: string; name?: string };
      content: { type: string; value: string }[];
    };

    expect(body.personalizations[0]?.to[0]?.email).toBe('user@example.com');
    expect(body.from.email).toBe('noreply@galaxy.io');
    expect(body.from.name).toBe('Galaxy');
    expect(body.content[0]?.type).toBe('text/plain');
    expect(body.content[0]?.value).toBe('Test message');
  });

  it('uses templateName as subject when present', async () => {
    const provider = new SendGridProvider(PROVIDER_OPTS);
    await provider.send('user@example.com', {
      type: 'template',
      templateName: 'welcome_email',
      text: 'Welcome!',
    });

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse((calls[0] as [string, RequestInit])[1].body as string) as { subject: string };
    expect(body.subject).toBe('welcome_email');
  });

  it('defaults subject to "Galaxy Notification" when templateName absent', async () => {
    const provider = new SendGridProvider(PROVIDER_OPTS);
    await provider.send('user@example.com', { type: 'text', text: 'Hi' });

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse((calls[0] as [string, RequestInit])[1].body as string) as { subject: string };
    expect(body.subject).toBe('Galaxy Notification');
  });

  it('adds HTML content part when body starts with an HTML tag', async () => {
    const provider = new SendGridProvider(PROVIDER_OPTS);
    const html = '<p>Hello <b>World</b></p>';
    await provider.send('user@example.com', { type: 'text', text: html });

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse((calls[0] as [string, RequestInit])[1].body as string) as {
      content: { type: string; value: string }[];
    };
    const types = body.content.map((c) => c.type);
    expect(types).toContain('text/plain');
    expect(types).toContain('text/html');
  });

  it('does NOT add HTML part for plain text body', async () => {
    const provider = new SendGridProvider(PROVIDER_OPTS);
    await provider.send('user@example.com', { type: 'text', text: 'Plain text only' });

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse((calls[0] as [string, RequestInit])[1].body as string) as {
      content: { type: string; value: string }[];
    };
    expect(body.content).toHaveLength(1);
    expect(body.content[0]?.type).toBe('text/plain');
  });

  it('omits providerMessageId when x-message-id header is absent', async () => {
    vi.stubGlobal('fetch', makeFetchOk(202));
    const provider = new SendGridProvider(PROVIDER_OPTS);
    const result = await provider.send('user@example.com', { type: 'text', text: 'Hi' });

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBeUndefined();
  });

  it('returns failure with error message from JSON body on non-202', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchError(400, { errors: [{ message: 'The from address is invalid' }] }),
    );
    const provider = new SendGridProvider(PROVIDER_OPTS);
    const result = await provider.send('user@example.com', { type: 'text', text: 'Hi' });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('The from address is invalid');
  });

  it('falls back to HTTP status string when error body has no errors array', async () => {
    vi.stubGlobal('fetch', makeFetchError(500, {}));
    const provider = new SendGridProvider(PROVIDER_OPTS);
    const result = await provider.send('user@example.com', { type: 'text', text: 'Hi' });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/500/);
  });

  it('falls back to HTTP status string when JSON parse fails', async () => {
    const mockResponse = {
      status: 503,
      ok: false,
      headers: { get: () => null },
      json: vi.fn().mockRejectedValue(new Error('not json')),
      text: vi.fn().mockResolvedValue('Service Unavailable'),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const provider = new SendGridProvider(PROVIDER_OPTS);
    const result = await provider.send('user@example.com', { type: 'text', text: 'Hi' });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/503/);
  });

  it('omits fromName when not provided', async () => {
    const provider = new SendGridProvider({ apiKey: 'SG.x', fromEmail: 'a@b.com' });
    await provider.send('user@example.com', { type: 'text', text: 'Hi' });

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse((calls[0] as [string, RequestInit])[1].body as string) as { from: { name?: string } };
    expect(body.from.name).toBeUndefined();
  });

  it('provider name is "sendgrid"', () => {
    const provider = new SendGridProvider(PROVIDER_OPTS);
    expect(provider.name).toBe('sendgrid');
  });
});
