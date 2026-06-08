# Sprint 3 Validation Checklist

## packages/modules/analytics/

- [x] `package.json` — name: `@galaxy/analytics`, type: module
- [x] `tsconfig.json` — extends `../../../tsconfig.base.json`
- [x] `src/types.ts` — Metric, KPI, Report, ReportTemplate, DashboardWidget, AnalyticsSnapshot, AnalyticsDimension, AnalyticsFact (all include `organizationId`)
- [x] `src/services/MetricsService.ts` — recordMetric, getMetrics, aggregateMetrics
- [x] `src/services/KPIService.ts` — setKPI, getKPIs, evaluateKPI
- [x] `src/services/DashboardService.ts` — createWidget, getWidgets, getDashboard
- [x] `src/services/ReportingService.ts` — generateReport, getReports, getReportTemplates
- [x] `src/services/AnalyticsService.ts` — event orchestrator
- [x] `src/index.ts` — barrel export

## packages/modules/knowledge/

- [x] `package.json` — name: `@galaxy/knowledge`, type: module
- [x] `tsconfig.json` — extends `../../../tsconfig.base.json`
- [x] `src/types.ts` — KnowledgeDocument, KnowledgeCategory, KnowledgeTag, KnowledgeVersion, KnowledgeComment, KnowledgePermission, KnowledgeActivity
- [x] `src/services/KnowledgeService.ts` — createDocument, updateDocument, publishDocument, archiveDocument, getDocument, listDocuments
- [x] `src/services/KnowledgeSearchService.ts` — search, rankResults, filterByPermission, logSearchAudit
- [x] `src/services/KnowledgeVersionService.ts` — createVersion, getVersions, restoreVersion
- [x] `src/services/KnowledgePublishingService.ts` — publish, unpublish, getPublishStatus
- [x] `src/index.ts` — barrel export

## packages/modules/intelligence/

- [x] `package.json` — name: `@galaxy/intelligence`, type: module
- [x] `tsconfig.json` — extends `../../../tsconfig.base.json`
- [x] `src/types.ts` — HealthScore, RiskIndicator, Recommendation, OperationalSignal, InsightSnapshot
- [x] `src/services/HealthScoreService.ts` — computeOrganizationHealth, computeDepartmentHealth, computeWorkflowEffectiveness, computeCommunicationEffectiveness, computeMemberEngagement
- [x] `src/services/InsightService.ts` — generateInsights, listInsights
- [x] `src/services/RecommendationService.ts` — generateRecommendations, prioritizeRecommendations
- [x] `src/services/RiskDetectionService.ts` — detectRisks, assessRiskLevel, flagRiskIndicators, listRisks
- [x] `src/services/OperationalIntelligenceService.ts` — event orchestrator (workflow.completed, task.completed, message.sent, notification.sent, approval.granted, approval.rejected, member.created, member.updated, automation.executed, audit.recorded)
- [x] `src/index.ts` — barrel export

## Database Migrations

- [x] `017_create_metrics.sql` — metrics table, RLS, tenant_isolation policy
- [x] `018_create_kpis.sql` — kpis table with UNIQUE(org, name), RLS
- [x] `019_create_reports.sql` — report_templates + reports tables, RLS
- [x] `020_create_dashboard_widgets.sql` — dashboard_widgets table, RLS
- [x] `021_create_knowledge_documents.sql` — knowledge_documents, knowledge_versions, knowledge_activities tables, RLS
- [x] `022_create_knowledge_categories_tags.sql` — knowledge_categories, knowledge_tags tables, RLS
- [x] `023_create_health_scores.sql` — health_scores, risk_indicators, recommendations tables, RLS
- [x] `024_create_intelligence_snapshots.sql` — intelligence_snapshots table, RLS

## API Routes

- [x] `apps/api/src/routes/analytics.ts` — GET /analytics/metrics, GET /analytics/kpis, GET /analytics/dashboards/:category, POST /analytics/reports
- [x] `apps/api/src/routes/knowledge.ts` — CRUD /knowledge/documents, GET /knowledge/search, GET /knowledge/categories
- [x] `apps/api/src/routes/intelligence.ts` — GET /intelligence/health, GET /intelligence/insights, GET /intelligence/recommendations, GET /intelligence/risks
- [x] Routes registered in `apps/api/src/index.ts` with prefix `/api/v1`

## Tests

- [x] `packages/modules/analytics/src/__tests__/MetricsService.test.ts`
- [x] `packages/modules/knowledge/src/__tests__/KnowledgeService.test.ts`
- [x] `packages/modules/intelligence/src/__tests__/HealthScoreService.test.ts`

## Security Rules

- [x] All DB queries use parameterized values (`$1, $2`)
- [x] All services call `set_config($1, $2, true)` before any DB query
- [x] No string interpolation in SQL
- [x] TypeScript strict mode, no `any`, no `@ts-ignore`
- [x] RLS enabled on all new tables with `tenant_isolation` policy

## Notifications Barrel Export

- [x] `packages/modules/notifications/src/index.ts` — barrel export added
