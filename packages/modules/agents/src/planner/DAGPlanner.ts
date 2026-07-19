import { randomUUID } from 'node:crypto';

export interface DAGTask {
  id: string;
  name: string;
  agentType: string;
  input: Record<string, unknown>;
  dependsOn: string[]; // task ids that must complete first
}

export interface DAGNode {
  task: DAGTask;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DAGPlan {
  id: string;
  organizationId: string;
  correlationId: string;
  nodes: Map<string, DAGNode>;
  executionLayers: string[][];
  createdAt: string;
}

export interface DAGExecutionResult {
  planId: string;
  completedTasks: string[];
  failedTasks: string[];
  skippedTasks: string[];
  durationMs: number;
}

type TaskExecutor = (
  task: DAGTask,
  inputs: Record<string, Record<string, unknown>>,
) => Promise<Record<string, unknown>>;

/**
 * DAGPlanner — builds a dependency DAG from a list of tasks and executes
 * layers in parallel, passing outputs of upstream tasks to downstream ones.
 */
export class DAGPlanner {
  /** Build a DAG execution plan from a list of tasks. Validates for cycles. */
  buildPlan(organizationId: string, tasks: DAGTask[], correlationId?: string): DAGPlan {
    // Validate all dependsOn ids reference known tasks
    const taskIds = new Set(tasks.map((t) => t.id));
    for (const task of tasks) {
      for (const dep of task.dependsOn) {
        if (!taskIds.has(dep)) {
          throw new Error(`Task ${task.id} depends on unknown task ${dep}`);
        }
      }
    }

    const layers = this.topologicalSort(tasks);

    const nodes = new Map<string, DAGNode>();
    for (const task of tasks) {
      nodes.set(task.id, { task, status: 'pending' });
    }

    return {
      id: randomUUID(),
      organizationId,
      correlationId: correlationId ?? randomUUID(),
      nodes,
      executionLayers: layers,
      createdAt: new Date().toISOString(),
    };
  }

  /** Execute a DAG plan layer by layer. */
  async execute(plan: DAGPlan, executor: TaskExecutor): Promise<DAGExecutionResult> {
    const startMs = Date.now();
    const completedTasks: string[] = [];
    const failedTasks: string[] = [];
    const skippedTasks: string[] = [];

    for (const layer of plan.executionLayers) {
      // Skip tasks whose dependencies failed
      const layerTasks = layer.filter((taskId) => {
        const node = plan.nodes.get(taskId);
        if (!node) return false;
        const depsFailed = node.task.dependsOn.some((depId) => failedTasks.includes(depId));
        if (depsFailed) {
          node.status = 'skipped';
          skippedTasks.push(taskId);
          return false;
        }
        return true;
      });

      // Execute layer in parallel
      await Promise.all(
        layerTasks.map(async (taskId) => {
          const node = plan.nodes.get(taskId);
          if (!node) return;

          node.status = 'running';
          node.startedAt = new Date().toISOString();

          try {
            // Collect upstream outputs
            const upstreamOutputs: Record<string, Record<string, unknown>> = {};
            for (const depId of node.task.dependsOn) {
              const depNode = plan.nodes.get(depId);
              if (depNode?.output) {
                upstreamOutputs[depId] = depNode.output;
              }
            }

            node.output = await executor(node.task, upstreamOutputs);
            node.status = 'completed';
            node.completedAt = new Date().toISOString();
            completedTasks.push(taskId);
          } catch (err) {
            node.status = 'failed';
            node.error = err instanceof Error ? err.message : String(err);
            node.completedAt = new Date().toISOString();
            failedTasks.push(taskId);
          }
        }),
      );
    }

    return {
      planId: plan.id,
      completedTasks,
      failedTasks,
      skippedTasks,
      durationMs: Date.now() - startMs,
    };
  }

  private topologicalSort(tasks: DAGTask[]): string[][] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const task of tasks) {
      inDegree.set(task.id, task.dependsOn.length);
      adjacency.set(task.id, []);
    }

    for (const task of tasks) {
      for (const dep of task.dependsOn) {
        adjacency.get(dep)?.push(task.id);
      }
    }

    const layers: string[][] = [];
    let frontier = tasks.filter((t) => (inDegree.get(t.id) ?? 0) === 0).map((t) => t.id);

    while (frontier.length > 0) {
      layers.push(frontier);
      const next: string[] = [];
      for (const taskId of frontier) {
        for (const dependent of adjacency.get(taskId) ?? []) {
          const newDegree = (inDegree.get(dependent) ?? 1) - 1;
          inDegree.set(dependent, newDegree);
          if (newDegree === 0) {
            next.push(dependent);
          }
        }
      }
      frontier = next;
    }

    const total = layers.reduce((s, l) => s + l.length, 0);
    if (total !== tasks.length) {
      throw new Error('DAG contains a cycle — cannot build execution plan');
    }

    return layers;
  }
}
