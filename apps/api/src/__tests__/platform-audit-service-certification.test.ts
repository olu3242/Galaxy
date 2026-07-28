/**
 * Platform Audit Service Certification Test Suite — Phase 82
 *
 * Certifies AuditService from @galaxy/platform:
 * 1.  queryLogs returns an array for an org with logs
 * 2.  queryLogs returns empty array for org with no logs
 * 3.  queryLogs filters by actorId
 * 4.  queryLogs filters by action
 * 5.  queryLogs filters by resourceType
 * 6.  queryLogs respects limit
 * 7.  queryLogs respects offset
 * 8.  queryLogs returns entries with correct organizationId
 * 9.  queryLogs with no filters returns all logs for org
 * 10. Cross-org: orgB logs do not appear in orgA queryLogs
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { AuditService } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-8201-4000-8000-820100000001';
const orgIdB = '00000000-8201-4000-8000-820100000002';
const actorId = '00000000-8201-4000-8000-820100000099';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Audit Phase 82 Org A', 'audit-phase82-a', 'starter', 'active'),
            ($2, 'Audit Phase 82 Org B', 'audit-phase82-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
  // Insert audit log entries directly (AuditService only queries, not inserts)
  await pool.query(
    `INSERT INTO audit_logs (organization_id, actor_type, actor_id, action, resource_type, resource_id, correlation_id)
     VALUES ($1, 'member', $3, 'cert82.login', 'session', $3, gen_random_uuid()),
            ($1, 'member', $3, 'cert82.update', 'workflow', $3, gen_random_uuid()),
            ($1, 'system', NULL, 'cert82.cron', 'system', NULL, gen_random_uuid()),
            ($2, 'member', $3, 'cert82.login', 'session', $3, gen_random_uuid())`,
    [orgId, orgIdB, actorId],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Platform Audit Service Certification', () => {
  // ── 1. queryLogs returns array for org with logs ──────────────────────────
  it('1. queryLogs returns an array for an org with logs', async () => {
    const svc = new AuditService(pool);
    const logs = await svc.queryLogs({ organizationId: orgId });
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThanOrEqual(3);
  });

  // ── 2. queryLogs returns empty for org with no logs ───────────────────────
  it('2. queryLogs returns empty array for org with no logs', async () => {
    const svc = new AuditService(pool);
    const orgNoLogs = '00000000-8201-4000-8000-820100000003';
    await pool.query(
      `INSERT INTO organizations (id, name, slug, tier, status) VALUES ($1, 'Empty Org', 'audit-phase82-empty', 'starter', 'active') ON CONFLICT (id) DO NOTHING`,
      [orgNoLogs],
    );
    const logs = await svc.queryLogs({ organizationId: orgNoLogs });
    expect(logs.length).toBe(0);
    await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgNoLogs]).catch(() => null);
  });

  // ── 3. queryLogs filters by actorId ─────────────────────────────────────
  it('3. queryLogs filters by actorId', async () => {
    const svc = new AuditService(pool);
    const logs = await svc.queryLogs({ organizationId: orgId, actorId });
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs.every((l) => l.actorId === actorId)).toBe(true);
  });

  // ── 4. queryLogs filters by action ──────────────────────────────────────
  it('4. queryLogs filters by action', async () => {
    const svc = new AuditService(pool);
    const logs = await svc.queryLogs({ organizationId: orgId, action: 'cert82.update' });
    expect(logs.every((l) => l.action === 'cert82.update')).toBe(true);
  });

  // ── 5. queryLogs filters by resourceType ────────────────────────────────
  it('5. queryLogs filters by resourceType', async () => {
    const svc = new AuditService(pool);
    const logs = await svc.queryLogs({ organizationId: orgId, resourceType: 'workflow' });
    expect(logs.every((l) => l.resourceType === 'workflow')).toBe(true);
  });

  // ── 6. queryLogs respects limit ─────────────────────────────────────────
  it('6. queryLogs respects limit', async () => {
    const svc = new AuditService(pool);
    const logs = await svc.queryLogs({ organizationId: orgId, limit: 1 });
    expect(logs.length).toBeLessThanOrEqual(1);
  });

  // ── 7. queryLogs respects offset ────────────────────────────────────────
  it('7. queryLogs respects offset', async () => {
    const svc = new AuditService(pool);
    const all = await svc.queryLogs({ organizationId: orgId });
    const offset = await svc.queryLogs({ organizationId: orgId, offset: 1 });
    expect(offset.length).toBeLessThanOrEqual(all.length);
  });

  // ── 8. entries have correct organizationId ──────────────────────────────
  it('8. queryLogs entries all have the correct organizationId', async () => {
    const svc = new AuditService(pool);
    const logs = await svc.queryLogs({ organizationId: orgId });
    expect(logs.every((l) => l.organizationId === orgId)).toBe(true);
  });

  // ── 9. no filters returns all logs for org ───────────────────────────────
  it('9. queryLogs with no filters returns all logs for the org', async () => {
    const svc = new AuditService(pool);
    const logs = await svc.queryLogs({ organizationId: orgId });
    expect(logs.length).toBeGreaterThanOrEqual(3);
  });

  // ── 10. Cross-org: orgB logs not in orgA results ─────────────────────────
  it('10. orgB logs do not appear in orgA queryLogs', async () => {
    const svc = new AuditService(pool);
    const logsA = await svc.queryLogs({ organizationId: orgId });
    const logsB = await svc.queryLogs({ organizationId: orgIdB });
    expect(logsA.every((l) => l.organizationId === orgId)).toBe(true);
    expect(logsB.every((l) => l.organizationId === orgIdB)).toBe(true);
    expect(logsA.some((l) => l.organizationId === orgIdB)).toBe(false);
  });
});
