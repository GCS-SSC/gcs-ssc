/* eslint-disable jsdoc/require-jsdoc -- Runtime lifecycle operations have explicit inputs. */
import nodeProcess from 'node:process'
import { sql, type Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AuditControl } from './audit-driver'
import { withoutAuditCapture } from './audit-context'
import { auditOwnershipRegistrationIssues } from '../database/audit-ownership-validation'
import { AUDIT_EFFECTIVE_REGISTRY_SQL } from './audit-ownership-source'

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
export const loadAuditOwnershipRegistry = async (db: Kysely<Database>) => {
  const result = await sql.raw<{ registry: NonNullable<AuditControl['ownershipRegistry']> }>(AUDIT_EFFECTIVE_REGISTRY_SQL).execute(db)
  return result.rows[0]!.registry
}

const refreshAuditKeys = async (db: Kysely<Database>): Promise<void> => {
  const control = auditControls.get(db) ?? adapterControls.get(db.getExecutor().adapter)
  if (!control) return
  const keys = await sql<{ table_name: string; columns: string[] }>`
    SELECT n.nspname || '.' || c.relname AS table_name, array_agg(a.attname::text ORDER BY a.attnum) AS columns
    FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE i.indisprimary AND n.nspname NOT LIKE 'pg_%' GROUP BY n.nspname, c.relname`.execute(db)
  const policies = await sql<{ table_schema: string; table_name: string; excluded_columns: string[] }>`SELECT table_schema, table_name, excluded_columns FROM audit.capture_policy WHERE enabled`.execute(db)
  control.policies = new Map(policies.rows.map(row => [`${row.table_schema}.${row.table_name}`, row.excluded_columns]))
  control.keys = new Map(keys.rows.map(row => [row.table_name, row.columns]))
  const ownership = await sql<{ installed: string | null }>`SELECT to_regprocedure('audit.resolve_ownership(text,jsonb,text)')::text AS installed`.execute(db)
  control.ownershipEnabled = Boolean(ownership.rows[0]?.installed)
  if (control.ownershipEnabled) {
    control.ownershipRegistry = await loadAuditOwnershipRegistry(db)
  }
}
export const resolveAccessLogEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => {
  const value = env.GCS_ACCESS_LOG_ENABLED
  if (value === undefined || value === 'true') return true
  if (value === 'false') return false
  throw new Error('GCS_ACCESS_LOG_ENABLED must be true or false')
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

/**
 * Refuses standalone business work until the deployed agency-audit upgrade is complete.
 * @param db - Standalone worker database generation to verify.
 */
export const assertAgencyAuditReady = async (db: Kysely<Database>): Promise<void> => {
  const result = await sql<{ ready: boolean }>`SELECT
    to_regclass('audit.change_event') IS NOT NULL
    AND to_regclass('audit.access_event') IS NOT NULL
    AND to_regclass('audit.capture_policy') IS NOT NULL
    AND to_regprocedure('audit.reconcile_capture()') IS NOT NULL
    AND to_regprocedure('audit.snapshot_actor_context()') IS NOT NULL
    AND to_regprocedure('audit.resolve_ownership(text,jsonb,text)') IS NOT NULL
    AND to_regprocedure('audit.expire_events(integer,integer,integer)') IS NOT NULL AS ready`.execute(db)
  if (result.rows[0]?.ready !== true) {
    throw new Error('Agency audit schema is not ready; apply core migrations before starting standalone workers')
  }
}

export const reconcileAuditCapture = async (db: Kysely<Database>): Promise<void> => {
  await withoutAuditCapture(async () => {
    const exists = await sql<{ installed: string | null }>`SELECT to_regprocedure('audit.reconcile_capture()')::text AS installed`.execute(db)
    if (exists.rows[0]?.installed) {
      await sql`DO $audit_maintenance$
        DECLARE previous_context text := current_setting('app.audit_maintenance', true);
        BEGIN
          PERFORM set_config('app.audit_maintenance', 'on', true);
          PERFORM audit.reconcile_capture();
          PERFORM set_config('app.audit_maintenance', coalesce(previous_context, ''), true);
        END $audit_maintenance$`.execute(db)
      const ownership = await sql<{ installed: string | null }>`SELECT to_regprocedure('audit.ownership_registry()')::text AS installed`.execute(db)
      if (ownership.rows[0]?.installed) {
        const rules = await loadAuditOwnershipRegistry(db)
        const tables = await sql<{ schema: string; name: string; columns: { name: string }[] }>`
          SELECT n.nspname AS schema, c.relname AS name,
            jsonb_agg(jsonb_build_object('name', a.attname) ORDER BY a.attnum) AS columns
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
          WHERE n.nspname IN ('public', 'audit', 'extensions') AND c.relkind IN ('r', 'p')
          GROUP BY n.nspname, c.relname`.execute(db)
        const issues = auditOwnershipRegistrationIssues(tables.rows, rules)
        if (issues.length) throw new Error(`Audit ownership registration failed:\n${issues.join('\n')}`)
      }
      // Online extension migrations can still roll back after reconciliation.
      // Never publish their uncommitted metadata into the process-wide control.
      if (!db.isTransaction) await refreshAuditKeys(db)
    }
  })
}

export const startAuditRuntime = async (db: Kysely<Database>): Promise<() => Promise<void>> => {
  const retention = resolveAuditRetention()
  await withoutAuditCapture(async () => {
    await reconcileAuditCapture(db)
  })
  const control = auditControls.get(db)
  if (control) control.enabled = true
  let running: Promise<void> | undefined
  let continuation: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const clean = async () => {
    if (stopped) return
    if (running) return await running
    if (continuation) clearTimeout(continuation)
    continuation = undefined
    running = withoutAuditCapture(async () => {
      try {
        let total = 0
        let removed = 0
        for (let batch = 0; batch < 10 && !stopped; batch++) {
          const result = await sql<{ removed: number }>`SELECT audit.expire_events(${retention.auditDays}, ${retention.accessDays}, 1000) AS removed`.execute(db)
          removed = result.rows[0]?.removed ?? 0
          total += removed
          if (removed < 1000) break
        }
        console.info({ event: 'audit.retention', removed: total })
        if (removed >= 1000 && !stopped) {
          continuation = setTimeout(() => {
            continuation = undefined
            void clean()
          }, 1000)
          continuation.unref()
        }
      } catch {
        console.error({ event: 'audit.retention_failed' })
      }
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
    stopped = true
    if (continuation) clearTimeout(continuation)
    clearInterval(interval)
    clearInterval(retry)
    await running
  }
}
