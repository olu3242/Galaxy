# Galaxy Data Model

This document defines the logical data model for Galaxy Loop OS. It describes entities, their key fields, relationships, tenant ownership, access patterns, and Row-Level Security (RLS) policy notes. This is a conceptual model — no SQL DDL is included here. See `apps/api/src/db/migrations/` for schema definitions.

---

## Conventions

- All primary keys are UUID (`gen_random_uuid()`).
- All timestamps are `TIMESTAMPTZ` defaulting to `NOW()`.
- All JSONB columns default to `'{}'`.
- All tables (except `organizations`) include `organization_id UUID NOT NULL` for RLS.
- RLS context is set per-request: `SELECT set_config('app.current_tenant', $1, true)`.

---

## Entities

### organizations

**Description:** Root tenant entity. Every other entity is scoped to an organization. RLS is not applied to this table; access is controlled at the application layer.

| Field                   | Type        | Description                                             |
| ----------------------- | ----------- | ------------------------------------------------------- |
| `id`                    | UUID        | Primary key                                             |
| `name`                  | string      | Display name of the organization                        |
| `slug`                  | string      | Unique URL-safe identifier                              |
| `tier`                  | string      | Subscription tier: `starter`, `growth`, `enterprise`    |
| `status`                | string      | `active`, `suspended`, `deleted`                        |
| `waba_phone_number_id`  | string      | WhatsApp Business Account phone number ID               |
| `waba_access_token_ref` | string      | Reference to AWS Secrets Manager secret for WABA token  |
| `settings`              | JSONB       | Org-level preferences (timezone, locale, feature flags) |
| `created_at`            | TIMESTAMPTZ | Creation timestamp                                      |
| `updated_at`            | TIMESTAMPTZ | Last modification timestamp                             |

**Relationships:**

- Has many `departments`
- Has many `members`
- Has many `roles`
- Has many `workflows`
- Has many `audit_logs`

**Tenant ownership:** This IS the tenant root. No `organization_id` FK — the `id` itself is the tenant key.

**Access pattern:** Platform Admin: full CRUD. Organization Owner: read + update settings. Members: read own org name/settings only.

**RLS notes:** RLS is disabled on `organizations`. Application middleware validates the organization is `active` and the actor belongs to it before granting access.

---

### departments

**Description:** Organizational units within a tenant, forming a hierarchy via the self-referential `parent_department_id`.

| Field                  | Type         | Description                                    |
| ---------------------- | ------------ | ---------------------------------------------- |
| `id`                   | UUID         | Primary key                                    |
| `organization_id`      | UUID         | FK → organizations.id                          |
| `parent_department_id` | UUID \| null | FK → departments.id (self-referential)         |
| `name`                 | string       | Department name                                |
| `head_member_id`       | UUID \| null | FK → members.id — department head              |
| `status`               | string       | `active`, `archived`                           |
| `metadata`             | JSONB        | Optional metadata (budget codes, cost centers) |
| `created_at`           | TIMESTAMPTZ  | Creation timestamp                             |
| `updated_at`           | TIMESTAMPTZ  | Last modification timestamp                    |

**Relationships:**

- Belongs to `organizations`
- Belongs to `departments` (parent, optional)
- Has many `departments` (children)
- Has many `teams`
- Has many `members` (via team memberships and org chart nodes)

**Tenant ownership:** `organization_id`

**Access pattern:** Department Head and above: CRUD on own department. Members: read own department.

**RLS notes:** RLS policy enforces `organization_id = current_setting('app.current_tenant')::uuid`. All queries are automatically scoped to the active tenant.

---

### teams

**Description:** Sub-units within a department. A team has a lead and a defined roster.

| Field             | Type         | Description                 |
| ----------------- | ------------ | --------------------------- |
| `id`              | UUID         | Primary key                 |
| `organization_id` | UUID         | FK → organizations.id       |
| `department_id`   | UUID         | FK → departments.id         |
| `name`            | string       | Team name                   |
| `lead_member_id`  | UUID \| null | FK → members.id — team lead |
| `status`          | string       | `active`, `archived`        |
| `metadata`        | JSONB        | Optional metadata           |
| `created_at`      | TIMESTAMPTZ  | Creation timestamp          |
| `updated_at`      | TIMESTAMPTZ  | Last modification timestamp |

**Relationships:**

- Belongs to `organizations`
- Belongs to `departments`
- Has many `members` (via team_memberships)

**Tenant ownership:** `organization_id`

**Access pattern:** Team Lead and above: CRUD. Members: read own team.

**RLS notes:** Standard tenant RLS. Reads are further filtered by department membership where required.

---

### members

**Description:** A human actor within an organization. May have an email identity, a WhatsApp phone identity, or both.

| Field             | Type           | Description                                         |
| ----------------- | -------------- | --------------------------------------------------- |
| `id`              | UUID           | Primary key                                         |
| `organization_id` | UUID           | FK → organizations.id                               |
| `display_name`    | string         | Full name for display                               |
| `email`           | string \| null | Verified email address (unique within org)          |
| `whatsapp_phone`  | string \| null | E.164 WhatsApp phone number (unique within org)     |
| `job_title`       | string \| null | Job title                                           |
| `avatar_url`      | string \| null | Profile picture URL                                 |
| `status`          | string         | `active`, `inactive`, `suspended`                   |
| `department_id`   | UUID \| null   | FK → departments.id — primary department            |
| `manager_id`      | UUID \| null   | FK → members.id (self-referential — reporting line) |
| `metadata`        | JSONB          | Additional profile fields                           |
| `created_at`      | TIMESTAMPTZ    | Creation timestamp                                  |
| `updated_at`      | TIMESTAMPTZ    | Last modification timestamp                         |

**Relationships:**

- Belongs to `organizations`
- Belongs to `departments` (primary)
- Belongs to `members` (manager, optional)
- Has many `members` (direct reports)
- Has many `role_assignments`
- Has many `tasks` (as assignee)

**Tenant ownership:** `organization_id`

**Access pattern:** Manager and above: CRUD on team members. Members: read peers, update own profile.

**RLS notes:** Standard tenant RLS. Sensitive fields (`whatsapp_phone`, `email`) are redacted from logs. Application layer enforces field-level access per role.

---

### roles

**Description:** Named roles within the platform's RBAC system. Roles are either platform-defined (seeded) or organization-custom.

| Field             | Type         | Description                                           |
| ----------------- | ------------ | ----------------------------------------------------- |
| `id`              | UUID         | Primary key                                           |
| `organization_id` | UUID \| null | null = platform role; UUID = org-custom role          |
| `slug`            | string       | Canonical identifier (e.g., `org:owner`, `dept:head`) |
| `display_name`    | string       | Human-readable name                                   |
| `description`     | string       | What this role permits                                |
| `is_system`       | boolean      | True if seeded by platform, false if custom           |
| `created_at`      | TIMESTAMPTZ  | Creation timestamp                                    |

**Relationships:**

- Optionally belongs to `organizations` (null for platform roles)
- Has many `role_assignments`
- Has many `permissions` (via role_permissions join)

**Tenant ownership:** `organization_id` (nullable — platform roles have no tenant owner)

**Access pattern:** Organization Owner: create/manage org-custom roles. Platform Admin: manage system roles.

**RLS notes:** Platform roles (organization_id IS NULL) are readable by all authenticated members. Org-custom roles are scoped to their tenant.

---

### permissions

**Description:** Named permission strings that can be assigned to roles. Permissions follow a `action:resource` naming convention.

| Field          | Type        | Description                                                     |
| -------------- | ----------- | --------------------------------------------------------------- |
| `id`           | UUID        | Primary key                                                     |
| `slug`         | string      | Unique permission string (e.g., `manage:workflows`)             |
| `display_name` | string      | Human-readable label                                            |
| `description`  | string      | What this permission grants                                     |
| `category`     | string      | Grouping: `identity`, `workflow`, `analytics`, `agent`, `admin` |
| `created_at`   | TIMESTAMPTZ | Creation timestamp                                              |

**Relationships:**

- Has many `roles` (via role_permissions join)

**Tenant ownership:** None — permissions are global platform definitions.

**Access pattern:** Read-only for all authenticated actors. Platform Admin: manage permission definitions.

**RLS notes:** No RLS — permissions table is global.

---

### tasks

**Description:** Actionable work items assigned to members, typically created within workflow run steps.

| Field                  | Type                | Description                                                   |
| ---------------------- | ------------------- | ------------------------------------------------------------- |
| `id`                   | UUID                | Primary key                                                   |
| `organization_id`      | UUID                | FK → organizations.id                                         |
| `workflow_run_id`      | UUID \| null        | FK → workflow_runs.id (null for standalone tasks)             |
| `workflow_run_step_id` | UUID \| null        | FK → workflow_run_steps.id                                    |
| `title`                | string              | Task title                                                    |
| `description`          | string \| null      | Detailed description                                          |
| `assignee_member_id`   | UUID                | FK → members.id                                               |
| `created_by_member_id` | UUID                | FK → members.id                                               |
| `status`               | string              | `pending`, `in_progress`, `completed`, `overdue`, `cancelled` |
| `priority`             | string              | `low`, `medium`, `high`, `critical`                           |
| `due_at`               | TIMESTAMPTZ \| null | Task deadline                                                 |
| `completed_at`         | TIMESTAMPTZ \| null | When the task was completed                                   |
| `metadata`             | JSONB               | Additional task data                                          |
| `created_at`           | TIMESTAMPTZ         | Creation timestamp                                            |
| `updated_at`           | TIMESTAMPTZ         | Last modification timestamp                                   |

**Relationships:**

- Belongs to `organizations`
- Belongs to `workflow_runs` (optional)
- Belongs to `workflow_run_steps` (optional)
- Belongs to `members` (assignee)
- Belongs to `members` (creator)

**Tenant ownership:** `organization_id`

**Access pattern:** Assignee: read + update own tasks. Manager: read team tasks. Workflow OS: create/update via worker.

**RLS notes:** Standard tenant RLS. Application layer filters by membership scope (member sees own tasks; manager sees team tasks).

---

### approvals

**Description:** Approval request instances created within workflow runs, tracking the full decision lifecycle.

| Field                  | Type                | Description                                              |
| ---------------------- | ------------------- | -------------------------------------------------------- |
| `id`                   | UUID                | Primary key                                              |
| `organization_id`      | UUID                | FK → organizations.id                                    |
| `workflow_run_id`      | UUID                | FK → workflow_runs.id                                    |
| `workflow_run_step_id` | UUID                | FK → workflow_run_steps.id                               |
| `title`                | string              | Approval request subject                                 |
| `description`          | string \| null      | Context for approvers                                    |
| `outcome`              | string              | `pending`, `granted`, `rejected`, `delegated`, `expired` |
| `quorum_type`          | string              | `any` (any approver), `all` (unanimous), `majority`      |
| `decided_at`           | TIMESTAMPTZ \| null | When the final decision was reached                      |
| `expires_at`           | TIMESTAMPTZ \| null | Auto-expire deadline                                     |
| `metadata`             | JSONB               | Additional context data                                  |
| `created_at`           | TIMESTAMPTZ         | Creation timestamp                                       |
| `updated_at`           | TIMESTAMPTZ         | Last modification timestamp                              |

**Relationships:**

- Belongs to `organizations`
- Belongs to `workflow_runs`
- Belongs to `workflow_run_steps`
- Has many `approval_decisions` (one per approver)

**Tenant ownership:** `organization_id`

**Access pattern:** Approvers: read + decide on assigned approvals. Requestor: read status. Workflow OS: create/update via worker.

**RLS notes:** Standard tenant RLS. Column-level checks ensure only designated approvers can submit decisions.

---

### workflows

**Description:** Versioned workflow definition templates that describe the steps, routing, and trigger configuration for a repeatable business process.

| Field                  | Type                | Description                                 |
| ---------------------- | ------------------- | ------------------------------------------- |
| `id`                   | UUID                | Primary key                                 |
| `organization_id`      | UUID                | FK → organizations.id                       |
| `name`                 | string              | Workflow template name                      |
| `description`          | string \| null      | Purpose and usage description               |
| `version`              | string              | Semver of this definition                   |
| `status`               | string              | `draft`, `active`, `paused`, `archived`     |
| `trigger_config`       | JSONB               | Trigger definition (keyword, schedule, API) |
| `step_config`          | JSONB               | Ordered step definitions                    |
| `created_by_member_id` | UUID                | FK → members.id                             |
| `published_at`         | TIMESTAMPTZ \| null | When this version was made active           |
| `created_at`           | TIMESTAMPTZ         | Creation timestamp                          |
| `updated_at`           | TIMESTAMPTZ         | Last modification timestamp                 |

**Relationships:**

- Belongs to `organizations`
- Belongs to `members` (creator)
- Has many `workflow_steps`
- Has many `workflow_runs`

**Tenant ownership:** `organization_id`

**Access pattern:** Manager and above: CRUD on workflow definitions. Members: read active workflows they participate in.

**RLS notes:** Standard tenant RLS.

---

### workflow_steps

**Description:** Individual step definitions within a workflow template, ordered by sequence.

| Field               | Type        | Description                                                      |
| ------------------- | ----------- | ---------------------------------------------------------------- |
| `id`                | UUID        | Primary key                                                      |
| `organization_id`   | UUID        | FK → organizations.id                                            |
| `workflow_id`       | UUID        | FK → workflows.id                                                |
| `sequence`          | integer     | Ordinal position in the workflow                                 |
| `name`              | string      | Step name                                                        |
| `type`              | string      | `task`, `approval`, `notification`, `branch`, `delay`, `webhook` |
| `config`            | JSONB       | Step-type-specific configuration                                 |
| `routing_rules`     | JSONB       | Conditional routing expressions                                  |
| `escalation_policy` | JSONB       | Time-to-escalate and target                                      |
| `created_at`        | TIMESTAMPTZ | Creation timestamp                                               |
| `updated_at`        | TIMESTAMPTZ | Last modification timestamp                                      |

**Relationships:**

- Belongs to `organizations`
- Belongs to `workflows`
- Has many `workflow_run_steps`

**Tenant ownership:** `organization_id`

**Access pattern:** Workflow editor (Manager+): CRUD. Runtime (worker): read during execution.

**RLS notes:** Standard tenant RLS.

---

### workflow_runs

**Description:** Live execution instances of a workflow definition. Each run has its own state machine and context.

| Field                 | Type                | Description                                    |
| --------------------- | ------------------- | ---------------------------------------------- |
| `id`                  | UUID                | Primary key                                    |
| `organization_id`     | UUID                | FK → organizations.id                          |
| `workflow_id`         | UUID                | FK → workflows.id                              |
| `definition_version`  | string              | Snapshot of the definition version used        |
| `status`              | string              | `running`, `completed`, `failed`, `cancelled`  |
| `initiator_member_id` | UUID                | FK → members.id                                |
| `trigger_type`        | string              | `whatsapp_message`, `api`, `schedule`, `agent` |
| `current_step_id`     | UUID \| null        | FK → workflow_steps.id                         |
| `context`             | JSONB               | Runtime context data (inputs, step outputs)    |
| `started_at`          | TIMESTAMPTZ         | Run start timestamp                            |
| `completed_at`        | TIMESTAMPTZ \| null | Run completion timestamp                       |
| `created_at`          | TIMESTAMPTZ         | Creation timestamp                             |
| `updated_at`          | TIMESTAMPTZ         | Last modification timestamp                    |

**Relationships:**

- Belongs to `organizations`
- Belongs to `workflows`
- Belongs to `members` (initiator)
- Has many `workflow_run_steps`
- Has many `tasks`
- Has many `approvals`

**Tenant ownership:** `organization_id`

**Access pattern:** Workflow OS (worker): full lifecycle management. Members: read runs they participate in.

**RLS notes:** Standard tenant RLS.

---

### events

**Description:** The persistent event store for all `GalaxyEvent` instances. This table is append-only. Events are the source of truth for all state changes and feed the audit log and analytics pipelines.

| Field             | Type         | Description                                        |
| ----------------- | ------------ | -------------------------------------------------- |
| `id`              | UUID         | Event ID (from GalaxyEvent envelope)               |
| `organization_id` | UUID         | FK → organizations.id                              |
| `version`         | string       | Event schema version                               |
| `type`            | string       | Dot-notation event type                            |
| `tenant_id`       | UUID         | Redundant with organization_id for quick filtering |
| `correlation_id`  | UUID         | Request chain trace ID                             |
| `causation_id`    | UUID \| null | Parent event ID                                    |
| `actor_type`      | string       | `member`, `agent`, `system`                        |
| `actor_id`        | string       | Actor's UUID or system identifier                  |
| `payload`         | JSONB        | Domain-specific event payload                      |
| `metadata`        | JSONB        | Source, region, optional tags                      |
| `occurred_at`     | TIMESTAMPTZ  | When the event occurred                            |
| `recorded_at`     | TIMESTAMPTZ  | When the event was written to this table           |

**Relationships:**

- Belongs to `organizations`

**Tenant ownership:** `organization_id`

**Access pattern:** Workers: INSERT only. Analytics OS: read for aggregation. Platform Admin: read for forensics.

**RLS notes:** INSERT is permitted for service role. SELECT is scoped to tenant. No UPDATE or DELETE ever.

---

### audit_logs

**Description:** Immutable compliance audit trail. Every state-changing event produces an audit log entry. The table has INSERT-only RLS — no UPDATE or DELETE is ever permitted.

| Field             | Type           | Description                                                 |
| ----------------- | -------------- | ----------------------------------------------------------- |
| `id`              | UUID           | Primary key                                                 |
| `organization_id` | UUID           | FK → organizations.id                                       |
| `category`        | string         | `auth`, `data`, `admin`, `agent`, `workflow`, `integration` |
| `event_type`      | string         | Source GalaxyEvent type that triggered this log             |
| `correlation_id`  | UUID           | Request chain trace ID                                      |
| `actor_type`      | string         | `member`, `agent`, `system`                                 |
| `actor_id`        | string         | Actor UUID or system ID                                     |
| `resource_type`   | string         | Entity type affected (e.g., `workflow_run`)                 |
| `resource_id`     | UUID \| null   | Entity ID affected                                          |
| `before_snapshot` | JSONB          | State before the change (null for creates)                  |
| `after_snapshot`  | JSONB          | State after the change (null for deletes)                   |
| `ip_address`      | string \| null | Client IP (for auth events)                                 |
| `user_agent`      | string \| null | Client user agent (for auth events)                         |
| `severity`        | string         | `info`, `warning`, `error`, `critical`                      |
| `entry_hash`      | string         | SHA-256 of this entry's content + previous entry hash       |
| `occurred_at`     | TIMESTAMPTZ    | When the source event occurred                              |
| `recorded_at`     | TIMESTAMPTZ    | When this entry was written                                 |

**Relationships:**

- Belongs to `organizations`

**Tenant ownership:** `organization_id`

**Access pattern:** Governance OS (worker): INSERT. Auditor and Platform Admin: read-only SELECT. No UPDATE or DELETE by anyone.

**RLS notes:** INSERT-only policy enforced at the database level. SELECT is scoped to tenant. UPDATE and DELETE are blocked by policy for all roles including the service account.

---

### notifications

**Description:** Notification jobs representing intents to send messages to members. Tracks delivery attempts and final delivery status.

| Field                 | Type                | Description                                      |
| --------------------- | ------------------- | ------------------------------------------------ |
| `id`                  | UUID                | Primary key                                      |
| `organization_id`     | UUID                | FK → organizations.id                            |
| `recipient_member_id` | UUID                | FK → members.id                                  |
| `channel`             | string              | `whatsapp` (future: `email`, `sms`)              |
| `template_name`       | string              | WhatsApp template name                           |
| `template_params`     | JSONB               | Template parameter values                        |
| `status`              | string              | `pending`, `sent`, `delivered`, `read`, `failed` |
| `wamid`               | string \| null      | Meta-issued message ID after successful dispatch |
| `attempt_count`       | integer             | Number of send attempts                          |
| `last_attempted_at`   | TIMESTAMPTZ \| null | Most recent attempt timestamp                    |
| `delivered_at`        | TIMESTAMPTZ \| null | Delivery confirmation timestamp                  |
| `failed_reason`       | string \| null      | Error description on terminal failure            |
| `workflow_run_id`     | UUID \| null        | Workflow run that triggered this notification    |
| `created_at`          | TIMESTAMPTZ         | Creation timestamp                               |
| `updated_at`          | TIMESTAMPTZ         | Last modification timestamp                      |

**Relationships:**

- Belongs to `organizations`
- Belongs to `members` (recipient)
- Belongs to `workflow_runs` (optional)

**Tenant ownership:** `organization_id`

**Access pattern:** Communication OS (worker): CRUD. Members: read own notifications.

**RLS notes:** Standard tenant RLS.

---

### messages

**Description:** Individual WhatsApp messages, both inbound (from members) and outbound (from platform). Grouped into conversations.

| Field              | Type                | Description                                                     |
| ------------------ | ------------------- | --------------------------------------------------------------- |
| `id`               | UUID                | Primary key                                                     |
| `organization_id`  | UUID                | FK → organizations.id                                           |
| `conversation_id`  | UUID                | FK → conversations.id                                           |
| `wamid`            | string              | Meta-issued WhatsApp message ID                                 |
| `direction`        | string              | `inbound`, `outbound`                                           |
| `sender_member_id` | UUID \| null        | FK → members.id (null for unknown inbound)                      |
| `content_type`     | string              | `text`, `image`, `document`, `audio`, `interactive`, `template` |
| `content`          | JSONB               | Message content payload (sanitized, never logged)               |
| `status`           | string              | `pending`, `sent`, `delivered`, `read`, `failed`                |
| `received_at`      | TIMESTAMPTZ \| null | Meta webhook timestamp for inbound                              |
| `sent_at`          | TIMESTAMPTZ \| null | Dispatch timestamp for outbound                                 |
| `created_at`       | TIMESTAMPTZ         | Record creation timestamp                                       |

**Relationships:**

- Belongs to `organizations`
- Belongs to `conversations`
- Belongs to `members` (sender, optional)

**Tenant ownership:** `organization_id`

**Access pattern:** Communication OS: CRUD. Members: read own conversation messages.

**RLS notes:** Standard tenant RLS. `content` field must never be written to application logs.

---

### knowledge_documents

**Description:** Versioned organizational knowledge documents, SOPs, and reference materials.

| Field                | Type                | Description                                      |
| -------------------- | ------------------- | ------------------------------------------------ |
| `id`                 | UUID                | Primary key                                      |
| `organization_id`    | UUID                | FK → organizations.id                            |
| `collection_id`      | UUID \| null        | FK → knowledge_collections.id                    |
| `title`              | string              | Document title                                   |
| `body`               | text                | Markdown document body                           |
| `version`            | integer             | Monotonically incrementing version number        |
| `status`             | string              | `draft`, `under_review`, `published`, `archived` |
| `author_member_id`   | UUID                | FK → members.id                                  |
| `reviewer_member_id` | UUID \| null        | FK → members.id                                  |
| `tags`               | string[]            | Taxonomy tags                                    |
| `embedding_status`   | string              | `pending`, `indexed`, `failed`                   |
| `published_at`       | TIMESTAMPTZ \| null | When the document was published                  |
| `created_at`         | TIMESTAMPTZ         | Creation timestamp                               |
| `updated_at`         | TIMESTAMPTZ         | Last modification timestamp                      |

**Relationships:**

- Belongs to `organizations`
- Belongs to `knowledge_collections` (optional)
- Belongs to `members` (author)
- Belongs to `members` (reviewer, optional)
- Has many `document_embeddings`

**Tenant ownership:** `organization_id`

**Access pattern:** All members: read published documents. Authors: CRUD on own drafts. Manager+: publish/archive.

**RLS notes:** Standard tenant RLS. Status-based visibility enforced at application layer (drafts visible to author only).

---

### agent_actions

**Description:** Records of every tool invocation by an AI agent, including governance classification and outcome.

| Field                    | Type                | Description                                                                          |
| ------------------------ | ------------------- | ------------------------------------------------------------------------------------ |
| `id`                     | UUID                | Primary key                                                                          |
| `organization_id`        | UUID                | FK → organizations.id                                                                |
| `agent_session_id`       | UUID                | FK → agent_sessions.id                                                               |
| `tool_name`              | string              | Registered tool identifier                                                           |
| `input_params`           | JSONB               | Tool input parameters                                                                |
| `output`                 | JSONB \| null       | Tool output (null if blocked or pending)                                             |
| `impact_tier`            | integer             | 1–4 impact classification                                                            |
| `governance_outcome`     | string              | `auto_approved`, `pending_human`, `human_approved`, `human_rejected`, `auto_blocked` |
| `governance_approval_id` | UUID \| null        | FK → governance_approvals.id (for Tier 3–4)                                          |
| `status`                 | string              | `pending`, `executing`, `completed`, `failed`, `blocked`                             |
| `error_message`          | string \| null      | Error detail if status is failed                                                     |
| `started_at`             | TIMESTAMPTZ         | When execution began                                                                 |
| `completed_at`           | TIMESTAMPTZ \| null | When execution finished                                                              |
| `created_at`             | TIMESTAMPTZ         | Record creation timestamp                                                            |

**Relationships:**

- Belongs to `organizations`
- Belongs to `agent_sessions`
- Belongs to `governance_approvals` (optional)

**Tenant ownership:** `organization_id`

**Access pattern:** Agent OS (worker): CRUD. Auditor and Platform Admin: read-only. Members: read their own session actions.

**RLS notes:** Standard tenant RLS. All entries are effectively append-only in practice — completed actions should not be modified.

---

### ai_insights

**Description:** Pattern-detected insights generated by the Loop Engine, with associated recommendations and action tracking.

| Field                    | Type                | Description                                                         |
| ------------------------ | ------------------- | ------------------------------------------------------------------- |
| `id`                     | UUID                | Primary key                                                         |
| `organization_id`        | UUID                | FK → organizations.id                                               |
| `type`                   | string              | `bottleneck`, `compliance_gap`, `efficiency_opportunity`, `anomaly` |
| `title`                  | string              | Short insight summary                                               |
| `description`            | string              | Detailed finding explanation                                        |
| `recommendation`         | string              | Suggested action                                                    |
| `affected_resource_type` | string \| null      | Entity type the insight applies to                                  |
| `affected_resource_id`   | UUID \| null        | Entity the insight applies to                                       |
| `severity`               | string              | `low`, `medium`, `high`                                             |
| `status`                 | string              | `new`, `acknowledged`, `acted_upon`, `dismissed`                    |
| `acted_by_member_id`     | UUID \| null        | FK → members.id — who acted on it                                   |
| `acted_at`               | TIMESTAMPTZ \| null | When action was taken                                               |
| `detected_at`            | TIMESTAMPTZ         | When the Loop Engine detected this pattern                          |
| `created_at`             | TIMESTAMPTZ         | Record creation timestamp                                           |
| `updated_at`             | TIMESTAMPTZ         | Last modification timestamp                                         |

**Relationships:**

- Belongs to `organizations`
- Belongs to `members` (actor, optional)

**Tenant ownership:** `organization_id`

**Access pattern:** Loop Engine (system): INSERT. Executives and Managers: read. Organization Owner: acknowledge/dismiss.

**RLS notes:** Standard tenant RLS.

---

## Entity Relationship Summary

```
organizations (1)
  ├── (many) departments
  │     └── (many) teams
  │           └── (many via team_memberships) members
  ├── (many) members
  │     ├── (many) role_assignments → roles
  │     ├── (many) tasks (as assignee)
  │     └── (self-ref) members (manager → reports)
  ├── (many) roles → (many via role_permissions) permissions
  ├── (many) workflows
  │     ├── (many) workflow_steps
  │     └── (many) workflow_runs
  │           ├── (many) workflow_run_steps → workflow_steps
  │           ├── (many) tasks
  │           ├── (many) approvals
  │           │     └── (many) approval_decisions → members
  │           └── (many) notifications → members
  ├── (many) messages → conversations → members
  ├── (many) knowledge_documents → knowledge_collections
  ├── (many) agent_sessions → agents
  │     └── (many) agent_actions → governance_approvals
  ├── (many) ai_insights
  ├── (many) events  [append-only]
  └── (many) audit_logs  [INSERT-only]
```

### Key Cardinalities

| Relationship                      | Cardinality                        |
| --------------------------------- | ---------------------------------- |
| Organization → Departments        | 1 : many                           |
| Department → Teams                | 1 : many                           |
| Department → Departments (parent) | 1 : many (self-ref, nullable)      |
| Organization → Members            | 1 : many                           |
| Member → RoleAssignments          | 1 : many                           |
| Role → Permissions                | many : many (via role_permissions) |
| Organization → Workflows          | 1 : many                           |
| Workflow → WorkflowRuns           | 1 : many                           |
| WorkflowRun → Tasks               | 1 : many                           |
| WorkflowRun → Approvals           | 1 : many                           |
| Member → Tasks (assignee)         | 1 : many                           |
| Member → Members (manager)        | 1 : many (self-ref, nullable)      |
| Organization → AuditLogs          | 1 : many (INSERT-only)             |
| AgentSession → AgentActions       | 1 : many                           |
| AgentAction → GovernanceApprovals | 1 : 0-or-1                         |
