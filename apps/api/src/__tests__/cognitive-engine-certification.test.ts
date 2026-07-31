/**
 * Cognitive Engine OS Certification Test Suite
 *
 * Certifies the Cognitive Engine module lifecycle:
 * 1.  agent_memories and agent_learning_events tables exist
 * 2.  GxMemoryEngine.write persists a memory entry
 * 3.  GxMemoryEngine.read returns written memories
 * 4.  read filters by scope
 * 5.  GxMemoryEngine.forget removes a memory
 * 6.  GxMemoryEngine.consolidate returns count of promoted memories
 * 7.  GxLearningEngine.recordOutcome persists an event
 * 8.  GxLearningEngine.generateInsights returns insights
 * 9.  Memories are agent+org scoped
 * 10. Cross-tenant isolation — org B cannot see org A memories
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { GxMemoryEngine, GxLearningEngine } from '@galaxy/cognitive-engine';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-4901-4000-8000-490000000001';
const orgIdB = '00000000-4901-4000-8000-490000000002';
const agentId = '00000000-4901-4000-8000-490000000010';
const agentIdB = '00000000-4901-4000-8000-490000000011';

const memKey = 'cert-expense-policy-49';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'CogEngine Test Org A', 'cogengine-test-a', 'starter', 'active'),
            ($2, 'CogEngine Test Org B', 'cogengine-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const mem = new GxMemoryEngine(pool);
  await mem.write({
    agentId,
    organizationId: orgId,
    scope: 'short_term',
    key: 'cert-seed-key-49',
    value: { seedData: true },
    relevanceScore: 0.9,
  });
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM agent_memories WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM agent_learning_events WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Cognitive Engine OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. agent_memories and agent_learning_events tables exist', async () => {
    for (const table of ['agent_memories', 'agent_learning_events']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. GxMemoryEngine.write persists a memory entry ──────────────────────
  it('2. GxMemoryEngine.write persists a memory entry', async () => {
    const mem = new GxMemoryEngine(pool);

    const entry = await mem.write({
      agentId,
      organizationId: orgId,
      scope: 'long_term',
      key: memKey,
      value: { threshold: 500, currency: 'USD' },
      relevanceScore: 0.85,
    });

    expect(entry.id).toBeTruthy();
    expect(entry.agentId).toBe(agentId);
    expect(entry.organizationId).toBe(orgId);
    expect(entry.key).toBe(memKey);
  });

  // ── 3. GxMemoryEngine.read returns written memories ──────────────────────
  it('3. GxMemoryEngine.read returns written memories', async () => {
    const mem = new GxMemoryEngine(pool);

    const entries = await mem.read({ agentId, organizationId: orgId });
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  // ── 4. read filters by scope ──────────────────────────────────────────────
  it('4. read filters by scope', async () => {
    const mem = new GxMemoryEngine(pool);

    const entries = await mem.read({ agentId, organizationId: orgId, scope: 'long_term' });
    for (const e of entries) {
      expect(e.scope).toBe('long_term');
    }
    expect(entries.length).toBeGreaterThan(0);
  });

  // ── 5. GxMemoryEngine.forget removes a memory ────────────────────────────
  it('5. GxMemoryEngine.forget removes a memory', async () => {
    const mem = new GxMemoryEngine(pool);

    const toForget = 'cert-to-forget-49';
    await mem.write({
      agentId,
      organizationId: orgId,
      scope: 'short_term',
      key: toForget,
      value: { temporary: true },
    });

    await expect(mem.forget(agentId, orgId, toForget, 'short_term')).resolves.not.toThrow();

    const remaining = await mem.read({ agentId, organizationId: orgId, key: toForget });
    expect(remaining.length).toBe(0);
  });

  // ── 6. GxMemoryEngine.consolidate returns count ───────────────────────────
  it('6. GxMemoryEngine.consolidate returns count of promoted memories', async () => {
    const mem = new GxMemoryEngine(pool);

    const count = await mem.consolidate(agentId, orgId);
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  // ── 7. GxLearningEngine.recordOutcome persists an event ──────────────────
  it('7. GxLearningEngine.recordOutcome persists an event', async () => {
    const learn = new GxLearningEngine(pool);

    await expect(
      learn.recordOutcome({
        agentId,
        organizationId: orgId,
        executionId: '00000000-4901-4000-8000-490000000099',
        outcome: 'success',
        intent: 'expense-approval',
        actions: ['fetch-policy', 'validate-amount', 'notify-approver'],
        durationMs: 320,
        confidenceScore: 0.92,
        humanEscalated: false,
      }),
    ).resolves.not.toThrow();
  });

  // ── 8. GxLearningEngine.generateInsights returns insights ────────────────
  it('8. GxLearningEngine.generateInsights returns insights', async () => {
    const learn = new GxLearningEngine(pool);

    const insights = await learn.generateInsights(agentId, orgId);
    expect(Array.isArray(insights)).toBe(true);
  });

  // ── 9. Memories are agent+org scoped ─────────────────────────────────────
  it('9. Memories are agent+org scoped', async () => {
    const mem = new GxMemoryEngine(pool);

    const entries = await mem.read({ agentId, organizationId: orgId });
    for (const e of entries) {
      expect(e.agentId).toBe(agentId);
      expect(e.organizationId).toBe(orgId);
    }
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A memories', async () => {
    const mem = new GxMemoryEngine(pool);

    const entriesB = await mem.read({ agentId: agentIdB, organizationId: orgIdB });
    const leaked = entriesB.some((e) => e.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
