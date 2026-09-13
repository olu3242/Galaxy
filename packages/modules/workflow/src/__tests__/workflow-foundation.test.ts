import { describe, expect, it } from 'vitest';
import type { WorkflowDefinition } from '../types.js';
import { WorkflowRegistry } from '../runtime/WorkflowRegistry.js';
import { WorkflowStateMachine } from '../runtime/WorkflowStateMachine.js';

function workflow(id: string, version = 1, isActive = true): WorkflowDefinition {
  return {
    id,
    organizationId: 'org-1',
    name: `Workflow ${id}`,
    version,
    isActive,
    automationDomain: 'task',
    flowType: 'automated',
    tags: [],
    definition: {},
    createdBy: 'user-1',
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
  };
}

describe('WorkflowRegistry', () => {
  it('registers, filters and replaces workflow versions', () => {
    const registry = new WorkflowRegistry();
    registry.register(workflow('wf-1'));
    registry.register(workflow('wf-2', 1, false));
    registry.register(workflow('wf-1', 2));

    expect(registry.get('wf-1')?.version).toBe(2);
    expect(registry.list('org-1')).toHaveLength(2);
    expect(registry.active('org-1').map((item) => item.id)).toEqual(['wf-1']);
  });

  it('rejects stale versions', () => {
    const registry = new WorkflowRegistry();
    registry.register(workflow('wf-1', 2));
    expect(() => {
      registry.register(workflow('wf-1', 1));
    }).toThrow('older workflow version');
  });
});

describe('WorkflowStateMachine', () => {
  it('enforces valid lifecycle transitions and terminal states', () => {
    const machine = new WorkflowStateMachine();
    expect(machine.canTransition('pending', 'running')).toBe(true);
    expect(machine.canTransition('completed', 'running')).toBe(false);
    expect(machine.isTerminal('failed')).toBe(true);
    expect(() => {
      machine.assertTransition('cancelled', 'running');
    }).toThrow('Invalid workflow transition');
  });
});
