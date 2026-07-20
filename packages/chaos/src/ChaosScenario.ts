import type { Pool } from 'pg';

export interface ChaosContext {
  organizationId: string;
  pool: Pool;
  injectedAt: string;
}

export interface ChaosVerification {
  scenario: string;
  injectedAt: string;
  verifiedAt: string;
  selfHealingTriggered: boolean;
  recoveryDurationMs: number;
  auditLogsPresent: boolean;
  dataIntegrityMaintained: boolean;
  outcome: 'PASS' | 'FAIL';
  details: string;
}

export interface ChaosScenario {
  name: string;
  description: string;
  targetComponent: 'queue' | 'database' | 'agent' | 'api' | 'knowledge' | 'approval';
  failureType: 'latency' | 'error' | 'timeout' | 'rejection' | 'data_corruption';
  inject(context: ChaosContext): Promise<void>;
  verify(context: ChaosContext): Promise<ChaosVerification>;
  cleanup(context: ChaosContext): Promise<void>;
}
