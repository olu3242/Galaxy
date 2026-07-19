import { describe, it, expect, vi } from 'vitest';
import { GxCommunicationEngine } from '../GxCommunicationEngine.js';
import type {
  OutboundMessage,
  MessageDeliveryResult,
  CommunicationChannel,
} from '../GxCommunicationEngine.js';

function makeDeliveryResult(
  channel: CommunicationChannel,
  recipientId: string,
  success: boolean,
): MessageDeliveryResult {
  return {
    messageId: 'msg-1',
    channel,
    recipientId,
    success,
    sentAt: new Date().toISOString(),
  };
}

describe('GxCommunicationEngine.send', () => {
  it('returns failure when no adapter is registered', async () => {
    const engine = new GxCommunicationEngine();
    const msg: OutboundMessage = {
      channel: 'whatsapp',
      recipientId: 'user-1',
      recipientAddress: '+2341234567890',
      body: 'Hello',
    };
    const result = await engine.send(msg);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('No adapter registered');
    expect(result.channel).toBe('whatsapp');
    expect(result.recipientId).toBe('user-1');
  });

  it('delegates to registered adapter', async () => {
    const engine = new GxCommunicationEngine();
    const adapter = vi.fn().mockResolvedValue(makeDeliveryResult('whatsapp', 'user-1', true));
    engine.registerAdapter('whatsapp', adapter);
    const msg: OutboundMessage = {
      channel: 'whatsapp',
      recipientId: 'user-1',
      recipientAddress: '+2341234567890',
      body: 'Hello',
    };
    const result = await engine.send(msg);
    expect(result.success).toBe(true);
    expect(adapter).toHaveBeenCalledWith(msg);
  });

  it('does not call adapters for other channels', async () => {
    const engine = new GxCommunicationEngine();
    const whatsappAdapter = vi.fn().mockResolvedValue(makeDeliveryResult('whatsapp', 'u', true));
    engine.registerAdapter('whatsapp', whatsappAdapter);
    const msg: OutboundMessage = {
      channel: 'email',
      recipientId: 'user-2',
      recipientAddress: 'user@example.com',
      body: 'Hi',
    };
    const result = await engine.send(msg);
    expect(result.success).toBe(false);
    expect(whatsappAdapter).not.toHaveBeenCalled();
  });
});

describe('GxCommunicationEngine.sendBatch', () => {
  it('sends all messages and returns all results', async () => {
    const engine = new GxCommunicationEngine();
    const adapter = vi.fn().mockResolvedValue(makeDeliveryResult('email', 'u', true));
    engine.registerAdapter('email', adapter);
    const messages: OutboundMessage[] = [
      { channel: 'email', recipientId: 'u1', recipientAddress: 'a@b.com', body: 'M1' },
      { channel: 'email', recipientId: 'u2', recipientAddress: 'c@d.com', body: 'M2' },
    ];
    const results = await engine.sendBatch(messages);
    expect(results).toHaveLength(2);
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it('handles empty batch', async () => {
    const engine = new GxCommunicationEngine();
    const results = await engine.sendBatch([]);
    expect(results).toHaveLength(0);
  });
});

describe('GxCommunicationEngine.notify', () => {
  it('calls send with constructed message', async () => {
    const engine = new GxCommunicationEngine();
    const adapter = vi.fn().mockResolvedValue(makeDeliveryResult('push', 'u', true));
    engine.registerAdapter('push', adapter);
    const result = await engine.notify(
      'user-3',
      'device-token-abc',
      'push',
      'You have an update',
      'Alert',
    );
    expect(result.success).toBe(true);
    const calledMsg = adapter.mock.calls[0]?.[0] as OutboundMessage | undefined;
    expect(calledMsg?.subject).toBe('Alert');
    expect(calledMsg?.body).toBe('You have an update');
    expect(calledMsg?.recipientId).toBe('user-3');
  });

  it('omits subject when not provided', async () => {
    const engine = new GxCommunicationEngine();
    const adapter = vi.fn().mockResolvedValue(makeDeliveryResult('internal', 'u', true));
    engine.registerAdapter('internal', adapter);
    await engine.notify('user-4', 'internal-id', 'internal', 'Body only');
    const calledMsg = adapter.mock.calls[0]?.[0] as OutboundMessage | undefined;
    expect(calledMsg?.subject).toBeUndefined();
  });
});
