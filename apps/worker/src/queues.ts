import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const workflowQueue = new Queue('workflow-execution', { connection });
export const approvalQueue = new Queue('approval-processing', { connection });
export const taskQueue = new Queue('task-processing', { connection });
export const slaQueue = new Queue('sla-monitoring', { connection });
export const intentQueue = new Queue('intent-detection', { connection });
export const notificationQueue = new Queue('notification-dispatch', { connection });

export { connection };
