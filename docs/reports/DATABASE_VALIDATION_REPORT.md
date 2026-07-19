# Database Validation Report

_Generated: 2026-06-09_

---

## Overview

This report validates the migration sequence in `apps/api/src/db/migrations/`, confirms no gaps in numbering, documents tables created per migration, and notes RLS coverage.

---

## Migration Sequence

| #   | File                                | Tables Created                                                                                               | RLS Applied   |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------- |
| 001 | create_organizations                | organizations, organization_settings                                                                         | via 008       |
| 002 | create_users                        | users                                                                                                        | via 008       |
| 003 | create_roles_permissions            | roles, permissions, role_permissions, user_roles                                                             | via 008       |
| 004 | create_memberships                  | memberships                                                                                                  | via 008       |
| 005 | create_departments_teams            | departments, teams, team_members                                                                             | via 008       |
| 006 | create_events                       | events                                                                                                       | via 008       |
| 007 | create_audit_logs                   | audit_logs                                                                                                   | via 008       |
| 008 | enable_rls                          | —                                                                                                            | Sprint 1 RLS  |
| 009 | create_channels_messages            | channels, channel_members, messages, message_threads                                                         | via 016       |
| 010 | create_announcements_broadcasts     | announcements, broadcasts, communication_preferences                                                         | via 016       |
| 011 | create_notifications                | notification_templates, notifications, notification_deliveries, notification_preferences                     | via 016       |
| 012 | create_workflows                    | workflows, workflow_steps, workflow_conditions, workflow_runs, workflow_run_steps                            | via 016       |
| 013 | create_tasks                        | tasks, task_assignments, task_comments, task_dependencies, task_history                                      | via 016       |
| 014 | create_approvals                    | approvals, approval_steps, approval_decisions, approval_history                                              | via 016       |
| 015 | create_automations                  | automations, automation_executions                                                                           | via 016       |
| 016 | enable_rls_sprint2                  | —                                                                                                            | Sprint 2 RLS  |
| 017 | create_metrics (SQL)                | metrics                                                                                                      | Global        |
| 018 | create_kpis (SQL)                   | kpis                                                                                                         | Global        |
| 019 | create_reports (SQL)                | report_templates, reports                                                                                    | Global        |
| 020 | create_dashboard_widgets (SQL)      | dashboard_widgets                                                                                            | Global        |
| 021 | create_knowledge_documents (SQL)    | knowledge_documents, knowledge_versions, knowledge_activities                                                | Global        |
| 022 | create_knowledge_categories (SQL)   | knowledge_categories, knowledge_tags                                                                         | Global        |
| 023 | create_health_scores (SQL)          | health_scores, risk_indicators, recommendations                                                              | Global        |
| 024 | create_intelligence_snapshots (SQL) | intelligence_snapshots                                                                                       | Global        |
| 025 | gwos_workflow_classification        | workflow_packs                                                                                               | via 029       |
| 026 | gwos_event_fabric                   | event_consumers, event_subscriptions, event_retries, event_dead_letters                                      | via 029       |
| 027 | gwos_ai_orchestration               | ai_executions, ai_decisions, intent_detections                                                               | via 029       |
| 028 | gwos_whatsapp_runtime               | conversation_sessions (v1), conversation_messages (v1)                                                       | via 029       |
| 029 | gwos_rls                            | —                                                                                                            | GWOS RLS      |
| 030 | agent_registry                      | agents, agent_executions                                                                                     | via 033       |
| 031 | agent_memory                        | agent_memory, agent_context_snapshots                                                                        | via 033       |
| 032 | decision_engine                     | decision_rules, decisions, risk_assessments                                                                  | via 033       |
| 033 | agent_rls                           | —                                                                                                            | Agent RLS     |
| 034 | marketplace                         | publishers, marketplace_items, installations, reviews, marketplace_billing                                   | via 036       |
| 035 | observability                       | platform_health_checks, operational_metrics, alert_rules, alerts, incidents                                  | via 037       |
| 036 | marketplace_rls                     | —                                                                                                            | Marketplace   |
| 037 | observability_rls                   | —                                                                                                            | Observability |
| 038 | billing                             | plans, subscriptions, invoices (v1), usage_events (v1), usage_summaries                                      | via 040       |
| 039 | developer_platform                  | api_keys, webhooks, webhook_deliveries, oauth_apps, oauth_tokens                                             | via 041       |
| 040 | billing_rls                         | —                                                                                                            | Billing RLS   |
| 041 | developer_rls                       | —                                                                                                            | Developer RLS |
| 042 | governance                          | governance_policies, policy_rules (v1), compliance_checks, compliance_reports, data_retention_policies       | Global        |
| 043 | platform_admin                      | feature_flags (v1), system_config, admin_action_logs                                                         | Global        |
| 044 | governance_rls                      | —                                                                                                            | Governance    |
| 045 | partner_portal                      | partners, partner_deals, partner_commissions, publisher_payouts                                              | Global        |
| 046 | api_gateway                         | gateway_routes, api_request_logs, rate_limit_windows                                                         | Global        |
| 047 | integrations                        | integration_connectors, integration_sync_logs, event_mappings, event_deliveries, solution_packs              | via 048       |
| 048 | integrations_rls                    | —                                                                                                            | Integrations  |
| 049 | org_graph                           | org_graph_nodes, org_graph_edges                                                                             | Global        |
| 050 | coo_org_memory                      | coo_briefings, coo_actions, org_memories                                                                     | Global        |
| 051 | predictive                          | predictive_scores, risk_alerts, intelligence_contributions, intelligence_benchmarks                          | Global        |
| 052 | economy                             | economy_accounts, economy_transactions                                                                       | Global        |
| 053 | conversation_os                     | conversation_sessions (v2), conversation_messages (v2), conversation_threads                                 | Global        |
| 054 | autonomous_intelligence             | autonomous_agents, agent_actions, agent_insights                                                             | Global        |
| 055 | digital_twin                        | twin_nodes, twin_relationships, twin_snapshots                                                               | Global        |
| 056 | policy_engine                       | policies, policy_rules (v2), policy_enforcement_logs                                                         | Global        |
| 057 | org_dna                             | org_dna, org_language_entries, industry_blueprints                                                           | Global        |
| 058 | org_health                          | org_health_scores                                                                                            | Global        |
| 059 | workflow_generator                  | workflow_generation_requests                                                                                 | Global        |
| 060 | self_healing                        | healing_incidents, healing_rules                                                                             | Global        |
| 061 | ai_deployment                       | deployment_plans, deployment_resources, org_discovery_sessions                                               | Global        |
| 062 | reliability_part1                   | happy_path_templates, happy_path_simulations, failure_records, confidence_scores, confidence_thresholds      | Global        |
| 063 | reliability_part2                   | threat_events, trust_scores, escalation_records, retry_policies, retry_records                               | Global        |
| 064 | reliability_part3                   | simulation_runs, simulation_reports, reliability_reports                                                     | Global        |
| 065 | platform_admin (v2)                 | platform_admin_actions, platform_admin_metrics, support_tickets, admin_notes, tenants                        | Global        |
| 066 | org_lifecycle                       | org_lifecycle_events, org_readiness_scores, org_health_checkpoints, feature_flags (v2), feature_entitlements | Global        |
| 067 | config                              | org_configurations, config_schemas, platform_metrics, platform_health_snapshots                              | Global        |
| 068 | billing (v2)                        | billing_accounts, billing_profiles, invoices (v2), invoice_items, payments                                   | Global        |
| 069 | usage                               | usage_events (v2), usage_records, usage_limits, usage_alerts, revenue_snapshots                              | Global        |
| 070 | commercial                          | commercial_policies, entitlement_mappings                                                                    | Global        |

---

## Sequence Validation

- **Total migrations:** 70
- **Expected range:** 001–070
- **Gaps detected:** None — all 70 numbers present and sequential
- **Mixed file types:** Migrations 017–024 are `.sql` files; all others are `.ts` files

---

## RLS Coverage Summary

| Phase         | Migrations | RLS Status                         |
| ------------- | ---------- | ---------------------------------- |
| Sprint 1      | 001–007    | RLS applied via migration 008      |
| Sprint 2      | 009–015    | RLS applied via migration 016      |
| SQL Batch     | 017–024    | Global RLS (assumed via PG config) |
| GWOS          | 025–028    | RLS applied via migration 029      |
| Agents        | 030–032    | RLS applied via migration 033      |
| Marketplace   | 034        | RLS applied via migration 036      |
| Observability | 035        | RLS applied via migration 037      |
| Billing       | 038        | RLS applied via migration 040      |
| Developer     | 039        | RLS applied via migration 041      |
| Governance    | 042        | RLS applied via migration 044      |
| Phase 4+      | 045–070    | Global RLS (tables include org_id) |

All tables include `organization_id UUID NOT NULL` per the database conventions in CLAUDE.md.

---

## Schema Overlap Notes

The following table names appear in more than one migration (both use `IF NOT EXISTS` — no conflict at migration time, but schema divergence is possible):

| Table Name            | Migrations | Note                                    |
| --------------------- | ---------- | --------------------------------------- |
| conversation_sessions | 028, 053   | v1 (GWOS) vs v2 (Conversation OS)       |
| conversation_messages | 028, 053   | v1 (GWOS) vs v2 (Conversation OS)       |
| policy_rules          | 042, 056   | Governance vs Policy Engine             |
| feature_flags         | 043, 066   | Platform Admin vs Org Lifecycle         |
| invoices              | 038, 068   | Original billing vs Platform billing v2 |
| usage_events          | 038, 069   | Original billing vs Platform usage      |

Recommend adding explicit ALTER TABLE or DROP/RECREATE migrations to resolve divergence before production launch.
