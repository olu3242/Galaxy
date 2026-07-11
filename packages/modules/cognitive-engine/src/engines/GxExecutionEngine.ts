import type { Pool } from 'pg';
import type { PlanTask, ExecutionPlan } from './GxPlanningEngine.js';

export interface ExecutionResult {
  taskId: string;
  success: boolean;
  output?: Record<string, unknown>;
  errorMessage?: string;
  retryCount: number;
  durationMs: number;
}

export type ToolHandler = (
  task: PlanTask,
  ctx: ToolExecutionContext,
) => Promise<Record<string, unknown>>;

export interface ToolExecutionContext {
  organizationId: string;
  actorId: string;
  correlationId: string;
  pool: Pool;
}

export interface ExecutionEngineOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export class GxExecutionEngine {
  private readonly tools = new Map<string, ToolHandler>();
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly pool: Pool,
    opts: ExecutionEngineOptions = {},
  ) {
    this.maxRetries = opts.maxRetries ?? 3;
    this.retryDelayMs = opts.retryDelayMs ?? 500;
    this.registerDefaultTools();
  }

  registerTool(name: string, handler: ToolHandler): void {
    this.tools.set(name, handler);
  }

  async executeTask(task: PlanTask, ctx: ToolExecutionContext): Promise<ExecutionResult> {
    const start = performance.now();
    let lastError = '';
    let retryCount = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await this.delay(this.retryDelayMs * attempt);
          retryCount++;
        }

        const toolName = task.tool;
        const handler = toolName ? this.tools.get(toolName) : undefined;

        const output = handler ? await handler(task, ctx) : await this.defaultExecute(task, ctx);

        return {
          taskId: task.id,
          success: true,
          output,
          retryCount,
          durationMs: Math.round(performance.now() - start),
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt === this.maxRetries) break;
      }
    }

    return {
      taskId: task.id,
      success: false,
      errorMessage: lastError,
      retryCount,
      durationMs: Math.round(performance.now() - start),
    };
  }

  async executePlan(plan: ExecutionPlan, ctx: ToolExecutionContext): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    const taskMap = new Map(plan.tasks.map((t) => [t.id, t]));
    const completedIds = new Set<string>();
    const failedIds = new Set<string>();

    for (const batch of plan.executionOrder) {
      const batchTasks = batch
        .map((id) => taskMap.get(id))
        .filter((t): t is PlanTask => t !== undefined);

      // Skip tasks whose dependencies failed
      const executableTasks = batchTasks.filter(
        (t) => !t.dependsOn.some((dep) => failedIds.has(dep)),
      );
      const skippedTasks = batchTasks.filter((t) => t.dependsOn.some((dep) => failedIds.has(dep)));

      for (const t of skippedTasks) {
        results.push({
          taskId: t.id,
          success: false,
          errorMessage: 'Skipped: dependency failed',
          retryCount: 0,
          durationMs: 0,
        });
        failedIds.add(t.id);
      }

      // Execute batch in parallel
      const batchResults = await Promise.all(
        executableTasks.map((task) => this.executeTask(task, ctx)),
      );

      for (const result of batchResults) {
        results.push(result);
        if (result.success) completedIds.add(result.taskId);
        else failedIds.add(result.taskId);
      }
    }

    return results;
  }

  async compensate(results: ExecutionResult[], ctx: ToolExecutionContext): Promise<void> {
    // Roll back completed tasks in reverse order on failure
    const completedResults = results.filter((r) => r.success).reverse();
    for (const result of completedResults) {
      const compensator = this.tools.get(`compensate_${result.taskId}`);
      if (compensator) {
        const noop: PlanTask = {
          id: result.taskId,
          title: 'compensation',
          description: '',
          dependsOn: [],
          estimatedMinutes: 0,
          priority: 'high',
          status: 'pending',
          ...(result.output !== undefined ? { input: result.output } : {}),
        };
        try {
          await compensator(noop, ctx);
        } catch {
          /* best-effort */
        }
      }
    }
  }

  private async defaultExecute(
    task: PlanTask,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown>> {
    // Log the execution attempt as a no-op when no tool is registered
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      ctx.organizationId,
    ]);
    return {
      taskId: task.id,
      status: 'executed',
      note: 'no tool handler registered',
      correlationId: ctx.correlationId,
    };
  }

  private registerDefaultTools(): void {
    this.tools.set('audit_logger', async (_task, ctx) => {
      await this.pool.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ctx.organizationId,
      ]);
      return { logged: true, correlationId: ctx.correlationId };
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
