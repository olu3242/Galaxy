import type { WorkflowRunStatus } from '../types.js';

const TRANSITIONS: Readonly<Record<WorkflowRunStatus, readonly WorkflowRunStatus[]>> = {
  pending: ['running', 'cancelled', 'failed'],
  running: ['waiting', 'escalated', 'completed', 'cancelled', 'failed'],
  waiting: ['running', 'escalated', 'cancelled', 'failed'],
  escalated: ['running', 'completed', 'cancelled', 'failed'],
  completed: [],
  cancelled: [],
  failed: [],
};

export class WorkflowStateMachine {
  canTransition(from: WorkflowRunStatus, to: WorkflowRunStatus): boolean {
    return TRANSITIONS[from].includes(to);
  }

  assertTransition(from: WorkflowRunStatus, to: WorkflowRunStatus): void {
    if (!this.canTransition(from, to)) {
      throw new Error(`Invalid workflow transition: ${from} -> ${to}`);
    }
  }

  next(from: WorkflowRunStatus): readonly WorkflowRunStatus[] {
    return TRANSITIONS[from];
  }

  isTerminal(status: WorkflowRunStatus): boolean {
    return TRANSITIONS[status].length === 0;
  }
}
