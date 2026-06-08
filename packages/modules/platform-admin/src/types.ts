export type TenantStatus = 'active' | 'suspended' | 'pending';
export type AdminActionType =
  | 'suspend_tenant'
  | 'reinstate_tenant'
  | 'toggle_feature_flag'
  | 'update_system_config'
  | 'create_feature_flag';

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: string;
  memberCount: number;
  workflowCount: number;
  createdAt: string;
}

export interface PlatformMetric {
  key: string;
  value: number | string;
  unit?: string;
  measuredAt: string;
}

export interface AdminAction {
  id: string;
  adminId: string;
  actionType: AdminActionType;
  targetTenantId: string | null;
  payload: Record<string, unknown>;
  reason: string | null;
  performedAt: string;
}

export interface FeatureFlag {
  id: string;
  key: string;
  description: string | null;
  isEnabled: boolean;
  scope: string;
  targetTenantId: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SystemConfig {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface CreateFeatureFlagInput {
  key: string;
  isEnabled?: boolean;
  scope?: string;
  description?: string;
  targetTenantId?: string;
  config?: Record<string, unknown>;
}

export interface UpsertSystemConfigInput {
  key: string;
  value: unknown;
  updatedBy: string;
  description?: string;
}
