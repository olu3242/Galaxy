import { describe, expect, it, vi } from 'vitest';
import type { WorkflowDefinition, WorkflowExecutor } from '../index.js';
import {
  ContextIntelligenceEngine,
  TriggerRegistry,
  WorkflowDiscoveryEngine,
  WorkflowRegistry,
  WorkflowRuntime,
  WorkflowTriggerAdapters,
} from '../index.js';

function definition(): WorkflowDefinition {
  return {
    id: 'leave-workflow',
    organizationId: 'org-1',
    name: 'Leave Request',
    version: 3,
    isActive: true,
    automationDomain: 'hr',
    flowType: 'ai_flow',
    tags: ['leave_request'],
    definition: {
      steps: [
        { id: 'classify', name: 'Classify leave', type: 'agent', config: { agent: 'hr-agent' } },
        { id: 'approve', name: 'Manager approval', type: 'approval', config: {} },
      ],
    },
    createdBy: 'owner-1',
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
  };
}

describe('Workflow discovery runtime', () => {
  it('normalizes a WhatsApp trigger, enriches context, discovers, plans and dispatches execution', async () => {
    const workflows = new WorkflowRegistry();
    workflows.register(definition());

    const triggers = new TriggerRegistry();
    triggers.register({
      id: 'whatsapp-leave',
      workflowId: 'leave-workflow',
      source: 'whatsapp',
      intent: 'leave_request',
      priority: 5,
    });

    const request = WorkflowTriggerAdapters.whatsapp({
      organizationId: 'org-1',
      sourceId: 'wamid-1',
      actorId: 'member-1',
      rawInput: 'I need Friday off',
      intent: 'leave_request',
      payload: { channel: 'whatsapp' },
      correlationId: 'corr-1',
      receivedAt: '2026-09-13T10:00:00.000Z',
    });
    request.automationDomain = 'hr';
    request.flowType = 'ai_flow';

    const context = new ContextIntelligenceEngine([
      {
        name: 'membership',
        enrich: () => Promise.resolve({ memberRole: 'employee' }),
      },
    ]);
    const discovery = new WorkflowDiscoveryEngine(workflows, triggers);
    const execute = vi
      .fn<WorkflowExecutor['execute']>()
      .mockResolvedValue({ runId: 'run-1', status: 'running' });
    const stages: string[] = [];
    const dispatchAgent = vi.fn().mockResolvedValue({ classification: 'annual_leave' });

    const runtime = new WorkflowRuntime(
      context,
      discovery,
      { execute },
      {
        onStage: (stage) => {
          stages.push(stage);
        },
        dispatchAgent,
      },
    );

    const result = await runtime.handle(request);

    expect(result.runId).toBe('run-1');
    expect(result.plan.workflowVersion).toBe(3);
    expect(result.plan.context.attributes).toEqual({ memberRole: 'employee' });
    expect(result.plan.context.candidateWorkflowIds).toEqual(['leave-workflow']);
    expect(result.plan.steps[0]?.config.agentResult).toEqual({ classification: 'annual_leave' });
    expect(dispatchAgent).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
    expect(stages).toEqual([
      'workflow.context.ready',
      'workflow.discovery.completed',
      'workflow.plan.ready',
      'workflow.execution.dispatched',
    ]);
  });

  it('supports web, API, scheduler and event trigger adapters', () => {
    const base = { organizationId: 'org-1', correlationId: 'corr', payload: {} };
    expect(WorkflowTriggerAdapters.web(base).source).toBe('web');
    expect(WorkflowTriggerAdapters.api(base).source).toBe('api');
    expect(WorkflowTriggerAdapters.scheduler(base).source).toBe('scheduler');
    expect(WorkflowTriggerAdapters.event(base).source).toBe('event');
  });
});
