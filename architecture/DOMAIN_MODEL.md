# Galaxy Domain Model

This document defines the bounded contexts, aggregates, entities, value objects, domain services, and domain events for each OS domain within the Galaxy Loop OS platform.

---

## 1. Identity OS

### Responsibilities

- Provision and manage organizations (tenants) on the platform
- Manage member accounts, credentials, and WhatsApp identity linking
- Issue and validate JWT tokens for API access
- Enforce RBAC role assignments at the organization scope
- Bootstrap Row-Level Security context for all tenant operations

### Aggregates

| Aggregate          | Description                                                                           |
| ------------------ | ------------------------------------------------------------------------------------- |
| **Organization**   | The root tenant aggregate. Owns all sub-entities within the tenant boundary.          |
| **Member**         | A human actor within an organization, linked to a WhatsApp phone number and/or email. |
| **RoleAssignment** | The binding of a role to a member within a scope (org, department, or team).          |

### Entities

**Organization aggregate:**

- `Organization` — root entity; holds tenant metadata, WABA config, subscription tier
- `OrganizationSettings` — configurable preferences (timezone, locale, feature flags)
- `WABAConfig` — WhatsApp Business Account binding (phone_number_id, access token ref)

**Member aggregate:**

- `Member` — root entity; holds profile data and credential references
- `PhoneIdentity` — verified WhatsApp phone number linked to the member
- `EmailIdentity` — optional email credential for web dashboard login
- `MemberProfile` — display name, avatar URL, job title

**RoleAssignment aggregate:**

- `RoleAssignment` — root entity; role + scope + member binding with effective dates

### Value Objects

| Value Object     | Description                                          |
| ---------------- | ---------------------------------------------------- | ------------ | ------------------- |
| `OrganizationId` | UUID wrapper; used as the RLS tenant key             |
| `MemberId`       | UUID wrapper                                         |
| `PhoneNumber`    | E.164-formatted phone string with validation         |
| `Email`          | RFC 5321 validated email address                     |
| `RoleSlug`       | Canonical role identifier string (e.g., `org:owner`) |
| `ScopeRef`       | Polymorphic scope reference: `{ type: 'org'          | 'department' | 'team', id: UUID }` |
| `JwtClaims`      | Immutable snapshot of claims embedded in a token     |

### Domain Services

| Service                           | Responsibility                                                          |
| --------------------------------- | ----------------------------------------------------------------------- |
| `OrganizationProvisioningService` | Creates a new tenant, seeds default roles, emits `organization.created` |
| `MemberAuthService`               | Validates credentials, issues JWTs, refreshes tokens                    |
| `WhatsAppIdentityLinkService`     | Associates a verified phone number with a member account                |
| `RbacEnforcementService`          | Evaluates role assignments against permission checks                    |

### Domain Events

- `identity.organization.created`
- `identity.organization.suspended`
- `identity.organization.deleted`
- `identity.member.created`
- `identity.member.updated`
- `identity.member.deactivated`
- `identity.member.phone_linked`
- `identity.role_assignment.created`
- `identity.role_assignment.revoked`
- `identity.auth.login_succeeded`
- `identity.auth.login_failed`
- `identity.auth.token_refreshed`

---

## 2. People OS

### Responsibilities

- Model the organizational hierarchy: departments, teams, reporting lines
- Maintain member profiles, employment attributes, and org chart positions
- Support bulk member import via WhatsApp message flows
- Track manager–report relationships and delegation chains
- Expose org chart queries for workflow routing and approval escalation

### Aggregates

| Aggregate        | Description                                                                     |
| ---------------- | ------------------------------------------------------------------------------- |
| **Department**   | A named organizational unit with a head member and budget ownership.            |
| **Team**         | A sub-unit within a department with a team lead and a bounded roster.           |
| **OrgChartNode** | Represents a member's position in the hierarchy: role, manager, direct reports. |

### Entities

**Department aggregate:**

- `Department` — root entity; name, head member ref, parent department ref
- `DepartmentBudget` — optional budget allocation metadata

**Team aggregate:**

- `Team` — root entity; name, parent department ref, team lead member ref
- `TeamMembership` — join entity: member + team + start/end date

**OrgChartNode aggregate:**

- `OrgChartNode` — root entity; member ref, manager ref, department ref, team refs

### Value Objects

| Value Object        | Description                                                |
| ------------------- | ---------------------------------------------------------- |
| `DepartmentId`      | UUID wrapper                                               |
| `TeamId`            | UUID wrapper                                               |
| `HeadcountSnapshot` | Point-in-time count of active members in a department/team |
| `ReportingLine`     | Ordered list of MemberIds from a member up to the root     |

### Domain Services

| Service                   | Responsibility                                                               |
| ------------------------- | ---------------------------------------------------------------------------- |
| `OrgChartService`         | Resolves reporting lines, finds escalation targets, builds hierarchy trees   |
| `BulkMemberImportService` | Parses WhatsApp-submitted CSV/table payloads, validates, and upserts members |
| `DepartmentRollupService` | Aggregates headcount, tasks, and completion metrics by department            |

### Domain Events

- `people.department.created`
- `people.department.updated`
- `people.department.deleted`
- `people.team.created`
- `people.team.updated`
- `people.team.member_added`
- `people.team.member_removed`
- `people.org_chart.updated`
- `people.member.profile_updated`
- `people.member.manager_changed`

---

## 3. Communication OS

### Responsibilities

- Receive and route inbound WhatsApp messages to the correct tenant context
- Send outbound messages and notifications via the WhatsApp Cloud API
- Manage WhatsApp message templates and their Meta approval lifecycle
- Thread messages into conversations linked to workflow runs or member contexts
- Enforce delivery confirmation and retry semantics

### Aggregates

| Aggregate           | Description                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| **Conversation**    | A bounded message thread between the platform and a member, optionally linked to a workflow run. |
| **MessageTemplate** | A Meta-approved WhatsApp template with parameterized body, header, and footer.                   |
| **NotificationJob** | An intent to send a notification; tracks delivery attempts and final status.                     |

### Entities

**Conversation aggregate:**

- `Conversation` — root entity; member ref, workflow run ref (optional), status
- `Message` — an individual inbound or outbound message within the conversation
- `MessageAttachment` — media reference (image, document, audio) linked to a message

**MessageTemplate aggregate:**

- `MessageTemplate` — root entity; template name, language, component definitions
- `TemplateVersion` — versioned snapshot submitted to Meta for approval

**NotificationJob aggregate:**

- `NotificationJob` — root entity; recipient member ref, template ref, params, delivery status
- `DeliveryAttempt` — individual send attempt with timestamp and error code

### Value Objects

| Value Object        | Description                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `WhatsAppMessageId` | Meta-issued message ID (wamid)                                     |
| `TemplateNamespace` | Combination of WABA ID and template name                           |
| `MessageDirection`  | Enum: `inbound` or `outbound`                                      |
| `DeliveryStatus`    | Enum: `pending`, `sent`, `delivered`, `read`, `failed`             |
| `MessageContent`    | Sealed union of text, image, document, audio, interactive payloads |

### Domain Services

| Service                      | Responsibility                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `WebhookRoutingService`      | Verifies HMAC signature, resolves tenant by phone_number_id, enqueues inbound message job |
| `MessageDispatchService`     | Sends outbound messages via WhatsApp Cloud API, records wamid, handles failures           |
| `TemplateManagementService`  | Submits templates to Meta, polls approval status, syncs approved versions                 |
| `ConversationContextService` | Attaches or detaches a conversation to a workflow run context                             |

### Domain Events

- `communication.message.received`
- `communication.message.sent`
- `communication.message.delivered`
- `communication.message.read`
- `communication.message.failed`
- `communication.notification.sent`
- `communication.notification.failed`
- `communication.template.created`
- `communication.template.approved`
- `communication.template.rejected`
- `communication.conversation.opened`
- `communication.conversation.closed`

---

## 4. Workflow OS

### Responsibilities

- Define and version workflow templates with multi-step execution logic
- Execute workflow instances (runs) triggered by WhatsApp messages, API calls, or schedules
- Manage task assignment, due dates, and completion tracking
- Orchestrate approval steps including routing, delegation, and escalation
- Emit step-level events for audit and analytics consumption

### Aggregates

| Aggregate              | Description                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **WorkflowDefinition** | A versioned template defining steps, conditions, and routing rules.                 |
| **WorkflowRun**        | A live execution instance of a definition, with its own state machine.              |
| **Task**               | An actionable unit of work assigned to a member with a deadline.                    |
| **ApprovalRequest**    | A step within a workflow run requiring explicit approval from designated approvers. |

### Entities

**WorkflowDefinition aggregate:**

- `WorkflowDefinition` — root entity; name, version, trigger config, step list
- `WorkflowStep` — ordered step definition; type (task, approval, notification, branch), routing rules
- `WorkflowTrigger` — defines how the workflow is initiated (keyword, schedule, API)

**WorkflowRun aggregate:**

- `WorkflowRun` — root entity; definition ref, initiator member ref, current step, status, context data
- `WorkflowRunStep` — execution record for each step in the run
- `EscalationRecord` — log of escalation events with target member and reason

**Task aggregate:**

- `Task` — root entity; title, description, assignee member ref, workflow run step ref, due date, status
- `TaskComment` — member comment on a task

**ApprovalRequest aggregate:**

- `ApprovalRequest` — root entity; workflow run step ref, approver member refs, decision, decided_at
- `ApprovalDecision` — individual approver's vote (granted/rejected) with reason

### Value Objects

| Value Object       | Description                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| `WorkflowStatus`   | Enum: `draft`, `active`, `paused`, `completed`, `cancelled`, `failed`  |
| `TaskStatus`       | Enum: `pending`, `in_progress`, `completed`, `overdue`, `cancelled`    |
| `ApprovalOutcome`  | Enum: `pending`, `granted`, `rejected`, `delegated`, `expired`         |
| `StepType`         | Enum: `task`, `approval`, `notification`, `branch`, `delay`, `webhook` |
| `RoutingRule`      | Condition expression and target member/role for step routing           |
| `EscalationPolicy` | Time-to-escalate duration and target member/role                       |

### Domain Services

| Service                   | Responsibility                                                              |
| ------------------------- | --------------------------------------------------------------------------- |
| `WorkflowExecutionEngine` | Advances workflow run state machine step by step                            |
| `TaskAssignmentService`   | Assigns tasks to members, evaluates routing rules, sets deadlines           |
| `ApprovalRoutingService`  | Determines approvers per step, handles delegation and multi-approver quorum |
| `EscalationService`       | Monitors overdue tasks and pending approvals, triggers escalation events    |
| `WorkflowTriggerService`  | Matches inbound messages and cron schedules to workflow definitions         |

### Domain Events

- `workflow.definition.created`
- `workflow.definition.updated`
- `workflow.definition.published`
- `workflow.run.started`
- `workflow.run.step_completed`
- `workflow.run.completed`
- `workflow.run.failed`
- `workflow.run.cancelled`
- `workflow.task.created`
- `workflow.task.assigned`
- `workflow.task.completed`
- `workflow.task.overdue`
- `workflow.approval.requested`
- `workflow.approval.granted`
- `workflow.approval.rejected`
- `workflow.approval.delegated`
- `workflow.approval.expired`
- `workflow.escalation.triggered`

---

## 5. Knowledge OS

### Responsibilities

- Store, version, and retrieve organizational knowledge documents and SOPs
- Support semantic search over knowledge content using vector embeddings
- Link knowledge documents to workflow definitions as reference material
- Manage document lifecycle: draft, review, published, archived
- Track document access for compliance and analytics

### Aggregates

| Aggregate               | Description                                                                     |
| ----------------------- | ------------------------------------------------------------------------------- |
| **KnowledgeDocument**   | A versioned document containing structured organizational knowledge.            |
| **KnowledgeCollection** | A named grouping of related documents (e.g., "HR Policies", "Operations SOPs"). |

### Entities

**KnowledgeDocument aggregate:**

- `KnowledgeDocument` — root entity; title, content, version, status, author member ref
- `DocumentVersion` — immutable snapshot of a document at a point in time
- `DocumentEmbedding` — vector embedding of document chunks for semantic search
- `DocumentTag` — taxonomy label applied to the document

**KnowledgeCollection aggregate:**

- `KnowledgeCollection` — root entity; name, description, owner department ref
- `CollectionMembership` — document + collection join with sort order

### Value Objects

| Value Object      | Description                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| `DocumentStatus`  | Enum: `draft`, `under_review`, `published`, `archived`                 |
| `DocumentContent` | Structured content with sections, markdown body, and media references  |
| `EmbeddingVector` | Float array of fixed dimension (e.g., 1536 for text-embedding-3-small) |
| `SemanticQuery`   | Natural language query string with search parameters                   |

### Domain Services

| Service                   | Responsibility                                                            |
| ------------------------- | ------------------------------------------------------------------------- |
| `DocumentIndexingService` | Chunks documents, generates embeddings, stores in vector store            |
| `SemanticSearchService`   | Executes nearest-neighbor search, reranks results, returns cited excerpts |
| `DocumentReviewService`   | Manages document review lifecycle, notifies reviewers, records approval   |

### Domain Events

- `knowledge.document.created`
- `knowledge.document.updated`
- `knowledge.document.published`
- `knowledge.document.archived`
- `knowledge.document.accessed`
- `knowledge.collection.created`
- `knowledge.search.performed`

---

## 6. Governance OS

### Responsibilities

- Define and enforce organization-level policies (approval thresholds, escalation rules)
- Audit all state changes across all OS domains for compliance and forensics
- Manage the Loop Engine: detect patterns, generate improvement recommendations
- Enforce agent governance: classify action impact, require human approval for Tier 3–4 actions
- Provide compliance reports aligned to GDPR, SOC 2, and ISO 27001 controls

### Aggregates

| Aggregate            | Description                                                                |
| -------------------- | -------------------------------------------------------------------------- |
| **GovernancePolicy** | A named rule set governing thresholds, approvals, and escalation behavior. |
| **AuditLog**         | An immutable record of every state-changing event across all domains.      |
| **LoopInsight**      | A pattern detected by the Loop Engine with associated recommendation.      |

### Entities

**GovernancePolicy aggregate:**

- `GovernancePolicy` — root entity; name, scope, rule definitions, effective date
- `PolicyRule` — individual rule with condition, threshold, and enforcement action

**AuditLog aggregate:**

- `AuditLog` — root entity; INSERT-only; event type, actor, resource, before/after snapshot, timestamp
- `AuditLogHash` — SHA-256 hash of the log entry chained to the previous entry hash

**LoopInsight aggregate:**

- `LoopInsight` — root entity; pattern type, affected workflows/members, recommendation text
- `InsightAction` — action taken on a recommendation (accepted, dismissed, deferred)

### Value Objects

| Value Object    | Description                                                               |
| --------------- | ------------------------------------------------------------------------- |
| `PolicyScope`   | Enum: `platform`, `organization`, `department`, `team`                    |
| `AuditCategory` | Enum: `auth`, `data`, `admin`, `agent`, `workflow`, `integration`         |
| `ImpactTier`    | Integer 1–4 classifying the potential impact of an agent action           |
| `InsightType`   | Enum: `bottleneck`, `compliance_gap`, `efficiency_opportunity`, `anomaly` |

### Domain Services

| Service                   | Responsibility                                                                 |
| ------------------------- | ------------------------------------------------------------------------------ |
| `AuditWriterService`      | Accepts audit events from all domains, writes INSERT-only to audit_logs        |
| `PolicyEvaluationService` | Evaluates actions against active policies, returns enforcement decisions       |
| `LoopEngineService`       | Analyzes event streams over time windows, detects patterns, generates insights |
| `ComplianceReportService` | Generates audit exports aligned to GDPR, SOC 2, and ISO 27001 frameworks       |

### Domain Events

- `governance.policy.created`
- `governance.policy.updated`
- `governance.policy.enforced`
- `governance.audit.recorded`
- `governance.loop_insight.created`
- `governance.loop_insight.acted_upon`
- `governance.agent_action.approved`
- `governance.agent_action.blocked`

---

## 7. Analytics OS

### Responsibilities

- Aggregate event streams into queryable metrics and KPIs
- Calculate workflow completion rates, SLA adherence, and throughput metrics
- Provide department- and team-level performance dashboards
- Supply data to the Loop Engine for pattern detection
- Support ad-hoc report generation via the web dashboard

### Aggregates

| Aggregate          | Description                                                                     |
| ------------------ | ------------------------------------------------------------------------------- |
| **MetricSnapshot** | A point-in-time aggregated metric value for a given dimension and time window.  |
| **Dashboard**      | A named collection of metric widgets configured by an executive or manager.     |
| **Report**         | A generated, exportable summary of analytics data for a given scope and period. |

### Entities

**MetricSnapshot aggregate:**

- `MetricSnapshot` — root entity; metric type, dimension (org/dept/team), value, period
- `MetricDimension` — categorical breakdown (by member, department, workflow type)

**Dashboard aggregate:**

- `Dashboard` — root entity; owner member ref, layout, widget definitions
- `DashboardWidget` — metric type, visualization, filter config, refresh cadence

**Report aggregate:**

- `Report` — root entity; title, scope, period, generated_at, format (PDF/CSV)
- `ReportSection` — named section with metric data and narrative

### Value Objects

| Value Object   | Description                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `MetricType`   | Enum: `workflow_completion_rate`, `avg_task_duration`, `approval_turnaround`, `agent_action_count`, etc. |
| `TimePeriod`   | Start and end `TIMESTAMPTZ` defining the analysis window                                                 |
| `MetricValue`  | Numeric value with unit (count, percentage, seconds)                                                     |
| `DimensionKey` | Composite key identifying the metric breakdown axis                                                      |

### Domain Services

| Service                    | Responsibility                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `MetricAggregationService` | Consumes GalaxyEvents, computes and stores metric snapshots on rolling windows        |
| `DashboardRenderService`   | Resolves widget data from metric snapshots for real-time dashboard display            |
| `ReportGenerationService`  | Builds structured report documents from metric snapshots for a requested scope/period |
| `SlaMonitoringService`     | Detects SLA breaches in real time, emits alerts to Governance OS                      |

### Domain Events

- `analytics.metric.snapshot_recorded`
- `analytics.report.generated`
- `analytics.dashboard.viewed`
- `analytics.sla.breached`

---

## 8. Agent OS

### Responsibilities

- Provide an AI agent runtime that can take actions on behalf of members
- Maintain a tool registry mapping agent capabilities to OS module operations
- Enforce the AutomationGovernanceGuard before every write operation
- Manage the human-in-the-loop approval flow for Tier 3–4 impact actions
- Record a complete, tamper-evident audit trail of every agent decision and action

### Aggregates

| Aggregate              | Description                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **Agent**              | A named, configured AI agent with a defined scope of permitted tools and capabilities. |
| **AgentSession**       | A bounded execution context for a single agent interaction initiated by a member.      |
| **AgentAction**        | A record of a single tool invocation by an agent, including governance decision.       |
| **GovernanceApproval** | A human approval request generated when an agent proposes a Tier 3–4 action.           |

### Entities

**Agent aggregate:**

- `Agent` — root entity; name, model config, permitted tool list, scope constraints
- `AgentTool` — a registered capability the agent may invoke, with input/output schema
- `AgentConstraint` — policy constraint limiting tool usage (rate limits, data access scope)

**AgentSession aggregate:**

- `AgentSession` — root entity; initiating member ref, agent ref, started_at, ended_at, status
- `SessionMessage` — individual message in the agent conversation (user input or agent output)

**AgentAction aggregate:**

- `AgentAction` — root entity; session ref, tool name, input params, output, impact_tier, status
- `GovernanceDecision` — outcome of AutomationGovernanceGuard for this action

**GovernanceApproval aggregate:**

- `GovernanceApproval` — root entity; agent action ref, approver member refs, status, decided_at
- `ApprovalMessage` — human-readable explanation of the proposed action sent to approver

### Value Objects

| Value Object        | Description                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `ImpactTier`        | Integer 1–4: 1=read-only, 2=low-risk write, 3=significant write, 4=irreversible            |
| `ToolName`          | Canonical string identifier for a registered agent tool                                    |
| `AgentModel`        | Model identifier and inference parameters (e.g., `claude-sonnet-4-6`)                      |
| `GovernanceOutcome` | Enum: `auto_approved`, `pending_human`, `human_approved`, `human_rejected`, `auto_blocked` |

### Domain Services

| Service                     | Responsibility                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `AgentRuntimeService`       | Executes agent sessions: sends messages to LLM, dispatches tool calls, collects results       |
| `ToolRegistryService`       | Maintains the catalog of available tools and validates tool invocations against schemas       |
| `AutomationGovernanceGuard` | Classifies action impact tier, auto-approves Tiers 1–2, routes Tiers 3–4 for human approval   |
| `HumanInTheLoopService`     | Sends Tier 3–4 approval requests via WhatsApp, waits for response, resumes or cancels session |

### Domain Events

- `agent.session.started`
- `agent.session.ended`
- `agent.action.proposed`
- `agent.action.executed`
- `agent.action.blocked`
- `agent.governance.approval_requested`
- `agent.governance.approved`
- `agent.governance.rejected`
- `agent.tool.invoked`
- `agent.tool.failed`
