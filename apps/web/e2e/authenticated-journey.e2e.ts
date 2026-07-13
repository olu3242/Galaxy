/**
 * E2E: Authenticated user journeys
 * Requires the test database to be seeded (admin@galaxy-test.local)
 */
import { test, expect, API, TEST_EMAIL } from './fixtures';

test.describe('Authenticated: Login flow', () => {
  test('can log in via UI and land on /dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', 'galaxy-test-password');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 10_000 });
    expect(page.url()).toContain('/dashboard');
  });

  test('sidebar is visible after login', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('aside')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('aside').getByText('Mission Control').first()).toBeVisible();
  });

  test('user email appears in sidebar footer', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('aside').getByText(TEST_EMAIL)).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Authenticated: Dashboard pages load', () => {
  const dashboardPages = [
    { path: '/dashboard', label: 'Mission Control' },
    { path: '/dashboard/executive', label: 'Executive' },
    { path: '/dashboard/workflow-ops', label: 'Workflow Ops' },
    { path: '/dashboard/ai-ops', label: 'AI Operations' },
    { path: '/dashboard/org-admin', label: 'Org Admin' },
    { path: '/dashboard/security-ops', label: 'Security Ops' },
    { path: '/dashboard/members', label: 'Members' },
    { path: '/dashboard/approvals', label: 'Approvals' },
    { path: '/dashboard/profile', label: 'My Profile' },
  ];

  for (const { path, label } of dashboardPages) {
    test(`${label} page renders without crash`, async ({ authenticatedPage: page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      // Should not redirect to /login
      expect(page.url()).not.toContain('/login');
      // Should not show a white/empty body
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length).toBeGreaterThan(0);
    });
  }
});

test.describe('Authenticated: Members page', () => {
  test('displays member table', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/members');
    await page.waitForLoadState('networkidle');

    // Wait for either a table row or the empty state
    await expect(
      page
        .locator('table')
        .or(page.locator('[data-testid="empty-members"]'))
        .or(page.getByText('No members')),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Authenticated: Profile page', () => {
  test('shows current user email', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/profile');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(TEST_EMAIL).first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Authenticated: Approvals page', () => {
  test('renders approvals list or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/approvals');
    await page.waitForLoadState('networkidle');

    // Accept either pending items or an empty state message
    const content = await page.locator('body').innerText();
    expect(content.length).toBeGreaterThan(0);
    expect(page.url()).not.toContain('/login');
  });
});

test.describe('Authenticated: API with token', () => {
  test('GET /auth/me returns current user when authenticated', async ({ request, accessToken }) => {
    const res = await request.get(`${API}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data: { email: string } };
    expect(body.data.email).toBe(TEST_EMAIL);
  });

  test('GET /members returns data with valid token', async ({ request, accessToken }) => {
    // Get organizationId from /auth/me first
    const meRes = await request.get(`${API}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const me = (await meRes.json()) as { data: { organizationId: string } };
    const orgId = me.data.organizationId;

    const res = await request.get(`${API}/api/v1/members?organizationId=${orgId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('POST /auth/login with correct credentials returns tokens', async ({ request }) => {
    const res = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: TEST_EMAIL, password: 'galaxy-test-password' },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data: { accessToken: string; refreshToken: string };
    };
    expect(typeof body.data.accessToken).toBe('string');
    expect(typeof body.data.refreshToken).toBe('string');
  });
});
