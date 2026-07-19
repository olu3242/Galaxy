/**
 * Digital Twin OS — TwinNodeService · TwinRelationshipService unit tests
 *
 * Covers: upsertNode · getNode · listNodes · updateHealthScore ·
 *         createRelationship · getRelationships · deleteRelationship
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { TwinNodeService } from '../nodes/TwinNodeService.js';
import { TwinRelationshipService } from '../relationships/TwinRelationshipService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const NODE_ID = '00000000-0000-0000-0000-000000000010';
const NODE_ID_2 = '00000000-0000-0000-0000-000000000011';
const REL_ID = '00000000-0000-0000-0000-000000000020';
const NOW = new Date('2026-01-01T00:00:00.000Z');

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(responses: QueryResult[]): Pool {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

function nodeRow(overrides: Partial<{ health_score: number; node_type: string }> = {}) {
  return {
    id: NODE_ID,
    organization_id: ORG,
    node_type: overrides.node_type ?? 'member',
    external_id: 'ext-001',
    name: 'Alice',
    properties: { role: 'admin' },
    health_score: overrides.health_score ?? 1.0,
    created_at: NOW,
    updated_at: NOW,
  };
}

function relRow(overrides: Partial<{ weight: number }> = {}) {
  return {
    id: REL_ID,
    organization_id: ORG,
    source_node_id: NODE_ID,
    target_node_id: NODE_ID_2,
    relationship_type: 'reports_to',
    weight: overrides.weight ?? 1.0,
    properties: {},
    created_at: NOW,
  };
}

// ─── TwinNodeService ──────────────────────────────────────────────────────────

describe('TwinNodeService.upsertNode', () => {
  it('sets tenant context and returns mapped TwinNode', async () => {
    const pool = makePool([ok([]), ok([nodeRow()])]);
    const svc = new TwinNodeService(pool);
    const result = await svc.upsertNode(ORG, 'member', 'ext-001', 'Alice', { role: 'admin' });

    expect(result.id).toBe(NODE_ID);
    expect(result.nodeType).toBe('member');
    expect(result.externalId).toBe('ext-001');
    expect(result.healthScore).toBe(1.0);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('throws when upsert returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TwinNodeService(pool);
    await expect(svc.upsertNode(ORG, 'member', 'ext-001', 'Alice', {})).rejects.toThrow(
      'Failed to upsert twin node',
    );
  });
});

describe('TwinNodeService.getNode', () => {
  it('returns node when found', async () => {
    const pool = makePool([ok([]), ok([nodeRow()])]);
    const svc = new TwinNodeService(pool);
    const result = await svc.getNode(ORG, NODE_ID);
    expect(result.id).toBe(NODE_ID);
    expect(result.name).toBe('Alice');
  });

  it('throws when node not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TwinNodeService(pool);
    await expect(svc.getNode(ORG, 'ghost')).rejects.toThrow('Twin node not found');
  });
});

describe('TwinNodeService.listNodes', () => {
  it('returns all nodes for org', async () => {
    const pool = makePool([ok([]), ok([nodeRow(), nodeRow()])]);
    const svc = new TwinNodeService(pool);
    const result = await svc.listNodes(ORG);
    expect(result).toHaveLength(2);
  });

  it('filters by nodeType when provided', async () => {
    const pool = makePool([ok([]), ok([nodeRow({ node_type: 'workflow' })])]);
    const svc = new TwinNodeService(pool);
    await svc.listNodes(ORG, 'workflow');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[1] as [string, unknown[]])[1]).toContain('workflow');
  });

  it('returns empty array when none exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TwinNodeService(pool);
    const result = await svc.listNodes(ORG);
    expect(result).toHaveLength(0);
  });
});

describe('TwinNodeService.updateHealthScore', () => {
  it('returns node with updated health score', async () => {
    const pool = makePool([ok([]), ok([nodeRow({ health_score: 0.75 })])]);
    const svc = new TwinNodeService(pool);
    const result = await svc.updateHealthScore(ORG, NODE_ID, 0.75);
    expect(result.healthScore).toBe(0.75);
  });

  it('throws when node not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TwinNodeService(pool);
    await expect(svc.updateHealthScore(ORG, 'ghost', 0.5)).rejects.toThrow('Twin node not found');
  });
});

// ─── TwinRelationshipService ──────────────────────────────────────────────────

describe('TwinRelationshipService.createRelationship', () => {
  it('sets tenant context and returns mapped relationship', async () => {
    const pool = makePool([ok([]), ok([relRow()])]);
    const svc = new TwinRelationshipService(pool);
    const result = await svc.createRelationship(ORG, NODE_ID, NODE_ID_2, 'reports_to');

    expect(result.id).toBe(REL_ID);
    expect(result.sourceNodeId).toBe(NODE_ID);
    expect(result.targetNodeId).toBe(NODE_ID_2);
    expect(result.relationshipType).toBe('reports_to');
    expect(result.weight).toBe(1.0);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('uses provided weight', async () => {
    const pool = makePool([ok([]), ok([relRow({ weight: 0.8 })])]);
    const svc = new TwinRelationshipService(pool);
    const result = await svc.createRelationship(ORG, NODE_ID, NODE_ID_2, 'reports_to', 0.8);
    expect(result.weight).toBe(0.8);
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TwinRelationshipService(pool);
    await expect(svc.createRelationship(ORG, NODE_ID, NODE_ID_2, 'reports_to')).rejects.toThrow(
      'Failed to create twin relationship',
    );
  });
});

describe('TwinRelationshipService.getRelationships', () => {
  it('returns relationships where node is source or target', async () => {
    const pool = makePool([ok([]), ok([relRow(), relRow()])]);
    const svc = new TwinRelationshipService(pool);
    const result = await svc.getRelationships(ORG, NODE_ID);
    expect(result).toHaveLength(2);
    expect(result[0]?.relationshipType).toBe('reports_to');
  });

  it('returns empty array when node has no relationships', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TwinRelationshipService(pool);
    const result = await svc.getRelationships(ORG, NODE_ID);
    expect(result).toHaveLength(0);
  });
});

describe('TwinRelationshipService.deleteRelationship', () => {
  it('resolves without error when relationship exists', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TwinRelationshipService(pool);
    await expect(svc.deleteRelationship(ORG, REL_ID)).resolves.toBeUndefined();

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[1] as [string, unknown[]])[1]).toContain(REL_ID);
  });
});
