/**
 * Partner OS Certification Test Suite
 *
 * Certifies the Partner module lifecycle:
 * 1.  partners and partner_deals tables exist
 * 2.  Partner registration persists a record
 * 3.  Partner retrieval returns the partner
 * 4.  Partner listing works
 * 5.  Partner listing filters by type
 * 6.  Partner approval sets status to approved
 * 7.  Partner rejection sets status to rejected
 * 8.  Partner profile update persists changes
 * 9.  Partner listing filters by status
 * 10. Cross-tenant isolation — org B cannot see org A partners
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { PartnerService } from '@galaxy/partner';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-3601-4000-8000-360000000001';
const orgIdB = '00000000-3601-4000-8000-360000000002';
const actorId = '00000000-3601-4000-8000-360000000010';

let sharedPartnerId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Partner Test Org A', 'partner-test-a', 'starter', 'active'),
            ($2, 'Partner Test Org B', 'partner-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const svc = new PartnerService(pool);
  const partner = await svc.registerPartner({
    organizationId: orgId,
    name: 'Shared Cert Partner',
    type: 'reseller',
    tier: 'silver',
    contactEmail: 'cert@partner.com',
    contactName: 'Cert Contact',
  });
  sharedPartnerId = partner.id;
});

afterAll(async () => {
  await pool
    .query(
      `DELETE FROM partner_commissions WHERE partner_id IN (SELECT id FROM partners WHERE organization_id IN ($1, $2))`,
      [orgId, orgIdB],
    )
    .catch(() => null);
  await pool
    .query(
      `DELETE FROM partner_deals WHERE partner_id IN (SELECT id FROM partners WHERE organization_id IN ($1, $2))`,
      [orgId, orgIdB],
    )
    .catch(() => null);
  await pool
    .query(`DELETE FROM partners WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Partner OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. partners and partner_deals tables exist', async () => {
    for (const table of ['partners', 'partner_deals']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Partner registration ───────────────────────────────────────────────
  it('2. Partner registration persists a record', async () => {
    const svc = new PartnerService(pool);

    const partner = await svc.registerPartner({
      organizationId: orgId,
      name: 'Galaxy Solutions Partner',
      type: 'reseller',
      tier: 'gold',
      contactEmail: 'sales@galaxypartner.com',
      contactName: 'Jane Sales',
    });

    expect(partner.id).toBeTruthy();
    expect(partner.organizationId).toBe(orgId);
    expect(partner.name).toBe('Galaxy Solutions Partner');
    expect(partner.type).toBe('reseller');
    expect(partner.status).toBe('pending');
  });

  // ── 3. Partner retrieval ──────────────────────────────────────────────────
  it('3. Partner retrieval returns the partner', async () => {
    const svc = new PartnerService(pool);

    const partner = await svc.getPartner(orgId, sharedPartnerId);
    expect(partner).not.toBeNull();
    expect(partner?.id).toBe(sharedPartnerId);
    expect(partner?.organizationId).toBe(orgId);
  });

  // ── 4. Partner listing ────────────────────────────────────────────────────
  it('4. Partner listing works', async () => {
    const svc = new PartnerService(pool);

    const partners = await svc.listPartners(orgId);
    expect(Array.isArray(partners)).toBe(true);
    expect(partners.length).toBeGreaterThan(0);
  });

  // ── 5. Partner listing filters by type ───────────────────────────────────
  it('5. Partner listing filters by type', async () => {
    const svc = new PartnerService(pool);

    const partners = await svc.listPartners(orgId, { type: 'reseller' });
    expect(Array.isArray(partners)).toBe(true);
    for (const p of partners) {
      expect(p.type).toBe('reseller');
    }
  });

  // ── 6. Partner approval ───────────────────────────────────────────────────
  it('6. Partner approval sets status to approved', async () => {
    const svc = new PartnerService(pool);

    const approved = await svc.approvePartner(orgId, sharedPartnerId, actorId);
    expect(approved).not.toBeNull();
    expect(approved?.status).toBe('approved');
    expect(approved?.approvedBy).toBe(actorId);
  });

  // ── 7. Partner rejection ──────────────────────────────────────────────────
  it('7. Partner rejection sets status to rejected', async () => {
    const svc = new PartnerService(pool);

    const fresh = await svc.registerPartner({
      organizationId: orgId,
      name: 'Reject Me Partner',
      type: 'reseller',
      tier: 'registered',
      contactEmail: 'reject@me.com',
      contactName: 'Reject Me',
    });

    const rejected = await svc.rejectPartner(orgId, fresh.id);
    expect(rejected).not.toBeNull();
    expect(rejected?.status).toBe('rejected');
  });

  // ── 8. Partner profile update ─────────────────────────────────────────────
  it('8. Partner profile update persists changes', async () => {
    const svc = new PartnerService(pool);

    const updated = await svc.updatePartnerProfile(orgId, sharedPartnerId, {
      contactEmail: 'updated@partner.com',
    });
    expect(updated).not.toBeNull();
    expect(updated?.contactEmail).toBe('updated@partner.com');
  });

  // ── 9. Partner listing filters by status ─────────────────────────────────
  it('9. Partner listing filters by status', async () => {
    const svc = new PartnerService(pool);

    const approved = await svc.listPartners(orgId, { status: 'approved' });
    for (const p of approved) {
      expect(p.status).toBe('approved');
    }
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A partners', async () => {
    const svc = new PartnerService(pool);

    const partnersB = await svc.listPartners(orgIdB);
    const leaked = partnersB.some((p) => p.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
