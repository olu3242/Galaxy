# ADR-022: Galaxy Event Fabric

**Status:** Accepted
**Date:** 2026-06-08

## Context

The existing event system (`packages/events`) provides a PostgreSQL-backed event store with publish and in-memory subscribe. GWOS needs consumer tracking, retry logic, and a dead letter queue.

## Decision

Extend the event fabric with:

- `event_consumers` — registered consumer groups
- `event_subscriptions` — consumer-to-event-type mappings
- `event_retries` — retry state per failed consumption
- `event_dead_letters` — unrecoverable events for manual review

Consumer implementation uses BullMQ as the message transport. Events are published to PostgreSQL (source of truth) and also enqueued to BullMQ for processing.

## Consequences

- Events are durable (PostgreSQL) and fast (Redis/BullMQ).
- Dead letters require manual intervention and alerting.
- Consumer groups enable multiple services to subscribe to the same event type independently.
