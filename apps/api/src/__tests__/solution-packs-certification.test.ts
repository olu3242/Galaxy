/**
 * Solution Packs OS Certification Test Suite
 *
 * Certifies the Solution Packs module lifecycle:
 * 1.  solution_packs and solution_pack_installations tables exist
 * 2.  Solution pack creation persists a record
 * 3.  Solution pack retrieval returns the pack
 * 4.  Unpublished packs excluded from available listing
 * 5.  Published pack appears in available listing
 * 6.  Available listing filters by industry
 * 7.  Pack installation persists a record
 * 8.  Installation listing is tenant-scoped
 * 9.  Multiple installations are all listed
 * 10. Cross-tenant isolation — org B installations don't leak to org A
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { SolutionPackService } from '@galaxy/solution-packs';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-4001-4000-8000-400000000001';
const orgIdB = '00000000-4001-4000-8000-400000000002';
const actorId = '00000000-4001-4000-8000-400000000010';

let sharedPackId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'SolPacks Test Org A', 'solpacks-test-a', 'starter', 'active'),
            ($2, 'SolPacks Test Org B', 'solpacks-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const svc = new SolutionPackService(pool);
  const pack = await svc.createPack({
    name: 'Shared Cert Pack',
    industry: 'fintech',
    description: 'Cert shared pack',
    version: '1.0.0',
    packData: {
      includedWorkflows: ['expense-approval'],
      includedKnowledgeTemplates: [],
      recommendedAgents: [],
    },
  });
  sharedPackId = pack.id;

  // Publish the shared pack so it appears in available listing
  await pool.query(`UPDATE solution_packs SET is_published = true WHERE id = $1`, [sharedPackId]);
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM solution_pack_installations WHERE organization_id IN ($1, $2)`, [
      orgId,
      orgIdB,
    ])
    .catch(() => null);
  await pool
    .query(`DELETE FROM solution_packs WHERE name LIKE 'Cert%' OR name LIKE 'Shared Cert%'`)
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Solution Packs OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. solution_packs and solution_pack_installations tables exist', async () => {
    for (const table of ['solution_packs', 'solution_pack_installations']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Solution pack creation ─────────────────────────────────────────────
  it('2. Solution pack creation persists a record', async () => {
    const svc = new SolutionPackService(pool);

    const pack = await svc.createPack({
      name: 'Cert HR Starter Pack',
      industry: 'professional_services',
      description: 'HR workflows for certification',
      version: '1.0.0',
      packData: {
        includedWorkflows: ['leave-approval', 'onboarding'],
        includedKnowledgeTemplates: ['hr-policy'],
        recommendedAgents: ['hr-copilot'],
      },
    });

    expect(pack.id).toBeTruthy();
    expect(pack.name).toBe('Cert HR Starter Pack');
    expect(pack.industry).toBe('professional_services');
    expect(pack.isPublished).toBe(false);
  });

  // ── 3. Solution pack retrieval ────────────────────────────────────────────
  it('3. Solution pack retrieval returns the pack', async () => {
    const svc = new SolutionPackService(pool);

    const pack = await svc.getPack(sharedPackId);
    expect(pack).toBeDefined();
    expect(pack?.id).toBe(sharedPackId);
    expect(pack?.name).toBe('Shared Cert Pack');
  });

  // ── 4. Unpublished packs excluded from available listing ──────────────────
  it('4. Unpublished packs excluded from available listing', async () => {
    const svc = new SolutionPackService(pool);

    // Create an unpublished pack
    const unpublished = await svc.createPack({
      name: 'Cert Unpublished Pack',
      industry: 'retail',
      description: 'Not published yet',
      version: '0.1.0',
      packData: { includedWorkflows: [], includedKnowledgeTemplates: [], recommendedAgents: [] },
    });

    const available = await svc.listAvailablePacks();
    const found = available.some((p) => p.id === unpublished.id);
    expect(found).toBe(false);
  });

  // ── 5. Published pack appears in available listing ────────────────────────
  it('5. Published pack appears in available listing', async () => {
    const svc = new SolutionPackService(pool);

    const available = await svc.listAvailablePacks();
    expect(Array.isArray(available)).toBe(true);
    const found = available.some((p) => p.id === sharedPackId);
    expect(found).toBe(true);
  });

  // ── 6. Available listing filters by industry ──────────────────────────────
  it('6. Available listing filters by industry', async () => {
    const svc = new SolutionPackService(pool);

    const fintech = await svc.listAvailablePacks({ industry: 'fintech' });
    for (const p of fintech) {
      expect(p.industry).toBe('fintech');
    }
  });

  // ── 7. Pack installation ──────────────────────────────────────────────────
  it('7. Pack installation persists a record', async () => {
    const svc = new SolutionPackService(pool);

    const installation = await svc.installPack(orgId, sharedPackId, actorId);

    expect(installation.id).toBeTruthy();
    expect(installation.organizationId).toBe(orgId);
    expect(installation.packId).toBe(sharedPackId);
    expect(installation.installedBy).toBe(actorId);
    expect(installation.status).toBe('installed');
  });

  // ── 8. Installation listing is tenant-scoped ──────────────────────────────
  it('8. Installation listing is tenant-scoped', async () => {
    const svc = new SolutionPackService(pool);

    const installs = await svc.listInstallations(orgId);
    expect(Array.isArray(installs)).toBe(true);
    expect(installs.length).toBeGreaterThan(0);
    for (const i of installs) {
      expect(i.organizationId).toBe(orgId);
    }
  });

  // ── 9. Multiple installations are all listed ──────────────────────────────
  it('9. Multiple installations are all listed', async () => {
    const svc = new SolutionPackService(pool);

    // Create a second pack and install it
    const pack2 = await svc.createPack({
      name: 'Cert Fintech Advanced Pack',
      industry: 'fintech',
      description: 'Advanced fintech workflows',
      version: '2.0.0',
      packData: {
        includedWorkflows: ['payment-approval'],
        includedKnowledgeTemplates: [],
        recommendedAgents: [],
      },
    });
    await pool.query(`UPDATE solution_packs SET is_published = true WHERE id = $1`, [pack2.id]);
    await svc.installPack(orgId, pack2.id, actorId);

    const installs = await svc.listInstallations(orgId);
    expect(installs.length).toBeGreaterThanOrEqual(2);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Cross-tenant: org B installations do not appear in org A listing', async () => {
    const svc = new SolutionPackService(pool);

    await svc.installPack(orgIdB, sharedPackId, actorId);

    const orgAInstalls = await svc.listInstallations(orgId);
    const leaked = orgAInstalls.some((i) => i.organizationId === orgIdB);
    expect(leaked).toBe(false);
  });
});
