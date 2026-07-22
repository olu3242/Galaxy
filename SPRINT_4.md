# Sprint 4 — Agent OS + Knowledge OS + Intelligence

**Sprint:** 4
**Duration:** Weeks 15–18
**Goal:** AI agents run autonomously within governance guardrails; knowledge powers every decision
**Branch:** `sprint/4-agent-knowledge`

---

## Objective

Deploy the Digital Workforce — 21 agent types governed by the AutomationGovernanceGuard — backed by a RAG knowledge base that gives every agent the context it needs. Operational intelligence moves from reactive reporting to predictive recommendations.

---

## Deliverables

### Agent OS

- [x] Agent lifecycle manager — `modules/agents/src/lifecycle/AgentLifecycleManager.ts`
  - Phases: OBSERVE → ANALYSE → PLAN → DECIDE → ACT → VERIFY → LEARN
- [x] 21-agent Digital Workforce registry — `modules/agents/src/manifests/`
  - CHIEF_OF_STAFF, HR_DIRECTOR, FINANCE_CONTROLLER, OPERATIONS_MANAGER, COMPLIANCE_OFFICER, …
- [x] Automation governance guard — `modules/governance/src/AutomationGovernanceGuard.ts`
- [x] Shared org memory — `modules/agents/src/memory/SharedOrgMemory.ts`
- [x] Agent security enforcement — `modules/agents/src/__tests__/agent-security.test.ts`
- [x] Agent OS API routes — `apps/api/src/routes/agent-os.ts`

### Knowledge OS

- [x] Document ingestion — `modules/knowledge/src/services/KnowledgeIngestionService.ts`
- [x] Text chunking + embedding scheduling — `KnowledgeIngestionService.ts` (BullMQ queue)
- [x] Full-text search — `modules/knowledge/src/services/KnowledgeSearchService.ts`
- [x] Semantic / RAG search — `modules/knowledge/src/services/SemanticSearchService.ts`
- [x] pgvector cosine-similarity search — `apps/api/src/routes/knowledge.ts` (`GET /knowledge/rag`)
- [x] Knowledge categories — `modules/knowledge/src/services/KnowledgeService.ts`

### Operational Intelligence

- [x] OperationalIntelligenceService — event routing to health/insight/risk sub-services
- [x] HealthScoreService — org, department, workflow, communication, member scores
- [x] InsightService — generates and lists intelligence snapshots
- [x] RiskDetectionService — flags failed workflows + rejected approval thresholds
- [x] RecommendationService — priority-ranked improvement recommendations
- [x] Intelligence API routes — `apps/api/src/routes/intelligence.ts`

### NL Workflow Generation

- [x] NLWorkflowParser — `modules/workflow-generator/src/NLWorkflowParser.ts`
- [x] `/workflows/generate` + `/workflows/generate/confirm` — `routes/workflow-gen.ts`

### Observability

- [x] PlatformHealthService + SLOService — `modules/observability/src/`
- [x] AlertService + IncidentService — `modules/observability/src/`
- [x] MetricsCollectorService — `modules/observability/src/`
- [x] Prometheus metrics endpoint — `apps/api/src/plugins/metrics.ts`

---

## Exit Criteria

- [x] Agents complete full OBSERVE→LEARN cycle under governance guard
- [x] Knowledge documents queryable via RAG (vector + full-text fallback)
- [x] Operational intelligence generates insights on every workflow/approval event
- [x] CI green, all agent and knowledge tests pass

---

## Status: **COMPLETE**
