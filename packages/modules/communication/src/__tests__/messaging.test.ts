import { describe, it, expect, vi } from 'vitest';
import { InboundMessageProcessor } from '../messaging/InboundMessageProcessor.js';
import { OutboundMessageProcessor } from '../messaging/OutboundMessageProcessor.js';
import { ProviderRegistry } from '../messaging/ProviderRegistry.js';
import { MessageDispatcher } from '../messaging/MessageDispatcher.js';
import type { MessagingProvider } from '../messaging/MessagingProvider.js';

// ─── InboundMessageProcessor ─────────────────────────────────────────────────

describe('InboundMessageProcessor.process', () => {
  const proc = new InboundMessageProcessor();

  it('normalizes a text message', () => {
    const result = proc.process({
      from: '+2348001234567',
      messageId: 'msg-001',
      timestamp: '2026-01-01T00:00:00.000Z',
      type: 'text',
      text: { body: 'Hello World' },
    });
    expect(result.externalId).toBe('msg-001');
    expect(result.senderPhone).toBe('+2348001234567');
    expect(result.receivedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.content).toEqual({ type: 'text', text: 'Hello World' });
  });

  it('normalizes an image message', () => {
    const result = proc.process({
      from: '+2348001234567',
      messageId: 'msg-002',
      timestamp: '2026-01-01T00:00:00.000Z',
      type: 'image',
      image: { id: 'img-123', mime_type: 'image/jpeg', sha256: 'abc' },
    });
    expect(result.content.type).toBe('image');
    expect((result.content as { mediaUrl?: string }).mediaUrl).toBe('img-123');
  });

  it('normalizes an audio message', () => {
    const result = proc.process({
      from: '+2348001234567',
      messageId: 'msg-003',
      timestamp: '2026-01-01T00:00:00.000Z',
      type: 'audio',
      audio: { id: 'audio-456', mime_type: 'audio/ogg' },
    });
    expect(result.content.type).toBe('audio');
    expect((result.content as { mediaUrl?: string }).mediaUrl).toBe('audio-456');
  });

  it('normalizes a document message as file type', () => {
    const result = proc.process({
      from: '+2348001234567',
      messageId: 'msg-004',
      timestamp: '2026-01-01T00:00:00.000Z',
      type: 'document',
      document: { id: 'doc-789', mime_type: 'application/pdf', filename: 'report.pdf' },
    });
    expect(result.content.type).toBe('file');
    expect((result.content as { mediaUrl?: string }).mediaUrl).toBe('doc-789');
  });

  it('falls back to empty text for unknown message types', () => {
    const result = proc.process({
      from: '+2348001234567',
      messageId: 'msg-005',
      timestamp: '2026-01-01T00:00:00.000Z',
      type: 'sticker',
    });
    expect(result.content).toEqual({ type: 'text', text: '' });
  });

  it('uses empty string when text body is missing', () => {
    const result = proc.process({
      from: '+2348001234567',
      messageId: 'msg-006',
      timestamp: '2026-01-01T00:00:00.000Z',
      type: 'text',
    });
    expect(result.content).toEqual({ type: 'text', text: '' });
  });
});

// ─── OutboundMessageProcessor ────────────────────────────────────────────────

describe('OutboundMessageProcessor.format', () => {
  const proc = new OutboundMessageProcessor();
  const TO = '+2348001234567';

  it('formats a text message', () => {
    const result = proc.format(TO, { type: 'text', text: 'Hello' });
    expect(result.type).toBe('text');
    expect(result.to).toBe(TO);
    expect(result.payload).toEqual({ text: { body: 'Hello' } });
  });

  it('formats an image message', () => {
    const result = proc.format(TO, { type: 'image', mediaUrl: 'https://cdn.example.com/img.jpg' });
    expect(result.type).toBe('image');
    expect(result.payload).toEqual({ image: { link: 'https://cdn.example.com/img.jpg' } });
  });

  it('formats a file message as document type', () => {
    const result = proc.format(TO, { type: 'file', mediaUrl: 'https://cdn.example.com/file.pdf' });
    expect(result.type).toBe('document');
    expect(result.payload).toEqual({ document: { link: 'https://cdn.example.com/file.pdf' } });
  });

  it('formats an audio message', () => {
    const result = proc.format(TO, {
      type: 'audio',
      mediaUrl: 'https://cdn.example.com/audio.ogg',
    });
    expect(result.type).toBe('audio');
    expect(result.payload).toEqual({ audio: { link: 'https://cdn.example.com/audio.ogg' } });
  });

  it('formats a template message with variables', () => {
    const result = proc.format(TO, {
      type: 'template',
      templateName: 'order_confirmation',
      templateVariables: { orderId: '12345', amount: '500' },
    });
    expect(result.type).toBe('template');
    expect((result.payload.template as { name: string }).name).toBe('order_confirmation');
  });

  it('formats a template message without variables', () => {
    const result = proc.format(TO, {
      type: 'template',
      templateName: 'welcome',
    });
    expect(result.type).toBe('template');
    const tmpl = result.payload.template as { components: unknown[] };
    expect(tmpl.components).toEqual([]);
  });

  it('falls back to empty text for unknown content type', () => {
    const result = proc.format(TO, { type: 'unknown' as 'text' });
    expect(result.type).toBe('text');
    expect(result.payload).toEqual({ text: { body: '' } });
  });
});

// ─── ProviderRegistry ────────────────────────────────────────────────────────

describe('ProviderRegistry', () => {
  function makeProvider(name: string): MessagingProvider {
    return {
      name,
      send: vi.fn().mockResolvedValue({ success: true, externalId: 'ext-1' }),
    };
  }

  it('registers and retrieves a provider by name', () => {
    const registry = new ProviderRegistry();
    const provider = makeProvider('whatsapp');
    registry.register(provider);
    expect(registry.get('whatsapp')).toBe(provider);
  });

  it('returns undefined for unregistered provider', () => {
    const registry = new ProviderRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('getOrThrow returns provider when registered', () => {
    const registry = new ProviderRegistry();
    const provider = makeProvider('sendgrid');
    registry.register(provider);
    expect(registry.getOrThrow('sendgrid')).toBe(provider);
  });

  it('getOrThrow throws when provider not registered', () => {
    const registry = new ProviderRegistry();
    expect(() => registry.getOrThrow('missing')).toThrow(
      "MessagingProvider 'missing' is not registered",
    );
  });

  it('list returns names of all registered providers', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('whatsapp'));
    registry.register(makeProvider('sendgrid'));
    expect(registry.list()).toEqual(expect.arrayContaining(['whatsapp', 'sendgrid']));
    expect(registry.list()).toHaveLength(2);
  });

  it('list returns empty array when no providers registered', () => {
    const registry = new ProviderRegistry();
    expect(registry.list()).toEqual([]);
  });
});

// ─── MessageDispatcher ───────────────────────────────────────────────────────

describe('MessageDispatcher.dispatch', () => {
  it('dispatches message via the named provider', async () => {
    const registry = new ProviderRegistry();
    const provider: MessagingProvider = {
      name: 'whatsapp',
      send: vi.fn().mockResolvedValue({ success: true, externalId: 'ext-123' }),
    };
    registry.register(provider);
    const dispatcher = new MessageDispatcher(registry);

    const result = await dispatcher.dispatch('whatsapp', '+2348001234567', {
      type: 'text',
      text: 'Hello',
    });

    expect(provider.send).toHaveBeenCalledWith('+2348001234567', { type: 'text', text: 'Hello' });
    expect(result.success).toBe(true);
    expect(result.externalId).toBe('ext-123');
  });

  it('throws when provider is not registered', async () => {
    const registry = new ProviderRegistry();
    const dispatcher = new MessageDispatcher(registry);

    await expect(
      dispatcher.dispatch('nonexistent', '+2348001234567', { type: 'text', text: 'Hello' }),
    ).rejects.toThrow("MessagingProvider 'nonexistent' is not registered");
  });

  it('propagates errors from provider.send', async () => {
    const registry = new ProviderRegistry();
    const provider: MessagingProvider = {
      name: 'flaky',
      send: vi.fn().mockRejectedValue(new Error('network timeout')),
    };
    registry.register(provider);
    const dispatcher = new MessageDispatcher(registry);

    await expect(
      dispatcher.dispatch('flaky', '+2348001234567', { type: 'text', text: 'Hello' }),
    ).rejects.toThrow('network timeout');
  });
});
