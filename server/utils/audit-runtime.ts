/* eslint-disable jsdoc/require-jsdoc -- Runtime lifecycle operations have explicit inputs. */
import nodeProcess from 'node:process'
import { sql, type Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AuditControl } from './audit-driver'
import { withoutAuditCapture } from './audit-context'

const runtimeState = nodeProcess as NodeJS.Process & {
  __gcsAuditControls?: WeakMap<Kysely<Database>, AuditControl>
  __gcsAuditAdapterControls?: WeakMap<object, AuditControl>
}
export const auditControls = runtimeState.__gcsAuditControls ??= new WeakMap<Kysely<Database>, AuditControl>()
const adapterControls = runtimeState.__gcsAuditAdapterControls ??= new WeakMap<object, AuditControl>()
export const registerAuditControl = (db: Kysely<Database>, control: AuditControl): void => {
  auditControls.set(db, control)
  adapterControls.set(db.getExecutor().adapter, control)
}
const refreshAuditKeys = async (db: Kysely<Database>): Promise<void> => {
  const control = auditControls.get(db) ?? adapterControls.get(db.getExecutor().adapter)
  if (!control) return
  const keys = await sql<{ table_name: string; columns: string[] }>`
    SELECT n.nspname || '.' || c.relname AS table_name, array_agg(a.attname::text ORDER BY a.attnum) AS columns
    FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE i.indisprimary AND n.nspname NOT LIKE 'pg_%' GROUP BY n.nspname, c.relname`.execute(db)
  control.keys = new Map(keys.rows.map(row => [row.table_name, row.columns]))
}
export const resolveAuditRetention = (env: NodeJS.ProcessEnv = process.env) => {
  const days = (key: string, fallback: number): number => {
    const value = env[key]
    if (value === undefined) return fallback
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
      throw new Error(`${key} must be a positive whole number of days within PostgreSQL integer range`)
    }
    return Number(value)
  }
  return { auditDays: days('GCS_AUDIT_RETENTION_DAYS', 365), accessDays: days('GCS_ACCESS_RETENTION_DAYS', 30) }
}

export const reconcileAuditCapture = async (db: Kysely<Database>): Promise<void> => {
  await withoutAuditCapture(async () => {
    const exists = await sql<{ installed: string | null }>`SELECT to_regprocedure('audit.reconcile_capture()')::text AS installed`.execute(db)
    if (exists.rows[0]?.installed) {
      await sql`SELECT audit.reconcile_capture()`.execute(db)
      await refreshAuditKeys(db)
    }
  })
}

export const startAuditRuntime = async (db: Kysely<Database>): Promise<() => Promise<void>> => {
  const retention = resolveAuditRetention()
  await withoutAuditCapture(async () => {
    await sql`UPDATE audit.retention_policy SET audit_days = ${retention.auditDays}, access_days = ${retention.accessDays}`.execute(db)
    await reconcileAuditCapture(db)
  })
  const control = auditControls.get(db)
  if (control) control.enabled = true
  let running: Promise<void> | undefined
  const clean = async () => {
    if (running) return await running
    running = withoutAuditCapture(async () => {
      try {
        const result = await sql<{ removed: number }>`SELECT audit.expire_events(1000) AS removed`.execute(db)
        console.info({ event: 'audit.retention', removed: result.rows[0]?.removed ?? 0 })
      } catch {
        console.error({ event: 'audit.retention_failed' })
      }
      await control?.flush?.()
    }).finally(() => {
      running = undefined
    })
    await running
  }
  await clean()
  const interval = setInterval(() => {
    void clean()
  }, 60 * 60 * 1000)
  const retry = setInterval(() => {
    void control?.flush?.()
  }, 10_000)
  interval.unref()
  retry.unref()
  return async () => {
    clearInterval(interval)
    clearInterval(retry)
    await running
    await control?.flush?.()
  }
}
