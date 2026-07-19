# AI Economy Architecture

## Overview

The Galaxy AI Economy introduces a three-layer economic model that incentivizes high-quality contributions across Workflows, Agents, and Knowledge. Participants (organizations, developers, AI agents) earn credits by contributing reusable assets and spend credits to consume marketplace assets. The economy is governed, auditable, and tenant-isolated.

---

## Three Economy Layers

### 1. Workflow Economy

**Producers**: Organizations publish workflow packs to the marketplace.  
**Consumers**: Organizations install and run published workflows.  
**Economic Model**:

- Installation = one-time credit purchase or subscription
- Per-run royalty: a fraction of each workflow run fee goes to the original publisher
- Quality multiplier: higher-rated packs earn more per run

```typescript
interface WorkflowEconomyAccount {
  organizationId: string;
  creditsBalance: number;
  publisherEarnings: number; // total earned from royalties
  consumerSpend: number; // total spent on installations + runs
  lastSettledAt: string;
}
```

### 2. Agent Economy

**Producers**: Developers publish custom agents to the Agent Marketplace.  
**Consumers**: Organizations execute published agents via the Agent Runtime.  
**Economic Model**:

- Agent registration: free (requires publisher account)
- Agent execution fee: metered by execution time + memory accessed
- Publisher royalty: 70% of execution fee → publisher, 30% → platform
- Quality gate: agents must pass governance review before earning royalties

```typescript
interface AgentEconomyLedger {
  agentId: string;
  publisherOrgId: string;
  totalExecutions: number;
  totalEarningsCredits: number;
  pendingSettlement: number;
  lastSettledAt: string;
}
```

### 3. Knowledge Economy

**Producers**: Members and organizations contribute knowledge documents.  
**Consumers**: Workflows, agents, and copilots reference knowledge docs.  
**Economic Model**:

- Knowledge contribution = credit reward (scaled by doc quality score)
- Knowledge consumption = micro-credit charge per reference
- Quality is measured by: reference count, resolution rate, freshness

```typescript
interface KnowledgeEconomyEntry {
  documentId: string;
  authorOrgId: string;
  referenceCount: number;
  totalEarningsCredits: number;
  qualityScore: number; // 0-100
}
```

---

## Credit System

### Credit Types

| Type               | Earned By                    | Spent On                    |
| ------------------ | ---------------------------- | --------------------------- |
| `workflow_credit`  | Publishing popular workflows | Installing workflows        |
| `agent_credit`     | Publishing/executing agents  | Agent executions            |
| `knowledge_credit` | Contributing docs            | Knowledge queries           |
| `platform_credit`  | All activity                 | Any marketplace transaction |

### Credit Ledger Schema

```sql
CREATE TABLE economy_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  account_type     TEXT NOT NULL,   -- 'workflow'|'agent'|'knowledge'|'platform'
  balance          NUMERIC(15,4) NOT NULL DEFAULT 0,
  total_earned     NUMERIC(15,4) NOT NULL DEFAULT 0,
  total_spent      NUMERIC(15,4) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, account_type)
);

CREATE TABLE economy_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  account_type     TEXT NOT NULL,
  transaction_type TEXT NOT NULL,   -- 'earn'|'spend'|'royalty'|'settlement'
  amount           NUMERIC(15,4) NOT NULL,
  description      TEXT NOT NULL,
  reference_type   TEXT,            -- 'workflow_run'|'agent_execution'|'installation'
  reference_id     TEXT,
  correlation_id   TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Governance & Anti-Fraud

1. **Rate limiting**: No org can earn more than 10,000 credits/day without manual review
2. **Self-consumption exclusion**: Orgs cannot earn royalties from their own usage
3. **Quality gate**: New publishers start at 50% royalty rate; full rate after 10 successful executions
4. **Settlement period**: Earnings settle T+7 (7 days hold for dispute resolution)
5. **Audit trail**: Every credit transaction emits a `GalaxyEvent` and is audit-logged
6. **Human override**: Platform admins can freeze accounts, reverse transactions

---

## Cross-Organization Intelligence (Phase 13)

### Anonymized Benchmarking

Organizations can opt-in to contribute anonymized workflow performance data to the Galaxy Intelligence Network. In return, they receive:

- Industry percentile rankings for their KPIs
- "Organizations like yours" pattern matching
- Recommended workflow packs based on peer usage

**Privacy Guarantees**:

- All contributed data is aggregated (minimum k=10 orgs per cohort)
- No raw data crosses tenant boundaries
- Opt-in only; can be revoked at any time
- Differential privacy noise added to published statistics

### Intelligence Network Schema

```sql
CREATE TABLE intelligence_contributions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  contribution_type TEXT NOT NULL,  -- 'workflow_perf'|'kpi_benchmark'|'agent_usage'
  metric_key       TEXT NOT NULL,
  metric_value     NUMERIC NOT NULL,
  period           TEXT NOT NULL,   -- 'YYYY-MM'
  anonymization_noise NUMERIC NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE intelligence_benchmarks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry         TEXT NOT NULL,
  size_bucket      TEXT NOT NULL,   -- 'small'|'medium'|'large'
  metric_key       TEXT NOT NULL,
  p25              NUMERIC NOT NULL,
  p50              NUMERIC NOT NULL,
  p75              NUMERIC NOT NULL,
  p90              NUMERIC NOT NULL,
  cohort_size      INTEGER NOT NULL,
  period           TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Phase 13-15 Deliverables

### Phase 13: Cross-Org Intelligence

1. `packages/modules/intelligence-network/` — ContributionService, BenchmarkService, PeerMatchingService
2. Migrations `050_intelligence_network.ts`
3. API routes `/api/v1/intelligence/*`
4. Opt-in consent management

### Phase 14: Predictive Operations Engine

1. `packages/modules/predictive/` — WorkloadForecastService, SLABreachPredictorService, ChurnRiskService
2. Uses historical workflow_runs + agent_executions as training signal
3. Lightweight time-series analysis (moving averages, anomaly detection without ML infra)
4. Migrations `051_predictive_models.ts`

### Phase 15: Organization Benchmarking

1. `packages/modules/benchmarking/` — IndustryBenchmarkService, PeerComparisonService
2. Consumes intelligence_benchmarks table
3. Generates benchmark reports via ReportingService (reuse @galaxy/analytics)
4. API routes `/api/v1/benchmarks/*`

---

## Implementation Prerequisites (Before Phase 13)

Before implementing cross-org intelligence, the following must be in place:

- [ ] Phase 7 complete (Marketplace + Billing + Governance)
- [ ] Consent management system (not yet built)
- [ ] Privacy review of data anonymization approach
- [ ] Differential privacy library evaluation
- [ ] Legal review of cross-tenant data aggregation
- [ ] Opt-in UI in Mission Control (Next.js web app)
