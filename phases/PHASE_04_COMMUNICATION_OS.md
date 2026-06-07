# Phase 04: Communication OS

## Objectives

Implement the Communication OS module, which is Galaxy's core interface layer with WhatsApp. This phase delivers the complete bidirectional WhatsApp messaging infrastructure: receiving and routing inbound messages, sending outbound messages and notifications, managing message templates, and threading messages into conversations. Communication OS is the nervous system of Galaxy — every member interaction flows through it.

---

## Deliverables

### 1. WhatsApp Webhook Reception

- `POST /api/v1/webhooks/whatsapp` — production webhook handler with HMAC-SHA256 signature verification
- `GET /api/v1/webhooks/whatsapp` — Meta webhook verification challenge handler (returns challenge token)
- `WebhookRoutingService`: resolves `phone_number_id` → `organizationId` mapping
- Inbound message job enqueued to `notification-dispatch` queue with full webhook payload, `organizationId`, and `correlationId`
- Duplicate wamid detection: idempotency check using wamid as deduplication key in Redis (TTL: 24 hours)
- Unsupported message types (stickers, locations, reactions) are received, stored, and acknowledged to Meta — no error thrown
- Signature verification failure: 403 response, `integration.webhook.signature_failed` audit event emitted

### 2. Conversation Management

- Automatic conversation creation: every inbound message from a member creates or reopens a conversation
- Conversations are linked to the sender's member record (by `whatsapp_phone`) if the phone number is known
- Conversation status: `open`, `closed` — conversations auto-close after 24 hours of inactivity
- `GET /api/v1/conversations` — list conversations for a tenant (paginated, filterable by status)
- `GET /api/v1/conversations/:id/messages` — list messages in a conversation (paginated)
- Conversation-to-workflow linking: `PATCH /api/v1/conversations/:id` supports setting `workflow_run_id`
- Database migrations: `conversations` table, `messages` table with RLS policies
- Emits: `communication.conversation.opened`, `communication.conversation.closed`, `communication.message.received`

### 3. Outbound Message Dispatch

- `MessageDispatchService`: constructs and sends WhatsApp messages via the Graph API
- Supports message types: text, template, interactive (buttons and lists), document, image
- Per-org WABA access token resolved from AWS Secrets Manager
- On successful dispatch: `wamid` recorded in the message record, `communication.message.sent` emitted
- Delivery status updates: Meta sends status callbacks (sent/delivered/read/failed) via the same webhook endpoint; these update the message status
- `communication.message.delivered` and `communication.message.read` emitted on status callbacks
- Failed dispatch: exponential backoff retry per standard retry policy; after max retries, `communication.message.failed` emitted and alert fires

### 4. Notification Routing

- `NotificationJob` model: an intent to notify a recipient with a template and parameters
- `notification-dispatch` BullMQ queue processor: resolves recipient's `whatsapp_phone`, dispatches via `MessageDispatchService`
- `POST /api/v1/notifications` — create a notification job (invoked by other OS modules via internal service call)
- Notification status tracking: pending → sent → delivered/read/failed
- Bulk notification: supports sending the same template to multiple recipients (creates one `NotificationJob` per recipient; processed in parallel with concurrency limit)
- `communication.notification.sent` and `communication.notification.failed` emitted on completion
- Database migration: `notifications` table with RLS policy

### 5. Message Template Management

- `GET /api/v1/templates` — list approved templates for the organization
- `POST /api/v1/templates` — submit a new template to Meta for approval
- `PATCH /api/v1/templates/:id/sync` — manually trigger a sync of template approval status from Meta
- `TemplateManagementService`: polls Meta for template approval status on a scheduled basis (every 4 hours for pending templates)
- Approved templates cached in Redis (TTL: 1 hour) for fast lookup during message dispatch
- Database migration: `message_templates` table with RLS policy
- Emits: `communication.template.created`, `communication.template.approved`, `communication.template.rejected`

### 6. Conversational Flow Engine (Basic)

- Keyword matching: inbound messages matching configured keywords trigger specific workflow actions
- Keyword configuration stored in `organizations.settings.keyword_triggers` (JSONB)
- Example: "SUBMIT LEAVE" triggers the leave request workflow definition
- `WorkflowTriggerService` integration: when a keyword matches, `workflow.run.started` event is emitted via a BullMQ job
- Unrecognized messages: the platform sends a default "help" response listing available commands

---

## Dependencies

- Phase 02 (Identity OS) complete: `withTenantContext`, JWT auth, member records
- Phase 01 (Foundation) complete: BullMQ configured, Redis running
- WABA phone number provisioned and registered in the test organization's settings
- `WHATSAPP_APP_SECRET` and `WHATSAPP_ACCESS_TOKEN` environment variables configured
- `WHATSAPP_PHONE_NUMBER_ID` configured for the test organization
- AWS Secrets Manager secret created for the test organization's WABA token

---

## Acceptance Criteria

- [ ] Meta sends a test webhook and it is received, signature-verified, and a job is enqueued (verified by BullMQ dashboard)
- [ ] A forged webhook (invalid signature) returns 403 and no job is enqueued
- [ ] Duplicate wamid: sending the same webhook twice results in only one message record
- [ ] `GET /api/v1/conversations` returns only conversations scoped to the requesting tenant's organization
- [ ] Sending a text message via `MessageDispatchService` returns a wamid and creates a `message` record with status `sent`
- [ ] Meta delivery status callback updates the message record to `delivered`
- [ ] Failed dispatch retries and eventually moves to DLQ after max retries
- [ ] Notification job created for a member with a known phone number dispatches successfully
- [ ] Template approval flow: submit template → poll status → approve → template appears in `GET /api/v1/templates` with status `approved`
- [ ] Keyword trigger: sending "SUBMIT LEAVE" enqueues a workflow run start job (workflow run creation is validated in Phase 05)
- [ ] `communication.message.received` is emitted and recorded in audit log for every inbound message
- [ ] `communication.message.failed` is emitted when Meta API returns an error and retries are exhausted
- [ ] Cross-tenant isolation test passes for `conversations`, `messages`, `notifications`, `message_templates` tables

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Meta webhook delivery delays or replays during testing | Medium | Low | Idempotency check on wamid prevents duplicate processing |
| WABA rate limits during bulk notification testing | Medium | Medium | Rate limiting at the `notification-dispatch` queue level (concurrency limit per org) |
| Template submission rejected by Meta | Medium | Low | Use test templates that follow Meta's guidelines; document template requirements |
| Webhook signature verification fails due to raw body parsing issue in Fastify | Low | High | Test signature verification with a real Meta webhook before marking acceptance criteria green |
| Delivery status callbacks arriving out of order (delivered before sent status) | Low | Low | Status update is idempotent; always apply the most recently received status |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Webhook to job enqueue latency | Under 100ms p95 (must return 200 to Meta quickly) |
| Message dispatch to wamid confirmation | Under 2 seconds p95 |
| Template sync latency | Template approval reflected within 1 polling cycle (4 hours) |
| Audit log coverage | 100% of Communication OS domain events produce audit log entries |
| Webhook signature rejection rate | 100% of forged signatures rejected |
