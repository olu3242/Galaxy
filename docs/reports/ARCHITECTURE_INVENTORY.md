# Architecture Inventory

_Generated: 2026-06-09_

---

## OS Modules

| Package Name                    | Path                                     | Key Services / Directories                                                      | Migration Numbers |
| ------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- | ----------------- |
| @galaxy/agents                  | packages/modules/agents                  | registry, runtime, memory, decisions, copilots, governance                      | 030–033           |
| @galaxy/ai-deployment           | packages/modules/ai-deployment           | deployment, discovery                                                           | 061               |
| @galaxy/analytics               | packages/modules/analytics               | services                                                                        | 017–020           |
| @galaxy/api-gateway             | packages/modules/api-gateway             | routes, ratelimit, analytics                                                    | 046               |
| @galaxy/autonomous-intelligence | packages/modules/autonomous-intelligence | agents, actions, insights                                                       | 054               |
| @galaxy/benchmarking            | packages/modules/benchmarking            | IndustryBenchmarkService, PeerComparisonService                                 | 051 (partial)     |
| @galaxy/billing                 | packages/modules/billing                 | subscriptions, invoices, limits, usage                                          | 038, 040, 068–069 |
| @galaxy/communication           | packages/modules/communication           | messaging, services                                                             | 009–011           |
| @galaxy/conversation            | packages/modules/conversation            | sessions, messages, intelligence                                                | 053               |
| @galaxy/coo                     | packages/modules/coo                     | DigitalCOOService, BriefingComposer, ContextAggregator, InsightEngine           | 050               |
| @galaxy/developer               | packages/modules/developer               | apikeys, oauth, webhooks, ratelimit                                             | 039, 041          |
| @galaxy/digital-twin            | packages/modules/digital-twin            | nodes, relationships, snapshots                                                 | 055               |
| @galaxy/economy                 | packages/modules/economy                 | accounts, transactions, agent, knowledge, workflow, settlement                  | 052               |
| @galaxy/governance              | packages/modules/governance              | policies, compliance, reports, retention                                        | 042, 044          |
| @galaxy/graph                   | packages/modules/graph                   | OrgGraphService, GraphQueryService, GraphSyncService                            | 049               |
| @galaxy/identity                | packages/modules/identity                | auth, audit, services                                                           | 001–004, 008      |
| @galaxy/integrations            | packages/modules/integrations            | connectors, sync, events                                                        | 047–048           |
| @galaxy/intelligence            | packages/modules/intelligence            | services                                                                        | 023–024           |
| @galaxy/intelligence-network    | packages/modules/intelligence-network    | BenchmarkService, ContributionService, PeerMatchingService                      | 051               |
| @galaxy/knowledge               | packages/modules/knowledge               | services                                                                        | 021–022           |
| @galaxy/marketplace             | packages/modules/marketplace             | items, installations, billing, reviews, publisher, analytics                    | 034, 036          |
| @galaxy/mission-control         | packages/modules/mission-control         | dashboard                                                                       | (route-level)     |
| @galaxy/notifications           | packages/modules/notifications           | services                                                                        | 011               |
| @galaxy/observability           | packages/modules/observability           | metrics, alerts, health, incidents, slo                                         | 035, 037          |
| @galaxy/org-dna                 | packages/modules/org-dna                 | dna, blueprints, language                                                       | 057               |
| @galaxy/org-health              | packages/modules/org-health              | scoring, monitoring                                                             | 058               |
| @galaxy/org-memory              | packages/modules/org-memory              | OrgMemoryService                                                                | 050               |
| @galaxy/partner                 | packages/modules/partner                 | partners, deals, publisher                                                      | 045               |
| @galaxy/people                  | packages/modules/people                  | services                                                                        | 004–005           |
| @galaxy/platform                | packages/modules/platform                | billing, features, config, lifecycle, observability, revenue, commercial, admin | 065–070           |
| @galaxy/platform-admin          | packages/modules/platform-admin          | tenants, feature-flags, config, actions                                         | 043, 065          |
| @galaxy/policy-engine           | packages/modules/policy-engine           | policies, rules, enforcement                                                    | 056               |
| @galaxy/predictive              | packages/modules/predictive              | (services)                                                                      | 051               |
| @galaxy/reliability             | packages/modules/reliability             | (multi-part)                                                                    | 062–064           |
| @galaxy/risk-intelligence       | packages/modules/risk-intelligence       | (services)                                                                      | 032, 051          |
| @galaxy/self-healing            | packages/modules/self-healing            | (services)                                                                      | 060               |
| @galaxy/solution-packs          | packages/modules/solution-packs          | (services)                                                                      | 047               |
| @galaxy/workflow                | packages/modules/workflow                | (services)                                                                      | 012–015, 025      |
| @galaxy/workflow-generator      | packages/modules/workflow-generator      | (services)                                                                      | 059               |

---

## API Routes

| File                       | Key Endpoints                                                        |
| -------------------------- | -------------------------------------------------------------------- |
| agent-os.ts                | /agents — agent registry and execution                               |
| ai-deployment.ts           | /ai-deployment/plans — deployment plan management                    |
| analytics.ts               | /analytics — metrics, KPIs, reports                                  |
| api-gateway.ts             | /api-gateway/routes — gateway route management                       |
| audit.ts                   | /audit — immutable audit log queries                                 |
| autonomous-intelligence.ts | /autonomous-intelligence — autonomous agent management               |
| benchmarking.ts            | /benchmarking — industry benchmarks, peer comparisons                |
| billing.ts                 | /billing/plans, /billing/subscriptions, /billing/invoices            |
| conversation.ts            | /conversations — conversation session management                     |
| coo.ts                     | /coo — digital COO briefings, actions                                |
| departments.ts             | /departments — department CRUD                                       |
| developer.ts               | /developer/api-keys, /developer/webhooks, /developer/oauth           |
| digital-twin.ts            | /digital-twin — twin node and relationship management                |
| economy.ts                 | /economy/accounts, /economy/transactions                             |
| governance.ts              | /governance/policies, /governance/compliance                         |
| graph.ts                   | /graph — org graph nodes and edges                                   |
| integrations.ts            | /integrations — connector management and sync                        |
| intelligence-network.ts    | /intelligence-network — peer benchmarking, contributions             |
| intelligence.ts            | /intelligence — health scores, snapshots                             |
| knowledge.ts               | /knowledge — document management                                     |
| marketplace.ts             | /marketplace/items — marketplace CRUD and installs                   |
| members.ts                 | /members — member management                                         |
| mission-control.ts         | /mission-control — dashboard, learning, guardian                     |
| observability.ts           | /observability/health, /observability/metrics, /observability/alerts |
| org-dna.ts                 | /org-dna — DNA profile management                                    |
| org-health.ts              | /org-health/scores, /org-health/overall, /org-health/at-risk         |
| org-memory.ts              | /org-memory — memory entry management                                |
| organizations.ts           | /organizations — organization CRUD                                   |
| partner.ts                 | /partners — partner management and deals                             |
| platform-admin.ts          | /platform-admin/tenants, /platform-admin/feature-flags               |
| platform.ts                | /platform — consolidated platform services                           |
| policy-engine.ts           | /policy-engine/policies, /policy-engine/enforce                      |
| predictive.ts              | /predictive — predictive scores and risk alerts                      |
| reliability.ts             | /reliability/score, /reliability/incidents                           |
| risk-intelligence.ts       | /risk-intelligence — risk signal management                          |
| roles.ts                   | /roles — role and permission management                              |
| self-healing.ts            | /self-healing/incidents, /self-healing/rules                         |
| solution-packs.ts          | /solution-packs — pack management                                    |
| teams.ts                   | /teams — team CRUD                                                   |
| workflow-generator.ts      | /workflow-generator — AI-driven workflow generation                  |
| workflow-os.ts             | /workflows — workflow execution and management                       |

---

## Database Migrations

| Number | File                             | Tables Created                                                                                               | RLS           |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------- |
| 001    | create_organizations             | organizations, organization_settings                                                                         | Post-008      |
| 002    | create_users                     | users                                                                                                        | Post-008      |
| 003    | create_roles_permissions         | roles, permissions, role_permissions, user_roles                                                             | Post-008      |
| 004    | create_memberships               | memberships                                                                                                  | Post-008      |
| 005    | create_departments_teams         | departments, teams, team_members                                                                             | Post-008      |
| 006    | create_events                    | events                                                                                                       | Post-008      |
| 007    | create_audit_logs                | audit_logs                                                                                                   | Post-008      |
| 008    | enable_rls                       | (RLS enabled on all Sprint 1 tables)                                                                         | Sprint 1 RLS  |
| 009    | create_channels_messages         | channels, channel_members, messages, message_threads                                                         | Post-016      |
| 010    | create_announcements_broadcasts  | announcements, broadcasts, communication_preferences                                                         | Post-016      |
| 011    | create_notifications             | notification_templates, notifications, notification_deliveries, notification_prefs                           | Post-016      |
| 012    | create_workflows                 | workflows, workflow_steps, workflow_conditions, workflow_runs, workflow_run_steps                            | Post-016      |
| 013    | create_tasks                     | tasks, task_assignments, task_comments, task_dependencies, task_history                                      | Post-016      |
| 014    | create_approvals                 | approvals, approval_steps, approval_decisions, approval_history                                              | Post-016      |
| 015    | create_automations               | automations, automation_executions                                                                           | Post-016      |
| 016    | enable_rls_sprint2               | (RLS enabled on Sprint 2 tables)                                                                             | Sprint 2 RLS  |
| 017    | create_metrics                   | metrics                                                                                                      | Global        |
| 018    | create_kpis                      | kpis                                                                                                         | Global        |
| 019    | create_reports                   | report_templates, reports                                                                                    | Global        |
| 020    | create_dashboard_widgets         | dashboard_widgets                                                                                            | Global        |
| 021    | create_knowledge_documents       | knowledge_documents, knowledge_versions, knowledge_activities                                                | Global        |
| 022    | create_knowledge_categories_tags | knowledge_categories, knowledge_tags                                                                         | Global        |
| 023    | create_health_scores             | health_scores, risk_indicators, recommendations                                                              | Global        |
| 024    | create_intelligence_snapshots    | intelligence_snapshots                                                                                       | Global        |
| 025    | gwos_workflow_classification     | workflow_packs                                                                                               | Post-029      |
| 026    | gwos_event_fabric                | event_consumers, event_subscriptions, event_retries, event_dead_letters                                      | Post-029      |
| 027    | gwos_ai_orchestration            | ai_executions, ai_decisions, intent_detections                                                               | Post-029      |
| 028    | gwos_whatsapp_runtime            | conversation_sessions, conversation_messages                                                                 | Post-029      |
| 029    | gwos_rls                         | (RLS enabled on GWOS tables)                                                                                 | GWOS RLS      |
| 030    | agent_registry                   | agents, agent_executions                                                                                     | Post-033      |
| 031    | agent_memory                     | agent_memory, agent_context_snapshots                                                                        | Post-033      |
| 032    | decision_engine                  | decision_rules, decisions, risk_assessments                                                                  | Post-033      |
| 033    | agent_rls                        | (RLS on agent tables)                                                                                        | Agent RLS     |
| 034    | marketplace                      | publishers, marketplace_items, installations, reviews, marketplace_billing                                   | Post-036      |
| 035    | observability                    | platform_health_checks, operational_metrics, alert_rules, alerts, incidents                                  | Post-037      |
| 036    | marketplace_rls                  | (RLS on marketplace tables)                                                                                  | Marketplace   |
| 037    | observability_rls                | (RLS on observability tables)                                                                                | Observability |
| 038    | billing                          | plans, subscriptions, invoices, usage_events, usage_summaries                                                | Post-040      |
| 039    | developer_platform               | api_keys, webhooks, webhook_deliveries, oauth_apps, oauth_tokens                                             | Post-041      |
| 040    | billing_rls                      | (RLS on billing tables)                                                                                      | Billing RLS   |
| 041    | developer_rls                    | (RLS on developer tables)                                                                                    | Developer     |
| 042    | governance                       | governance_policies, policy_rules, compliance_checks, compliance_reports, retention                          | Post-044      |
| 043    | platform_admin                   | feature_flags, system_config, admin_action_logs                                                              | Global        |
| 044    | governance_rls                   | (RLS on governance tables)                                                                                   | Governance    |
| 045    | partner_portal                   | partners, partner_deals, partner_commissions, publisher_payouts                                              | Global        |
| 046    | api_gateway                      | gateway_routes, api_request_logs, rate_limit_windows                                                         | Global        |
| 047    | integrations                     | integration_connectors, integration_sync_logs, event_mappings, solution_packs                                | Post-048      |
| 048    | integrations_rls                 | (RLS on integration tables)                                                                                  | Integrations  |
| 049    | org_graph                        | org_graph_nodes, org_graph_edges                                                                             | Global        |
| 050    | coo_org_memory                   | coo_briefings, coo_actions, org_memories                                                                     | Global        |
| 051    | predictive                       | predictive_scores, risk_alerts, intelligence_contributions, intelligence_benchmarks                          | Global        |
| 052    | economy                          | economy_accounts, economy_transactions                                                                       | Global        |
| 053    | conversation_os                  | conversation_sessions (v2), conversation_messages (v2), conversation_threads                                 | Global        |
| 054    | autonomous_intelligence          | autonomous_agents, agent_actions, agent_insights                                                             | Global        |
| 055    | digital_twin                     | twin_nodes, twin_relationships, twin_snapshots                                                               | Global        |
| 056    | policy_engine                    | policies, policy_rules (v2), policy_enforcement_logs                                                         | Global        |
| 057    | org_dna                          | org_dna, org_language_entries, industry_blueprints                                                           | Global        |
| 058    | org_health                       | org_health_scores                                                                                            | Global        |
| 059    | workflow_generator               | workflow_generation_requests                                                                                 | Global        |
| 060    | self_healing                     | healing_incidents, healing_rules                                                                             | Global        |
| 061    | ai_deployment                    | deployment_plans, deployment_resources, org_discovery_sessions                                               | Global        |
| 062    | reliability_part1                | happy_path_templates, happy_path_simulations, failure_records, confidence_scores                             | Global        |
| 063    | reliability_part2                | threat_events, trust_scores, escalation_records, retry_policies, retry_records                               | Global        |
| 064    | reliability_part3                | simulation_runs, simulation_reports, reliability_reports                                                     | Global        |
| 065    | platform_admin (v2)              | platform_admin_actions, platform_admin_metrics, support_tickets, admin_notes, tenants                        | Global        |
| 066    | org_lifecycle                    | org_lifecycle_events, org_readiness_scores, org_health_checkpoints, feature_flags (v2), feature_entitlements | Global        |
| 067    | config                           | org_configurations, config_schemas, platform_metrics, platform_health_snapshots                              | Global        |
| 068    | billing (v2)                     | billing_accounts, billing_profiles, invoices (v2), invoice_items, payments                                   | Global        |
| 069    | usage                            | usage_events (v2), usage_records, usage_limits, usage_alerts, revenue_snapshots                              | Global        |
| 070    | commercial                       | commercial_policies, entitlement_mappings                                                                    | Global        |

**Total Migrations: 70 | No sequence gaps detected.**

---

## Workers & Queues

**File:** `apps/worker/src/queues.ts`

| Queue Name            | BullMQ Queue Key      | Processor                          |
| --------------------- | --------------------- | ---------------------------------- |
| Workflow Execution    | workflow-execution    | processors/workflow-execution.ts   |
| Approval Processing   | approval-processing   | (via workflow-execution processor) |
| Task Processing       | task-processing       | (via workflow-execution processor) |
| SLA Monitoring        | sla-monitoring        | processors/sla-monitoring.ts       |
| Intent Detection      | intent-detection      | processors/intent-detection.ts     |
| Notification Dispatch | notification-dispatch | (service-handled)                  |
| Agent Execution       | agent-execution       | processors/agent-execution.ts      |

**Processors in** `apps/worker/src/processors/`:

- `agent-execution.ts`
- `intent-detection.ts`
- `sla-monitoring.ts`
- `workflow-execution.ts`

---

## Web Components

**Location:** `apps/web/`

| Component File                                | Description                         |
| --------------------------------------------- | ----------------------------------- |
| components/landing/Hero.tsx                   | Landing page hero section           |
| components/landing/Navbar.tsx                 | Top navigation bar                  |
| components/landing/HowItWorks.tsx             | Product walkthrough section         |
| components/landing/PlaybooksSection.tsx       | Use-case playbooks showcase         |
| components/landing/OutcomesSection.tsx        | Business outcomes display           |
| components/landing/BeforeAfterSection.tsx     | Before/after comparison             |
| components/landing/ChallengesSection.tsx      | Pain points section                 |
| components/landing/ExecutionFlowSection.tsx   | Workflow execution flow diagram     |
| components/landing/TrustGovernanceSection.tsx | Trust & governance features         |
| components/landing/TrustSection.tsx           | Trust signals / social proof        |
| components/landing/OrganizationGallery.tsx    | Customer/org gallery                |
| components/landing/Testimonials.tsx           | Testimonials carousel               |
| components/landing/FAQ.tsx                    | Frequently asked questions          |
| components/landing/CTA.tsx                    | Call-to-action section              |
| components/landing/Footer.tsx                 | Site footer                         |
| app/page.tsx                                  | Landing page root                   |
| app/layout.tsx                                | Root layout (Next.js 14 App Router) |

> Note: The web app currently serves the public landing page only. The full Mission Control dashboard UI is tracked as a future sprint deliverable.
