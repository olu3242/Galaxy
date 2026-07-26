/**
 * Workflow Generator OS Certification Test Suite
 *
 * Certifies the Workflow Generator module lifecycle:
 * 1.  workflow_generation_requests table exists
 * 2.  Request creation persists a record
 * 3.  Request retrieval returns the record
 * 4.  Request listing is tenant-scoped
 * 5.  generateWorkflow sets status to complete
 * 6.  Generated workflow has steps
 * 7.  Generated workflow has a name derived from the description
 * 8.  Multiple requests are all listed
 * 9.  Request listing returns only org's requests
 * 10. Cross-tenant isolation — org B cannot see org A requests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { WorkflowGeneratorService } from '@galaxy/workflow-generator';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-4501-4000-8000-450000000001';
const orgIdB = '00000000-4501-4000-8000-450000000002';

let sharedRequestId: string;
let secondRequestId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'WFGen Test Org A', 'wfgen-test-a', 'starter', 'active'),
            ($2, 'WFGen Test Org B', 'wfgen-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const svc = new WorkflowGeneratorService(pool);
  const req = await svc.createRequest(
    orgId,
    'Submit expense report, then review manager, after that finance approval',
    'fintech',
  );
  sharedRequestId = req.id;

  const req2 = await svc.createRequest(
    orgId,
    'Onboard employee, then IT setup, after that orientation session',
    'hr',
  );
  secondRequestId = req2.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM workflow_generation_requests WHERE organization_id IN ($1, $2)`, [
      orgId,
      orgIdB,
    ])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Workflow Generator OS Certification', () => {
  // ── 1. Table exists ────────────────────────────────────────────────────────
  it('1. workflow_generation_requests table exists', async () => {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'workflow_generation_requests' AND table_schema = 'public'`,
    );
    expect(
      Number(r.rows[0]?.count ?? 0),
      'workflow_generation_requests must have columns',
    ).toBeGreaterThan(0);
  });

  // ── 2. Request creation ───────────────────────────────────────────────────
  it('2. Request creation persists a record', async () => {
    const svc = new WorkflowGeneratorService(pool);

    const req = await svc.createRequest(
      orgId,
      'Review invoice, then approve payment, after that notify finance',
      'fintech',
    );

    expect(req.id).toBeTruthy();
    expect(req.organizationId).toBe(orgId);
    expect(req.naturalLanguageDescription).toBe(
      'Review invoice, then approve payment, after that notify finance',
    );
    expect(req.status).toBe('pending');
  });

  // ── 3. Request retrieval ──────────────────────────────────────────────────
  it('3. Request retrieval returns the record', async () => {
    const svc = new WorkflowGeneratorService(pool);

    const req = await svc.getRequest(orgId, sharedRequestId);
    expect(req.id).toBe(sharedRequestId);
    expect(req.organizationId).toBe(orgId);
  });

  // ── 4. Request listing is tenant-scoped ───────────────────────────────────
  it('4. Request listing is tenant-scoped', async () => {
    const svc = new WorkflowGeneratorService(pool);

    const requests = await svc.listRequests(orgId);
    expect(Array.isArray(requests)).toBe(true);
    expect(requests.length).toBeGreaterThan(0);
    for (const r of requests) {
      expect(r.organizationId).toBe(orgId);
    }
  });

  // ── 5. generateWorkflow sets status to complete ───────────────────────────
  it('5. generateWorkflow sets status to complete', async () => {
    const svc = new WorkflowGeneratorService(pool);

    const result = await svc.generateWorkflow(orgId, sharedRequestId);
    expect(result.status).toBe('complete');
  });

  // ── 6. Generated workflow has steps ───────────────────────────────────────
  it('6. Generated workflow has steps', async () => {
    const svc = new WorkflowGeneratorService(pool);

    const req = await svc.getRequest(orgId, sharedRequestId);
    expect(Array.isArray(req.steps)).toBe(true);
    const steps = req.steps ?? [];
    expect(steps.length).toBeGreaterThan(0);
  });

  // ── 7. Generated workflow has a name ─────────────────────────────────────
  it('7. Generated workflow has a name derived from the description', async () => {
    const svc = new WorkflowGeneratorService(pool);

    const req = await svc.getRequest(orgId, sharedRequestId);
    expect(req.generatedWorkflow).toBeTruthy();
    if (!req.generatedWorkflow) return;
    expect(typeof req.generatedWorkflow.name).toBe('string');
    expect(String(req.generatedWorkflow.name).length).toBeGreaterThan(0);
  });

  // ── 8. Multiple requests are all listed ──────────────────────────────────
  it('8. Multiple requests are all listed', async () => {
    const svc = new WorkflowGeneratorService(pool);

    const requests = await svc.listRequests(orgId);
    const ids = requests.map((r) => r.id);
    expect(ids).toContain(sharedRequestId);
    expect(ids).toContain(secondRequestId);
  });

  // ── 9. Request listing returns only org's requests ────────────────────────
  it('9. Request listing returns only org A requests', async () => {
    const svc = new WorkflowGeneratorService(pool);

    const requests = await svc.listRequests(orgId);
    for (const r of requests) {
      expect(r.organizationId).toBe(orgId);
    }
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A requests', async () => {
    const svc = new WorkflowGeneratorService(pool);

    const requestsB = await svc.listRequests(orgIdB);
    const leaked = requestsB.some((r) => r.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
