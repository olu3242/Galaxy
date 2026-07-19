import crypto from 'node:crypto';
import type { ExecutionTelemetryEntry, ExecutionTelemetryService } from './ExecutionTelemetryService.js';

/**
 * Minimal interface for persisting lessons to shared org memory.
 * Structurally compatible with OrgMemoryService from @galaxy/org-memory.
 */
export interface SharedOrgMemory {
  store(
    orgId: string,
    input: {
      memoryType: 'lesson';
      subject: string;
      content: string;
      source: string;
      confidence?: number;
      relevanceTags?: string[];
    },
  ): Promise<{ id: string }>;
}

export interface Recommendation {
  type: 'parallelize' | 'remove_step' | 'add_cache' | 'reduce_approval_chain';
  description: string;
  estimatedSavingMs: number;
}

export interface OptimizationSuggestion {
  type: 'parallelize' | 'remove_step' | 'add_cache' | 'reduce_approval_chain';
  description: string;
  estimatedSavingMs: number;
}

export interface LearningEvent {
  id: string;
  workflowRunId: string;
  lessons: string[];
  recommendations: Recommendation[];
  improvementScore: number;
}

export class LearningEngine {
  constructor(
    private readonly telemetry: ExecutionTelemetryService,
    private readonly orgMemory: SharedOrgMemory,
  ) {}

  async processExecution(entry: ExecutionTelemetryEntry): Promise<LearningEvent> {
    const lessons: string[] = [];
    const recommendations: Recommendation[] = [];

    // Derive lessons from the execution outcome
    if (entry.outcome === 'failed') {
      const msgs = entry.errorMessages.slice(0, 3).join('; ');
      lessons.push(
        `Workflow ${entry.workflowDefinitionId} failed after ${String(entry.durationMs)}ms: ${msgs || 'unknown error'}`,
      );
    }

    if (entry.bottlenecks.length > 0) {
      lessons.push(
        `Steps [${entry.bottlenecks.join(', ')}] were bottlenecks in run ${entry.workflowRunId}`,
      );
      recommendations.push({
        type: 'parallelize',
        description: `Consider parallelising bottleneck steps: ${entry.bottlenecks.join(', ')}`,
        estimatedSavingMs: Math.round(entry.durationMs * 0.2),
      });
    }

    if (entry.approvalWaitMs > entry.durationMs * 0.5) {
      lessons.push(
        `Approval wait (${String(entry.approvalWaitMs)}ms) consumed over 50% of total duration`,
      );
      recommendations.push({
        type: 'reduce_approval_chain',
        description: 'Review approval chain — more than half of execution time was spent waiting for human approvals',
        estimatedSavingMs: Math.round(entry.approvalWaitMs * 0.4),
      });
    }

    if (entry.retryCount > 2) {
      lessons.push(`Run ${entry.workflowRunId} required ${String(entry.retryCount)} retries`);
      recommendations.push({
        type: 'add_cache',
        description: `High retry count (${String(entry.retryCount)}) suggests transient failures — add idempotency caching`,
        estimatedSavingMs: Math.round(entry.durationMs * 0.1 * entry.retryCount),
      });
    }

    if (entry.failedSteps > 0 && entry.stepCount > 0) {
      const failRate = entry.failedSteps / entry.stepCount;
      if (failRate > 0.3) {
        lessons.push(
          `${String(entry.failedSteps)} of ${String(entry.stepCount)} steps failed (${String(Math.round(failRate * 100))}% failure rate)`,
        );
        recommendations.push({
          type: 'remove_step',
          description: 'High per-step failure rate — audit and prune unreliable steps',
          estimatedSavingMs: Math.round(entry.durationMs * failRate * 0.5),
        });
      }
    }

    // Persist lessons to org memory
    for (const lesson of lessons) {
      await this.orgMemory.store(entry.organizationId, {
        memoryType: 'lesson',
        subject: `workflow:${entry.workflowDefinitionId}`,
        content: lesson,
        source: 'loop:learning-engine',
        confidence: entry.outcome === 'completed' ? 0.9 : 0.7,
        relevanceTags: ['workflow', entry.workflowDefinitionId, entry.outcome],
      });
    }

    // Compute improvement score: 0–100; higher = more room to improve
    const improvementScore = Math.min(
      100,
      (entry.outcome !== 'completed' ? 40 : 0) +
        entry.bottlenecks.length * 10 +
        (entry.approvalWaitMs > entry.durationMs * 0.5 ? 20 : 0) +
        Math.min(30, entry.retryCount * 10),
    );

    return {
      id: crypto.randomUUID(),
      workflowRunId: entry.workflowRunId,
      lessons,
      recommendations,
      improvementScore,
    };
  }

  async generateWorkflowOptimizations(
    organizationId: string,
    workflowId: string,
  ): Promise<OptimizationSuggestion[]> {
    const stats = await this.telemetry.getWorkflowStats(organizationId, workflowId, 30);
    const bottlenecks = await this.telemetry.detectBottlenecks(organizationId, workflowId);

    const suggestions: OptimizationSuggestion[] = [];

    if (bottlenecks.length > 0) {
      suggestions.push({
        type: 'parallelize',
        description: `Parallelise recurring bottleneck steps: ${bottlenecks.slice(0, 3).join(', ')}`,
        estimatedSavingMs: Math.round((stats.p95DurationMs - stats.p50DurationMs) * 0.3),
      });
    }

    if (stats.successRate < 0.8 && stats.totalRuns >= 5) {
      suggestions.push({
        type: 'remove_step',
        description: `Success rate is ${String(Math.round(stats.successRate * 100))}% — audit and remove or fix unreliable steps`,
        estimatedSavingMs: Math.round(stats.avgDurationMs * (1 - stats.successRate) * 0.5),
      });
    }

    if (stats.p95DurationMs > stats.p50DurationMs * 3 && stats.totalRuns >= 5) {
      suggestions.push({
        type: 'add_cache',
        description: `P95 duration (${String(Math.round(stats.p95DurationMs))}ms) is 3x the median — add result caching for expensive steps`,
        estimatedSavingMs: Math.round(stats.p95DurationMs * 0.4),
      });
    }

    if (stats.avgDurationMs > 0 && stats.totalRuns >= 10) {
      // Suggest reducing approval chain if avg is high relative to a 30-minute SLA proxy
      const slaProxyMs = 30 * 60 * 1000;
      if (stats.avgDurationMs > slaProxyMs * 0.7) {
        suggestions.push({
          type: 'reduce_approval_chain',
          description: 'Average duration is above 70% of a 30-minute SLA — consider streamlining the approval chain',
          estimatedSavingMs: Math.round(stats.avgDurationMs * 0.2),
        });
      }
    }

    return suggestions;
  }
}
