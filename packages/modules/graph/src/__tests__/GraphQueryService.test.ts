import { describe, it, expect, vi } from 'vitest';
import { GraphQueryService } from '../GraphQueryService.js';
import type { OrgGraphService } from '../OrgGraphService.js';
import type { GraphNode } from '../types.js';

function makeNode(id: string, nodeType = 'Member'): GraphNode {
  return {
    id,
    organizationId: 'org-1',
    nodeType,
    externalId: id,
    properties: {},
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function mockGraphService(overrides: Partial<OrgGraphService> = {}): OrgGraphService {
  return {
    getNode: vi.fn().mockResolvedValue(null),
    traverse: vi.fn().mockResolvedValue([]),
    listNodes: vi.fn().mockResolvedValue([]),
    upsertNode: vi.fn(),
    addEdge: vi.fn(),
    removeEdge: vi.fn(),
    getNodeById: vi.fn().mockResolvedValue(null),
    neighbors: vi.fn().mockResolvedValue([]),
    influenceScore: vi.fn().mockResolvedValue(0),
    findBottlenecks: vi.fn().mockResolvedValue([]),
    centralityRanking: vi.fn().mockResolvedValue([]),
    shortestPath: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as OrgGraphService;
}

describe('GraphQueryService', () => {
  describe('getMemberNetwork', () => {
    it('returns empty array when member node not found', async () => {
      const graphService = mockGraphService({ getNode: vi.fn().mockResolvedValue(null) });
      const svc = new GraphQueryService(graphService);
      const result = await svc.getMemberNetwork('org-1', 'member-1', 2);
      expect(result).toHaveLength(0);
    });

    it('traverses from member node when found', async () => {
      const memberNode = makeNode('node-1');
      const neighbor = makeNode('node-2', 'Department');
      const graphService = mockGraphService({
        getNode: vi.fn().mockResolvedValue(memberNode),
        traverse: vi.fn().mockResolvedValue([neighbor]),
      });
      const svc = new GraphQueryService(graphService);
      const result = await svc.getMemberNetwork('org-1', 'member-1', 2);
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('node-2');
    });
  });

  describe('getWorkflowChain', () => {
    it('returns empty array when workflow run node not found', async () => {
      const graphService = mockGraphService({ getNode: vi.fn().mockResolvedValue(null) });
      const svc = new GraphQueryService(graphService);
      const result = await svc.getWorkflowChain('org-1', 'run-1');
      expect(result).toHaveLength(0);
    });

    it('traverses from run node when found', async () => {
      const runNode = makeNode('run-node-1', 'WorkflowRun');
      const taskNode = makeNode('task-1', 'Task');
      const graphService = mockGraphService({
        getNode: vi.fn().mockResolvedValue(runNode),
        traverse: vi.fn().mockResolvedValue([taskNode]),
      });
      const svc = new GraphQueryService(graphService);
      const result = await svc.getWorkflowChain('org-1', 'run-1');
      expect(result).toHaveLength(1);
      expect(result[0]?.nodeType).toBe('Task');
    });
  });

  describe('getDepartmentGraph', () => {
    it('lists department nodes', async () => {
      const dept = makeNode('dept-1', 'Department');
      const graphService = mockGraphService({
        listNodes: vi.fn().mockResolvedValue([dept]),
      });
      const svc = new GraphQueryService(graphService);
      const result = await svc.getDepartmentGraph('org-1');
      expect(result).toHaveLength(1);
      expect(result[0]?.nodeType).toBe('Department');
    });
  });

  describe('getKnowledgeUsageGraph', () => {
    it('returns empty when no knowledge nodes', async () => {
      const graphService = mockGraphService({ listNodes: vi.fn().mockResolvedValue([]) });
      const svc = new GraphQueryService(graphService);
      const result = await svc.getKnowledgeUsageGraph('org-1');
      expect(result).toHaveLength(0);
    });

    it('deduplicates nodes across knowledge items', async () => {
      const kNode1 = makeNode('k-1', 'Knowledge');
      const kNode2 = makeNode('k-2', 'Knowledge');
      const sharedNode = makeNode('shared', 'Workflow');

      const graphService = mockGraphService({
        listNodes: vi.fn().mockResolvedValue([kNode1, kNode2]),
        traverse: vi.fn().mockResolvedValue([sharedNode]),
      });
      const svc = new GraphQueryService(graphService);
      const result = await svc.getKnowledgeUsageGraph('org-1');
      // k-1, shared, k-2 (shared deduplicated)
      const ids = result.map((n) => n.id);
      expect(ids.filter((id) => id === 'shared')).toHaveLength(1);
    });
  });
});
