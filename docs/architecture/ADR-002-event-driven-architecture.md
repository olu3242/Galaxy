# ADR-002: Event-Driven Architecture with BullMQ (MVP) → Kafka (V1+)

**Status:** Accepted
**Date:** 2026-06-07
**Deciders:** Engineering Foundation
**Tags:** architecture, events, messaging, scalability

---

## Context

Galaxy's architecture requires that every state change emit an event. These events drive:

- Loop OS observations (watching every workflow step)
- Agent triggers (agents react to events)
- Audit log entries (immutable record of what happened)
- Dashboard real-time updates
- Decoupled module communication (Workflow OS → Loop OS → Analytics OS)

The system must handle 1,000 messages/day at MVP, scaling to 50,000+ messages/day at V1, and 10,000 events/sec at enterprise scale.

The choice of event bus technology has significant operational cost implications.

## Decision

**MVP (Sprint 1–3):** Use **BullMQ** (Redis-backed) as both the job queue and the internal event bus.

**V1 (Month 4+):** Introduce **Apache Kafka** (Confluent Cloud) as the persistent event bus when event volume justifies it. BullMQ retains its role as the job queue.

## Rationale

### Options Considered

| Option                    | Pros                                                     | Cons                                                                                 |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Kafka from day one        | True event streaming, replay, partitioning               | High operational overhead at MVP scale; 25 orgs, 1K messages/day does not need Kafka |
| BullMQ only               | Simple, Redis-backed, familiar, low ops overhead         | Not a true event log; no indefinite replay; limited for large-scale fan-out          |
| BullMQ (MVP) → Kafka (V1) | Right-size tooling per phase; avoid premature complexity | Requires migration work at V1; event consumers must be written for both              |
| Redis Streams             | Built into Redis, append-only, consumer groups           | Less ecosystem tooling than Kafka; awkward at scale                                  |

### Chosen Option: Phased BullMQ → Kafka

The primary risk at MVP is under-delivery due to infrastructure complexity, not under-scale. BullMQ on an existing Redis instance adds zero new infrastructure. Kafka adds: Confluent Cloud account, topic management, schema registry, consumer group management, and DLQ handling — all before a single organization has onboarded.

The phased approach introduces Kafka when real traffic data justifies it, and before the system approaches BullMQ's limits.

## Consequences

### Positive

- MVP can ship without Kafka operational knowledge
- BullMQ provides retry, delay, priority, and dead-letter queues — sufficient for MVP
- The `GalaxyEvent` envelope is infrastructure-agnostic; consumers don't know whether the carrier is BullMQ or Kafka

### Negative / Trade-offs

- BullMQ does not provide indefinite event replay (events expire after retention window)
- Migration from BullMQ to Kafka at V1 requires event producer/consumer rewrites
- If MVP exceeds projections, Kafka introduction may be forced before V1 timeline

### Neutral

- The `GalaxyEvent<T>` interface is defined in `packages/types` and is stable regardless of transport

## Implementation Notes

- **Event envelope:** All events use `GalaxyEvent<T>` from `packages/types/src/events.ts`
- **Producers:** Use `createEvent()` from `packages/utils/src/events.ts`; never construct envelopes manually
- **At MVP:** Publish events to BullMQ queues named by event type; consumers are BullMQ workers
- **At V1:** Introduce a `EventBus` abstraction layer so producers/consumers are decoupled from the transport
- **Schema versioning:** The `version` field in `GalaxyEvent` is used to detect schema changes; introduce formal Avro schemas when Kafka is adopted

## Review Trigger

Introduce Kafka when any of the following is true:

- Event volume exceeds 10,000 events/hour sustained
- The need for event replay (replay from time T) arises
- The number of event consumers for a single event type exceeds 3
