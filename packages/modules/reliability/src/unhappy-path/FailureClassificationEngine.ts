import type { FailureCategory, FailureSeverity, FailureClassification } from './types.js';

const SEVERITY_MAP: Record<FailureCategory, FailureSeverity> = {
  low_confidence_intent: 'low',
  duplicate_request: 'low',
  wrong_department_routing: 'medium',
  wrong_assignee_routing: 'medium',
  workflow_failure: 'high',
  approval_failure: 'high',
  escalation_failure: 'high',
  agent_failure: 'medium',
  knowledge_failure: 'medium',
  communication_failure: 'medium',
  org_misconfiguration: 'critical',
  data_integrity_failure: 'critical',
};

const ACTION_MAP: Record<FailureCategory, string> = {
  low_confidence_intent: 'Request human clarification',
  duplicate_request: 'Deduplicate and notify sender',
  wrong_department_routing: 'Re-route to correct department',
  wrong_assignee_routing: 'Re-assign to correct member',
  workflow_failure: 'Retry workflow or escalate',
  approval_failure: 'Escalate to manager',
  escalation_failure: 'Emergency escalation',
  agent_failure: 'Fallback to human agent',
  knowledge_failure: 'Flag for knowledge base update',
  communication_failure: 'Retry via fallback channel',
  org_misconfiguration: 'Alert admin and suspend operation',
  data_integrity_failure: 'Quarantine record and alert admin',
};

export class FailureClassificationEngine {
  classify(category: FailureCategory, _context?: Record<string, unknown>): FailureClassification {
    return {
      category,
      severity: SEVERITY_MAP[category],
      confidence: 0.9,
      suggestedAction: ACTION_MAP[category],
    };
  }

  detectCategory(description: string): FailureCategory {
    const lower = description.toLowerCase();
    if (lower.includes('confidence') || lower.includes('unclear')) return 'low_confidence_intent';
    if (lower.includes('duplicate')) return 'duplicate_request';
    if (lower.includes('department')) return 'wrong_department_routing';
    if (lower.includes('assignee') || lower.includes('assignme')) return 'wrong_assignee_routing';
    if (lower.includes('workflow')) return 'workflow_failure';
    if (lower.includes('approval')) return 'approval_failure';
    if (lower.includes('escalat')) return 'escalation_failure';
    if (lower.includes('agent')) return 'agent_failure';
    if (lower.includes('knowledge')) return 'knowledge_failure';
    if (lower.includes('communication') || lower.includes('message'))
      return 'communication_failure';
    if (lower.includes('config')) return 'org_misconfiguration';
    return 'data_integrity_failure';
  }
}
