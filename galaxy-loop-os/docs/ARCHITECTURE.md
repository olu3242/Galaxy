# GALAXY LOOP OS™
## System Architecture Document
### Version 1.0

---

## ARCHITECTURAL OVERVIEW

Galaxy is built as a **cloud-native, event-driven, multi-tenant platform** using a microservices architecture orchestrated around a central Runtime Kernel and Event Fabric.

### Technology Stack

```
Frontend:          Next.js 14 (App Router) + TailwindCSS
Mobile:            React Native (Admin only) + PWA
API Layer:         Node.js / Fastify (REST + GraphQL + WebSocket)
Runtime Kernel:    Node.js Worker Threads + BullMQ
Event Bus:         Apache Kafka (managed via Confluent Cloud)
Database:          PostgreSQL 16 (primary) + Redis 7 (cache/queue)
Search:            pgvector + Elasticsearch
AI/Agent Runtime:  Anthropic Claude API (primary) + LangChain
File Storage:      AWS S3 / Cloudflare R2
WhatsApp:          Meta WhatsApp Cloud API (Business API v19+)
Auth:              Auth0 / Clerk + Custom JWT
Infrastructure:    AWS (primary) + Cloudflare (edge)
Container:         Docker + Kubernetes (EKS)
CI/CD:             GitHub Actions + ArgoCD
Monitoring:        Datadog + Sentry + OpenTelemetry
```

---

## SYSTEM ARCHITECTURE DIAGRAM

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                    │
│  ┌─────────────┐  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │  WhatsApp   │  │  Web Dashboard   │  │     Mobile Admin App         │ │
│  │  (Members)  │  │  (Mission Ctrl)  │  │  (Executives / Admins)       │ │
│  └──────┬──────┘  └────────┬─────────┘  └──────────────┬───────────────┘ │
└─────────┼──────────────────┼────────────────────────────┼─────────────────┘
          │                  │                            │
┌─────────┼──────────────────┼────────────────────────────┼─────────────────┐
│         ▼                  ▼                            ▼   API GATEWAY    │
│  ┌─────────────┐  ┌───────────────┐  ┌────────────────────────────────┐   │
│  │  WhatsApp   │  │   REST API    │  │       GraphQL API              │   │
│  │  Webhook    │  │   (Fastify)   │  │       (Apollo Server)          │   │
│  │  Handler    │  └───────┬───────┘  └──────────────┬─────────────────┘   │
│  └──────┬──────┘          │                         │                     │
└─────────┼─────────────────┼─────────────────────────┼─────────────────────┘
          │                 │                         │
          ▼                 ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         RUNTIME KERNEL                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │  Tenant Context │  │  Execution Engine │  │  Scheduler / Cron     │  │
│  │  Propagator     │  │  (BullMQ Workers) │  │  (Agenda.js)          │  │
│  └────────┬────────┘  └────────┬──────────┘  └───────────┬───────────┘  │
│           └───────────────────┴─────────────────────────┘               │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           EVENT FABRIC                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Kafka Bus   │  │  Event Store │  │  Dead Letter │  │  Replay    │  │
│  │  (Topics)    │  │  (Append)    │  │  Queue (DLQ) │  │  Engine    │  │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  └────────────┘  │
└─────────┼───────────────────────────────────────────────────────────────┘
          │ (events route to OS modules)
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          PLATFORM OS MODULES                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │Identity  │ │People    │ │Workflow  │ │Governance│ │Communication │  │
│  │OS        │ │OS        │ │OS        │ │OS        │ │OS            │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐   │
│  │Knowledge │ │Analytics │ │Agent     │ │Loop OS (Loop Engine™)    │   │
│  │OS        │ │OS        │ │OS        │ └──────────────────────────┘   │
│  └──────────┘ └──────────┘ └──────────┘                               │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA LAYER                                     │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │  PostgreSQL 16  │  │  Redis 7     │  │  S3 / R2    │  │pgvector   │ │
│  │  (Multi-tenant) │  │  (Cache+Q)   │  │  (Files)    │  │(Embedding)│ │
│  └─────────────────┘  └──────────────┘  └─────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## MULTI-TENANT ARCHITECTURE

### Strategy: Shared Database, Row-Level Security

```sql
-- Every table includes tenant isolation
CREATE TABLE members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  -- ... fields
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Row-Level Security Policy
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON members
  USING (organization_id = current_setting('app.current_tenant')::UUID);
```

### Tenant Context Propagation

```javascript
// Runtime Kernel — Tenant Context Middleware
class TenantContextMiddleware {
  async inject(request, reply, done) {
    const tenantId = await this.resolveTenant(request);
    
    // Set PostgreSQL session variable
    await db.query(`SET LOCAL app.current_tenant = '${tenantId}'`);
    
    // Set request context
    request.tenantContext = {
      organizationId: tenantId,
      correlationId: crypto.randomUUID(),
      timestamp: Date.now()
    };
    
    done();
  }
}
```

### Tenant Isolation Levels

| Level | Mechanism | Use Case |
|---|---|---|
| Shared Schema + RLS | PostgreSQL RLS | Standard & Growth |
| Dedicated Schema | Schema-per-tenant | Enterprise |
| Dedicated Database | Separate DB instance | Government / Sovereign |

---

## EVENT-DRIVEN ARCHITECTURE

### Event Registry (Selected Events)

```
// Communication Events
message.received          { tenantId, memberId, content, timestamp }
message.sent              { tenantId, recipientId, templateId, timestamp }
broadcast.dispatched      { tenantId, audienceSize, messageId, timestamp }

// Workflow Events
workflow.submitted         { tenantId, workflowId, instanceId, submitterId }
workflow.approved          { tenantId, instanceId, approverId, decision }
workflow.escalated         { tenantId, instanceId, reason, escalatedTo }
workflow.completed         { tenantId, instanceId, outcome, duration }

// Loop Events
loop.started               { tenantId, loopId, workflowInstanceId }
loop.verification.pending  { tenantId, loopId, verificationMethod }
loop.verified              { tenantId, loopId, evidence, verifierId }
loop.feedback.received     { tenantId, loopId, score, comments }
loop.learned               { tenantId, loopId, insights, recommendations }
loop.optimized             { tenantId, loopId, changes, expectedImprovement }

// Agent Events
agent.action.started       { tenantId, agentId, actionType, context }
agent.action.completed     { tenantId, agentId, outcome, telemetry }
agent.loop.iteration       { tenantId, agentId, iteration, learningDelta }

// People Events
member.registered          { tenantId, memberId, invitedBy, channel }
attendance.checked_in      { tenantId, memberId, locationId, method }
incident.reported          { tenantId, reporterId, severity, description }
```

### Event Envelope

```typescript
interface GalaxyEvent<T = unknown> {
  id:            string;       // UUID
  version:       string;       // "1.0"
  type:          string;       // "workflow.submitted"
  tenantId:      string;       // Organization ID
  correlationId: string;       // Trace across system
  causationId:   string;       // Parent event ID
  timestamp:     string;       // ISO 8601
  actor: {
    type:        'member' | 'agent' | 'system';
    id:          string;
  };
  payload:       T;
  metadata: {
    idempotencyKey: string;
    schemaVersion:  string;
    source:         string;
  };
}
```

---

## LOOP OS ARCHITECTURE

### Loop Lifecycle State Machine

```
CREATED → ANALYZING → EXECUTING → VERIFYING → COLLECTING_FEEDBACK
    ↓                                                     ↓
 FAILED                                              LEARNING
                                                          ↓
                                                    OPTIMIZING
                                                          ↓
                                                    COMPLETED ← (loops back)
```

### Loop Engine Components

```typescript
// Loop Registry — Central catalog
class LoopRegistry {
  async registerLoop(definition: LoopDefinition): Promise<Loop>
  async getLoop(loopId: string, tenantId: string): Promise<Loop>
  async listActiveLoops(tenantId: string): Promise<Loop[]>
}

// Loop Runtime — Execution engine  
class LoopRuntime {
  async startLoop(loopId: string, context: LoopContext): Promise<LoopInstance>
  async advanceLoop(instanceId: string, transition: LoopTransition): Promise<void>
  async terminateLoop(instanceId: string, reason: string): Promise<LoopOutcome>
}

// Verification Engine
class VerificationEngine {
  async requestVerification(instanceId: string, method: VerificationMethod): Promise<void>
  async submitEvidence(instanceId: string, evidence: Evidence): Promise<VerificationResult>
  
  // Verification Methods
  methods = {
    MANAGER_CONFIRMATION: 'WhatsApp message to direct supervisor',
    PHOTO_EVIDENCE:       'Photo upload via WhatsApp',
    LOCATION_CHECKIN:     'GPS location confirmation',
    DOCUMENT_UPLOAD:      'Document attached to WhatsApp message',
    DIGITAL_SIGNATURE:    'Signature via web link',
    AGENT_VERIFICATION:   'AI agent verifies via external data',
  };
}

// Learning Engine
class LearningEngine {
  async captureOutcome(loopInstanceId: string, outcome: LoopOutcome): Promise<void>
  async generateInsights(tenantId: string, loopType: string): Promise<Insight[]>
  async updateOrganizationalMemory(tenantId: string, insights: Insight[]): Promise<void>
}

// Optimization Engine
class OptimizationEngine {
  async analyzeBottlenecks(tenantId: string): Promise<Bottleneck[]>
  async generateRecommendations(bottlenecks: Bottleneck[]): Promise<Recommendation[]>
  async applyAutoOptimization(workflowId: string, recommendation: Recommendation): Promise<void>
}
```

---

## AGENT ARCHITECTURE

### Agent OS Framework

```typescript
interface GalaxyAgent {
  id:          string;
  name:        string;
  type:        AgentType;
  tenantId:    string;
  permissions: Permission[];
  
  // Core lifecycle
  think(context: AgentContext): Promise<AgentPlan>;
  act(plan: AgentPlan): Promise<AgentAction[]>;
  verify(actions: AgentAction[]): Promise<VerificationResult>;
  learn(outcome: AgentOutcome): Promise<LearningRecord>;
}

// Agent Types
enum AgentType {
  EXECUTIVE    = 'executive',    // Org health, strategic alerts
  HR           = 'hr',           // People, recruitment, performance
  FINANCE      = 'finance',      // Budget, expense, approvals
  OPERATIONS   = 'operations',   // Workflow orchestration
  COMPLIANCE   = 'compliance',   // Governance, audit, risk
  KNOWLEDGE    = 'knowledge',    // RAG, search, memory
  COMMS        = 'communications' // Broadcasts, notifications
}
```

### Agent Permission Binding

Every agent action is validated against the organizational permission matrix before execution. Agents cannot exceed the permissions of their role assignment.

---

## DATABASE ARCHITECTURE

### Core Schema (Selected Tables)

```sql
-- ORGANIZATIONS
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL,
  industry_type   VARCHAR(50) NOT NULL,  -- 'church', 'ngo', 'school', etc.
  plan_tier       VARCHAR(20) NOT NULL,  -- 'starter', 'growth', 'enterprise'
  whatsapp_phone  VARCHAR(30),
  settings        JSONB DEFAULT '{}',
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- MEMBERS
CREATE TABLE members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id   UUID REFERENCES departments(id),
  team_id         UUID REFERENCES teams(id),
  whatsapp_phone  VARCHAR(30) NOT NULL,
  display_name    VARCHAR(255) NOT NULL,
  role_id         UUID REFERENCES roles(id),
  status          VARCHAR(20) DEFAULT 'active',
  profile_data    JSONB DEFAULT '{}',
  last_active_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- WORKFLOW INSTANCES
CREATE TABLE workflow_instances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  workflow_id     UUID NOT NULL REFERENCES workflows(id),
  submitted_by    UUID NOT NULL REFERENCES members(id),
  status          VARCHAR(30) DEFAULT 'submitted',
  current_step    INTEGER DEFAULT 1,
  data            JSONB DEFAULT '{}',
  sla_due_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  correlation_id  UUID NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- LOOPS
CREATE TABLE loops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  workflow_id     UUID REFERENCES workflows(id),
  name            VARCHAR(255) NOT NULL,
  loop_type       VARCHAR(50) NOT NULL,
  config          JSONB DEFAULT '{}',
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- LOOP INSTANCES
CREATE TABLE loop_instances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_id             UUID NOT NULL REFERENCES loops(id),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  workflow_instance_id UUID REFERENCES workflow_instances(id),
  status              VARCHAR(30) DEFAULT 'created',
  verification_state  VARCHAR(30) DEFAULT 'pending',
  learning_state      VARCHAR(30) DEFAULT 'not_started',
  optimization_state  VARCHAR(30) DEFAULT 'not_started',
  outcome_score       DECIMAL(3,2),
  feedback_score      DECIMAL(3,2),
  started_at          TIMESTAMPTZ DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  metadata            JSONB DEFAULT '{}'
);

-- AUDIT LOGS (Immutable)
CREATE TABLE audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  actor_type      VARCHAR(20) NOT NULL,
  actor_id        UUID,
  action          VARCHAR(100) NOT NULL,
  resource_type   VARCHAR(50),
  resource_id     UUID,
  old_value       JSONB,
  new_value       JSONB,
  ip_address      INET,
  correlation_id  UUID NOT NULL,
  causation_id    UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
-- Audit logs are NEVER updated or deleted
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_read_only ON audit_logs FOR INSERT WITH CHECK (true);
```

---

## API ARCHITECTURE

### REST Endpoints (Selected)

```
POST   /api/v1/webhooks/whatsapp              # WhatsApp incoming messages
GET    /api/v1/organizations/:id              # Get organization
POST   /api/v1/organizations/:id/members      # Invite member
GET    /api/v1/workflows                      # List workflows
POST   /api/v1/workflows/:id/submit           # Submit workflow instance
POST   /api/v1/loops/:id/start                # Start a loop
POST   /api/v1/loops/instances/:id/verify     # Submit verification evidence
GET    /api/v1/analytics/dashboard            # Executive dashboard data
POST   /api/v1/agents/:type/invoke            # Invoke an AI agent
GET    /api/v1/audit-logs                     # Audit trail (paginated)
```

---

## DEPLOYMENT ARCHITECTURE

```
                    ┌──────────────────────┐
                    │   Cloudflare (Edge)   │
                    │   WAF + CDN + DDoS    │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │      AWS ALB          │
                    │  (Load Balancer)      │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │  API Pod 1   │   │  API Pod 2   │   │  API Pod N   │
   │  (EKS Node)  │   │  (EKS Node)  │   │  (EKS Node)  │
   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
          └─────────────────┬┘──────────────────┘
                            │
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
   ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
   │  RDS Aurora │  │  ElastiCache │  │  Kafka (MSK) │
   │  PostgreSQL │  │  Redis       │  │  Event Bus   │
   │  (Multi-AZ) │  │  Cluster     │  │              │
   └─────────────┘  └──────────────┘  └──────────────┘
```

---

## SCALABILITY STRATEGY

| Component | Scaling Strategy | Trigger |
|---|---|---|
| API Pods | Horizontal Pod Autoscaler | CPU > 70% or p99 latency > 500ms |
| Worker Pods | Queue depth-based scaling | Queue > 100 messages/worker |
| PostgreSQL | Read replicas + Connection pooling (PgBouncer) | Read load |
| Redis | Cluster mode with sharding | Memory > 75% |
| Kafka | Topic partition expansion | Consumer lag > 1000 |
| Agent Runtime | On-demand container spawning | Agent invocation rate |

---

*Document Version: 1.0 | Architecture Status: Draft for Review*
