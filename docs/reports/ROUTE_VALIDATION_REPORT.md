# Route Validation Report

_Generated: 2026-06-09_

---

## Overview

All routes in `apps/api/src/index.ts` are registered under the `/api/v1` prefix. This report lists each registered route module, its prefix, and validates there are no conflicting registrations.

---

## Registered Route Modules

| #   | Import Name                  | Route File                        | Top-Level Prefix | Sub-paths (sample)                                     |
| --- | ---------------------------- | --------------------------------- | ---------------- | ------------------------------------------------------ |
| 1   | organizationRoutes           | routes/organizations.ts           | /api/v1          | /organizations                                         |
| 2   | memberRoutes                 | routes/members.ts                 | /api/v1          | /members                                               |
| 3   | departmentRoutes             | routes/departments.ts             | /api/v1          | /departments                                           |
| 4   | teamRoutes                   | routes/teams.ts                   | /api/v1          | /teams                                                 |
| 5   | roleRoutes                   | routes/roles.ts                   | /api/v1          | /roles                                                 |
| 6   | auditRoutes                  | routes/audit.ts                   | /api/v1          | /audit                                                 |
| 7   | analyticsRoutes              | routes/analytics.ts               | /api/v1          | /analytics                                             |
| 8   | knowledgeRoutes              | routes/knowledge.ts               | /api/v1          | /knowledge                                             |
| 9   | intelligenceRoutes           | routes/intelligence.ts            | /api/v1          | /intelligence                                          |
| 10  | workflowOsRoutes             | routes/workflow-os.ts             | /api/v1          | /workflows                                             |
| 11  | agentOsRoutes                | routes/agent-os.ts                | /api/v1          | /agents                                                |
| 12  | billingRoutes                | routes/billing.ts                 | /api/v1          | /billing/plans, /billing/subscriptions                 |
| 13  | developerRoutes              | routes/developer.ts               | /api/v1          | /developer/api-keys, /developer/webhooks               |
| 14  | marketplaceRoutes            | routes/marketplace.ts             | /api/v1          | /marketplace/items                                     |
| 15  | observabilityRoutes          | routes/observability.ts           | /api/v1          | /observability/health, /observability/metrics          |
| 16  | governanceRoutes             | routes/governance.ts              | /api/v1          | /governance/policies                                   |
| 17  | platformAdminRoutes          | routes/platform-admin.ts          | /api/v1          | /platform-admin/tenants, /platform-admin/feature-flags |
| 18  | apiGatewayRoutes             | routes/api-gateway.ts             | /api/v1          | /api-gateway/routes                                    |
| 19  | integrationRoutes            | routes/integrations.ts            | /api/v1          | /integrations                                          |
| 20  | graphRoutes                  | routes/graph.ts                   | /api/v1          | /graph                                                 |
| 21  | cooRoutes                    | routes/coo.ts                     | /api/v1          | /coo                                                   |
| 22  | orgMemoryRoutes              | routes/org-memory.ts              | /api/v1          | /org-memory                                            |
| 23  | solutionPackRoutes           | routes/solution-packs.ts          | /api/v1          | /solution-packs                                        |
| 24  | partnerRoutes                | routes/partner.ts                 | /api/v1          | /partners                                              |
| 25  | economyRoutes                | routes/economy.ts                 | /api/v1          | /economy                                               |
| 26  | predictiveRoutes             | routes/predictive.ts              | /api/v1          | /predictive                                            |
| 27  | riskIntelligenceRoutes       | routes/risk-intelligence.ts       | /api/v1          | /risk-intelligence                                     |
| 28  | intelligenceNetworkRoutes    | routes/intelligence-network.ts    | /api/v1          | /intelligence-network                                  |
| 29  | benchmarkingRoutes           | routes/benchmarking.ts            | /api/v1          | /benchmarking                                          |
| 30  | conversationRoutes           | routes/conversation.ts            | /api/v1          | /conversations                                         |
| 31  | autonomousIntelligenceRoutes | routes/autonomous-intelligence.ts | /api/v1          | /autonomous-intelligence                               |
| 32  | digitalTwinRoutes            | routes/digital-twin.ts            | /api/v1          | /digital-twin                                          |
| 33  | policyEngineRoutes           | routes/policy-engine.ts           | /api/v1          | /policy-engine                                         |
| 34  | orgDnaRoutes                 | routes/org-dna.ts                 | /api/v1          | /org-dna                                               |
| 35  | orgHealthRoutes              | routes/org-health.ts              | /api/v1          | /org-health                                            |
| 36  | workflowGeneratorRoutes      | routes/workflow-generator.ts      | /api/v1          | /workflow-generator                                    |
| 37  | selfHealingRoutes            | routes/self-healing.ts            | /api/v1          | /self-healing                                          |
| 38  | aiDeploymentRoutes           | routes/ai-deployment.ts           | /api/v1          | /ai-deployment                                         |
| 39  | missionControlRoutes         | routes/mission-control.ts         | /api/v1          | /mission-control                                       |
| 40  | reliabilityRoutes            | routes/reliability.ts             | /api/v1          | /reliability                                           |
| 41  | platformRoutes               | routes/platform.ts                | /api/v1          | /platform                                              |

**Total: 41 route modules registered.**

---

## Conflict Analysis

### Duplicate Registration Check

No route module is registered more than once in `index.ts`. Each of the 41 imports maps to a unique `fastify.register()` call.

### Sub-path Conflict Check

All identified sub-paths are unique across modules. No two route files claim the same first-level sub-path. Specific checks:

| Potential Conflict                                          | Files Checked                            | Result                            |
| ----------------------------------------------------------- | ---------------------------------------- | --------------------------------- |
| /intelligence vs /intelligence-network                      | intelligence.ts, intelligence-network.ts | No conflict — different paths     |
| /platform vs /platform-admin                                | platform.ts, platform-admin.ts           | No conflict — different paths     |
| /billing (routes/billing.ts) vs /platform billing endpoints | billing.ts, platform.ts                  | No conflict — different sub-paths |
| /org-health vs /org-dna vs /org-memory                      | Separate files                           | No conflict                       |

### Health Check

The `/health` endpoint is registered directly on the Fastify instance (not via a route plugin) and does not conflict with any plugin-registered route.

---

## Observations

1. **No route prefix declared at the plugin level** — All 41 route modules rely on the `/api/v1` prefix passed at registration time. This is correct for Fastify plugin encapsulation.

2. **Fastify security plugins not registered** — `@fastify/helmet`, `@fastify/cors`, `@fastify/jwt`, `@fastify/rate-limit` are not registered in `buildApp()`. These should be added before routes for production hardening.

3. **No WebSocket routes visible** — `@fastify/websocket` is declared as a dependency but no WebSocket route handlers are registered in the current `index.ts`. WebSocket support may be deferred to a future sprint.

---

## Verdict

**Pass** — No duplicate route registrations or path conflicts detected across all 41 route modules.
