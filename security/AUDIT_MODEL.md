# Galaxy Audit Model

This document defines the audit event taxonomy, required fields, retention policies, forensics capabilities, compliance mappings, and chain of custody mechanisms for the Galaxy Loop OS audit system.

---

## Audit Event Taxonomy

Every state-changing event in Galaxy produces an audit log entry. Audit events are classified into six categories:

### Category: auth

Authentication and authorization events. These events record every attempt to access the platform, whether successful or not.

**Examples:**

- Member login (success and failure)
- JWT token issuance and refresh
- Token revocation
- WhatsApp phone number verification
- Permission denied (403) responses
- Role assignment and revocation

### Category: data

Data modification events covering CRUD operations on tenant operational data.

**Examples:**

- Member profile created, updated, or deactivated
- Department or team created, updated, or deleted
- Workflow definition created, published, or archived
- Knowledge document created, published, or deleted
- Organization settings updated

### Category: admin

Administrative platform actions, particularly those with elevated privilege or cross-tenant impact.

**Examples:**

- Organization provisioned or suspended by Platform Admin
- Billing tier changed
- WABA integration configured or reconfigured
- DLQ job replayed by Platform Admin
- Platform Admin accessing organization operational data (requires justification)
- Schema migration executed

### Category: agent

AI agent actions, governance decisions, and human-in-the-loop approval outcomes.

**Examples:**

- Agent session started or ended
- Agent tool invoked (every invocation, regardless of outcome)
- AutomationGovernanceGuard classification decision
- Tier 3–4 action routed for human approval
- Human approver grants or rejects a Tier 3–4 action
- Agent action auto-blocked by governance guard

### Category: workflow

Workflow lifecycle events that represent significant state transitions in business processes.

**Examples:**

- Workflow run started or completed
- Workflow run step completed
- Task created, assigned, completed, or overdue
- Approval request created
- Approval granted or rejected
- Workflow escalation triggered
- Workflow run cancelled or failed

### Category: integration

External system integration events.

**Examples:**

- WhatsApp webhook received and verified
- WhatsApp webhook signature validation failed
- Outbound WhatsApp message sent, delivered, or failed
- External webhook connector triggered
- WABA credential rotated

---

## Required Fields for Every Audit Log Entry

Every audit log entry written to the `audit_logs` table must include all of the following fields. A missing mandatory field causes the audit writer to emit a `critical` platform alert and retry the write.

| Field             | Type        | Description                                                                               |
| ----------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `id`              | UUID        | Primary key of this audit log entry                                                       |
| `organization_id` | UUID        | Tenant context (set to `platform` UUID for platform-scope admin events)                   |
| `category`        | string      | One of: `auth`, `data`, `admin`, `agent`, `workflow`, `integration`                       |
| `event_type`      | string      | Source `GalaxyEvent.type` that triggered this log entry (dot-notation)                    |
| `correlation_id`  | UUID        | Request chain trace ID from the originating request                                       |
| `actor_type`      | string      | `member`, `agent`, or `system`                                                            |
| `actor_id`        | string      | UUID of the actor (member ID, agent ID, or system process name)                           |
| `resource_type`   | string      | Entity type affected (e.g., `member`, `workflow_run`, `approval`)                         |
| `resource_id`     | UUID        | ID of the affected entity (null for bulk operations or global actions)                    |
| `before_snapshot` | JSONB       | State of the resource before the change; null for create operations                       |
| `after_snapshot`  | JSONB       | State of the resource after the change; null for delete operations                        |
| `severity`        | string      | `info`, `warning`, `error`, or `critical`                                                 |
| `entry_hash`      | string      | SHA-256 hash of this entry's canonical fields concatenated with the previous entry's hash |
| `occurred_at`     | TIMESTAMPTZ | UTC timestamp from the source `GalaxyEvent.occurredAt`                                    |
| `recorded_at`     | TIMESTAMPTZ | UTC timestamp when this entry was written to the database                                 |

**Optional fields** (included when applicable):

| Field           | Type   | When Included                                                         |
| --------------- | ------ | --------------------------------------------------------------------- |
| `ip_address`    | string | Auth events where client IP is available                              |
| `user_agent`    | string | Auth events where client user agent is available                      |
| `justification` | string | Mandatory for Platform Admin data access events                       |
| `metadata`      | JSONB  | Additional context (e.g., template name, workflow definition version) |

---

## Retention Policy

Audit logs are retained in three tiers based on recency. Tier transitions are automated by a scheduled platform job.

### Hot Tier (0–90 days)

- **Storage:** Primary PostgreSQL database, `audit_logs` table, indexed for fast query
- **Access:** Auditors, Executives, Organization Owners via the web dashboard and API
- **Query performance:** Full-text and indexed queries on `actor_id`, `resource_id`, `category`, `occurred_at`
- **Retention duration:** 90 days from `recorded_at`

### Warm Tier (91–365 days)

- **Storage:** Compressed Parquet files in AWS S3 (`galaxy-audit-logs/{organizationId}/{year}/{month}/`)
- **Access:** Platform Admin and Auditor role via export request; data is returned within 24 hours
- **Query performance:** Batch query via Athena or equivalent; results delivered asynchronously
- **Retention duration:** Days 91–365 from `recorded_at`

### Cold Tier (1–7 years)

- **Storage:** AWS S3 Glacier Instant Retrieval, same path structure as warm tier
- **Access:** Platform Admin only, via explicit compliance export request; retrieval SLA 12 hours
- **Query performance:** Batch only; not available for interactive query
- **Retention duration:** Years 1–7 from `recorded_at`; after year 7, data is deleted unless subject to legal hold

### Legal Hold

Audit log entries subject to a declared legal hold are moved to a separate S3 bucket with Object Lock enabled (WORM — Write Once Read Many). Legal hold records are managed by the Platform Admin and are not subject to automated deletion. A `legal_hold` flag is set on the affected entries.

### Deletion

At the end of the cold tier retention period, audit log entries are permanently deleted. A deletion job records a summary event in the platform admin log: number of entries deleted, date range covered, and the actor (system) that performed the deletion. This deletion record itself is retained indefinitely.

---

## Forensics Capability

### Timeline Reconstruction

Given a `correlationId`, a security engineer or auditor can reconstruct the complete causal chain of events for any request:

1. Query `audit_logs WHERE correlation_id = $correlationId ORDER BY occurred_at ASC`
2. The result set shows every state change in the order they occurred within that request chain
3. Each entry includes `before_snapshot` and `after_snapshot`, enabling exact reconstruction of what changed and when

### Actor Activity Reconstruction

Given an `actor_id`, an auditor can retrieve all actions taken by a member, agent, or system process:

1. Query `audit_logs WHERE actor_id = $actorId AND occurred_at BETWEEN $start AND $end`
2. Filter by `category` to focus on specific activity types
3. The result shows a chronological activity log for the actor

### Resource History

Given a `resource_id` and `resource_type`, an auditor can reconstruct the complete modification history of any entity:

1. Query `audit_logs WHERE resource_id = $resourceId AND resource_type = $resourceType ORDER BY occurred_at ASC`
2. The `before_snapshot` and `after_snapshot` fields enable diff-level reconstruction of each change
3. The first entry (category `data`, actor creates the entity) establishes the initial state

### Cross-Tenant Anomaly Detection

Platform Admin forensic queries may span tenants for incident investigation. These queries:

1. Require the `manage:audit` permission (Platform Admin only)
2. Are themselves recorded as `category: admin, severity: critical` audit log entries with the Platform Admin's actor ID and a mandatory justification
3. Return only the fields necessary for the investigation (principle of minimum necessary access)

---

## Compliance Support

### GDPR (General Data Protection Regulation)

| GDPR Requirement                 | Audit Event(s)                               | Control                                                                                                        |
| -------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Data access logging              | `data.*`, `auth.*`                           | Every read/write of personal data is audit-logged                                                              |
| Consent tracking                 | `data.member.created`, `data.member.updated` | Member onboarding events record consent status in `after_snapshot`                                             |
| Data export (Right of Access)    | `admin.data_export.requested`                | Platform Admin data export jobs are audit-logged                                                               |
| Data deletion (Right to Erasure) | `admin.member.deleted`                       | Deletion events include PII fields in `before_snapshot` (which is itself subject to the same retention policy) |
| Data breach notification window  | `integration.security.anomaly_detected`      | Cross-tenant anomaly events trigger 72-hour notification workflow                                              |

### SOC 2 Type II

| SOC 2 Trust Service Criteria    | Audit Event(s)                                                | Control                                              |
| ------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| CC6.1 — Logical access controls | `auth.*`, `identity.role_assignment.*`                        | All access events and role changes are logged        |
| CC6.2 — User authentication     | `identity.auth.login_succeeded`, `identity.auth.login_failed` | Every login attempt is logged with IP and user agent |
| CC6.3 — Authorization           | `auth.permission.denied`                                      | All permission denials are logged                    |
| CC7.2 — Monitoring              | `analytics.sla.breached`, `governance.*`                      | Automated monitoring events feed into audit stream   |
| CC8.1 — Change management       | `data.*`, `admin.*`                                           | All configuration and data changes are audit-logged  |
| CC9.2 — Vendor risk             | `integration.*`                                               | All external integration events are logged           |

### ISO 27001

| ISO 27001 Control                        | Audit Event(s)                                                | Control                                            |
| ---------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| A.9.4.1 — Information access restriction | `auth.permission.denied`, `identity.role_assignment.*`        | RBAC enforcement events                            |
| A.9.4.2 — Secure log-on                  | `identity.auth.login_succeeded`, `identity.auth.login_failed` | Authentication audit trail                         |
| A.12.4.1 — Event logging                 | All categories                                                | Comprehensive event logging across all OS modules  |
| A.12.4.2 — Protection of log information | INSERT-only RLS, hash chaining                                | Immutability controls (see Chain of Custody)       |
| A.16.1.1 — Incident management           | `governance.audit.recorded` with `severity: critical`         | Critical events trigger incident response workflow |

---

## Chain of Custody

### INSERT-Only RLS Policy

The `audit_logs` table has a PostgreSQL RLS policy that permits INSERT for the service role but blocks UPDATE and DELETE for all roles, including the database superuser (enforced by the policy definition, not role grants).

This is implemented as:

```
-- Policy allows INSERT only
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_tenant')::uuid);

-- No UPDATE policy exists — UPDATE is denied by default
-- No DELETE policy exists — DELETE is denied by default
```

Application code must never attempt UPDATE or DELETE on `audit_logs`. If such a query is somehow constructed and executed, the database returns an RLS violation error. This event is itself logged at `critical` severity by the database error handler.

### Hash Chaining

Each audit log entry includes an `entry_hash` field computed as:

```
entry_hash = SHA-256(
  id + organization_id + event_type + actor_id + resource_id +
  occurred_at + recorded_at + before_snapshot + after_snapshot +
  previous_entry_hash
)
```

Where `previous_entry_hash` is the `entry_hash` of the most recently written entry for the same `organization_id`. The first entry for an organization uses a static genesis hash.

This creates a hash chain similar to a blockchain: any modification of a historical entry would invalidate the chain from that entry forward, making tampering detectable during a chain integrity audit.

### Chain Integrity Verification

A scheduled daily job (`audit-integrity-verifier`) recomputes the hash chain for each organization's audit log and verifies it matches the stored `entry_hash` values. If a discrepancy is detected:

1. A `governance.audit.integrity_violation` event is emitted at `critical` severity
2. An immediate platform alert fires to the security on-call channel
3. The affected entry range is flagged for manual investigation
4. The incident response playbook for audit log tampering is automatically triggered

### Immutability at Export

When audit logs are exported to S3 for the warm or cold tier, the export job includes a manifest file containing a SHA-256 hash of every exported entry. This manifest is signed with the platform's audit signing key (stored in AWS Secrets Manager). Any future verification of the exported data can recompute hashes against the signed manifest.
