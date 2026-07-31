/**
 * Digital Twin OS Certification Test Suite
 *
 * Certifies the Digital Twin module lifecycle:
 * 1.  twin_nodes and twin_relationships tables exist
 * 2.  Node upsert creates a node
 * 3.  Node retrieval returns the node
 * 4.  Node listing is tenant-scoped
 * 5.  Node listing filters by type
 * 6.  Node health score update works
 * 7.  Relationship creation persists a record
 * 8.  Relationship listing returns edges for a node
 * 9.  Snapshot creation persists org state
 * 10. Cross-tenant isolation — org B cannot see org A nodes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import {
  TwinNodeService,
  TwinRelationshipService,
  TwinSnapshotService,
} from '@galaxy/digital-twin';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-3401-4000-8000-340000000001';
const orgIdB = '00000000-3401-4000-8000-340000000002';

let sharedNodeId: string;
let secondNodeId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Twin Test Org A', 'twin-test-a', 'starter', 'active'),
            ($2, 'Twin Test Org B', 'twin-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const svc = new TwinNodeService(pool);
  const node = await svc.upsertNode(orgId, 'organization', 'org-ext-001', 'Shared Cert Org Node', {
    region: 'us-west-2',
  });
  sharedNodeId = node.id;

  const node2 = await svc.upsertNode(orgId, 'department', 'dept-ext-001', 'Engineering Dept Node', {
    headcount: 50,
  });
  secondNodeId = node2.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM twin_snapshots WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM twin_relationships WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM twin_nodes WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Digital Twin OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. twin_nodes and twin_relationships tables exist', async () => {
    for (const table of ['twin_nodes', 'twin_relationships']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Node upsert ────────────────────────────────────────────────────────
  it('2. Node upsert creates a node', async () => {
    const svc = new TwinNodeService(pool);

    const node = await svc.upsertNode(orgId, 'team', 'team-ext-001', 'Platform Team Node', {
      size: 12,
    });

    expect(node.id).toBeTruthy();
    expect(node.organizationId).toBe(orgId);
    expect(node.nodeType).toBe('team');
    expect(node.name).toBe('Platform Team Node');
  });

  // ── 3. Node retrieval ─────────────────────────────────────────────────────
  it('3. Node retrieval returns the node', async () => {
    const svc = new TwinNodeService(pool);

    const node = await svc.getNode(orgId, sharedNodeId);
    expect(node.id).toBe(sharedNodeId);
    expect(node.organizationId).toBe(orgId);
  });

  // ── 4. Node listing ───────────────────────────────────────────────────────
  it('4. Node listing is tenant-scoped', async () => {
    const svc = new TwinNodeService(pool);

    const nodes = await svc.listNodes(orgId);
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBeGreaterThan(0);
    for (const n of nodes) {
      expect(n.organizationId).toBe(orgId);
    }
  });

  // ── 5. Node listing by type ───────────────────────────────────────────────
  it('5. Node listing filters by type', async () => {
    const svc = new TwinNodeService(pool);

    const nodes = await svc.listNodes(orgId, 'organization');
    expect(Array.isArray(nodes)).toBe(true);
    for (const n of nodes) {
      expect(n.nodeType).toBe('organization');
    }
  });

  // ── 6. Node health score update ───────────────────────────────────────────
  it('6. Node health score update works', async () => {
    const svc = new TwinNodeService(pool);

    const updated = await svc.updateHealthScore(orgId, sharedNodeId, 0.92);
    expect(updated.healthScore).toBe(0.92);
  });

  // ── 7. Relationship creation ──────────────────────────────────────────────
  it('7. Relationship creation persists a record', async () => {
    const svc = new TwinRelationshipService(pool);

    const rel = await svc.createRelationship(orgId, sharedNodeId, secondNodeId, 'contains', 1.0, {
      since: '2024-01-01',
    });

    expect(rel.id).toBeTruthy();
    expect(rel.organizationId).toBe(orgId);
    expect(rel.sourceNodeId).toBe(sharedNodeId);
    expect(rel.targetNodeId).toBe(secondNodeId);
    expect(rel.relationshipType).toBe('contains');
  });

  // ── 8. Relationship listing ───────────────────────────────────────────────
  it('8. Relationship listing returns edges for a node', async () => {
    const svc = new TwinRelationshipService(pool);

    const rels = await svc.getRelationships(orgId, sharedNodeId);
    expect(Array.isArray(rels)).toBe(true);
    expect(rels.length).toBeGreaterThan(0);
    expect(
      rels.some((r) => r.sourceNodeId === sharedNodeId || r.targetNodeId === sharedNodeId),
    ).toBe(true);
  });

  // ── 9. Snapshot creation ──────────────────────────────────────────────────
  it('9. Snapshot creation persists org state', async () => {
    const svc = new TwinSnapshotService(pool);

    const snapshot = await svc.takeSnapshot(orgId);
    expect(snapshot.id).toBeTruthy();
    expect(snapshot.organizationId).toBe(orgId);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A nodes', async () => {
    const svc = new TwinNodeService(pool);

    const nodesB = await svc.listNodes(orgIdB);
    const leaked = nodesB.some((n) => n.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
