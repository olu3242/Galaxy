import type { Queue } from 'bullmq';

export interface ScheduledJobDefinition {
  name: string;
  queueName: string;
  cron: string;
  description: string;
  data: Record<string, unknown>;
}

export const SCHEDULED_JOBS: ScheduledJobDefinition[] = [
  {
    name: 'sla-check',
    queueName: 'sla-monitoring',
    cron: '*/5 * * * *',
    description: 'Check for overdue workflow runs and escalate',
    data: { jobName: 'sla-check' },
  },
  {
    name: 'analytics-rollup',
    queueName: 'analytics-rollup',
    cron: '0 * * * *',
    description: 'Roll up hourly analytics metrics',
    data: { jobName: 'analytics-rollup' },
  },
  {
    name: 'loop-learning-nightly',
    queueName: 'loop-learning',
    cron: '0 2 * * *',
    description: 'Nightly Loop OS learning consolidation across all organizations',
    data: { jobName: 'loop-nightly-consolidation', organizationId: 'system' },
  },
  {
    name: 'knowledge-refresh',
    queueName: 'knowledge-ingestion',
    cron: '0 3 * * *',
    description: 'Re-embed stale knowledge documents',
    data: { jobName: 'knowledge-refresh' },
  },
  {
    name: 'audit-elasticsearch-sync',
    queueName: 'audit-sync',
    cron: '*/30 * * * *',
    description: 'Sync recent audit logs to Elasticsearch',
    data: { jobName: 'audit-sync-incremental', limit: 500 },
  },
  {
    name: 'approval-timeout-sweep',
    queueName: 'approval-timeout',
    cron: '*/5 * * * *',
    description: 'Sweep pending approval_requests whose timeout_at has passed',
    data: { jobName: 'approval-timeout-sweep' },
  },
  {
    name: 'health-check',
    queueName: 'health-check',
    cron: '*/1 * * * *',
    description: 'Platform health check — database, Redis, Kafka',
    data: { jobName: 'health-check' },
  },
];

/**
 * registerScheduledJobs
 *
 * Registers all defined scheduled jobs with their queues using BullMQ repeat.
 * Safe to call on startup — BullMQ deduplicates repeat jobs by name.
 */
export async function registerScheduledJobs(queues: Map<string, Queue>): Promise<void> {
  for (const job of SCHEDULED_JOBS) {
    const queue = queues.get(job.queueName);
    if (!queue) continue;
    await queue.add(job.name, job.data, {
      repeat: { pattern: job.cron },
      jobId: `scheduled:${job.name}`,
    });
  }
}
