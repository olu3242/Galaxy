export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped';

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  agentId?: string;
  dependsOn: string[];
  estimatedMinutes: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: TaskStatus;
  tool?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface ExecutionPlan {
  id: string;
  goal: string;
  organizationId: string;
  tasks: PlanTask[];
  executionOrder: string[][]; // parallel batches
  estimatedTotalMinutes: number;
  complexity: 'simple' | 'moderate' | 'complex';
  requiresMultiAgent: boolean;
  createdAt: string;
}

export interface PlanInput {
  goal: string;
  organizationId: string;
  availableTools?: string[];
  availableAgents?: string[];
  constraints?: { maxMinutes?: number; requireHumanApproval?: boolean };
}

export class GxPlanningEngine {
  createPlan(input: PlanInput): ExecutionPlan {
    const tasks = this.decomposeTasks(input);
    const executionOrder = this.resolveDependencies(tasks);
    const totalMinutes = tasks.reduce((s, t) => s + t.estimatedMinutes, 0);

    return {
      id: crypto.randomUUID(),
      goal: input.goal,
      organizationId: input.organizationId,
      tasks,
      executionOrder,
      estimatedTotalMinutes: totalMinutes,
      complexity: totalMinutes > 30 ? 'complex' : totalMinutes > 10 ? 'moderate' : 'simple',
      requiresMultiAgent:
        tasks.some((t) => t.agentId !== undefined) &&
        new Set(tasks.map((t) => t.agentId).filter(Boolean)).size > 1,
      createdAt: new Date().toISOString(),
    };
  }

  private decomposeTasks(input: PlanInput): PlanTask[] {
    // Generic decomposition based on goal keywords
    const tasks: PlanTask[] = [];
    const goal = input.goal.toLowerCase();

    // Always start with context gathering
    tasks.push({
      id: 'task-1',
      title: 'Gather context and validate permissions',
      description: 'Load organizational context and verify actor has required permissions',
      dependsOn: [],
      estimatedMinutes: 1,
      priority: 'high',
      status: 'pending',
      tool: 'context_engine',
    });

    if (/report|analytics|summary/.test(goal)) {
      tasks.push({
        id: 'task-2',
        title: 'Aggregate data for report',
        description: 'Query relevant data sources and aggregate metrics',
        dependsOn: ['task-1'],
        estimatedMinutes: 5,
        priority: 'high',
        status: 'pending',
        tool: 'analytics_query',
      });
      tasks.push({
        id: 'task-3',
        title: 'Format and deliver report',
        description: 'Structure data into readable report format and send to requester',
        dependsOn: ['task-2'],
        estimatedMinutes: 2,
        priority: 'medium',
        status: 'pending',
        tool: 'communication_engine',
      });
    } else if (/workflow|trigger|start/.test(goal)) {
      tasks.push({
        id: 'task-2',
        title: 'Validate workflow preconditions',
        description: 'Check that all workflow conditions are met',
        dependsOn: ['task-1'],
        estimatedMinutes: 2,
        priority: 'high',
        status: 'pending',
        tool: 'workflow_validator',
      });
      tasks.push({
        id: 'task-3',
        title: 'Execute workflow',
        description: 'Trigger and monitor workflow execution',
        dependsOn: ['task-2'],
        estimatedMinutes: 10,
        priority: 'critical',
        status: 'pending',
        tool: 'workflow_engine',
      });
    } else if (/approve|reject/.test(goal)) {
      tasks.push({
        id: 'task-2',
        title: 'Evaluate approval criteria',
        description: 'Check policy and risk before approval decision',
        dependsOn: ['task-1'],
        estimatedMinutes: 3,
        priority: 'high',
        status: 'pending',
        tool: 'policy_engine',
      });
      tasks.push({
        id: 'task-3',
        title: 'Record decision and notify',
        description: 'Persist decision and notify relevant parties',
        dependsOn: ['task-2'],
        estimatedMinutes: 1,
        priority: 'high',
        status: 'pending',
        tool: 'decision_engine',
      });
    } else {
      tasks.push({
        id: 'task-2',
        title: 'Execute primary action',
        description: 'Perform the core operation requested',
        dependsOn: ['task-1'],
        estimatedMinutes: 5,
        priority: 'high',
        status: 'pending',
      });
    }

    // Always end with verification
    const lastTask = tasks[tasks.length - 1];
    tasks.push({
      id: `task-${String(tasks.length + 1)}`,
      title: 'Verify outcome and update audit trail',
      description: 'Validate results and write audit log entry',
      dependsOn: lastTask ? [lastTask.id] : [],
      estimatedMinutes: 1,
      priority: 'medium',
      status: 'pending',
      tool: 'audit_logger',
    });

    return tasks;
  }

  private resolveDependencies(tasks: PlanTask[]): string[][] {
    // Topological sort → group into parallel batches
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const inDegree = new Map(tasks.map((t) => [t.id, 0]));

    for (const task of tasks) {
      for (const dep of task.dependsOn) {
        if (taskMap.has(dep)) inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
      }
    }

    const batches: string[][] = [];
    const remaining = new Set(tasks.map((t) => t.id));

    while (remaining.size > 0) {
      const batch = [...remaining].filter((id) => (inDegree.get(id) ?? 0) === 0);
      if (batch.length === 0) break; // cycle detection — stop

      batches.push(batch);
      for (const id of batch) {
        remaining.delete(id);
        for (const task of tasks) {
          if (task.dependsOn.includes(id)) {
            inDegree.set(task.id, (inDegree.get(task.id) ?? 1) - 1);
          }
        }
      }
    }

    return batches;
  }

  updateTaskStatus(
    plan: ExecutionPlan,
    taskId: string,
    status: TaskStatus,
    output?: Record<string, unknown>,
  ): ExecutionPlan {
    const tasks = plan.tasks.map((t) => {
      if (t.id !== taskId) return t;
      const updated: PlanTask = { ...t, status };
      if (output !== undefined) updated.output = output;
      return updated;
    });
    return { ...plan, tasks };
  }
}
