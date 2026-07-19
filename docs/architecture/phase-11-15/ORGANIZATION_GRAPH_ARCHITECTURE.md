# Organization Graph Architecture

## Overview

The Organization Graph transforms Galaxy's flat org model into a rich, connected knowledge graph where every entity (member, workflow, decision, task, knowledge document, metric) is a node and every relationship is a typed edge. This enables cross-entity traversal, influence scoring, and structural intelligence without breaking tenant isolation.

---

## Graph Model

### Node Types

| Node           | Key Properties               | Existing Source Table |
| -------------- | ---------------------------- | --------------------- |
| `Organization` | id, name, industry, size     | `organizations`       |
| `Member`       | id, role, department, tenure | `members`             |
| `Department`   | id, name, head_id            | `departments`         |
| `Workflow`     | id, domain, flow_type, sla   | `workflows`           |
| `WorkflowRun`  | id, status, risk_score       | `workflow_runs`       |
| `Decision`     | id, outcome, confidence      | `decisions`           |
| `Task`         | id, status, priority         | `tasks`               |
| `Approval`     | id, status, value            | `approvals`           |
| `KnowledgeDoc` | id, category, tags           | `knowledge_documents` |
| `Agent`        | id, type, capabilities       | `agents`              |

### Edge Types

| Edge           | From → To                  | Semantics            |
| -------------- | -------------------------- | -------------------- |
| `BELONGS_TO`   | Member → Department        | Org structure        |
| `MANAGES`      | Member → Member            | Reporting line       |
| `TRIGGERED`    | Member → WorkflowRun       | Authorship           |
| `ASSIGNED_TO`  | Task → Member              | Accountability       |
| `APPROVED_BY`  | Approval → Member          | Decision chain       |
| `DECIDED_BY`   | Decision → Agent           | AI accountability    |
| `REFERENCES`   | WorkflowRun → KnowledgeDoc | Knowledge usage      |
| `ESCALATED_TO` | WorkflowRun → Member       | Escalation path      |
| `GOVERNED_BY`  | Workflow → Policy          | Compliance           |
| `DEPENDS_ON`   | Workflow → Workflow        | Process dependencies |

---

## Database Schema (Phase 11 Implementation)

```sql
CREATE TABLE org_graph_nodes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  node_type        TEXT NOT NULL,
  external_id      TEXT NOT NULL,           -- FK to source table
  properties       JSONB NOT NULL DEFAULT '{}',
  embedding_vector FLOAT4[],               -- future: semantic search
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, node_type, external_id)
);

CREATE TABLE org_graph_edges (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  edge_type        TEXT NOT NULL,
  source_node_id   UUID NOT NULL REFERENCES org_graph_nodes(id) ON DELETE CASCADE,
  target_node_id   UUID NOT NULL REFERENCES org_graph_nodes(id) ON DELETE CASCADE,
  weight           NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  properties       JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for graph traversal
CREATE INDEX idx_graph_nodes_org_type ON org_graph_nodes(organization_id, node_type);
CREATE INDEX idx_graph_edges_source ON org_graph_edges(organization_id, source_node_id);
CREATE INDEX idx_graph_edges_target ON org_graph_edges(organization_id, target_node_id);
CREATE INDEX idx_graph_edges_type ON org_graph_edges(organization_id, edge_type);
```

---

## OrgGraphService (packages/modules/graph/src/OrgGraphService.ts)

```typescript
class OrgGraphService {
  // Sync node from source table row
  async upsertNode(
    orgId: string,
    nodeType: string,
    externalId: string,
    props: Record<string, unknown>,
  ): Promise<GraphNode>;

  // Create typed relationship
  async addEdge(
    orgId: string,
    edgeType: string,
    sourceId: string,
    targetId: string,
    weight?: number,
  ): Promise<GraphEdge>;

  // BFS/DFS traversal
  async traverse(
    orgId: string,
    startNodeId: string,
    edgeTypes: string[],
    depth: number,
  ): Promise<GraphNode[]>;

  // Find shortest path between two nodes
  async shortestPath(orgId: string, fromId: string, toId: string): Promise<GraphNode[]>;

  // Compute influence score for a member node
  async influenceScore(orgId: string, memberId: string): Promise<number>;

  // Identify bottlenecks (high in-degree approval/decision nodes)
  async findBottlenecks(
    orgId: string,
  ): Promise<{ nodeId: string; inDegree: number; nodeType: string }[]>;
}
```

---

## Graph Sync Strategy

Graph nodes are kept in sync via event listeners on GalaxyEvents:

- `workflow.run.started` → upsert WorkflowRun node + TRIGGERED edge
- `task.assigned` → upsert ASSIGNED_TO edge
- `approval.decided` → upsert APPROVED_BY edge
- `agent.execution.completed` → upsert DECIDED_BY edge

This is a background sync — the graph is eventually consistent, not transactional.

---

## Tenant Isolation

- All nodes and edges are scoped to `organization_id`
- RLS policy: `USING (organization_id::text = current_setting('app.current_tenant', true))`
- Cross-org graph access is NEVER permitted at the query level
- Anonymized benchmarking uses only aggregated statistics, never raw graph data

---

## Phase 11 Deliverables

1. `packages/modules/graph/` — OrgGraphService, GraphSyncService, GraphQueryService
2. Migration `045_org_graph.ts`
3. API route `/api/v1/graph/*` — nodes, edges, traverse, influence, bottlenecks
4. Worker processor: `graph-sync.ts` — event-driven node/edge maintenance
