import type { Pool } from 'pg';
import type { Job } from 'bullmq';
import { AuditSearchService } from '@galaxy/identity';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';
import type { AuditLogDoc } from '@galaxy/identity';

export interface AuditSyncJobData {
  doc: AuditLogDoc;
}

export function createAuditSyncProcessor(
  pool: Pool,
  elasticsearchUrl: string | undefined,
): (job: Job) => Promise<void> {
  const searchService = new AuditSearchService(pool, elasticsearchUrl);

  // Ensure the Elasticsearch index exists once at startup
  searchService.ensureIndex().catch((err: unknown) => {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'audit.sync.index_ensure_failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  });

  return async (job: Job): Promise<void> =>
    withEngineLifecycle(job, pool, async () => {
      const { doc } = job.data as AuditSyncJobData;

      await searchService.indexDocument(doc);

      console.warn(
        JSON.stringify({
          level: 'info',
          event: 'audit.synced_to_elasticsearch',
          auditId: doc.id,
          organizationId: doc.organizationId,
          action: doc.action,
        }),
      );
    });
}
