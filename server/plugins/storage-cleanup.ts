import { nanoid } from 'nanoid'
import type { Kysely } from 'kysely'
import type { Database } from '../../shared/types/database'
import { registerL1QueueHandler } from '../utils/l1-queue'
import { processStorageCleanupBatch, pruneCompletedStorageCleanupJobs } from '../utils/storage-cleanup-outbox'

export default defineNitroPlugin(app => {
  registerL1QueueHandler({
    id: 'host:storage-cleanup',
    intervalMs: 5000,
    run: async ({ db }) => {
      await processStorageCleanupBatch(db as Kysely<Database>, `l1:${nanoid()}`, 1)
    }
  }, app)
  registerL1QueueHandler({
    id: 'host:storage-cleanup-retention',
    intervalMs: 3_600_000,
    run: async ({ db }) => {
      const days = Math.max(1, Number.parseInt(process.env.GCS_STORAGE_CLEANUP_RETENTION_DAYS ?? '30', 10) || 30)
      await pruneCompletedStorageCleanupJobs(db as Kysely<Database>, new Date(Date.now() - days * 86_400_000))
    }
  }, app)
})
