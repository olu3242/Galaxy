/**
 * E2E: Authentication journey
 * Login → Dashboard → Profile → Logout
 */
import { test, expect } from '@playwright/test';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? 'admin@galaxy-test.local';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'test-password';

test.describe('Authentication', () => {
  test('renders login page with correct structure', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('Galaxy');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Sign In');
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'wrong@example.com');
    await page.fill('input[type="password"]', 'badpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid')).toBeVisible({ timeout: 5000 });
  });

  test('redirects unauthenticated users from /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('API /auth/login endpoint is reachable', async ({ request }) => {
    const res = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: 'probe@example.com', password: 'probe' },
    });
    // 400 (validation pass) or 401 (wrong creds) — both mean the endpoint is up
    expect([400, 401]).toContain(res.status());
  });

  test('API /auth/me requires authorization', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/auth/me`);
    expect(res.status()).toBe(401);
  });
});
