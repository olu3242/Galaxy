export type TwinNodeType =
  | 'organization'
  | 'department'
  | 'team'
  | 'member'
  | 'workflow'
  | 'process'
  | 'system'
  | 'resource';

export type TwinRelationshipType =
  | 'contains'
  | 'reports_to'
  | 'collaborates_with'
  | 'depends_on'
  | 'triggers'
  | 'owns';

export interface TwinNode {
  id: string;
  organizationId: string;
  nodeType: TwinNodeType;
  externalId: string;
  name: string;
  properties: Record<string, unknown>;
  healthScore: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TwinRelationship {
  id: string;
  organizationId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: TwinRelationshipType;
  weight: number;
  properties: Record<string, unknown>;
  createdAt: Date;
}

export interface TwinSnapshot {
  id: string;
  organizationId: string;
  nodeCount: number;
  relationshipCount: number;
  healthScore: number;
  insights: Record<string, unknown>;
  createdAt: Date;
}
