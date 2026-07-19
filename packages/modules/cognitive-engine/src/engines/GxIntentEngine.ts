export type IntentCategory =
  | 'query_information'
  | 'trigger_workflow'
  | 'approve_request'
  | 'escalate_issue'
  | 'generate_report'
  | 'manage_member'
  | 'configure_system'
  | 'assess_risk'
  | 'unknown';

export interface ExtractedEntity {
  type: 'member' | 'department' | 'workflow' | 'date' | 'amount' | 'status' | 'identifier';
  value: string;
  confidence: number;
}

export interface DetectedGoal {
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
}

export interface IntentAnalysis {
  rawInput: string;
  intent: IntentCategory;
  confidence: number;
  entities: ExtractedEntity[];
  goal: DetectedGoal;
  predictedActions: string[];
  requiresHumanConfirmation: boolean;
}

// Keyword-based intent classification (deterministic, no LLM cost)
const INTENT_PATTERNS: Record<IntentCategory, RegExp[]> = {
  query_information: [/(show|list|get|find|what|how many|status of|tell me)/i],
  trigger_workflow: [/(start|trigger|run|initiate|launch|begin|execute)/i],
  approve_request: [/(approve|reject|accept|deny|confirm|authorize)/i],
  escalate_issue: [/(escalate|urgent|critical|emergency|flag|raise)/i],
  generate_report: [/(report|summary|analytics|breakdown|generate|export)/i],
  manage_member: [/(add member|invite|remove|onboard|offboard|assign|role)/i],
  configure_system: [/(configure|set up|change settings|update config|enable|disable)/i],
  assess_risk: [/(risk|threat|vulnerability|compliance|audit|check)/i],
  unknown: [],
};

const ENTITY_PATTERNS: { type: ExtractedEntity['type']; pattern: RegExp }[] = [
  { type: 'date', pattern: /(\d{4}-\d{2}-\d{2}|today|yesterday|this week|last month)/i },
  { type: 'amount', pattern: /(\$[\d,]+|\d+\s*(dollars?|USD|NGN|naira))/i },
  { type: 'status', pattern: /(pending|approved|rejected|completed|failed|running)/i },
  {
    type: 'identifier',
    pattern: /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  },
];

const HIGH_RISK_ACTIONS = new Set(['trigger_workflow', 'approve_request', 'configure_system']);

export class GxIntentEngine {
  analyze(rawInput: string): IntentAnalysis {
    const intent = this.classifyIntent(rawInput);
    const entities = this.extractEntities(rawInput);
    const goal = this.detectGoal(rawInput, intent);
    const predictedActions = this.predictActions(intent, entities);

    return {
      rawInput,
      intent,
      confidence: this.scoreConfidence(rawInput, intent),
      entities,
      goal,
      predictedActions,
      requiresHumanConfirmation: HIGH_RISK_ACTIONS.has(intent) && goal.priority === 'urgent',
    };
  }

  private classifyIntent(input: string): IntentCategory {
    let best: IntentCategory = 'unknown';
    let bestScore = 0;

    for (const [category, patterns] of Object.entries(INTENT_PATTERNS) as [
      IntentCategory,
      RegExp[],
    ][]) {
      if (category === 'unknown') continue;
      const score = patterns.filter((p) => p.test(input)).length;
      if (score > bestScore) {
        bestScore = score;
        best = category;
      }
    }

    return best;
  }

  private extractEntities(input: string): ExtractedEntity[] {
    const found: ExtractedEntity[] = [];
    for (const { type, pattern } of ENTITY_PATTERNS) {
      const match = pattern.exec(input);
      if (match?.[0]) {
        found.push({ type, value: match[0], confidence: 0.85 });
      }
    }
    return found;
  }

  private detectGoal(input: string, intent: IntentCategory): DetectedGoal {
    const isUrgent = /urgent|critical|asap|immediately/i.test(input);
    const isComplex = input.split(' ').length > 15 || /and.*and/i.test(input);

    return {
      description: `${intent.replace(/_/g, ' ')} based on: ${input.slice(0, 80)}`,
      priority: isUrgent ? 'urgent' : intent === 'escalate_issue' ? 'high' : 'medium',
      estimatedComplexity: isComplex ? 'complex' : 'simple',
    };
  }

  private predictActions(intent: IntentCategory, entities: ExtractedEntity[]): string[] {
    const base: Record<IntentCategory, string[]> = {
      query_information: ['fetch_data', 'format_response'],
      trigger_workflow: ['validate_permissions', 'create_workflow_instance', 'notify_participants'],
      approve_request: ['check_policy', 'update_approval_status', 'send_notification'],
      escalate_issue: ['assess_severity', 'notify_manager', 'create_escalation_record'],
      generate_report: ['aggregate_data', 'format_report', 'deliver_to_requester'],
      manage_member: ['validate_permissions', 'update_membership', 'sync_access'],
      configure_system: ['validate_admin_access', 'apply_configuration', 'audit_change'],
      assess_risk: ['gather_evidence', 'score_risk', 'generate_recommendations'],
      unknown: ['request_clarification'],
    };

    const actions = [...base[intent]];
    if (entities.some((e) => e.type === 'member')) actions.unshift('resolve_member_identity');
    return actions;
  }

  private scoreConfidence(input: string, intent: IntentCategory): number {
    if (intent === 'unknown') return 0.1;
    const wordCount = input.split(' ').length;
    const base = wordCount > 5 ? 0.75 : 0.55;
    const matchCount = INTENT_PATTERNS[intent].filter((p) => p.test(input)).length;
    return Math.min(0.95, base + matchCount * 0.05);
  }
}
