import { sql, type Kysely } from 'kysely'
import { acquireDbLease, resolveDatabaseConfig } from '~~/server/utils/db'
import { getMigrationPromise } from '~~/server/utils/migration-readiness'
import { createScheduledExtensionWriteAuthorization } from '~~/server/utils/extension-scheduled-import'
import { withAuditExecution } from '~~/server/utils/audit-context'
import type { GcsExtensionScheduledMinutePayload } from '@gcs-ssc/extensions/server'
import type { Database } from '~~/shared/types/database'

let running = false

/**
 * Holds a session lock so another PostgreSQL worker cannot run the same minute job.
 * @param database - Application database whose connection holds the lock.
 * @param operation - Task body to run while the lock is held.
 * @returns The operation result, or null when another worker holds the lock.
 */
export const runWithPostgresMinuteLock = async <T>(database: Kysely<Database>, operation: () => Promise<T>): Promise<T | null> =>
  await database.connection().execute(async connection => {
    const result = await sql<{ acquired: boolean }>`SELECT pg_try_advisory_lock(214735, 914) AS acquired`.execute(connection)
    if (!result.rows[0]?.acquired) return null
    try {
      return await operation()
    } finally {
      await sql`SELECT pg_advisory_unlock(214735, 914)`.execute(connection)
    }
  })

/** Runs extension pull schedules once per minute without tying them to a user request. */
export default defineTask({
  meta: { name: 'extensions:minute', description: 'Run enabled extension minute jobs' },
  /** @returns Task completion after enabled extensions have been offered a run. */
  run: async () => {
    if (running) return { result: 'skipped' }
    running = true
    let lease: Awaited<ReturnType<typeof acquireDbLease>> | undefined
    try {
      lease = await acquireDbLease()
      const migration = getMigrationPromise(lease.generationId)
      if (!migration) throw new Error('Extension minute task ran before database migrations were registered.')
      await migration
      const database = lease.database
      const hooks = useNitroApp().hooks as unknown as {
        callHook: (name: string, payload: GcsExtensionScheduledMinutePayload) => Promise<void>
      }
      /** @returns Task completion after registered extensions receive one minute tick. */
      const dispatch = async () => {
        await hooks.callHook('gcs-extension:scheduled-minute', {
          db: database,
          createWriteAuthorization: createScheduledExtensionWriteAuthorization,
          runForAgency: async (agencyId, operation) => withAuditExecution({ type: 'agency', agencyId }, operation)
        })
        return { result: 'ok' }
      }
      if (!resolveDatabaseConfig(useRuntimeConfig()).databaseUrl) return await dispatch()
      return await runWithPostgresMinuteLock(database, dispatch) ?? { result: 'skipped' }
    } finally {
      try {
        await lease?.release()
      } finally {
        running = false
      }
    }
  }
})
