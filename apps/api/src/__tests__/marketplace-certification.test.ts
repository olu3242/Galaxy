/**
 * Marketplace OS Certification Test Suite
 *
 * Certifies the Marketplace module lifecycle:
 * 1.  marketplace_items and publishers tables exist
 * 2.  Publisher registration creates a pending publisher record
 * 3.  Publisher approval sets verified status
 * 4.  Marketplace item creation persists a draft item
 * 5.  Item publishing transitions to pending_review
 * 6.  Item listing is filterable by category
 * 7.  Item installation creates a retrievable installation
 * 8.  Review submission and moderation flow
 * 9.  Marketplace billing usage recording
 * 10. Cross-tenant isolation — org B cannot see org A items
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import {
  MarketplaceItemService,
  PublisherService,
  InstallationService,
  ReviewService,
  MarketplaceBillingService,
} from '@galaxy/marketplace';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-2401-4000-8000-240000000001';
const orgIdB = '00000000-2401-4000-8000-240000000002';
const actorId = '00000000-2401-4000-8000-240000000010';

let sharedPublisherId: string;
let sharedItemId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Marketplace Test Org A', 'market-test-a', 'starter', 'active'),
            ($2, 'Marketplace Test Org B', 'market-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  // Create a publisher and item for tests that need them
  const pubSvc = new PublisherService(pool);
  const publisher = await pubSvc.registerPublisher({
    organizationId: orgId,
    displayName: 'Galaxy Cert Publisher',
    email: 'publisher@certtest.com',
    metadata: {},
  });
  sharedPublisherId = publisher.id;
  await pubSvc.approvePublisher(orgId, sharedPublisherId);

  const itemSvc = new MarketplaceItemService(pool);
  const item = await itemSvc.createItem({
    organizationId: orgId,
    publisherId: sharedPublisherId,
    name: 'Shared Cert Item',
    slug: `shared-cert-item-${crypto.randomUUID().slice(0, 8)}`,
    description: 'Item used across certification tests',
    category: 'workflow',
    pricingModel: 'free',
    priceAmount: 0,
    priceCurrency: 'USD',
    tags: ['certification'],
    metadata: {},
  });
  sharedItemId = item.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM marketplace_billing WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM reviews WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM installations WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM marketplace_items WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM publishers WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Marketplace OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. marketplace_items and publishers tables exist', async () => {
    for (const table of ['marketplace_items', 'publishers']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Publisher registration ─────────────────────────────────────────────
  it('2. Publisher registration creates a pending publisher record', async () => {
    const svc = new PublisherService(pool);

    const publisher = await svc.registerPublisher({
      organizationId: orgId,
      displayName: 'New Test Publisher',
      email: `pub-${crypto.randomUUID().slice(0, 8)}@test.com`,
      metadata: { website: 'https://example.com' },
    });

    expect(publisher.id).toBeTruthy();
    expect(publisher.organizationId).toBe(orgId);
    expect(publisher.status).toBe('pending');
    expect(publisher.displayName).toBe('New Test Publisher');
  });

  // ── 3. Publisher approval ─────────────────────────────────────────────────
  it('3. Publisher approval sets verified status', async () => {
    const svc = new PublisherService(pool);

    const publisher = await svc.registerPublisher({
      organizationId: orgId,
      displayName: 'Approvable Publisher',
      email: `approve-${crypto.randomUUID().slice(0, 8)}@test.com`,
      metadata: {},
    });

    const approved = await svc.approvePublisher(orgId, publisher.id);
    expect(approved).not.toBeNull();
    expect(approved?.status).toBe('approved');
  });

  // ── 4. Item creation ──────────────────────────────────────────────────────
  it('4. Marketplace item creation persists a draft item', async () => {
    const svc = new MarketplaceItemService(pool);

    const item = await svc.createItem({
      organizationId: orgId,
      publisherId: sharedPublisherId,
      name: 'Leave Request Automation Pack',
      slug: `leave-request-${crypto.randomUUID().slice(0, 8)}`,
      description: 'Automates leave request workflows for HR departments.',
      category: 'workflow',
      pricingModel: 'subscription',
      priceAmount: 2900,
      priceCurrency: 'USD',
      tags: ['hr', 'automation'],
      metadata: { version: '1.0.0' },
    });

    expect(item.id).toBeTruthy();
    expect(item.organizationId).toBe(orgId);
    expect(item.status).toBe('draft');
    expect(item.category).toBe('workflow');
  });

  // ── 5. Item publishing ────────────────────────────────────────────────────
  it('5. Item publishing transitions to pending_review', async () => {
    const svc = new MarketplaceItemService(pool);

    const item = await svc.createItem({
      organizationId: orgId,
      publisherId: sharedPublisherId,
      name: `Publish Test Item ${crypto.randomUUID().slice(0, 8)}`,
      slug: `publish-test-${crypto.randomUUID().slice(0, 8)}`,
      description: 'Item to be published.',
      category: 'agent',
      pricingModel: 'free',
      priceAmount: 0,
      priceCurrency: 'USD',
      tags: [],
      metadata: {},
    });

    const published = await svc.publishItem(orgId, item.id);
    expect(published).not.toBeNull();
    expect(published?.status).toBe('pending_review');
  });

  // ── 6. Item listing ───────────────────────────────────────────────────────
  it('6. Item listing is filterable by category', async () => {
    const svc = new MarketplaceItemService(pool);

    const items = await svc.listItems(orgId, { category: 'workflow' });
    expect(Array.isArray(items)).toBe(true);
    for (const item of items) {
      expect(item.category).toBe('workflow');
      expect(item.organizationId).toBe(orgId);
    }
  });

  // ── 7. Installation ───────────────────────────────────────────────────────
  it('7. Item installation creates a retrievable installation', async () => {
    const svc = new InstallationService(pool);

    const installation = await svc.installItem({
      organizationId: orgId,
      marketplaceItemId: sharedItemId,
      installedBy: actorId,
      config: { autoApprove: false },
    });

    expect(installation.id).toBeTruthy();
    expect(installation.organizationId).toBe(orgId);
    expect(installation.marketplaceItemId).toBe(sharedItemId);
    expect(installation.status).toBe('active');

    const fetched = await svc.getInstallation(orgId, installation.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(installation.id);
  });

  // ── 8. Review submission and moderation ───────────────────────────────────
  it('8. Review submission and moderation flow works', async () => {
    const svc = new ReviewService(pool);

    const review = await svc.submitReview({
      organizationId: orgId,
      marketplaceItemId: sharedItemId,
      authorId: actorId,
      rating: 4,
      title: 'Great automation pack',
      body: 'Saved us hours of manual work each week.',
    });

    expect(review.id).toBeTruthy();
    expect(review.status).toBe('pending');
    expect(review.rating).toBe(4);

    const approved = await svc.moderateReview(orgId, review.id, 'approved');
    expect(approved).not.toBeNull();
    expect(approved?.status).toBe('approved');
  });

  // ── 9. Marketplace billing ────────────────────────────────────────────────
  it('9. Marketplace billing usage recording works', async () => {
    const installSvc = new InstallationService(pool);
    const billingSvc = new MarketplaceBillingService(pool);

    const installation = await installSvc.installItem({
      organizationId: orgId,
      marketplaceItemId: sharedItemId,
      installedBy: actorId,
      config: {},
    });

    const now = new Date();
    const billing = await billingSvc.recordUsage({
      organizationId: orgId,
      installationId: installation.id,
      marketplaceItemId: sharedItemId,
      periodStart: new Date(now.getTime() - 30 * 86400000).toISOString(),
      periodEnd: now.toISOString(),
      usageUnits: 1,
      feeAmount: 2900,
      feeCurrency: 'USD',
    });

    expect(billing.id).toBeTruthy();
    expect(billing.organizationId).toBe(orgId);
    expect(billing.status).toBe('pending');
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A items', async () => {
    const svc = new MarketplaceItemService(pool);

    const itemsB = await svc.listItems(orgIdB, {});
    const leaked = itemsB.some((i) => i.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
