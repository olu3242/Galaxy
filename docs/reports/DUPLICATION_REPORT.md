# Duplication Analysis Report

_Generated: 2026-06-09_

---

## Summary

This report documents service and route duplication found across the Galaxy monorepo. Most duplications are **expected tech debt** resulting from incremental module layering across sprints and are not defects.

---

## 1. BillingService — Two Implementations

| Location                                                | Package          | Purpose                                                   |
| ------------------------------------------------------- | ---------------- | --------------------------------------------------------- |
| packages/modules/billing/src/subscriptions/             | @galaxy/billing  | Sprint-era billing: plans, subscriptions, invoices, usage |
| packages/modules/platform/src/billing/BillingService.ts | @galaxy/platform | Phase 4 consolidated billing with accounts and profiles   |

**Assessment:** Expected tech debt. `@galaxy/billing` is the original Sprint 3 module. `@galaxy/platform` introduces a new consolidated BillingService as part of the Phase 4 platform layer. Both are referenced from `apps/api/src/routes/billing.ts` and `apps/api/src/routes/platform.ts` respectively. Canonical owner going forward is `@galaxy/platform`.

**Migrations affected:** 038/040 (original billing) vs 068/069 (platform billing v2).

---

## 2. FeatureFlagService — Two Implementations

| Location                                                                | Package                | Purpose                             |
| ----------------------------------------------------------------------- | ---------------------- | ----------------------------------- |
| packages/modules/platform-admin/src/feature-flags/FeatureFlagService.ts | @galaxy/platform-admin | Admin-facing flag management (CRUD) |
| packages/modules/platform/src/features/FeatureFlagService.ts            | @galaxy/platform       | Runtime flag evaluation for tenants |

**Assessment:** Expected separation of concerns. `@galaxy/platform-admin` manages flag definitions; `@galaxy/platform` evaluates them at runtime. Not a defect — distinct responsibilities.

**Migrations affected:** 043 (platform_admin) and 066 (org_lifecycle / feature_entitlements).

---

## 3. Observability — Two Implementations

| Location                                     | Package               | Purpose                                                            |
| -------------------------------------------- | --------------------- | ------------------------------------------------------------------ |
| packages/modules/observability/src/          | @galaxy/observability | Full observability stack: metrics, alerts, incidents, SLOs, health |
| packages/modules/platform/src/observability/ | @galaxy/platform      | Platform-level health snapshots and metrics                        |

**Assessment:** Expected layering. `@galaxy/observability` is the core operational monitoring module (registered at `/observability/*`). `@galaxy/platform` observability provides platform-wide health aggregation for admin dashboards. They serve different consumers.

---

## 4. Policy Rules — Potential Schema Overlap

| Migration | Table Name   | Context                         |
| --------- | ------------ | ------------------------------- |
| 042       | policy_rules | Governance policy rules         |
| 056       | policy_rules | Policy engine enforcement rules |

**Assessment:** Two separate `policy_rules` tables exist in different migration contexts. Both use `IF NOT EXISTS` so no migration conflict, but the naming collision may cause confusion. Recommend renaming one in a future migration (e.g., `governance_policy_rules` vs `engine_policy_rules`). Logged as tech debt.

---

## 5. Conversation Sessions — Schema Overlap

| Migration | Tables Created                                                     | Context               |
| --------- | ------------------------------------------------------------------ | --------------------- |
| 028       | conversation_sessions, conversation_messages                       | GWOS WhatsApp runtime |
| 053       | conversation_sessions, conversation_messages, conversation_threads | Conversation OS v2    |

**Assessment:** Migration 053 supersedes 028. Both use `IF NOT EXISTS` so the later migration extends the earlier schema. No runtime conflict, but schema evolution should be tracked via ALTER TABLE migrations in future.

---

## 6. Feature Flags — Schema Overlap

| Migration | Table Name    | Context                              |
| --------- | ------------- | ------------------------------------ |
| 043       | feature_flags | platform_admin (original)            |
| 066       | feature_flags | org_lifecycle (v2 with entitlements) |

**Assessment:** Both use `IF NOT EXISTS`. Migration 066 adds `feature_entitlements` as a companion table and extends the concept. No runtime conflict, but intent should be clarified.

---

## 7. Invoices — Schema Overlap

| Migration | Table Name | Context             |
| --------- | ---------- | ------------------- |
| 038       | invoices   | Original billing    |
| 068       | invoices   | Platform billing v2 |

**Assessment:** Both use `IF NOT EXISTS`. Schema columns may diverge. Track as tech debt for future consolidation.

---

## 8. usage_events — Schema Overlap

| Migration | Table Name   | Context              |
| --------- | ------------ | -------------------- |
| 038       | usage_events | Original billing     |
| 069       | usage_events | Platform usage layer |

**Assessment:** Same as invoices above — `IF NOT EXISTS` prevents runtime failure but columns may differ.

---

## 9. API Route Registration — No Duplicate Prefixes

All 42 route modules in `apps/api/src/index.ts` are registered at the same `/api/v1` top-level prefix. Each route file uses a unique sub-path. No duplicate route registrations were found.

---

## 10. MarketplaceBillingService

| Location                                                              | Package             | Purpose                                             |
| --------------------------------------------------------------------- | ------------------- | --------------------------------------------------- |
| packages/modules/marketplace/src/billing/MarketplaceBillingService.ts | @galaxy/marketplace | Marketplace-specific billing (commissions, payouts) |

**Assessment:** Not a duplicate — this is a specialized billing service for marketplace revenue, distinct from tenant subscription billing.

---

## Recommendations

| Priority | Item                                   | Action                                                  |
| -------- | -------------------------------------- | ------------------------------------------------------- |
| Low      | policy_rules naming collision          | Rename in next schema migration                         |
| Low      | conversation_sessions v1 vs v2         | Add migration to drop/consolidate v1 tables             |
| Low      | feature_flags v1 vs v2                 | Consolidate into single table with ALTER TABLE          |
| Low      | invoices / usage_events v1 vs v2       | Consolidate in Phase 4.9                                |
| Info     | BillingService dual implementation     | Phase out @galaxy/billing in favour of @galaxy/platform |
| Info     | FeatureFlagService dual implementation | Expected — no action required                           |
