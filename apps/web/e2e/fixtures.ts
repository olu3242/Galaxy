import { test as base, type Page, type APIRequestContext } from '@playwright/test';

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? 'admin@galaxy-test.local';
export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'galaxy-test-password';

export { expect } from '@playwright/test';

interface LoginResult {
  accessToken: string;
  organizationId: string;
}

async function loginViaApi(request: APIRequestContext): Promise<LoginResult> {
  const res = await request.post(`${API}/api/v1/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`Login failed: ${String(res.status())} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    data: { accessToken: string; user: { organizationId: string } };
  };
  return {
    accessToken: body.data.accessToken,
    organizationId: body.data.user.organizationId,
  };
}

interface AuthFixtures {
  authenticatedPage: Page;
  accessToken: string;
}

export const test = base.extend<AuthFixtures>({
  accessToken: async ({ request }, use) => {
    const { accessToken } = await loginViaApi(request);
    await use(accessToken);
  },

  authenticatedPage: async ({ page, request }, use) => {
    const { accessToken, organizationId } = await loginViaApi(request);

    // Seed localStorage before navigating so the AuthProvider picks up the session
    await page.goto('/login');
    await page.evaluate(
      ({ token, orgId, email }: { token: string; orgId: string; email: string }) => {
        localStorage.setItem('gx-access-token', token);
        localStorage.setItem(
          'gx-user',
          JSON.stringify({ organizationId: orgId, email, role: 'admin' }),
        );
      },
      { token: accessToken, orgId: organizationId, email: TEST_EMAIL },
    );

    await use(page);
  },
});
