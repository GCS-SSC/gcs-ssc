import { nanoid } from 'nanoid'
import { acquireDbLease } from '../utils/db'
import { processStorageCleanupBatch, pruneCompletedStorageCleanupJobs } from '../utils/storage-cleanup-outbox'

const lease = await acquireDbLease()
const workerId = process.env.GCS_STORAGE_CLEANUP_WORKER_ID?.trim() || `cli:${process.pid}:${nanoid()}`
const batchLimit = Math.max(1, Math.min(100, Number.parseInt(process.env.GCS_STORAGE_CLEANUP_BATCH_SIZE ?? '20', 10) || 20))

try {
  let totals = { claimed: 0, completed: 0, retried: 0, deadLettered: 0 }
  while (true) {
    const result = await processStorageCleanupBatch(lease.database, workerId, batchLimit)
    totals = {
      claimed: totals.claimed + result.claimed,
      completed: totals.completed + result.completed,
      retried: totals.retried + result.retried,
      deadLettered: totals.deadLettered + result.deadLettered
    }
    if (result.claimed < batchLimit) break
  }
  const retentionDays = Math.max(1, Number.parseInt(process.env.GCS_STORAGE_CLEANUP_RETENTION_DAYS ?? '30', 10) || 30)
  const pruned = await pruneCompletedStorageCleanupJobs(
    lease.database,
    new Date(Date.now() - retentionDays * 86_400_000)
  )
  console.info(JSON.stringify({ workerId, ...totals, pruned }))
} finally {
  await lease.release()
}
