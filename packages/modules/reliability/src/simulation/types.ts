export type SimulationType =
  | 'task'
  | 'approval'
  | 'case'
  | 'incident'
  | 'workflow'
  | 'organization'
  | 'disaster_recovery'
  | 'security_incident';

export type SimulationStatus = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled';

export interface SimulationRun {
  id: string;
  organizationId: string;
  simulationType: SimulationType;
  status: SimulationStatus;
  config: Record<string, unknown>;
  results: Record<string, unknown>;
  durationMs?: number;
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface SimulationReport {
  id: string;
  organizationId: string;
  runId: string;
  summary: string;
  passed: number;
  failed: number;
  coverage: Record<string, unknown>;
  createdAt: Date;
}
