/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Queue callbacks have explicit typed contracts. */
import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import type { Database } from '../../shared/types/database'
import { withoutAuditCapture } from './audit-context'
import { auditControls, resolveAuditRetention } from './audit-runtime'
import { registerQueueHandler, type HostQueueContext } from './queue-registry'

/** Registers evidence maintenance without waiting for the business database to become ready. */
export const registerAuditQueueHandlers = (db: Kysely<Database>, app: object): (() => void) => {
  const retention = resolveAuditRetention()
  const unregister: (() => void)[] = []
  try {
    unregister.push(registerQueueHandler({
      id: 'host:access-log-flush',
      queueLevel: 0,
      executionScope: 'process',
      /** Persists this process's response-complete evidence through its independent store. */
      run: async () => { await auditControls.get(db)?.flush?.() }
    }, app))
    unregister.push(registerQueueHandler({
      id: 'host:access-log-retention',
      queueLevel: 3,
      executionScope: 'process',
      /** Expires bounded batches independently of business-database readiness. */
      run: async () => {
        const expire = auditControls.get(db)?.expireAccess
        if (!expire) return
        try {
          let total = 0
          for (let batch = 0; batch < 10; batch++) {
            const removed = await expire(retention.accessDays)
            total += removed
            if (removed < 1000) break
          }
          if (total) console.info({ event: 'audit.access_retention', removed: total })
        } catch {
          console.error({ event: 'audit.access_retention_failed' })
          throw new Error('Access history retention failed')
        }
      }
    }, app))
    unregister.push(registerQueueHandler({
      id: 'host:audit-retention',
      queueLevel: 3,
      /** Expires bounded business evidence under the database's maintenance guard. */
      run: async ({ db: queueDb }: HostQueueContext) => {
        await withoutAuditCapture(async () => {
          try {
            let total = 0
            for (let batch = 0; batch < 10; batch++) {
              const result = await sql<{ removed: number }>`SELECT audit.expire_events(${retention.auditDays}, ${retention.accessDays}, 1000) AS removed`.execute(queueDb)
              const removed = result.rows[0]?.removed ?? 0
              total += removed
              if (removed < 1000) break
            }
            console.info({ event: 'audit.retention', removed: total })
          } catch {
            console.error({ event: 'audit.retention_failed' })
            throw new Error('Audit retention failed')
          }
        })
      }
    }, app))
  } catch (error) {
    for (const remove of unregister) remove()
    throw error
  }
  return () => {
    for (const remove of unregister) remove()
  }
}
