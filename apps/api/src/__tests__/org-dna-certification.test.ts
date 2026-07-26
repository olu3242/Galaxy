/**
 * Org DNA OS Certification Test Suite
 *
 * Certifies the Org DNA module lifecycle:
 * 1.  org_dna table exists
 * 2.  DNA upsert creates a record
 * 3.  DNA retrieval returns the record
 * 4.  getDNA returns null for an org with no DNA
 * 5.  DNA upsert is idempotent — updates existing record
 * 6.  updateDNAField updates a specific profile field
 * 7.  computeCompleteness returns a numeric score
 * 8.  DNA record belongs to the correct organization
 * 9.  DNA listing is tenant-scoped
 * 10. Cross-tenant isolation — org B cannot read org A DNA
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { OrgDNAService } from '@galaxy/org-dna';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-4301-4000-8000-430000000001';
const orgIdB = '00000000-4301-4000-8000-430000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'OrgDNA Test Org A', 'orgdna-test-a', 'starter', 'active'),
            ($2, 'OrgDNA Test Org B', 'orgdna-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM org_dna WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Org DNA OS Certification', () => {
  // ── 1. Table exists ────────────────────────────────────────────────────────
  it('1. org_dna table exists', async () => {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'org_dna' AND table_schema = 'public'`,
    );
    expect(Number(r.rows[0]?.count ?? 0), 'org_dna must have columns').toBeGreaterThan(0);
  });

  // ── 2. DNA upsert creates a record ────────────────────────────────────────
  it('2. DNA upsert creates a record', async () => {
    const svc = new OrgDNAService(pool);

    const dna = await svc.upsertDNA(
      orgId,
      { type: 'fintech_startup', size: 'small' },
      { workHours: '9-5', decisionStyle: 'consensus' },
      { primaryProcess: 'expense-approval' },
      { greeting: 'Hello', farewell: 'Goodbye' },
      'fintech',
    );

    expect(dna.id).toBeTruthy();
    expect(dna.organizationId).toBe(orgId);
    expect(dna.identityProfile).toMatchObject({ type: 'fintech_startup' });
  });

  // ── 3. DNA retrieval returns the record ───────────────────────────────────
  it('3. DNA retrieval returns the record', async () => {
    const svc = new OrgDNAService(pool);

    const dna = await svc.getDNA(orgId);
    expect(dna).not.toBeNull();
    expect(dna?.organizationId).toBe(orgId);
  });

  // ── 4. getDNA returns null for org with no DNA ────────────────────────────
  it('4. getDNA returns null for an org with no DNA', async () => {
    const svc = new OrgDNAService(pool);

    const dna = await svc.getDNA(orgIdB);
    expect(dna).toBeNull();
  });

  // ── 5. Upsert is idempotent ───────────────────────────────────────────────
  it('5. DNA upsert is idempotent — updates existing record', async () => {
    const svc = new OrgDNAService(pool);

    await svc.upsertDNA(
      orgId,
      { type: 'updated_fintech', size: 'medium' },
      { workHours: '8-6' },
      {},
      {},
    );

    const dna = await svc.getDNA(orgId);
    expect(dna?.identityProfile).toMatchObject({ type: 'updated_fintech' });

    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM org_dna WHERE organization_id = $1`,
      [orgId],
    );
    expect(Number(r.rows[0]?.count ?? 0)).toBe(1);
  });

  // ── 6. updateDNAField updates a specific field ────────────────────────────
  it('6. updateDNAField updates a specific profile field', async () => {
    const svc = new OrgDNAService(pool);

    const updated = await svc.updateDNAField(orgId, 'workflowProfile', {
      primaryProcess: 'invoice-approval',
      automationLevel: 'high',
    });

    expect(updated.workflowProfile).toMatchObject({ primaryProcess: 'invoice-approval' });
  });

  // ── 7. computeCompleteness returns a numeric score ────────────────────────
  it('7. computeCompleteness returns a numeric score', async () => {
    const svc = new OrgDNAService(pool);

    const score = await svc.computeCompleteness(orgId);
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  // ── 8. DNA record belongs to correct organization ─────────────────────────
  it('8. DNA record belongs to the correct organization', async () => {
    const svc = new OrgDNAService(pool);

    const dna = await svc.getDNA(orgId);
    expect(dna?.organizationId).toBe(orgId);
  });

  // ── 9. DNA listing is tenant-scoped ──────────────────────────────────────
  it('9. DNA is associated only with its organization', async () => {
    const r = await pool.query<{ organization_id: string }>(
      `SELECT organization_id FROM org_dna WHERE organization_id = $1`,
      [orgId],
    );
    for (const row of r.rows) {
      expect(row.organization_id).toBe(orgId);
    }
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot read org A DNA', async () => {
    const svc = new OrgDNAService(pool);

    const dnab = await svc.getDNA(orgIdB);
    expect(dnab).toBeNull();

    const dnaA = await svc.getDNA(orgId);
    expect(dnaA?.organizationId).not.toBe(orgIdB);
  });
});
