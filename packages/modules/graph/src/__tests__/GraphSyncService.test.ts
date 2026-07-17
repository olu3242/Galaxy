import { describe, it, expect, vi } from 'vitest';
import { GraphSyncService } from '../GraphSyncService.js';
import type { OrgGraphService } from '../OrgGraphService.js';
import type { GraphNode, GraphEdge } from '../types.js';

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

function makeEdge(id: string): GraphEdge {
  return {
    id,
    organizationId: 'org-1',
    edgeType: 'BELONGS_TO',
    sourceNodeId: 'node-1',
    targetNodeId: 'node-2',
    weight: 1,
    properties: {},
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

function mockGraphService(overrides: Partial<OrgGraphService> = {}): OrgGraphService {
  return {
    upsertNode: vi
      .fn()
      .mockImplementation((_org: string, type: string, id: string) =>
        Promise.resolve(makeNode(id, type)),
      ),
    getNode: vi.fn().mockResolvedValue(null),
    addEdge: vi.fn().mockResolvedValue(makeEdge('edge-1')),
    removeEdge: vi.fn(),
    listNodes: vi.fn().mockResolvedValue([]),
    traverse: vi.fn().mockResolvedValue([]),
    getNodeById: vi.fn().mockResolvedValue(null),
    neighbors: vi.fn().mockResolvedValue([]),
    influenceScore: vi.fn().mockResolvedValue(0),
    findBottlenecks: vi.fn().mockResolvedValue([]),
    centralityRanking: vi.fn().mockResolvedValue([]),
    shortestPath: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as OrgGraphService;
}

describe('GraphSyncService', () => {
  describe('syncMember', () => {
    it('upserts a Member node', async () => {
      const graphService = mockGraphService();
      const svc = new GraphSyncService(graphService);
      const node = await svc.syncMember('org-1', 'member-1', { name: 'Alice' });
      expect(graphService.upsertNode).toHaveBeenCalledWith('org-1', 'Member', 'member-1', {
        name: 'Alice',
      });
      expect(node.nodeType).toBe('Member');
    });
  });

  describe('syncDepartment', () => {
    it('upserts Department node and adds BELONGS_TO edges for members', async () => {
      const memberNode = makeNode('member-node-1', 'Member');
      const graphService = mockGraphService({
        getNode: vi.fn().mockResolvedValue(memberNode),
      });
      const svc = new GraphSyncService(graphService);
      const node = await svc.syncDepartment('org-1', 'dept-1', {
        name: 'Engineering',
        memberIds: ['member-1'],
      });
      expect(node.externalId).toBe('dept-1');
      expect(graphService.addEdge).toHaveBeenCalledWith(
        'org-1',
        'BELONGS_TO',
        'member-node-1',
        expect.any(String) as string,
      );
    });

    it('skips edge when member node not found', async () => {
      const graphService = mockGraphService({
        getNode: vi.fn().mockResolvedValue(null),
      });
      const svc = new GraphSyncService(graphService);
      await svc.syncDepartment('org-1', 'dept-1', { memberIds: ['missing-member'] });
      expect(graphService.addEdge).not.toHaveBeenCalled();
    });
  });

  describe('syncWorkflow', () => {
    it('upserts Workflow node', async () => {
      const graphService = mockGraphService();
      const svc = new GraphSyncService(graphService);
      const node = await svc.syncWorkflow('org-1', 'wf-1', { title: 'Onboarding' });
      expect(node.nodeType).toBe('Workflow');
    });
  });

  describe('syncWorkflowRun', () => {
    it('upserts WorkflowRun and adds TRIGGERED edge when trigger member found', async () => {
      const triggerNode = makeNode('trigger-node-1', 'Member');
      const graphService = mockGraphService({
        getNode: vi.fn().mockResolvedValue(triggerNode),
      });
      const svc = new GraphSyncService(graphService);
      const node = await svc.syncWorkflowRun('org-1', 'run-1', 'member-1', {});
      expect(node.nodeType).toBe('WorkflowRun');
      expect(graphService.addEdge).toHaveBeenCalledWith(
        'org-1',
        'TRIGGERED',
        'trigger-node-1',
        expect.any(String) as string,
      );
    });

    it('does not add edge when trigger member not found', async () => {
      const graphService = mockGraphService({ getNode: vi.fn().mockResolvedValue(null) });
      const svc = new GraphSyncService(graphService);
      await svc.syncWorkflowRun('org-1', 'run-1', 'member-1', {});
      expect(graphService.addEdge).not.toHaveBeenCalled();
    });
  });

  describe('syncTask', () => {
    it('adds ASSIGNED_TO edge when member found', async () => {
      const memberNode = makeNode('member-node-1', 'Member');
      const graphService = mockGraphService({
        getNode: vi.fn().mockResolvedValue(memberNode),
      });
      const svc = new GraphSyncService(graphService);
      await svc.syncTask('org-1', 'task-1', 'member-1', {});
      expect(graphService.addEdge).toHaveBeenCalledWith(
        'org-1',
        'ASSIGNED_TO',
        expect.any(String) as string,
        'member-node-1',
      );
    });
  });

  describe('syncApproval', () => {
    it('adds APPROVED_BY edge when member found', async () => {
      const memberNode = makeNode('member-node-1', 'Member');
      const graphService = mockGraphService({
        getNode: vi.fn().mockResolvedValue(memberNode),
      });
      const svc = new GraphSyncService(graphService);
      await svc.syncApproval('org-1', 'approval-1', 'member-1', {});
      expect(graphService.addEdge).toHaveBeenCalledWith(
        'org-1',
        'APPROVED_BY',
        expect.any(String) as string,
        'member-node-1',
      );
    });
  });

  describe('syncDecision', () => {
    it('returns node with edge when agent node found', async () => {
      const agentNode = makeNode('agent-node-1', 'Agent');
      const graphService = mockGraphService({
        getNode: vi.fn().mockResolvedValue(agentNode),
      });
      const svc = new GraphSyncService(graphService);
      const { node, edge } = await svc.syncDecision('org-1', 'decision-1', 'agent-1', {});
      expect(node.nodeType).toBe('Decision');
      expect(edge).not.toBeNull();
    });

    it('returns node with null edge when agent node not found', async () => {
      const graphService = mockGraphService({ getNode: vi.fn().mockResolvedValue(null) });
      const svc = new GraphSyncService(graphService);
      const { node, edge } = await svc.syncDecision('org-1', 'decision-1', 'agent-1', {});
      expect(node.nodeType).toBe('Decision');
      expect(edge).toBeNull();
    });
  });
});
