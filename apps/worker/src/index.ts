import { Pool } from 'pg';
import { Worker } from 'bullmq';
import pino from 'pino';
import {
  connection,
  workflowQueue,
  approvalQueue,
  taskQueue,
  slaQueue,
  intentQueue,
  notificationQueue,
  agentQueue,
  analyticsRollupQueue,
  healthCheckQueue,
  loopQueue,
  approvalTimeoutQueue,
} from './queues.js';
import { createWorkflowProcessor } from './processors/workflow-execution.js';
import { createSlaProcessor } from './processors/sla-monitoring.js';
import { createIntentProcessor } from './processors/intent-detection.js';
import { processAgentJob } from './processors/agent-execution.js';
import { createNotificationDispatchProcessor } from './processors/notification-dispatch.js';
import { createKnowledgeIngestionProcessor } from './processors/knowledge-ingestion.js';
import { createLoopLearningProcessor } from './processors/loop-learning.js';
import { createAuditSyncProcessor } from './processors/audit-sync.js';
import { createApprovalProcessor } from './processors/approval-processing.js';
import { createLoopProcessor } from './processors/loop-processing.js';
import { createApprovalTimeoutProcessor } from './processors/approval-timeout.js';
import { createWorkflowRecoveryProcessor } from './processors/workflow-recovery.js';
import { registerScheduledJobs } from './lib/scheduler.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const workflowWorker = new Worker('workflow-execution', createWorkflowProcessor(pool), {
  connection,
});
workflowWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'workflow job completed');
});
workflowWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'workflow job failed');
});

const workflowRecoveryWorker = new Worker(
  'task-processing',
  createWorkflowRecoveryProcessor(pool, workflowQueue),
  { connection },
);
workflowRecoveryWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'workflow completion reconciliation finished');
});
workflowRecoveryWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'workflow completion reconciliation failed');
});

const slaProcessor = createSlaProcessor(pool);
const slaWorker = new Worker(
  'sla-monitoring',
  async () => {
    const count = await slaProcessor();
    logger.info({ count }, 'SLA check completed');
  },
  { connection },
);
slaWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'SLA job failed');
});

const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
const intentWorker = new Worker('intent-detection', createIntentProcessor(pool, anthropicKey), {
  connection,
});
intentWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'intent detection job completed');
});
intentWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'intent detection job failed');
});

const sendGridApiKey = process.env.SENDGRID_API_KEY;
const notificationWorker = new Worker(
  'notification-dispatch',
  createNotificationDispatchProcessor(pool, sendGridApiKey),
  { connection },
);
notificationWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'notification dispatch job completed');
});
notificationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'notification dispatch job failed');
});

const loopLearningWorker = new Worker(
  'loop-learning',
  createLoopLearningProcessor(pool, anthropicKey),
  { connection },
);
loopLearningWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'loop learning job completed');
});
loopLearningWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'loop learning job failed');
});

const voyageApiKey = process.env.VOYAGE_API_KEY;
const knowledgeWorker = new Worker(
  'knowledge-ingestion',
  createKnowledgeIngestionProcessor(pool, voyageApiKey),
  { connection },
);
knowledgeWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'knowledge ingestion job completed');
});
knowledgeWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'knowledge ingestion job failed');
});

const elasticsearchUrl = process.env.ELASTICSEARCH_URL;
const auditSyncWorker = new Worker('audit-sync', createAuditSyncProcessor(pool, elasticsearchUrl), {
  connection,
});
auditSyncWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'audit sync job completed');
});
auditSyncWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'audit sync job failed');
});

const approvalWorker = new Worker('approval-processing', createApprovalProcessor(pool), {
  connection,
});
approvalWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'approval job completed');
});
approvalWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'approval job failed');
});

const approvalTimeoutWorker = new Worker('approval-timeout', createApprovalTimeoutProcessor(pool), {
  connection,
});
approvalTimeoutWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'approval-timeout job completed');
});
approvalTimeoutWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'approval-timeout job failed');
});

const loopWorker = new Worker('loop-processing', createLoopProcessor(pool), { connection });
loopWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'loop job completed');
});
loopWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'loop job failed');
});

const agentWorker = new Worker('agent-execution', processAgentJob, { connection });
agentWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'agent job completed');
});
agentWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'agent job failed');
});

const healthCheckWorker = new Worker(
  'health-check',
  () => {
    logger.info('health-check tick');
    return Promise.resolve();
  },
  { connection },
);
healthCheckWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'health-check job failed');
});

const schedulerQueues = new Map([
  ['workflow-execution', workflowQueue],
  ['approval-processing', approvalQueue],
  ['task-processing', taskQueue],
  ['sla-monitoring', slaQueue],
  ['intent-detection', intentQueue],
  ['notification-dispatch', notificationQueue],
  ['agent-execution', agentQueue],
  ['analytics-rollup', analyticsRollupQueue],
  ['health-check', healthCheckQueue],
  ['loop-processing', loopQueue],
  ['approval-timeout', approvalTimeoutQueue],
]);

registerScheduledJobs(schedulerQueues).catch((err: unknown) => {
  logger.error(err, 'Failed to register scheduled jobs');
});

async function shutdown(): Promise<void> {
  logger.info('Shutting down Galaxy Worker...');
  await workflowWorker.close();
  await workflowRecoveryWorker.close();
  await slaWorker.close();
  await intentWorker.close();
  await loopLearningWorker.close();
  await knowledgeWorker.close();
  await notificationWorker.close();
  await approvalWorker.close();
  await approvalTimeoutWorker.close();
  await auditSyncWorker.close();
  await loopWorker.close();
  await agentWorker.close();
  await healthCheckWorker.close();
  await pool.end();
  await connection.quit();
  logger.info('Galaxy Worker shut down cleanly');
}

process.on('SIGTERM', () => {
  shutdown().catch((err: unknown) => {
    logger.error(err);
    process.exit(1);
  });
});
process.on('SIGINT', () => {
  shutdown().catch((err: unknown) => {
    logger.error(err);
    process.exit(1);
  });
});

logger.info('Galaxy Worker started');
