# Digital COO Architecture

## Overview

The Digital COO is Galaxy's highest-level AI orchestrator. It runs on a scheduled cadence and on-demand, synthesizing signals from all OS modules (Workflow OS, Agent OS, Governance, Analytics, Knowledge, Graph) into a coherent operational picture. It issues recommendations, flags risks, and takes autonomous actions within configured governance boundaries.

---

## Capability Map

| COO Function            | Data Sources                               | Action Authority           |
| ----------------------- | ------------------------------------------ | -------------------------- |
| Daily Ops Briefing      | workflow_runs, approvals, tasks, incidents | Read-only, notify          |
| SLA Health Review       | workflow_runs.sla_due_at, risk_assessments | Create escalation tasks    |
| Approval Backlog Review | approvals (pending > N days)               | Notify approvers, escalate |
| Team Capacity Analysis  | tasks, members, workflow_runs              | Recommend rebalancing      |
| Risk Digest             | risk_assessments, decisions, incidents     | Flag for human review      |
| Process Optimization    | workflow history, completion rates         | Recommend workflow updates |
| Compliance Status       | compliance_checks, governance policies     | Alert compliance officer   |
| Knowledge Gap Detection | knowledge_documents vs workflow failures   | Suggest doc creation       |

---

## Architecture

```
DigitalCOO
  ├── ContextAggregator     — pulls signals from all modules
  ├── InsightEngine         — synthesizes patterns from aggregated context
  ├── ActionPlanner         — determines safe autonomous actions
  ├── GovernanceGate        — validates actions against policies and RBAC
  ├── ExecutionCoordinator  — dispatches actions via existing services
  └── BriefingComposer      — formats output for WhatsApp / web dashboard
```

### DigitalCOO Service Interface

```typescript
interface COOBriefing {
  organizationId: string;
  generatedAt: string;
  executiveSummary: string; // 3-5 sentence overview
  healthScore: number; // 0-100 composite
  criticalAlerts: COOAlert[]; // items requiring immediate attention
  operationalItems: COOItem[]; // routine items for review
  recommendations: Recommendation[]; // from RecommendationEngine
  autonomousActions: COOAction[]; // actions taken without human input
  pendingApprovals: COOAction[]; // actions waiting for human sign-off
  correlationId: string;
}

class DigitalCOOService {
  async generateBriefing(
    organizationId: string,
    actorId: string,
    correlationId: string,
  ): Promise<COOBriefing>;
  async executePendingActions(
    organizationId: string,
    actorId: string,
    correlationId: string,
  ): Promise<COOAction[]>;
  async approveCOOAction(
    organizationId: string,
    actionId: string,
    actorId: string,
  ): Promise<COOAction>;
  async rejectCOOAction(
    organizationId: string,
    actionId: string,
    actorId: string,
    reason: string,
  ): Promise<COOAction>;
}
```

---

## Decision Autonomy Levels

| Level     | What COO Can Do                                | Requires Human              |
| --------- | ---------------------------------------------- | --------------------------- |
| `observe` | Read data, compose briefing                    | No                          |
| `notify`  | Send WhatsApp notifications, create tasks      | No                          |
| `suggest` | Create draft workflow runs, draft approvals    | Yes (approve before submit) |
| `act`     | Trigger workflows, assign tasks, escalate SLAs | Governance gate check       |
| `command` | Override decisions, modify member roles        | Always requires human       |

Autonomy level is configured per organization via `system_config`.

---

## Scheduled Execution

The Digital COO runs via BullMQ scheduled jobs:

- **Daily briefing**: 7am tenant local time
- **SLA watchdog**: every 15 minutes
- **Compliance check**: weekly (Monday 9am)
- **On-demand**: via API `POST /api/v1/coo/briefing`

---

## Database Schema (Phase 12)

```sql
CREATE TABLE coo_briefings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  health_score     NUMERIC(5,2) NOT NULL,
  executive_summary TEXT NOT NULL,
  critical_alert_count INTEGER NOT NULL DEFAULT 0,
  autonomous_action_count INTEGER NOT NULL DEFAULT 0,
  pending_action_count INTEGER NOT NULL DEFAULT 0,
  briefing_data    JSONB NOT NULL DEFAULT '{}',
  correlation_id   TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE coo_actions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  briefing_id      UUID REFERENCES coo_briefings(id),
  action_type      TEXT NOT NULL,
  subject          TEXT NOT NULL,
  payload          JSONB NOT NULL DEFAULT '{}',
  autonomy_level   TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected|executed|failed
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  rejected_by      TEXT,
  rejected_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  executed_at      TIMESTAMPTZ,
  correlation_id   TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Integration Points

| Module                  | How COO Uses It                               |
| ----------------------- | --------------------------------------------- |
| `@galaxy/workflow`      | Read workflow runs, trigger new runs          |
| `@galaxy/agents`        | Execute copilots for domain-specific analysis |
| `@galaxy/governance`    | Check compliance status, enforce policies     |
| `@galaxy/observability` | Read platform health metrics                  |
| `@galaxy/analytics`     | Consume KPIs and metrics                      |
| `@galaxy/knowledge`     | Search knowledge base for relevant docs       |
| `@galaxy/billing`       | Check plan limits before actions              |

---

## Phase 12 Deliverables

1. `packages/modules/coo/` — DigitalCOOService, ContextAggregator, InsightEngine, ActionPlanner
2. Migration `046_digital_coo.ts`
3. API routes `/api/v1/coo/*` — briefing, actions, approve/reject
4. Worker scheduled job: `coo-scheduler.ts`
5. WhatsApp integration: COO briefing delivered via conversation session
