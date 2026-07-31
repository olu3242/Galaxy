# Galaxy Digital Twin Framework

**Version:** 1.0  
**Owner:** Platform Engineering

---

## Purpose

The Digital Twin Framework lets Galaxy simulate the effect of a proposed change before it touches any live tenant data. It creates an in-memory projection of an organization's current operational state, applies a change set, runs a forward projection, and returns an impact report — without writing a single row to production tables.

Simulations are the mandatory prerequisite for any optimization classified as `riskLevel: 'high'` or `riskLevel: 'critical'`. Lower-risk optimizations may skip simulation and proceed directly to certification.

---

## What Can Be Simulated

| Change Category         | Examples                                                              |
| ----------------------- | --------------------------------------------------------------------- |
| Increased workload      | 3x submission volume, peak-hour load spike, new onboarding wave       |
| New org structures      | Adding a department, merging teams, changing reporting hierarchy      |
| Policy changes          | New approval threshold, reduced SLA window, updated escalation rules  |
| Staffing changes        | Key member departing, agent capacity reduction, adding a new role     |
| AI model replacement    | Swapping the LLM used in a workflow stage to a different model        |
| Infrastructure failures | Redis unavailability, agent OS degradation, database read-replica lag |
| Workflow restructuring  | Removing an approval step, parallelizing two sequential stages        |
| Financial limit changes | Raising or lowering autonomous spend caps                             |

---

## Simulation Methodology

Simulations execute in four steps:

### Step 1 — Snapshot Current State

A read-only snapshot of the organization's current operational state is assembled from live tables. No locks are acquired; the snapshot is a point-in-time read.

```typescript
interface TwinSnapshot {
  organizationId: string;
  capturedAt: string; // ISO-8601
  workflowTemplates: WorkflowTemplate[];
  activeMembers: MemberSummary[];
  recentObservations: AofObservation[]; // Last 30 days
  performanceBaseline: BaselineMetrics;
  activePolicies: OrgPolicy[];
}
```

### Step 2 — Apply Change Set

The change set is applied to the in-memory snapshot only. The change set is a typed diff — it describes what is different about the proposed world, not a full replacement of state.

```typescript
interface ChangeSet {
  type: SimulationChangeType;
  params: Record<string, unknown>;
}
```

### Step 3 — Run Forward Projection

The modified snapshot is fed through the AOF prediction model for the requested horizon. The model projects throughput, latency percentiles, SLA breach probability, agent utilization, and cost.

Projection horizon: 1 hour to 90 days. Default: 7 days.

### Step 4 — Produce Impact Report

The projection output is compared to the unmodified baseline to produce the impact report.

---

## Digital Twin Isolation Guarantees

The following guarantees are enforced at the framework layer — no individual simulation implementation can bypass them:

1. **No live writes.** The simulation runner never holds a database transaction. All state exists only in process memory during the simulation.
2. **Separate connection.** Simulations use a read-only database connection string (`DATABASE_URL_READONLY`). Write operations on this connection throw at the driver level.
3. **Tenant-scoped snapshots.** The snapshot query always includes `WHERE organization_id = $1`. Cross-tenant data is structurally impossible to include.
4. **No event emission.** The simulation runner disables the `EventEmitter` during projection. No `GalaxyEvent` is published as a side effect of a simulation.
5. **No audit log entries for internal simulation steps.** Only the simulation start and completion are audited, not the internal projection steps.

---

## Simulation Result Schema

```typescript
interface SimulationResult {
  scenarioId: string; // UUID
  organizationId: string;
  changeSet: ChangeSet;
  simulatedAt: string; // ISO-8601
  horizonDays: number;
  baselineMetrics: {
    throughputPerDay: number;
    medianLatencyMs: number;
    p99LatencyMs: number;
    slaBreachRate: number; // 0–1
    agentUtilization: number; // 0–1
    estimatedDailyCost: number; // USD
  };
  projectedMetrics: {
    // Same shape as baselineMetrics
    throughputPerDay: number;
    medianLatencyMs: number;
    p99LatencyMs: number;
    slaBreachRate: number;
    agentUtilization: number;
    estimatedDailyCost: number;
  };
  delta: {
    throughputChange: number; // percentage, positive = improvement
    latencyChange: number; // percentage, negative = improvement
    slaRiskChange: number; // percentage, negative = improvement
    costChange: number; // percentage, negative = saving
  };
  riskScore: number; // 0–100; ≥ 70 blocks autonomous application
  recommendation: 'proceed' | 'proceed_with_caution' | 'abort';
  warnings: string[];
}
```

A `riskScore ≥ 70` forces `recommendation: 'abort'`. The optimization is returned to the Decision Engine as `decision: 'escalate'`.

---

## API

### Run a Simulation

```http
POST /api/v1/admin/aof/simulate
x-admin-secret: <secret>
Content-Type: application/json

{
  "changeSet": {
    "type": "remove_approval_step",
    "params": {
      "workflowId": "wf_01HXYZ",
      "stepId": "step_manager_approval"
    }
  },
  "horizonDays": 7
}
```

Response:

```json
{
  "scenarioId": "sim_01HABC",
  "status": "running",
  "estimatedCompletionMs": 3500
}
```

Simulations run asynchronously via BullMQ. Poll or subscribe to the `aof.simulation.completed` event for the result.

### Fetch Simulation Result

```http
GET /api/v1/admin/aof/simulations/sim_01HABC
x-admin-secret: <secret>
```

Returns the full `SimulationResult` object when `status: 'completed'`, or `{ status: 'running' | 'failed' }` otherwise.

---

## Definition of Done

- [x] Simulation runner uses `DATABASE_URL_READONLY` exclusively
- [x] No `GalaxyEvent` is emitted during projection steps
- [x] `riskScore ≥ 70` always produces `recommendation: 'abort'`
- [x] Simulation results for `riskLevel: 'high'` and `riskLevel: 'critical'` are required before certification
- [x] Cross-tenant snapshot isolation verified in integration tests
- [x] Simulation start and completion are recorded in `audit_logs`
