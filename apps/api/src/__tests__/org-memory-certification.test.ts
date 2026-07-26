/**
 * Org Memory OS Certification Test Suite
 *
 * Certifies the Org Memory module lifecycle:
 * 1.  org_memories table exists
 * 2.  Memory store persists a record
 * 3.  Stored memory has correct fields
 * 4.  recall returns stored memories
 * 5.  recall filters by memoryType
 * 6.  invalidate marks a memory invalid
 * 7.  invalidated memory excluded from onlyValid recall
 * 8.  getMemoryStats returns counts by type
 * 9.  Memories are tenant-scoped
 * 10. Cross-tenant isolation — org B cannot see org A memories
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { OrgMemoryService } from '@galaxy/org-memory';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-4601-4000-8000-460000000001';
const orgIdB = '00000000-4601-4000-8000-460000000002';

let sharedMemoryId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'OrgMemory Test Org A', 'orgmemory-test-a', 'starter', 'active'),
            ($2, 'OrgMemory Test Org B', 'orgmemory-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const svc = new OrgMemoryService(pool);
  const mem = await svc.store(orgId, {
    memoryType: 'decision',
    subject: 'Expense approval threshold',
    content: 'All expenses above $500 require CFO approval',
    source: 'finance-policy',
    confidence: 0.95,
    relevanceTags: ['finance', 'approval'],
  });
  sharedMemoryId = mem.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM org_memories WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Org Memory OS Certification', () => {
  // ── 1. Table exists ────────────────────────────────────────────────────────
  it('1. org_memories table exists', async () => {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'org_memories' AND table_schema = 'public'`,
    );
    expect(Number(r.rows[0]?.count ?? 0), 'org_memories must have columns').toBeGreaterThan(0);
  });

  // ── 2. Memory store persists a record ─────────────────────────────────────
  it('2. Memory store persists a record', async () => {
    const svc = new OrgMemoryService(pool);

    const mem = await svc.store(orgId, {
      memoryType: 'pattern',
      subject: 'Invoice processing cycle',
      content: 'Invoices take 3-5 days to process on average',
      source: 'analytics',
    });

    expect(mem.id).toBeTruthy();
    expect(mem.organizationId).toBe(orgId);
  });

  // ── 3. Stored memory has correct fields ───────────────────────────────────
  it('3. Stored memory has correct fields', async () => {
    const svc = new OrgMemoryService(pool);

    const mem = await svc.store(orgId, {
      memoryType: 'lesson',
      subject: 'Vendor onboarding',
      content: 'Vendor onboarding takes 2 weeks minimum',
      source: 'procurement',
      confidence: 0.8,
      relevanceTags: ['vendor', 'onboarding'],
    });

    expect(mem.memoryType).toBe('lesson');
    expect(mem.subject).toBe('Vendor onboarding');
    expect(mem.organizationId).toBe(orgId);
  });

  // ── 4. recall returns stored memories ────────────────────────────────────
  it('4. recall returns stored memories', async () => {
    const svc = new OrgMemoryService(pool);

    const memories = await svc.recall(orgId, {});
    expect(Array.isArray(memories)).toBe(true);
    expect(memories.length).toBeGreaterThan(0);
  });

  // ── 5. recall filters by memoryType ──────────────────────────────────────
  it('5. recall filters by memoryType', async () => {
    const svc = new OrgMemoryService(pool);

    const memories = await svc.recall(orgId, { type: 'decision' });
    for (const m of memories) {
      expect(m.memoryType).toBe('decision');
    }
    expect(memories.length).toBeGreaterThan(0);
  });

  // ── 6. invalidate marks a memory invalid ─────────────────────────────────
  it('6. invalidate marks a memory invalid', async () => {
    const svc = new OrgMemoryService(pool);

    await expect(svc.invalidate(orgId, sharedMemoryId)).resolves.not.toThrow();
  });

  // ── 7. invalidated memory excluded from onlyValid recall ─────────────────
  it('7. invalidated memory excluded from onlyValid recall', async () => {
    const svc = new OrgMemoryService(pool);

    const memories = await svc.recall(orgId, { onlyValid: true });
    const found = memories.some((m) => m.id === sharedMemoryId);
    expect(found).toBe(false);
  });

  // ── 8. getMemoryStats returns counts by type ──────────────────────────────
  it('8. getMemoryStats returns counts by type', async () => {
    const svc = new OrgMemoryService(pool);

    const stats = await svc.getMemoryStats(orgId);
    expect(typeof stats.total).toBe('number');
    expect(typeof stats.averageConfidence).toBe('number');
    expect(typeof stats.invalidCount).toBe('number');
    expect(stats.byType).toBeTruthy();
  });

  // ── 9. Memories are tenant-scoped ─────────────────────────────────────────
  it('9. Memories are tenant-scoped', async () => {
    const svc = new OrgMemoryService(pool);

    const memories = await svc.recall(orgId, {});
    for (const m of memories) {
      expect(m.organizationId).toBe(orgId);
    }
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A memories', async () => {
    const svc = new OrgMemoryService(pool);

    const memoriesB = await svc.recall(orgIdB, {});
    const leaked = memoriesB.some((m) => m.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
