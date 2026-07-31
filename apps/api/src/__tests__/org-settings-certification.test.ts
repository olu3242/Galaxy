/**
 * Organization Settings Service Certification Test Suite — Phase 88
 *
 * Certifies OrganizationSettingsService from @galaxy/platform:
 * 1.  registerSchema registers a config schema
 * 2.  schema has correct namespace, key, and valueType
 * 3.  listSchemas returns registered schemas
 * 4.  listSchemas filters by namespace
 * 5.  setSetting stores a configuration value
 * 6.  getSetting retrieves a stored value
 * 7.  getSetting returns null for missing key
 * 8.  getSetting falls back to schema defaultValue
 * 9.  setSetting overwrites an existing value
 * 10. Cross-org: setSetting/getSetting is isolated per org
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { OrganizationSettingsService, type ConfigSchema } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-8801-4000-8000-880100000001';
const orgIdB = '00000000-8801-4000-8000-880100000002';
const orgIdC = '00000000-8801-4000-8000-880100000003';
const ns = 'cert88';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'OrgSettings Phase 88 Org A', 'orgsettings-phase88-a', 'starter', 'active'),
            ($2, 'OrgSettings Phase 88 Org B', 'orgsettings-phase88-b', 'starter', 'active'),
            ($3, 'OrgSettings Phase 88 Org C', 'orgsettings-phase88-c', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB, orgIdC],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM org_configurations WHERE organization_id IN ($1, $2, $3)`, [
      orgId,
      orgIdB,
      orgIdC,
    ])
    .catch(() => null);
  await pool.query(`DELETE FROM config_schemas WHERE namespace = $1`, [ns]).catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2, $3)`, [orgId, orgIdB, orgIdC])
    .catch(() => null);
  await pool.end();
});

describe('Organization Settings Service Certification', () => {
  // ── 1. registerSchema registers a config schema ───────────────────────────
  it('1. registerSchema registers a config schema', async () => {
    const svc = new OrganizationSettingsService(pool);
    const schema: ConfigSchema = await svc.registerSchema({
      namespace: ns,
      key: 'max_users',
      valueType: 'number',
      defaultValue: '10',
      description: 'Maximum users allowed',
    });
    expect(schema).toBeTruthy();
    expect(schema.namespace).toBe(ns);
    expect(schema.key).toBe('max_users');
  });

  // ── 2. schema has correct namespace, key, and valueType ───────────────────
  it('2. schema has correct namespace, key, and valueType', async () => {
    const svc = new OrganizationSettingsService(pool);
    const schema: ConfigSchema = await svc.registerSchema({
      namespace: ns,
      key: 'feature_x',
      valueType: 'boolean',
      defaultValue: 'false',
      description: 'Enable feature X',
    });
    expect(schema.namespace).toBe(ns);
    expect(schema.key).toBe('feature_x');
    expect(schema.valueType).toBe('boolean');
  });

  // ── 3. listSchemas returns registered schemas ─────────────────────────────
  it('3. listSchemas returns registered schemas', async () => {
    const svc = new OrganizationSettingsService(pool);
    const schemas: ConfigSchema[] = await svc.listSchemas(ns);
    expect(Array.isArray(schemas)).toBe(true);
    expect(schemas.length).toBeGreaterThanOrEqual(2);
  });

  // ── 4. listSchemas filters by namespace ───────────────────────────────────
  it('4. listSchemas filters by namespace', async () => {
    const svc = new OrganizationSettingsService(pool);
    const schemas: ConfigSchema[] = await svc.listSchemas(ns);
    expect(schemas.every((s) => s.namespace === ns)).toBe(true);
  });

  // ── 5. setSetting stores a configuration value ────────────────────────────
  it('5. setSetting stores a configuration value', async () => {
    const svc = new OrganizationSettingsService(pool);
    const config = await svc.setSetting(orgId, ns, 'max_users', '50');
    expect(config).toBeTruthy();
    expect(config.value).toBe('50');
  });

  // ── 6. getSetting retrieves a stored value ────────────────────────────────
  it('6. getSetting retrieves a stored value', async () => {
    const svc = new OrganizationSettingsService(pool);
    const value: string | null = await svc.getSetting(orgId, ns, 'max_users');
    expect(value).toBe('50');
  });

  // ── 7. getSetting returns null for missing key ────────────────────────────
  it('7. getSetting returns null for missing key with no schema', async () => {
    const svc = new OrganizationSettingsService(pool);
    const value: string | null = await svc.getSetting(orgId, ns, 'nonexistent_key');
    expect(value).toBeNull();
  });

  // ── 8. getSetting falls back to schema defaultValue ───────────────────────
  it('8. getSetting falls back to schema defaultValue', async () => {
    const svc = new OrganizationSettingsService(pool);
    // orgIdB has no stored value for 'max_users' but schema has default '10'
    const value: string | null = await svc.getSetting(orgIdB, ns, 'max_users');
    expect(value).toBe('10');
  });

  // ── 9. setSetting overwrites an existing value ────────────────────────────
  it('9. setSetting overwrites an existing value', async () => {
    const svc = new OrganizationSettingsService(pool);
    await svc.setSetting(orgId, ns, 'max_users', '100');
    const value: string | null = await svc.getSetting(orgId, ns, 'max_users');
    expect(value).toBe('100');
  });

  // ── 10. Cross-org: settings isolated per org ──────────────────────────────
  it('10. getSetting is isolated per org', async () => {
    const svc = new OrganizationSettingsService(pool);
    await svc.setSetting(orgIdB, ns, 'max_users', '25');
    const valueA: string | null = await svc.getSetting(orgId, ns, 'max_users');
    const valueB: string | null = await svc.getSetting(orgIdB, ns, 'max_users');
    expect(valueA).toBe('100');
    expect(valueB).toBe('25');
    expect(valueA).not.toBe(valueB);
  });
});
