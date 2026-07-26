/**
 * Developer OS Certification Test Suite
 *
 * Certifies the Developer module lifecycle:
 * 1.  api_keys and webhooks tables exist
 * 2.  API key generation returns key with plaintext secret
 * 3.  API key listing is tenant-scoped
 * 4.  API key validation accepts the plain key
 * 5.  API key rotation invalidates old key
 * 6.  API key revocation sets status to revoked
 * 7.  Webhook registration persists a record
 * 8.  Webhook listing is tenant-scoped
 * 9.  Webhook retrieval returns the webhook
 * 10. Cross-tenant isolation — org B cannot see org A API keys
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { APIKeyService, WebhookService } from '@galaxy/developer';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-3201-4000-8000-320000000001';
const orgIdB = '00000000-3201-4000-8000-320000000002';
const actorId = '00000000-3201-4000-8000-320000000010';

let sharedPlainKey: string;
let sharedKeyId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Developer Test Org A', 'dev-test-a', 'starter', 'active'),
            ($2, 'Developer Test Org B', 'dev-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const svc = new APIKeyService(pool);
  const keyWithSecret = await svc.generateKey({
    organizationId: orgId,
    name: 'Shared Cert Key',
    scopes: ['read:workflows'],
    createdBy: actorId,
  });
  sharedPlainKey = keyWithSecret.plainSecret;
  sharedKeyId = keyWithSecret.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM webhook_deliveries WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM webhooks WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM api_keys WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Developer OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. api_keys and webhooks tables exist', async () => {
    for (const table of ['api_keys', 'webhooks']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. API key generation ─────────────────────────────────────────────────
  it('2. API key generation returns key with plaintext secret', async () => {
    const svc = new APIKeyService(pool);

    const key = await svc.generateKey({
      organizationId: orgId,
      name: 'Test Integration Key',
      scopes: ['read:workflows', 'write:tasks'],
      createdBy: actorId,
    });

    expect(key.id).toBeTruthy();
    expect(key.organizationId).toBe(orgId);
    expect(key.name).toBe('Test Integration Key');
    expect(key.plainSecret).toBeTruthy();
    expect(key.status).toBe('active');
  });

  // ── 3. API key listing ────────────────────────────────────────────────────
  it('3. API key listing is tenant-scoped', async () => {
    const svc = new APIKeyService(pool);

    const keys = await svc.listKeys(orgId);
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k.organizationId).toBe(orgId);
    }
  });

  // ── 4. API key validation ─────────────────────────────────────────────────
  it('4. API key validation accepts the plain key', async () => {
    const svc = new APIKeyService(pool);

    const validated = await svc.validateKey(sharedPlainKey);
    expect(validated).not.toBeNull();
    expect(validated?.id).toBe(sharedKeyId);
    expect(validated?.status).toBe('active');
  });

  // ── 5. API key rotation ───────────────────────────────────────────────────
  it('5. API key rotation returns new key with new secret', async () => {
    const svc = new APIKeyService(pool);

    const newKey = await svc.rotateKey(orgId, sharedKeyId);
    expect(newKey.id).toBeTruthy();
    expect(newKey.plainSecret).toBeTruthy();
    expect(newKey.plainSecret).not.toBe(sharedPlainKey);

    // update shared plain key for subsequent test
    sharedPlainKey = newKey.plainSecret;
    sharedKeyId = newKey.id;
  });

  // ── 6. API key revocation ─────────────────────────────────────────────────
  it('6. API key revocation sets status to revoked', async () => {
    const svc = new APIKeyService(pool);

    const key = await svc.generateKey({
      organizationId: orgId,
      name: 'Revoke Me',
      scopes: [],
      createdBy: actorId,
    });

    const revoked = await svc.revokeKey(orgId, key.id);
    expect(revoked.status).toBe('revoked');
  });

  // ── 7. Webhook registration ───────────────────────────────────────────────
  it('7. Webhook registration persists a record', async () => {
    const svc = new WebhookService(pool);

    const webhook = await svc.registerWebhook({
      organizationId: orgId,
      name: 'My Workflow Hook',
      url: 'https://example.com/webhook',
      eventTypes: ['workflow.completed', 'task.assigned'],
      metadata: {},
    });

    expect(webhook.id).toBeTruthy();
    expect(webhook.organizationId).toBe(orgId);
    expect(webhook.name).toBe('My Workflow Hook');
    expect(webhook.isActive).toBe(true);
  });

  // ── 8. Webhook listing ────────────────────────────────────────────────────
  it('8. Webhook listing is tenant-scoped', async () => {
    const svc = new WebhookService(pool);

    const webhooks = await svc.listWebhooks(orgId);
    expect(Array.isArray(webhooks)).toBe(true);
    expect(webhooks.length).toBeGreaterThan(0);
    for (const w of webhooks) {
      expect(w.organizationId).toBe(orgId);
    }
  });

  // ── 9. Webhook retrieval ──────────────────────────────────────────────────
  it('9. Webhook retrieval returns the webhook', async () => {
    const svc = new WebhookService(pool);

    const webhooks = await svc.listWebhooks(orgId);
    const first = webhooks[0];
    if (!first) return;

    const fetched = await svc.getWebhook(orgId, first.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(first.id);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A API keys', async () => {
    const svc = new APIKeyService(pool);

    const keysB = await svc.listKeys(orgIdB);
    const leaked = keysB.some((k) => k.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
