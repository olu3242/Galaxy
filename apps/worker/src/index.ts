import { Pool } from 'pg';
import { Worker } from 'bullmq';
import pino from 'pino';
import { connection } from './queues.js';
import { createWorkflowProcessor } from './processors/workflow-execution.js';
import { createSlaProcessor } from './processors/sla-monitoring.js';
import { createIntentProcessor } from './processors/intent-detection.js';
import { processAgentJob } from './processors/agent-execution.js';
import { createNotificationDispatchProcessor } from './processors/notification-dispatch.js';
import { createKnowledgeIngestionProcessor } from './processors/knowledge-ingestion.js';
import { createLoopLearningProcessor } from './processors/loop-learning.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Workflow execution worker
const workflowWorker = new Worker('workflow-execution', createWorkflowProcessor(pool), {
  connection,
});
workflowWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'workflow job completed');
});
workflowWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'workflow job failed');
});

// SLA monitoring — run every 5 minutes
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

// Intent detection worker
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

// Notification dispatch worker
const notificationWorker = new Worker(
  'notification-dispatch',
  createNotificationDispatchProcessor(pool),
  { connection },
);
notificationWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'notification dispatch job completed');
});
notificationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'notification dispatch job failed');
});

// Loop learning worker (AI-driven optimization insights)
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

// Knowledge ingestion worker (RAG embedding pipeline — real embeddings via Voyage AI)
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

// Agent execution worker
const agentWorker = new Worker('agent-execution', processAgentJob, { connection });
agentWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'agent job completed');
});
agentWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'agent job failed');
});

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info('Shutting down Galaxy Worker...');
  await workflowWorker.close();
  await slaWorker.close();
  await intentWorker.close();
  await loopLearningWorker.close();
  await knowledgeWorker.close();
  await notificationWorker.close();
  await agentWorker.close();
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
