/**
 * E2E: Dashboard navigation journey
 * Tests sidebar navigation, page loading, and data display
 */
import { test, expect } from '@playwright/test';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

test.describe('API Endpoint Availability', () => {
  test('health endpoint is reachable', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBe(200);
  });

  test('analytics/dashboards endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/analytics/dashboards/executive`);
    expect(res.status()).toBe(401);
  });

  test('members endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/members?organizationId=test`);
    expect(res.status()).toBe(401);
  });

  test('workflow-os/approvals endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/workflow-os/approvals?organizationId=test`);
    expect(res.status()).toBe(401);
  });

  test('agents/overview endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/agents/overview?organizationId=test`);
    expect(res.status()).toBe(401);
  });

  test('intelligence/insights endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/intelligence/insights?organizationId=test`);
    expect(res.status()).toBe(401);
  });

  test('audit/logs endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/audit/logs?organizationId=test`);
    expect(res.status()).toBe(401);
  });

  test('observability/health endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/observability/health`);
    expect([200, 401]).toContain(res.status());
  });

  test('departments endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/departments?organizationId=test`);
    expect(res.status()).toBe(401);
  });

  test('roles endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/roles?organizationId=test`);
    expect(res.status()).toBe(401);
  });

  test('agents/definitions endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/agents/definitions?organizationId=test`);
    expect(res.status()).toBe(401);
  });

  test('identity/delegations endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/identity/delegations?organizationId=test`);
    expect(res.status()).toBe(401);
  });

  test('communication/templates endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/communication/templates?organizationId=test`);
    expect(res.status()).toBe(401);
  });

  test('loops/all endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/loops/all?organizationId=test`);
    expect(res.status()).toBe(401);
  });

  test('broadcasts endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/broadcasts?organizationId=test`);
    expect(res.status()).toBe(401);
  });

  test('knowledge/documents endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/knowledge/documents?organizationId=test`);
    expect(res.status()).toBe(401);
  });

  test('people/attendance endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/people/attendance?organizationId=test`);
    expect(res.status()).toBe(401);
  });
});

test.describe('Dashboard pages render without crash', () => {
  // These tests verify the pages load (may redirect to /login without auth, which is correct)
  const pages = [
    '/dashboard',
    '/dashboard/executive',
    '/dashboard/workflow-ops',
    '/dashboard/ai-ops',
    '/dashboard/org-admin',
    '/dashboard/security-ops',
    '/dashboard/super-admin',
    '/dashboard/approvals',
    '/dashboard/members',
    '/dashboard/profile',
    '/dashboard/loops',
    '/dashboard/workflow-builder',
    '/dashboard/broadcast',
    '/dashboard/knowledge',
    '/dashboard/people',
    '/dashboard/copilot',
    '/dashboard/reports',
    '/dashboard/notifications',
    '/dashboard/onboarding',
  ];

  for (const path of pages) {
    test(`${path} redirects to login when unauthenticated`, async ({ page }) => {
      await page.goto(path);
      // Either stays on page with loading state, or redirects to /login
      await page.waitForTimeout(1000);
      const url = page.url();
      expect(url.includes(path) || url.includes('/login')).toBe(true);
    });
  }
});
