import {
  Kafka,
  type Producer,
  type KafkaConfig,
  type SASLOptions,
  CompressionTypes,
} from 'kafkajs';
import type { Pool } from 'pg';
import type { GalaxyEvent } from '@galaxy/types';
import { EventPublisher } from './publisher.js';
import type { PublishResult } from './publisher.js';
import type { EventRegistry } from './registry.js';

export interface KafkaEventBusOptions {
  brokers: string[];
  clientId?: string;
  ssl?: boolean;
  sasl?: SASLOptions;
}

// Galaxy event type → Kafka topic name
function topicForEventType(eventType: string): string {
  // "workflow.submitted" → "galaxy.workflow"
  // "member.invited"     → "galaxy.member"
  const domain = eventType.split('.')[0] ?? 'events';
  return `galaxy.${domain}`;
}

/**
 * KafkaEventBus wraps EventPublisher and additionally publishes each event to a
 * Kafka topic. PostgreSQL remains the source of truth; Kafka is the distribution bus.
 *
 * Topics are named galaxy.<domain> where domain is the first segment of event.type.
 * The producer is lazy-initialized on first publish and reused thereafter.
 */
export class KafkaEventBus {
  private readonly pg: EventPublisher;
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private connecting = false;

  constructor(pool: Pool, options: KafkaEventBusOptions, registry?: EventRegistry) {
    this.pg = new EventPublisher(pool, registry);
    const kafkaConfig: KafkaConfig = {
      clientId: options.clientId ?? 'galaxy-api',
      brokers: options.brokers,
    };
    if (options.ssl !== undefined) kafkaConfig.ssl = options.ssl;
    if (options.sasl !== undefined) kafkaConfig.sasl = options.sasl;
    this.kafka = new Kafka(kafkaConfig);
  }

  private async getProducer(): Promise<Producer> {
    if (this.producer) return this.producer;
    if (this.connecting) {
      // Wait for the in-flight connect to finish (spin with backoff capped at 200ms)
      await new Promise<void>((resolve) => {
        const check = (): void => {
          if (this.producer) resolve();
          else setTimeout(check, 20);
        };
        check();
      });
      return this.producer!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    }

    this.connecting = true;
    try {
      const p = this.kafka.producer({ allowAutoTopicCreation: true });
      await p.connect();
      this.producer = p;
      return p;
    } finally {
      this.connecting = false;
    }
  }

  async publish<TPayload>(event: GalaxyEvent<TPayload>): Promise<PublishResult> {
    // Always write to PostgreSQL first (source of truth + durability)
    const result = await this.pg.publish(event);
    if (!result.success) return result;

    try {
      const producer = await this.getProducer();
      await producer.send({
        topic: topicForEventType(event.type),
        compression: CompressionTypes.GZIP,
        messages: [
          {
            key: event.tenantId,
            value: JSON.stringify(event),
            headers: {
              eventType: event.type,
              correlationId: event.correlationId,
              version: event.version,
            },
          },
        ],
      });
    } catch {
      // Kafka publish failure is non-fatal — PostgreSQL already has the event.
      // Log but return success so callers aren't blocked by broker unavailability.
    }

    return result;
  }

  async publishBatch<TPayload>(events: GalaxyEvent<TPayload>[]): Promise<PublishResult[]> {
    if (events.length === 0) return [];

    const results = await this.pg.publishBatch(events);

    // Only forward events that were successfully stored to PostgreSQL
    const successful = events.filter((_, i) => results[i]?.success);
    if (successful.length === 0) return results;

    try {
      const producer = await this.getProducer();

      // Group by topic for efficient batched send
      const byTopic = new Map<string, typeof successful>();
      for (const event of successful) {
        const topic = topicForEventType(event.type);
        if (!byTopic.has(topic)) byTopic.set(topic, []);
        byTopic.get(topic)!.push(event); // eslint-disable-line @typescript-eslint/no-non-null-assertion
      }

      await producer.sendBatch({
        compression: CompressionTypes.GZIP,
        topicMessages: Array.from(byTopic.entries()).map(([topic, evts]) => ({
          topic,
          messages: evts.map((e) => ({
            key: e.tenantId,
            value: JSON.stringify(e),
            headers: {
              eventType: e.type,
              correlationId: e.correlationId,
              version: e.version,
            },
          })),
        })),
      });
    } catch {
      // Non-fatal: PostgreSQL batch already committed
    }

    return results;
  }

  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
  }
}

/**
 * Factory that returns a KafkaEventBus when KAFKA_BROKERS is set,
 * or a plain EventPublisher otherwise.
 */
export function createEventBus(
  pool: Pool,
  registry?: EventRegistry,
): EventPublisher | KafkaEventBus {
  const brokersEnv = process.env.KAFKA_BROKERS;
  if (!brokersEnv) return new EventPublisher(pool, registry);

  const brokers = brokersEnv.split(',').map((b) => b.trim());
  const saslUser = process.env.KAFKA_SASL_USERNAME;
  const saslPass = process.env.KAFKA_SASL_PASSWORD;

  const sasl: SASLOptions | undefined =
    saslUser && saslPass
      ? { mechanism: 'plain', username: saslUser, password: saslPass }
      : undefined;

  return new KafkaEventBus(
    pool,
    {
      brokers,
      clientId: process.env.KAFKA_CLIENT_ID ?? 'galaxy-api',
      ssl: process.env.KAFKA_SSL === 'true',
      ...(sasl !== undefined ? { sasl } : {}),
    },
    registry,
  );
}
