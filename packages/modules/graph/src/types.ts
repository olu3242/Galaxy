export interface GraphNode {
  id: string;
  organizationId: string;
  nodeType: string;
  externalId: string;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface GraphEdge {
  id: string;
  organizationId: string;
  edgeType: string;
  sourceNodeId: string;
  targetNodeId: string;
  weight: number;
  properties: Record<string, unknown>;
  createdAt: string;
}

export type TraverseDirection = 'outbound' | 'inbound' | 'both';

export interface BottleneckNode {
  nodeId: string;
  inDegree: number;
  nodeType: string;
}

export interface CentralityRankEntry {
  nodeId: string;
  score: number;
}
