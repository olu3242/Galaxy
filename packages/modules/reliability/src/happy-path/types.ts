export type HappyPathScenario =
  | 'task_creation'
  | 'approval_routing'
  | 'case_management'
  | 'incident_resolution'
  | 'project_creation'
  | 'program_execution'
  | 'strategy_execution'
  | 'resource_allocation'
  | 'workflow_automation'
  | 'agent_recommendation';

export type HappyPathStatus = 'active' | 'deprecated' | 'draft';
export type SimulationResult = 'pass' | 'fail' | 'skipped';

export interface HappyPathTemplate {
  id: string;
  organizationId: string;
  scenario: HappyPathScenario;
  name: string;
  description: string;
  steps: HappyPathStep[];
  status: HappyPathStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface HappyPathStep {
  order: number;
  name: string;
  action: string;
  expectedOutcome: string;
  timeoutSeconds: number;
}

export interface HappyPathSimulation {
  id: string;
  organizationId: string;
  templateId: string;
  result: SimulationResult;
  stepResults: StepResult[];
  durationMs: number;
  errorMessage?: string;
  runAt: Date;
}

export interface StepResult {
  order: number;
  name: string;
  passed: boolean;
  durationMs: number;
  notes?: string;
}

export interface HappyPathMetrics {
  organizationId: string;
  scenario: HappyPathScenario;
  totalRuns: number;
  passRate: number;
  avgDurationMs: number;
  lastRunAt?: Date;
}
