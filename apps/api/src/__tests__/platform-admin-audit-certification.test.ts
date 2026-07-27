/**
 * Platform Admin Audit & Config Certification Test Suite — Phase 70
 *
 * Certifies SystemConfigService, AuditService, and MetricsService from @galaxy/platform-admin:
 * 1.  SystemConfigService.upsertConfig stores a platform config
 * 2.  SystemConfigService.getConfig retrieves it
 * 3.  SystemConfigService.listConfigs includes the stored config
 * 4.  SystemConfigService.deleteConfig removes it
 * 5.  AuditService.log creates a platform audit log entry
 * 6.  AuditService.queryLogs returns logs by organizationId
 * 7.  AuditService.queryLogs filters by action
 * 8.  MetricsService.getPlatformMetrics returns platform-level metrics
 * 9.  MetricsService.getTenantMetrics returns tenant-scoped metrics
 * 10. Cross-tenant isolation — org B audit logs not returned for org A query
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { SystemConfigService, AuditService, MetricsService } from '@galaxy/platform-admin';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-7001-4000-8000-700000000001';
const orgIdB = '00000000-7001-4000-8000-700000000002';
const configKey = 'cert70.test.config';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Admin Audit Phase 70 Org A', 'adminaudit-phase70-a', 'starter', 'active'),
            ($2, 'Admin Audit Phase 70 Org B', 'adminaudit-phase70-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM platform_audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.query(`DELETE FROM system_config WHERE key LIKE 'cert70%'`).catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Platform Admin Audit & Config Certification', () => {
  // ── 1. upsertConfig stores a config ──────────────────────────────────────
  it('1. SystemConfigService.upsertConfig stores a platform config', async () => {
    const svc = new SystemConfigService(pool);
    const config = await svc.upsertConfig({
      key: configKey,
      value: { enabled: true },
      updatedBy: 'cert70-admin',
    });
    expect(config).toBeTruthy();
    expect(config.key).toBe(configKey);
    expect(config.updatedBy).toBe('cert70-admin');
  });

  // ── 2. getConfig retrieves it ─────────────────────────────────────────────
  it('2. SystemConfigService.getConfig retrieves the stored config', async () => {
    const svc = new SystemConfigService(pool);
    const config = await svc.getConfig(configKey);
    expect(config).toBeTruthy();
    expect(config?.key).toBe(configKey);
  });

  // ── 3. listConfigs includes it ────────────────────────────────────────────
  it('3. SystemConfigService.listConfigs includes the stored config', async () => {
    const svc = new SystemConfigService(pool);
    const configs = await svc.listConfigs();
    expect(Array.isArray(configs)).toBe(true);
    const found = configs.find((c) => c.key === configKey);
    expect(found).toBeTruthy();
  });

  // ── 4. deleteConfig removes it ────────────────────────────────────────────
  it('4. SystemConfigService.deleteConfig removes the config', async () => {
    const svc = new SystemConfigService(pool);
    const deleted = await svc.deleteConfig(configKey);
    expect(deleted).toBe(true);
    const config = await svc.getConfig(configKey);
    expect(config).toBeNull();
  });

  // ── 5. AuditService.log creates an entry ──────────────────────────────────
  it('5. AuditService.log creates a platform audit log entry', async () => {
    const svc = new AuditService(pool);
    const entry = await svc.log({
      organizationId: orgId,
      actorType: 'admin',
      actorId: 'cert70-admin-user',
      action: 'org.settings.updated',
      resourceType: 'organization',
      resourceId: orgId,
    });
    expect(entry).toBeTruthy();
    expect(entry.id).toBeTruthy();
    expect(entry.organizationId).toBe(orgId);
    expect(entry.action).toBe('org.settings.updated');
  });

  // ── 6. queryLogs returns logs by organizationId ───────────────────────────
  it('6. AuditService.queryLogs returns logs by organizationId', async () => {
    const svc = new AuditService(pool);
    const logs = await svc.queryLogs({ organizationId: orgId });
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.organizationId === orgId)).toBe(true);
  });

  // ── 7. queryLogs filters by action ───────────────────────────────────────
  it('7. AuditService.queryLogs filters by action', async () => {
    const svc = new AuditService(pool);
    const logs = await svc.queryLogs({ organizationId: orgId, action: 'org.settings.updated' });
    expect(logs.every((l) => l.action === 'org.settings.updated')).toBe(true);
  });

  // ── 8. MetricsService.getPlatformMetrics ─────────────────────────────────
  it('8. MetricsService.getPlatformMetrics returns platform-level metrics', async () => {
    const svc = new MetricsService(pool);
    const metrics = await svc.getPlatformMetrics();
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics.length).toBeGreaterThan(0);
    const keys = metrics.map((m) => m.key);
    expect(keys).toContain('total_orgs');
  });

  // ── 9. MetricsService.getTenantMetrics ───────────────────────────────────
  it('9. MetricsService.getTenantMetrics returns tenant-scoped metrics', async () => {
    const svc = new MetricsService(pool);
    const metrics = await svc.getTenantMetrics(orgId);
    expect(metrics).toBeTruthy();
    expect(metrics.organizationId).toBe(orgId);
    expect(typeof metrics.memberCount).toBe('number');
    expect(typeof metrics.workflowCount).toBe('number');
  });

  // ── 10. Cross-tenant isolation ───────────────────────────────────────────
  it('10. Org B audit logs are not returned in org A queryLogs', async () => {
    const svc = new AuditService(pool);
    await svc.log({
      organizationId: orgIdB,
      actorType: 'admin',
      actorId: 'cert70-b-admin',
      action: 'org.viewed',
    });
    const logsA = await svc.queryLogs({ organizationId: orgId });
    const logsB = await svc.queryLogs({ organizationId: orgIdB });
    expect(logsA.every((l) => l.organizationId === orgId)).toBe(true);
    expect(logsB.every((l) => l.organizationId === orgIdB)).toBe(true);
    expect(logsA.some((l) => l.organizationId === orgIdB)).toBe(false);
  });
});
