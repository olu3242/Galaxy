export interface OrgDNA {
  id: string;
  organizationId: string;
  identityProfile: Record<string, unknown>;
  operatingProfile: Record<string, unknown>;
  workflowProfile: Record<string, unknown>;
  languageProfile: Record<string, unknown>;
  industryBlueprint?: string;
  completenessScore: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrgLanguageEntry {
  id: string;
  organizationId: string;
  term: string;
  definition: string;
  aliases: string[];
  category: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IndustryBlueprint {
  id: string;
  industry: string;
  name: string;
  description: string;
  defaultWorkflows: Record<string, unknown>;
  defaultRoles: Record<string, unknown>;
  defaultPolicies: Record<string, unknown>;
  createdAt: Date;
}
