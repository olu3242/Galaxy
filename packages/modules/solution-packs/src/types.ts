export type Industry =
  | 'fintech'
  | 'healthcare'
  | 'logistics'
  | 'retail'
  | 'manufacturing'
  | 'professional_services';

export type PackInstallationStatus = 'installing' | 'installed' | 'failed';

export interface SolutionPack {
  id: string;
  name: string;
  industry: Industry;
  description: string;
  version: string;
  isPublished: boolean;
  packData: SolutionPackData;
  createdAt: string;
}

export interface SolutionPackData {
  includedWorkflows: string[];
  includedKnowledgeTemplates: string[];
  recommendedAgents: string[];
}

export interface SolutionPackRow {
  id: string;
  name: string;
  industry: string;
  description: string;
  version: string;
  is_published: boolean;
  pack_data: SolutionPackData;
  created_at: string;
}

export interface PackInstallation {
  id: string;
  organizationId: string;
  packId: string;
  installedBy: string;
  installedAt: string;
  status: PackInstallationStatus;
}

export interface PackInstallationRow {
  id: string;
  organization_id: string;
  pack_id: string;
  installed_by: string;
  installed_at: string;
  status: string;
}

export interface SolutionPackTemplate {
  id: string;
  organizationId: string | null;
  name: string;
  industry: Industry | null;
  description: string;
  steps: Record<string, unknown>;
  category: string;
  isSystem: boolean;
  createdAt: string;
}

export interface SolutionPackTemplateRow {
  id: string;
  organization_id: string | null;
  name: string;
  industry: string | null;
  description: string;
  steps: Record<string, unknown>;
  category: string;
  is_system: boolean;
  created_at: string;
}
