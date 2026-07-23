# Sprint 3 — Analytics + Broadcast + Onboarding

**Sprint:** 3
**Duration:** Weeks 11–14
**Goal:** Organisations can see what's happening and communicate at scale
**Branch:** `sprint/3-analytics-broadcast`

---

## Objective

Surface live operational intelligence through the Mission Control web dashboard, enable mass broadcasts, and make onboarding a sub-30-minute experience for new organisations.

---

## Deliverables

### Analytics OS

- [x] Executive dashboard — `apps/web/app/dashboard/executive/page.tsx`
- [x] Operations dashboard — `apps/web/app/dashboard/workflows/page.tsx`
- [x] Real-time dashboard updates
  - [x] SSE stream — `apps/api/src/routes/events-sse.ts` (`GET /api/v1/events/stream`)
  - [x] WebSocket stream — `apps/api/src/routes/events-ws.ts` (`WS /api/v1/events/ws`)
- [x] Org health score — `modules/intelligence/src/services/HealthScoreService.ts`
- [x] Workflow velocity metrics — `modules/analytics/src/`
- [x] Intelligence snapshots — `modules/intelligence/src/services/InsightService.ts`

### Communication OS (Broadcast)

- [x] Broadcast engine — `modules/communication/src/services/BroadcastService.ts`
- [x] Rate limiting per WABA tier — `BroadcastService.ts`
- [x] Delivery tracking — `BroadcastService.ts` (sent/delivered/read states)
- [x] Message template library — migration `078_wa_templates.ts`
- [x] Announcement layer — `modules/communication/src/services/AnnouncementService.ts`

### Identity OS (Onboarding)

- [x] Organisation onboarding flow — `apps/api/src/routes/onboarding.ts`
- [x] Member bulk invite — `modules/identity/src/services/MemberService.ts`
- [x] Department/team setup wizard — `apps/web/app/dashboard/onboarding/page.tsx`

### Mission Control (Web Dashboard)

- [x] Organisation overview — `apps/web/app/dashboard/page.tsx`
- [x] Active workflows list — `apps/web/app/dashboard/workflows/page.tsx`
- [x] Member directory — `apps/web/app/dashboard/members/page.tsx`
- [x] Broadcast composer — `apps/web/app/dashboard/broadcast/page.tsx`
- [x] Audit log viewer — `apps/web/app/dashboard/audit/page.tsx`
- [x] Agents panel — `apps/web/app/dashboard/agents/page.tsx`
- [x] Knowledge base — `apps/web/app/dashboard/knowledge/page.tsx`

---

## Exit Criteria

- [x] Org admin can see live org health on web dashboard
- [x] Admin can broadcast to all members via web
- [x] Onboarding takes < 30 minutes for a new organisation
- [x] WebSocket real-time event stream operational

---

## Status: **COMPLETE**
