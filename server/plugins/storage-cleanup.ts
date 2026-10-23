import { nanoid } from 'nanoid'
import type { Kysely } from 'kysely'
import type { Database } from '../../shared/types/database'
import { registerQueueHandler } from '../utils/queue-registry'
import { processStorageCleanupBatch, pruneCompletedStorageCleanupJobs } from '../utils/storage-cleanup-outbox'

export default defineNitroPlugin(app => {
  registerQueueHandler({
    id: 'host:storage-cleanup',
    queueLevel: 1,
    run: async ({ db }) => {
      await processStorageCleanupBatch(db as Kysely<Database>, `queue:${nanoid()}`, 60)
    }
  }, app)
  registerQueueHandler({
    id: 'host:storage-cleanup-retention',
    queueLevel: 2,
    run: async ({ db }) => {
      const days = Math.max(1, Number.parseInt(process.env.GCS_STORAGE_CLEANUP_RETENTION_DAYS ?? '30', 10) || 30)
      await pruneCompletedStorageCleanupJobs(db as Kysely<Database>, new Date(Date.now() - days * 86_400_000))
    }
  }, app)
})
