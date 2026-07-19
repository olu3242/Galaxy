import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  organizationId: string;
  correlationId: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface AgentBusSubscription {
  agentId: string;
  handler: (message: AgentMessage) => void;
}

/**
 * AgentBus — lightweight in-process pub/sub for inter-agent messaging.
 * Agents publish typed messages; subscribers receive only messages addressed
 * to them or broadcast messages within the same organization.
 */
export class AgentBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(256);
  }

  /** Subscribe an agent to messages addressed to it or broadcast within an org. */
  subscribe(subscription: AgentBusSubscription): () => void {
    const handler = (message: AgentMessage): void => {
      if (message.toAgentId === 'broadcast' || message.toAgentId === subscription.agentId) {
        subscription.handler(message);
      }
    };

    const channel = `org:${subscription.agentId}`;
    this.emitter.on(channel, handler);

    return () => {
      this.emitter.off(channel, handler);
    };
  }

  /** Publish a message to a specific agent or broadcast within an org. */
  publish(
    fromAgentId: string,
    toAgentId: string,
    organizationId: string,
    type: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): AgentMessage {
    const message: AgentMessage = {
      id: randomUUID(),
      fromAgentId,
      toAgentId,
      organizationId,
      correlationId: correlationId ?? randomUUID(),
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    if (toAgentId === 'broadcast') {
      this.emitter.emit(`org:broadcast:${organizationId}`, message);
    } else {
      this.emitter.emit(`org:${toAgentId}`, message);
    }

    return message;
  }

  /** Subscribe to all broadcast messages for an organization. */
  subscribeBroadcast(organizationId: string, handler: (message: AgentMessage) => void): () => void {
    const channel = `org:broadcast:${organizationId}`;
    this.emitter.on(channel, handler);
    return () => {
      this.emitter.off(channel, handler);
    };
  }
}

// Singleton instance shared across the process
export const agentBus = new AgentBus();
