import type { OrgGraphService } from './OrgGraphService.js';
import type { GraphNode } from './types.js';

export class GraphQueryService {
  constructor(private readonly graphService: OrgGraphService) {}

  /**
   * Returns all nodes reachable from a member within the given depth.
   */
  async getMemberNetwork(
    orgId: string,
    memberId: string,
    depth: number,
  ): Promise<GraphNode[]> {
    const memberNode = await this.graphService.getNode(orgId, 'Member', memberId);
    if (memberNode === null) return [];

    return this.graphService.traverse(
      orgId,
      memberNode.id,
      ['BELONGS_TO', 'TRIGGERED', 'ASSIGNED_TO', 'APPROVED_BY', 'DECIDED_BY'],
      depth,
      'both',
    );
  }

  /**
   * Returns the full chain for a workflow run: trigger → tasks → approvals → decisions.
   */
  async getWorkflowChain(orgId: string, workflowRunId: string): Promise<GraphNode[]> {
    const runNode = await this.graphService.getNode(orgId, 'WorkflowRun', workflowRunId);
    if (runNode === null) return [];

    return this.graphService.traverse(
      orgId,
      runNode.id,
      ['TRIGGERED', 'ASSIGNED_TO', 'APPROVED_BY', 'DECIDED_BY'],
      5,
      'both',
    );
  }

  /**
   * Returns the department hierarchy as a graph.
   */
  async getDepartmentGraph(orgId: string): Promise<GraphNode[]> {
    return this.graphService.listNodes(orgId, 'Department');
  }

  /**
   * Returns which knowledge docs are referenced by which workflows.
   */
  async getKnowledgeUsageGraph(orgId: string): Promise<GraphNode[]> {
    const knowledgeNodes = await this.graphService.listNodes(orgId, 'Knowledge');
    const result: GraphNode[] = [];

    for (const kNode of knowledgeNodes) {
      const connected = await this.graphService.traverse(
        orgId,
        kNode.id,
        ['REFERENCES', 'USED_BY'],
        2,
        'both',
      );
      result.push(kNode, ...connected);
    }

    // Deduplicate by id
    const seen = new Set<string>();
    return result.filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }
}
