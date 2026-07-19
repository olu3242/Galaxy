import type { OrgGraphService } from './OrgGraphService.js';
import type { GraphNode, GraphEdge } from './types.js';

export class GraphSyncService {
  constructor(private readonly graphService: OrgGraphService) {}

  async syncMember(
    orgId: string,
    memberId: string,
    props: Record<string, unknown>,
  ): Promise<GraphNode> {
    return this.graphService.upsertNode(orgId, 'Member', memberId, props);
  }

  async syncDepartment(
    orgId: string,
    deptId: string,
    props: Record<string, unknown> & { memberIds?: string[] },
  ): Promise<GraphNode> {
    const { memberIds, ...deptProps } = props;
    const deptNode = await this.graphService.upsertNode(orgId, 'Department', deptId, deptProps);

    if (memberIds !== undefined && Array.isArray(memberIds)) {
      for (const memberId of memberIds) {
        const memberNode = await this.graphService.getNode(orgId, 'Member', memberId);
        if (memberNode !== null) {
          await this.graphService.addEdge(orgId, 'BELONGS_TO', memberNode.id, deptNode.id);
        }
      }
    }

    return deptNode;
  }

  async syncWorkflow(
    orgId: string,
    workflowId: string,
    props: Record<string, unknown>,
  ): Promise<GraphNode> {
    return this.graphService.upsertNode(orgId, 'Workflow', workflowId, props);
  }

  async syncWorkflowRun(
    orgId: string,
    runId: string,
    triggeredById: string,
    props: Record<string, unknown>,
  ): Promise<GraphNode> {
    const runNode = await this.graphService.upsertNode(orgId, 'WorkflowRun', runId, props);

    const triggerNode = await this.graphService.getNode(orgId, 'Member', triggeredById);
    if (triggerNode !== null) {
      await this.graphService.addEdge(orgId, 'TRIGGERED', triggerNode.id, runNode.id);
    }

    return runNode;
  }

  async syncTask(
    orgId: string,
    taskId: string,
    assignedToMemberId: string,
    props: Record<string, unknown>,
  ): Promise<GraphNode> {
    const taskNode = await this.graphService.upsertNode(orgId, 'Task', taskId, props);

    const memberNode = await this.graphService.getNode(orgId, 'Member', assignedToMemberId);
    if (memberNode !== null) {
      await this.graphService.addEdge(orgId, 'ASSIGNED_TO', taskNode.id, memberNode.id);
    }

    return taskNode;
  }

  async syncApproval(
    orgId: string,
    approvalId: string,
    approvedByMemberId: string,
    props: Record<string, unknown>,
  ): Promise<GraphNode> {
    const approvalNode = await this.graphService.upsertNode(orgId, 'Approval', approvalId, props);

    const memberNode = await this.graphService.getNode(orgId, 'Member', approvedByMemberId);
    if (memberNode !== null) {
      await this.graphService.addEdge(orgId, 'APPROVED_BY', approvalNode.id, memberNode.id);
    }

    return approvalNode;
  }

  async syncDecision(
    orgId: string,
    decisionId: string,
    agentId: string,
    props: Record<string, unknown>,
  ): Promise<{ node: GraphNode; edge: GraphEdge | null }> {
    const decisionNode = await this.graphService.upsertNode(orgId, 'Decision', decisionId, props);

    const agentNode = await this.graphService.getNode(orgId, 'Agent', agentId);
    if (agentNode !== null) {
      const edge = await this.graphService.addEdge(
        orgId,
        'DECIDED_BY',
        decisionNode.id,
        agentNode.id,
      );
      return { node: decisionNode, edge };
    }

    return { node: decisionNode, edge: null };
  }
}
