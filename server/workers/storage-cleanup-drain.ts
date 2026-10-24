import { withSystemAudit } from '../utils/audit-context'
import { nanoid } from 'nanoid'
import { acquireDatabaseLease, environmentDatabaseRuntimeConfig, type DatabaseLease } from '../database/runtime'
import { assertAgencyAuditReady, auditControls, initializeAuditRuntime } from '../utils/audit-runtime'
import { processStorageCleanupBatch, pruneCompletedStorageCleanupJobs } from '../utils/storage-cleanup-outbox'

/**
 * Runs one standalone cleanup lifecycle against an audit-ready database.
 * @param providedLease - Testable pre-acquired lease; production acquires its own.
 * @returns Completion after capture flush and generation release.
 */
export const drainStorageCleanup = async (providedLease?: DatabaseLease): Promise<void> => withSystemAudit(async () => {
  const lease = providedLease ?? await acquireDatabaseLease({ config: environmentDatabaseRuntimeConfig, context: { type: 'standalone' } })
  let auditControl: ReturnType<typeof auditControls.get>
  const workerId = process.env.GCS_STORAGE_CLEANUP_WORKER_ID?.trim() || `cli:${process.pid}:${nanoid()}`
  const batchLimit = Math.max(1, Math.min(100, Number.parseInt(process.env.GCS_STORAGE_CLEANUP_BATCH_SIZE ?? '20', 10) || 20))

  try {
    // Standalone workers do not execute Nitro's migration plugin. Starting the
    // runtime verifies that the deployed audit schema is ready, reconciles its
    // triggers, and enables capture on this process's database generation.
    await assertAgencyAuditReady(lease.database)
    await initializeAuditRuntime(lease.database)
    auditControl = auditControls.get(lease.database)
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
    try {
      // A short-lived worker cannot wait for the next Level 0 cycle.
      await auditControl?.flush?.()
    } catch { /* Generation shutdown reports any remaining best-effort evidence loss. */ } finally {
      await lease.release()
    }
  }
})

if (import.meta.main) await drainStorageCleanup()
