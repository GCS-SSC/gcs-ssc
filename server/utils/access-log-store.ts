/* eslint-disable jsdoc/require-jsdoc -- Internal lifecycle callbacks follow the typed store contract. */
import { Kysely, PostgresDialect, sql, type DatabaseConnection, type Dialect } from 'kysely'
import { KyselyPGlite } from 'kysely-pglite'
import pg from 'pg'
import type { Database } from '../../shared/types/database'
import type { AccessEvidence } from './access-log-queue'
import { initializeAccessLogStore } from '../database/access-log-schema'
import { destroyUnderlyingConnection } from './database-health'

export { initializeAccessLogStore } from '../database/access-log-schema'

export interface AccessLogStoreConfig {
  databaseUrl: string
  pgliteDataDir: string
}

export interface AccessLogStore {
  database: Kysely<Database>
  initialize: () => Promise<void>
  persist: (events: AccessEvidence[]) => Promise<void>
  expire: (accessDays: number) => Promise<number>
  destroy: () => Promise<void>
}

/**
 * Uses small, independent pools so access history cannot occupy business connections.
 * @param connectionString Independent PostgreSQL URL.
 * @param max Maximum concurrent connections for this workload.
 * @returns Bounded pool configuration.
 */
export const buildAccessLogPoolConfig = (connectionString: string, max: number): pg.PoolConfig => ({
  connectionString,
  max,
  connectionTimeoutMillis: 2000,
  idleTimeoutMillis: 30000,
  statement_timeout: 5000,
  lock_timeout: 1000,
  idle_in_transaction_session_timeout: 5000,
  application_name: 'gcs-ssc-access-history'
})

/**
 * Holds the single PGlite client across complete leases, including browser transactions.
 * @param dialect Independent PGlite dialect.
 * @returns Unaudited dialect with exclusive transaction leases.
 */
const serializedPGliteDialect = (dialect: Dialect): Dialect => ({
  createAdapter: () => dialect.createAdapter(),
  createIntrospector: db => dialect.createIntrospector(db),
  createQueryCompiler: () => dialect.createQueryCompiler(),
  createDriver: () => {
    const driver = dialect.createDriver()
    let tail = Promise.resolve()
    const releases = new WeakMap<DatabaseConnection, () => void>()
    return {
      init: () => driver.init(),
      acquireConnection: async () => {
        const previous = tail
        let unlock = () => {}
        tail = new Promise<void>(resolve => {
          unlock = resolve
        })
        await previous
        try {
          const connection = await driver.acquireConnection()
          releases.set(connection, unlock)
          return connection
        } catch (error) {
          unlock()
          throw error
        }
      },
      releaseConnection: async connection => {
        try {
          await driver.releaseConnection(connection)
        } finally {
          releases.get(connection)?.()
          releases.delete(connection)
        }
      },
      beginTransaction: (connection, settings) => driver.beginTransaction(connection, settings),
      commitTransaction: connection => driver.commitTransaction(connection),
      rollbackTransaction: connection => driver.rollbackTransaction(connection),
      destroy: () => driver.destroy()
    }
  }
})

/**
 * Creates an unaudited destination; connecting and installing its schema remain lazy and retryable.
 * @param config Independent PostgreSQL or PGlite destination.
 * @param report Structured diagnostics without SQL, credentials or evidence.
 * @returns Access-history persistence, browsing and lifecycle operations.
 */
export const createAccessLogStore = (
  config: AccessLogStoreConfig,
  report: (event: Record<string, unknown>) => void
): AccessLogStore => {
  if (!config.databaseUrl && !config.pgliteDataDir) throw new Error('An independent access-history destination is required')
  let lastIdleFailureReport = -Infinity
  let suppressedIdleFailures = 0
  const reportIdleFailure = () => {
    const now = Date.now()
    if (now - lastIdleFailureReport < 10000) {
      suppressedIdleFailures++
      return
    }
    report({ event: 'audit.access_store_connection_failed', suppressed: suppressedIdleFailures })
    lastIdleFailureReport = now
    suppressedIdleFailures = 0
  }
  const createPostgresDatabase = (max: number): Kysely<Database> => {
    const pool = new pg.Pool(buildAccessLogPoolConfig(config.databaseUrl, max))
    pool.on('error', reportIdleFailure)
    // Server statement_timeout cannot answer when the server or network is frozen.
    // Kill the transport at the lease deadline and await the query's actual rejection.
    const leases = new WeakMap<pg.PoolClient, { timer: ReturnType<typeof setTimeout>; handleError: () => void }>()
    pool.on('acquire', client => {
      const handleError = () => {}
      client.on('error', handleError)
      const timer = setTimeout(() => {
        destroyUnderlyingConnection(client, new Error('Access-history connection exceeded its configured deadline'))
      }, 5000)
      timer.unref?.()
      leases.set(client, { timer, handleError })
    })
    pool.on('release', (_error, client) => {
      const lease = leases.get(client)
      if (!lease) return
      clearTimeout(lease.timer)
      client.removeListener('error', lease.handleError)
      leases.delete(client)
    })
    return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) })
  }
  const writer = config.databaseUrl
    ? createPostgresDatabase(1)
    : new Kysely<Database>({ dialect: serializedPGliteDialect(new KyselyPGlite(config.pgliteDataDir).dialect) })
  const database = config.databaseUrl ? createPostgresDatabase(2) : writer
  let initialization: Promise<void> | undefined
  const initialize = (): Promise<void> => {
    initialization ??= initializeAccessLogStore(writer).catch(error => {
      initialization = undefined
      throw error
    })
    return initialization
  }
  return {
    database,
    initialize,
    persist: async events => {
      if (!events.length) return
      await initialize()
      // jsonb_populate_recordset supplies nulls for omitted keys rather than column defaults.
      const records = events.map(event => ({
        ...event,
        scope_type: event.scope_type ?? 'global',
        agency_id: event.agency_id ?? null,
        agency_ids: event.agency_ids ?? (event.agency_id ? [event.agency_id] : []),
        attribution_error: event.attribution_error ?? null,
        transaction_id: event.transaction_id ?? null,
        inputs: event.inputs ?? null
      }))
      await sql`INSERT INTO audit.access_event
        SELECT * FROM jsonb_populate_recordset(NULL::audit.access_event, ${JSON.stringify(records)}::jsonb)
        ON CONFLICT (id) DO NOTHING`.execute(writer)
    },
    expire: async accessDays => {
      await initialize()
      const result = await sql<{ removed: number }>`SELECT audit.expire_access_events(${accessDays}::integer) AS removed`.execute(writer)
      return result.rows[0]?.removed ?? 0
    },
    destroy: async () => {
      const results = await Promise.allSettled(database === writer ? [writer.destroy()] : [writer.destroy(), database.destroy()])
      const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (failure) throw failure.reason
    }
  }
}
