/**
 * Platform Config OS Certification Test Suite — Phase 66
 *
 * Certifies ConfigurationService and OrganizationSettingsService:
 * 1.  ConfigurationService.set stores a value
 * 2.  ConfigurationService.get retrieves the value
 * 3.  ConfigurationService.set updates on conflict (upsert)
 * 4.  ConfigurationService.listNamespace returns keys in namespace
 * 5.  ConfigurationService.listAll returns all org configs
 * 6.  OrganizationSettingsService.setSetting stores a value
 * 7.  OrganizationSettingsService.getSetting retrieves stored value
 * 8.  OrganizationSettingsService.registerSchema creates a schema
 * 9.  OrganizationSettingsService.getSetting falls back to schema default
 * 10. Cross-tenant isolation — org B configs not visible to org A query
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { ConfigurationService, OrganizationSettingsService } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-6601-4000-8000-660000000001';
const orgIdB = '00000000-6601-4000-8000-660000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Config Phase 66 Org A', 'config-phase66-a', 'starter', 'active'),
            ($2, 'Config Phase 66 Org B', 'config-phase66-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM org_configurations WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.query(`DELETE FROM config_schemas WHERE namespace LIKE 'cert66%'`).catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Platform Config OS Certification', () => {
  // ── 1. set stores a value ────────────────────────────────────────────────
  it('1. ConfigurationService.set stores a configuration value', async () => {
    const svc = new ConfigurationService(pool);
    const config = await svc.set({
      organizationId: orgId,
      namespace: 'notifications',
      key: 'email_enabled',
      value: 'true',
    });
    expect(config).toBeTruthy();
    expect(config.organizationId).toBe(orgId);
    expect(config.namespace).toBe('notifications');
    expect(config.key).toBe('email_enabled');
    expect(config.value).toBe('true');
  });

  // ── 2. get retrieves the value ───────────────────────────────────────────
  it('2. ConfigurationService.get retrieves the stored value', async () => {
    const svc = new ConfigurationService(pool);
    const value = await svc.get(orgId, 'notifications', 'email_enabled');
    expect(value).toBe('true');
  });

  // ── 3. set updates on conflict ───────────────────────────────────────────
  it('3. ConfigurationService.set updates on conflict (upsert)', async () => {
    const svc = new ConfigurationService(pool);
    const updated = await svc.set({
      organizationId: orgId,
      namespace: 'notifications',
      key: 'email_enabled',
      value: 'false',
    });
    expect(updated.value).toBe('false');
    const value = await svc.get(orgId, 'notifications', 'email_enabled');
    expect(value).toBe('false');
  });

  // ── 4. listNamespace returns keys ────────────────────────────────────────
  it('4. ConfigurationService.listNamespace returns keys in namespace', async () => {
    const svc = new ConfigurationService(pool);
    await svc.set({
      organizationId: orgId,
      namespace: 'notifications',
      key: 'sms_enabled',
      value: 'true',
    });
    const configs = await svc.listNamespace(orgId, 'notifications');
    expect(Array.isArray(configs)).toBe(true);
    expect(configs.length).toBeGreaterThanOrEqual(2);
    expect(configs.every((c) => c.namespace === 'notifications')).toBe(true);
  });

  // ── 5. listAll returns all org configs ───────────────────────────────────
  it('5. ConfigurationService.listAll returns all configs for the org', async () => {
    const svc = new ConfigurationService(pool);
    await svc.set({
      organizationId: orgId,
      namespace: 'branding',
      key: 'logo_url',
      value: 'https://example.com/logo.png',
    });
    const all = await svc.listAll(orgId);
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all.every((c) => c.organizationId === orgId)).toBe(true);
  });

  // ── 6. OrganizationSettingsService.setSetting ────────────────────────────
  it('6. OrganizationSettingsService.setSetting stores a value', async () => {
    const svc = new OrganizationSettingsService(pool);
    const config = await svc.setSetting(orgId, 'ui', 'theme', 'dark');
    expect(config.value).toBe('dark');
    expect(config.organizationId).toBe(orgId);
  });

  // ── 7. OrganizationSettingsService.getSetting retrieves ──────────────────
  it('7. OrganizationSettingsService.getSetting retrieves stored value', async () => {
    const svc = new OrganizationSettingsService(pool);
    const value = await svc.getSetting(orgId, 'ui', 'theme');
    expect(value).toBe('dark');
  });

  // ── 8. registerSchema creates schema ─────────────────────────────────────
  it('8. OrganizationSettingsService.registerSchema creates a schema', async () => {
    const svc = new OrganizationSettingsService(pool);
    const schema = await svc.registerSchema({
      namespace: 'cert66_ui',
      key: 'language',
      valueType: 'string',
      defaultValue: 'en',
      description: 'UI language setting',
    });
    expect(schema.namespace).toBe('cert66_ui');
    expect(schema.key).toBe('language');
    expect(schema.defaultValue).toBe('en');
  });

  // ── 9. getSetting falls back to schema default ───────────────────────────
  it('9. OrganizationSettingsService.getSetting falls back to schema default', async () => {
    const svc = new OrganizationSettingsService(pool);
    // 'language' has no explicit value set for orgId, should fall back to 'en'
    const value = await svc.getSetting(orgId, 'cert66_ui', 'language');
    expect(value).toBe('en');
  });

  // ── 10. Cross-tenant isolation ───────────────────────────────────────────
  it('10. Org B configs are not visible to org A listAll query', async () => {
    const svc = new ConfigurationService(pool);
    await svc.set({
      organizationId: orgIdB,
      namespace: 'notifications',
      key: 'email_enabled',
      value: 'true',
    });
    const configsA = await svc.listAll(orgId);
    const configsB = await svc.listAll(orgIdB);
    expect(configsA.every((c) => c.organizationId === orgId)).toBe(true);
    expect(configsB.every((c) => c.organizationId === orgIdB)).toBe(true);
    expect(configsA.some((c) => c.organizationId === orgIdB)).toBe(false);
  });
});
