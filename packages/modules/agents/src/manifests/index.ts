import type { AgentManifest } from '../types.js';

export const ALICE_MANIFEST: AgentManifest = {
  id: 'AG-001',
  name: 'ALICE',
  fullName: 'Executive Intelligence Agent',
  agentType: 'alice',
  version: '1.0.0',
  capabilities: [
    'read_workflows',
    'read_analytics',
    'read_knowledge',
    'approve_decisions',
    'assess_risk',
    'generate_recommendations',
  ],
  automationDomains: ['executive', 'governance', 'strategy'],
  defaultStrategy: 'tree_of_thought',
  maxConcurrentTasks: 5,
  requiresHumanApprovalFor: ['bulk_update', 'policy_change', 'org_restructure'],
  impactTier: 4,
  description:
    'Executive-level intelligence agent for strategic decision-making, governance oversight, and organizational strategy.',
};

export const MAX_MANIFEST: AgentManifest = {
  id: 'AG-002',
  name: 'MAX',
  fullName: 'Operations Intelligence Agent',
  agentType: 'max',
  version: '1.0.0',
  capabilities: [
    'read_workflows',
    'write_tasks',
    'trigger_workflows',
    'assess_risk',
    'generate_recommendations',
  ],
  automationDomains: ['operations', 'workflow', 'logistics'],
  defaultStrategy: 'chain_of_thought',
  maxConcurrentTasks: 10,
  requiresHumanApprovalFor: ['bulk_update', 'override_sla'],
  impactTier: 3,
  description:
    'Operations intelligence agent managing day-to-day workflows, logistics coordination, and process automation.',
};

export const FINN_MANIFEST: AgentManifest = {
  id: 'AG-003',
  name: 'FINN',
  fullName: 'Finance Intelligence Agent',
  agentType: 'finn',
  version: '1.0.0',
  capabilities: [
    'read_analytics',
    'read_workflows',
    'approve_decisions',
    'assess_risk',
    'generate_recommendations',
  ],
  automationDomains: ['finance', 'payroll', 'budgeting'],
  defaultStrategy: 'evidence_gathering',
  maxConcurrentTasks: 5,
  requiresHumanApprovalFor: ['payment_release', 'budget_reallocation', 'payroll_run', 'transfer'],
  impactTier: 4,
  description:
    'Finance intelligence agent for payroll management, budget analysis, financial reporting, and compliance.',
};

export const EVA_MANIFEST: AgentManifest = {
  id: 'AG-004',
  name: 'EVA',
  fullName: 'HR Intelligence Agent',
  agentType: 'eva',
  version: '1.0.0',
  capabilities: [
    'read_workflows',
    'read_knowledge',
    'write_tasks',
    'approve_decisions',
    'generate_recommendations',
  ],
  automationDomains: ['hr', 'recruitment', 'onboarding'],
  defaultStrategy: 'chain_of_thought',
  maxConcurrentTasks: 8,
  requiresHumanApprovalFor: ['termination', 'salary_change', 'role_reassignment'],
  impactTier: 3,
  description:
    'HR intelligence agent handling recruitment pipelines, employee onboarding, and people operations.',
};

export const ATLAS_MANIFEST: AgentManifest = {
  id: 'AG-005',
  name: 'ATLAS',
  fullName: 'Knowledge Intelligence Agent',
  agentType: 'atlas',
  version: '1.0.0',
  capabilities: ['read_knowledge', 'read_analytics', 'generate_recommendations'],
  automationDomains: ['knowledge', 'documentation', 'search'],
  defaultStrategy: 'chain_of_thought',
  maxConcurrentTasks: 15,
  requiresHumanApprovalFor: ['delete_document', 'publish_policy'],
  impactTier: 2,
  description:
    'Knowledge intelligence agent for documentation management, search optimization, and organizational learning.',
};

export const SAGE_MANIFEST: AgentManifest = {
  id: 'AG-006',
  name: 'SAGE',
  fullName: 'Compliance Intelligence Agent',
  agentType: 'sage',
  version: '1.0.0',
  capabilities: [
    'read_workflows',
    'read_analytics',
    'read_knowledge',
    'approve_decisions',
    'assess_risk',
    'generate_recommendations',
  ],
  automationDomains: ['compliance', 'audit', 'governance'],
  defaultStrategy: 'evidence_gathering',
  maxConcurrentTasks: 5,
  requiresHumanApprovalFor: ['escalate', 'override', 'policy_exception', 'audit_conclusion'],
  impactTier: 4,
  description:
    'Compliance intelligence agent for regulatory adherence, audit trail management, and governance enforcement.',
};

export const NOVA_MANIFEST: AgentManifest = {
  id: 'AG-007',
  name: 'NOVA',
  fullName: 'Analytics Intelligence Agent',
  agentType: 'nova',
  version: '1.0.0',
  capabilities: ['read_analytics', 'read_workflows', 'read_knowledge', 'generate_recommendations'],
  automationDomains: ['analytics', 'reporting', 'insights'],
  defaultStrategy: 'chain_of_thought',
  maxConcurrentTasks: 12,
  requiresHumanApprovalFor: ['publish_report', 'export_data'],
  impactTier: 2,
  description:
    'Analytics intelligence agent for data aggregation, report generation, and business insights delivery.',
};

export const LYRA_MANIFEST: AgentManifest = {
  id: 'AG-008',
  name: 'LYRA',
  fullName: 'Communication Intelligence Agent',
  agentType: 'lyra',
  version: '1.0.0',
  capabilities: ['read_workflows', 'write_tasks', 'generate_recommendations'],
  automationDomains: ['communication', 'notifications'],
  defaultStrategy: 'chain_of_thought',
  maxConcurrentTasks: 20,
  requiresHumanApprovalFor: ['broadcast_message', 'external_communication'],
  impactTier: 3,
  description:
    'Communication intelligence agent managing notifications, messaging orchestration, and stakeholder engagement.',
};

export const AURORA_MANIFEST: AgentManifest = {
  id: 'AG-009',
  name: 'AURORA',
  fullName: 'Workflow Intelligence Agent',
  agentType: 'aurora',
  version: '1.0.0',
  capabilities: [
    'read_workflows',
    'write_tasks',
    'trigger_workflows',
    'approve_decisions',
    'generate_recommendations',
  ],
  automationDomains: ['workflow', 'automation', 'scheduling'],
  defaultStrategy: 'tree_of_thought',
  maxConcurrentTasks: 10,
  requiresHumanApprovalFor: ['disable_workflow', 'bulk_update', 'schedule_change'],
  impactTier: 3,
  description:
    'Workflow intelligence agent for process orchestration, automation scheduling, and workflow optimization.',
};

export const TITAN_MANIFEST: AgentManifest = {
  id: 'AG-010',
  name: 'TITAN',
  fullName: 'Infrastructure Intelligence Agent',
  agentType: 'titan',
  version: '1.0.0',
  capabilities: ['read_analytics', 'assess_risk', 'generate_recommendations'],
  automationDomains: ['infrastructure', 'security', 'devops'],
  defaultStrategy: 'evidence_gathering',
  maxConcurrentTasks: 3,
  requiresHumanApprovalFor: [
    'delete',
    'override',
    'system_shutdown',
    'access_revocation',
    'config_change',
  ],
  impactTier: 5,
  description:
    'Infrastructure intelligence agent for system reliability, security posture, and DevOps automation.',
};

export const ORION_MANIFEST: AgentManifest = {
  id: 'AG-011',
  name: 'ORION',
  fullName: 'Project Intelligence Agent',
  agentType: 'orion',
  version: '1.0.0',
  capabilities: ['read_workflows', 'read_analytics', 'write_tasks', 'generate_recommendations'],
  automationDomains: ['projects', 'tasks', 'milestones'],
  defaultStrategy: 'chain_of_thought',
  maxConcurrentTasks: 10,
  requiresHumanApprovalFor: ['cancel_project', 'milestone_deferral'],
  impactTier: 3,
  description:
    'Project intelligence agent for task management, milestone tracking, and project delivery optimization.',
};

export const MERCURY_MANIFEST: AgentManifest = {
  id: 'AG-012',
  name: 'MERCURY',
  fullName: 'Integration Intelligence Agent',
  agentType: 'mercury',
  version: '1.0.0',
  capabilities: ['read_workflows', 'write_tasks', 'trigger_workflows', 'generate_recommendations'],
  automationDomains: ['integrations', 'api', 'webhooks'],
  defaultStrategy: 'chain_of_thought',
  maxConcurrentTasks: 15,
  requiresHumanApprovalFor: ['revoke_api_key', 'disable_integration'],
  impactTier: 3,
  description:
    'Integration intelligence agent managing API connections, webhook orchestration, and third-party integrations.',
};

export const PHOENIX_MANIFEST: AgentManifest = {
  id: 'AG-013',
  name: 'PHOENIX',
  fullName: 'Recovery Intelligence Agent',
  agentType: 'phoenix',
  version: '1.0.0',
  capabilities: ['read_workflows', 'read_analytics', 'approve_decisions', 'assess_risk'],
  automationDomains: ['recovery', 'incident', 'continuity'],
  defaultStrategy: 'evidence_gathering',
  maxConcurrentTasks: 3,
  requiresHumanApprovalFor: ['escalate', 'override', 'failover', 'data_restore'],
  impactTier: 5,
  description:
    'Recovery intelligence agent for incident response, business continuity management, and disaster recovery.',
};

export const APOLLO_MANIFEST: AgentManifest = {
  id: 'AG-014',
  name: 'APOLLO',
  fullName: 'Learning Intelligence Agent',
  agentType: 'apollo',
  version: '1.0.0',
  capabilities: ['read_knowledge', 'read_analytics', 'write_tasks', 'generate_recommendations'],
  automationDomains: ['learning', 'training', 'optimization'],
  defaultStrategy: 'chain_of_thought',
  maxConcurrentTasks: 10,
  requiresHumanApprovalFor: ['publish_training', 'delete_curriculum'],
  impactTier: 2,
  description:
    'Learning intelligence agent for training program management, skill gap analysis, and continuous improvement.',
};

export const GUARDIAN_MANIFEST: AgentManifest = {
  id: 'AG-015',
  name: 'GUARDIAN',
  fullName: 'Security Intelligence Agent',
  agentType: 'guardian',
  version: '1.0.0',
  capabilities: ['read_analytics', 'read_workflows', 'assess_risk', 'approve_decisions'],
  automationDomains: ['security', 'threats', 'access'],
  defaultStrategy: 'evidence_gathering',
  maxConcurrentTasks: 3,
  requiresHumanApprovalFor: ['delete', 'override', 'lockout', 'access_grant', 'revoke_token'],
  impactTier: 5,
  description:
    'Security intelligence agent for threat detection, access control enforcement, and security incident management.',
};

export const ALL_MANIFESTS: AgentManifest[] = [
  ALICE_MANIFEST,
  MAX_MANIFEST,
  FINN_MANIFEST,
  EVA_MANIFEST,
  ATLAS_MANIFEST,
  SAGE_MANIFEST,
  NOVA_MANIFEST,
  LYRA_MANIFEST,
  AURORA_MANIFEST,
  TITAN_MANIFEST,
  ORION_MANIFEST,
  MERCURY_MANIFEST,
  PHOENIX_MANIFEST,
  APOLLO_MANIFEST,
  GUARDIAN_MANIFEST,
];
