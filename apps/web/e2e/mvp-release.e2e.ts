import { test, expect, API } from './fixtures';

test.describe('MVP release readiness', () => {
  test('authenticated tenant can query onboarding release readiness without supplying tenant identity', async ({
    request,
    accessToken,
  }) => {
    const res = await request.get(`${API}/api/v1/onboarding/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data: {
        complete: boolean;
        releaseReady: boolean;
        progress: { completed: number; total: number };
        steps: {
          wabaConfigured: boolean;
          membersInvited: boolean;
          departmentsCreated: boolean;
          teamsCreated: boolean;
          workflowReady: boolean;
        };
        counts: { activeWorkflows: number };
      };
    };

    expect(typeof body.data.releaseReady).toBe('boolean');
    expect(body.data.progress.total).toBe(5);
    expect(typeof body.data.steps.workflowReady).toBe('boolean');
    expect(body.data.counts.activeWorkflows).toBeGreaterThanOrEqual(0);
    expect(body.data.releaseReady).toBe(body.data.complete);
  });

  test('onboarding readiness rejects a forged tenant id', async ({ request, accessToken }) => {
    const forgedOrganizationId = '00000000-0000-0000-0000-999999999999';
    const res = await request.get(
      `${API}/api/v1/onboarding/status?organizationId=${forgedOrganizationId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(res.status()).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Tenant mismatch');
  });

  test('liveness remains available for deployment probes', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
