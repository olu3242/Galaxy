/**
 * Communication OS — WhatsAppProvider unit tests
 *
 * Covers: missing env vars · text · image · audio · file · template · interactive ·
 *         unknown content type · HTTP error response · missing message id in response
 *
 * fetch is mocked via vi.stubGlobal. Env vars are set/restored per test via
 * vi.stubEnv (available in Vitest).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WhatsAppProvider } from '../messaging/WhatsAppProvider.js';

const ACCESS_TOKEN = 'EAAtest-token';
const PHONE_NUMBER_ID = '123456789';
const TO = '+2348001234567';

function makeOkFetch(messageId = 'wamid.abc123'): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ messages: [{ id: messageId }] }),
    text: vi.fn().mockResolvedValue(''),
  });
}

function makeErrorFetch(status: number, body = 'Bad Request'): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: vi.fn().mockResolvedValue(body),
    json: vi.fn().mockResolvedValue({}),
  });
}

beforeEach(() => {
  process.env.WHATSAPP_ACCESS_TOKEN = ACCESS_TOKEN;
  process.env.WHATSAPP_PHONE_NUMBER_ID = PHONE_NUMBER_ID;
  vi.stubGlobal('fetch', makeOkFetch());
});

afterEach(() => {
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  vi.unstubAllGlobals();
});

describe('WhatsAppProvider', () => {
  it('provider name is "whatsapp"', () => {
    const provider = new WhatsAppProvider();
    expect(provider.name).toBe('whatsapp');
  });

  it('returns failure when WHATSAPP_ACCESS_TOKEN is not set', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const provider = new WhatsAppProvider();
    const result = await provider.send(TO, { type: 'text', text: 'Hello' });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/WHATSAPP_ACCESS_TOKEN/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns failure when WHATSAPP_PHONE_NUMBER_ID is not set', async () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const provider = new WhatsAppProvider();
    const result = await provider.send(TO, { type: 'text', text: 'Hello' });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/WHATSAPP_PHONE_NUMBER_ID/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('WhatsAppProvider.send — happy path', () => {
  it('sends a text message and returns success with providerMessageId', async () => {
    const provider = new WhatsAppProvider();
    const result = await provider.send(TO, { type: 'text', text: 'Hello World' });

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe('wamid.abc123');
    expect(result.sentAt).toBeDefined();

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const [url, init] = calls[0] as [string, RequestInit];
    expect(url).toContain(PHONE_NUMBER_ID);
    expect(url).toContain('/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);

    const body = JSON.parse(init.body as string) as {
      type: string;
      to: string;
      text: { body: string };
    };
    expect(body.to).toBe(TO);
    expect(body.type).toBe('text');
    expect(body.text.body).toBe('Hello World');
  });

  it('sends an image message with link', async () => {
    const provider = new WhatsAppProvider();
    await provider.send(TO, { type: 'image', mediaUrl: 'https://cdn.example.com/img.jpg' });

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse((calls[0] as [string, RequestInit])[1].body as string) as {
      type: string;
      image: { link: string };
    };
    expect(body.type).toBe('image');
    expect(body.image.link).toBe('https://cdn.example.com/img.jpg');
  });

  it('sends an audio message with link', async () => {
    const provider = new WhatsAppProvider();
    await provider.send(TO, { type: 'audio', mediaUrl: 'https://cdn.example.com/audio.ogg' });

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse((calls[0] as [string, RequestInit])[1].body as string) as {
      type: string;
      audio: { link: string };
    };
    expect(body.type).toBe('audio');
    expect(body.audio.link).toBe('https://cdn.example.com/audio.ogg');
  });

  it('sends a file message as document type with link', async () => {
    const provider = new WhatsAppProvider();
    await provider.send(TO, { type: 'file', mediaUrl: 'https://cdn.example.com/doc.pdf' });

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse((calls[0] as [string, RequestInit])[1].body as string) as {
      type: string;
      document: { link: string };
    };
    expect(body.type).toBe('document');
    expect(body.document.link).toBe('https://cdn.example.com/doc.pdf');
  });

  it('sends a template message with component parameters', async () => {
    const provider = new WhatsAppProvider();
    await provider.send(TO, {
      type: 'template',
      templateName: 'order_confirmation',
      templateVariables: { orderId: '12345', amount: '500' },
    });

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse((calls[0] as [string, RequestInit])[1].body as string) as {
      type: string;
      template: {
        name: string;
        language: { code: string };
        components: { type: string; parameters: { type: string; text: string }[] }[];
      };
    };
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('order_confirmation');
    expect(body.template.language.code).toBe('en_US');
    expect(body.template.components[0]?.parameters).toEqual(
      expect.arrayContaining([
        { type: 'text', text: '12345' },
        { type: 'text', text: '500' },
      ]),
    );
  });

  it('sends a template message without variables — empty components array', async () => {
    const provider = new WhatsAppProvider();
    await provider.send(TO, { type: 'template', templateName: 'welcome' });

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse((calls[0] as [string, RequestInit])[1].body as string) as {
      template: { components: unknown[] };
    };
    expect(body.template.components).toEqual([]);
  });

  it('sends an interactive message', async () => {
    const interactive = { type: 'list', header: { type: 'text', text: 'Choose' } };
    const provider = new WhatsAppProvider();
    await provider.send(TO, { type: 'interactive', interactive });

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse((calls[0] as [string, RequestInit])[1].body as string) as {
      type: string;
      interactive: unknown;
    };
    expect(body.type).toBe('interactive');
    expect(body.interactive).toEqual(interactive);
  });

  it('falls back to empty text message for unknown content type', async () => {
    const provider = new WhatsAppProvider();
    await provider.send(TO, { type: 'video' });

    const wasMocked = vi.mocked(fetch);
    expect(wasMocked).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({ body: expect.stringContaining('"type":"text"') as unknown }),
    );
  });

  it('returns success without providerMessageId when messages array is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ messages: [] }),
        text: vi.fn().mockResolvedValue(''),
      }),
    );
    const provider = new WhatsAppProvider();
    const result = await provider.send(TO, { type: 'text', text: 'Hi' });

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBeUndefined();
  });
});

describe('WhatsAppProvider.send — error handling', () => {
  it('returns failure on non-OK HTTP response', async () => {
    vi.stubGlobal('fetch', makeErrorFetch(400, 'Invalid phone number'));
    const provider = new WhatsAppProvider();
    const result = await provider.send(TO, { type: 'text', text: 'Hi' });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/400/);
    expect(result.errorMessage).toContain('Invalid phone number');
  });

  it('returns failure on 500 server error', async () => {
    vi.stubGlobal('fetch', makeErrorFetch(500, 'Internal Server Error'));
    const provider = new WhatsAppProvider();
    const result = await provider.send(TO, { type: 'text', text: 'Hi' });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/500/);
  });
});
