import { createAuditDialect, type AuditControl } from '../utils/audit-driver'
import { auditScope, withoutAuditCapture } from '../utils/audit-context'
import { registerAuditControl, resolveAccessLogEnabled, resolveAuditRetention } from '../utils/audit-runtime'
import nodeProcess from 'node:process'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { KyselyPGlite } from 'kysely-pglite'
import { types as pgliteTypes } from '@electric-sql/pglite'
import { citext } from '@electric-sql/pglite/contrib/citext'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import pg from 'pg'
import type { Database } from '~~/shared/types/database'
import {
  buildPostgresHealthPoolConfig,
  buildPostgresPoolConfig,
  resolvePostgresTimeoutConfig,
  type PostgresTimeoutRuntimeConfig
} from '../utils/database-config'
import { executeBoundedPostgresHealthQuery } from '../utils/database-health'
import { clearMigrationStateForDatabaseGeneration } from '../utils/migration-readiness'
import { createAccessLogStore } from '../utils/access-log-store'
import { resolveAccessLogStorageConfig, resolveAccessLogFlushBudget } from '../utils/access-log-storage'

interface DatabaseGeneration {
  id: symbol
  database: Kysely<Database>
  healthCheck: () => Promise<void>
  destroy: () => Promise<void>
  leases: Set<symbol>
}

type DatabaseRegistry =
  | { kind: 'empty' }
  | { kind: 'active'; generation: DatabaseGeneration }
  | { kind: 'retiring'; generationId: symbol; promise: Promise<void> }

const databaseProcess = nodeProcess as NodeJS.Process & {
  __gcsSscDatabaseRegistry?: DatabaseRegistry
}

/** @returns The process owner shared across module reloads. */
const getDatabaseRegistry = (): DatabaseRegistry => databaseProcess.__gcsSscDatabaseRegistry ??= { kind: 'empty' }

export interface DatabaseRuntimeConfig extends PostgresTimeoutRuntimeConfig {
  databaseUrl?: string
  pgliteDataDir?: string
  accessDatabaseUrl?: string
  pgliteAccessDataDir?: string
}

export interface DatabaseRuntimeDependencies {
  config: () => DatabaseRuntimeConfig
  context: {
    type: 'http'
    identity: AuditControl['identity']
    accessRequest: NonNullable<AuditControl['accessRequest']>
  } | { type: 'standalone' }
}

/**
 * Reads standalone runtime fallbacks without loading a Nitro application.
 * @param env - Runtime process environment.
 * @returns Explicit runtime fallbacks; direct variables retain their existing precedence.
 */
export const environmentDatabaseRuntimeConfig = (env: NodeJS.ProcessEnv = nodeProcess.env): DatabaseRuntimeConfig => ({
  databaseUrl: env.NUXT_DATABASE_URL,
  pgliteDataDir: env.NUXT_PGLITE_DATA_DIR,
  accessDatabaseUrl: env.NUXT_ACCESS_DATABASE_URL,
  pgliteAccessDataDir: env.NUXT_PGLITE_ACCESS_DATA_DIR,
  postgresStatementTimeoutMs: env.NUXT_POSTGRES_STATEMENT_TIMEOUT_MS,
  postgresLockTimeoutMs: env.NUXT_POSTGRES_LOCK_TIMEOUT_MS,
  postgresIdleInTransactionSessionTimeoutMs: env.NUXT_POSTGRES_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS,
  postgresHealthQueryTimeoutMs: env.NUXT_POSTGRES_HEALTH_QUERY_TIMEOUT_MS
})

interface ResolvedDatabaseConfig {
  databaseUrl: string
  pgliteDataDir: string
}

export const parsePostgresDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`)

/**
 * Selects a database environment value before its Nuxt runtime fallback.
 *
 * @param environmentValue - Direct process environment value.
 * @param runtimeValue - Nuxt runtime configuration fallback.
 * @returns Resolved database configuration value.
 */
const configuredValue = (environmentValue: string | undefined, runtimeValue: string | undefined): string => {
  if (environmentValue !== undefined && environmentValue.trim().length > 0) {
    return environmentValue.trim()
  }
  if (runtimeValue !== undefined) {
    return runtimeValue
  }
  return ''
}

/**
 * Resolves established process environment variables ahead of Nuxt runtime config.
 *
 * Nuxt runtime config remains the fallback so NUXT_DATABASE_URL and
 * NUXT_PGLITE_DATA_DIR continue to work in production artifacts.
 *
 * @param config - Nuxt runtime database configuration.
 * @param env - Runtime process environment.
 * @returns Database configuration used by the Kysely factory.
 */
export const resolveDatabaseConfig = (
  config: DatabaseRuntimeConfig,
  env: NodeJS.ProcessEnv = nodeProcess.env
): ResolvedDatabaseConfig => ({
  databaseUrl: configuredValue(env.DATABASE_URL, config.databaseUrl),
  pgliteDataDir: configuredValue(env.PGLITE_DATA_DIR, config.pgliteDataDir)
})

/**
 * Creates the business database and its generation-owned independent access destination.
 *
 * @param dependencies - Runtime configuration and request attribution boundary.
 * @returns The database, health probe and coordinated close operation.
 */
const createDatabase = (dependencies: DatabaseRuntimeDependencies): Omit<DatabaseGeneration, 'id' | 'leases'> => {
  resolveAuditRetention()
  const audit: AuditControl = {
    enabled: false,
    accessEnabled: resolveAccessLogEnabled(),
    /** @returns The response lifecycle captured separately from anonymous audit identity. */
    accessRequest: () => {
      const scope = auditScope.getStore()
      if (scope?.identity) return scope.accessRequest
      return dependencies.context.type === 'http' ? dependencies.context.accessRequest() : undefined
    },
    report: event => {
      if (event.event === 'audit.access_queue') console.info(event)
      else console.error(event)
    },
    /** @returns Immutable query attribution from the verified request context. */
    identity: () => {
      const scoped = auditScope.getStore()?.identity
      if (scoped) return scoped
      if (dependencies.context.type === 'http') return dependencies.context.identity()
      throw new Error('Audit execution requires an HTTP event or explicit identity')
    }
  }
  const config = dependencies.config()
  const {
    databaseUrl,
    pgliteDataDir
  } = resolveDatabaseConfig(config)

  if (!databaseUrl && !pgliteDataDir) {
    throw new Error('No database configuration provided (DATABASE_URL or PGLITE_DATA_DIR)')
  }

  const accessConfig = resolveAccessLogStorageConfig({ databaseUrl, pgliteDataDir }, config)
  audit.accessMaxBatchesPerFlush = resolveAccessLogFlushBudget()
  let accessStore: ReturnType<typeof createAccessLogStore> | undefined
  /**
   * Creates the independent destination only when history work first needs it.
   * @returns Generation-owned independent store.
   */
  const getAccessStore = () => accessStore ??= createAccessLogStore(accessConfig, audit.report)
  audit.persistAccess = async events => await getAccessStore().persist(events)
  audit.expireAccess = async days => await getAccessStore().expire(days)
  /** @returns Initialized access database without acquiring a business connection. */
  audit.accessDatabase = async () => {
    const store = getAccessStore()
    await store.initialize()
    return store.database
  }

  if (databaseUrl) {
    const timeouts = resolvePostgresTimeoutConfig(config)
    pg.types.setTypeParser(pg.types.builtins.NUMERIC, String)
    pg.types.setTypeParser(pg.types.builtins.DATE, parsePostgresDate)
    pg.defaults.parseInputDatesAsUTC = true

    const applicationPool = new pg.Pool(buildPostgresPoolConfig(databaseUrl, timeouts))
    const healthPool = new pg.Pool(buildPostgresHealthPoolConfig(databaseUrl, timeouts.healthQueryTimeoutMs))
    const database = new Kysely<Database>({
      dialect: createAuditDialect(new PostgresDialect({ pool: applicationPool }), false, audit)
    })

    registerAuditControl(database, audit)
    return {
      database,
      healthCheck: async () => await executeBoundedPostgresHealthQuery(
        healthPool,
        timeouts.healthQueryTimeoutMs
      ),
      /** Destroys both PostgreSQL pools and preserves their first close failure. */
      destroy: async () => {
        const results = await Promise.allSettled([
          database.destroy(),
          healthPool.end()
        ])
        // The business driver drains its best-effort queue before closing the destination.
        const accessResult = await Promise.allSettled([accessStore?.destroy()])
        const failure = [...results, ...accessResult].find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failure) throw failure.reason
      }
    }
  }

  const dialect = new KyselyPGlite(pgliteDataDir, {
    extensions: { citext, pg_trgm },
    parsers: {
      [pgliteTypes.INT8]: String,
      [pgliteTypes.NUMERIC]: String
    }
  }).dialect
  const database = new Kysely<Database>({ dialect: createAuditDialect(dialect, true, audit) })
  registerAuditControl(database, audit)

  return {
    database,
    healthCheck: async () => {
      await withoutAuditCapture(() => sql`SELECT 1`.execute(database))
    },
    /** Stops business capture before closing the second local database. */
    destroy: async () => {
      try {
        await database.destroy()
      } finally {
        await accessStore?.destroy()
      }
    }
  }
}

/**
 * Creates an unleased database generation with a unique process identity.
 *
 * @param dependencies - Runtime configuration and request attribution boundary.
 * @returns Newly initialized database generation.
 */
const createDatabaseGeneration = (dependencies: DatabaseRuntimeDependencies): DatabaseGeneration => {
  const database = createDatabase(dependencies)
  return {
    id: Symbol('gcs-ssc-database-generation'),
    ...database,
    leases: new Set<symbol>()
  }
}

/**
 * Retrieves the current Kysely generation, creating it when no retirement is active.
 *
 * @param dependencies - Runtime configuration and request attribution boundary.
 * @returns The current Kysely database instance.
 */
export const useDatabase = (dependencies: DatabaseRuntimeDependencies): Kysely<Database> =>
  getDatabaseGeneration(dependencies).database

/**
 * @param dependencies - Runtime configuration and request attribution boundary.
 * @returns The current generation, creating it only while the registry is empty.
 */
const getDatabaseGeneration = (dependencies: DatabaseRuntimeDependencies): DatabaseGeneration => {
  const state = getDatabaseRegistry()
  if (state.kind === 'active') return state.generation
  if (state.kind === 'retiring') throw new Error('Database generation is shutting down')

  const generation = createDatabaseGeneration(dependencies)
  databaseProcess.__gcsSscDatabaseRegistry = { kind: 'active', generation }
  return generation
}

export interface DatabaseLease {
  database: Kysely<Database>
  generationId: symbol
  healthCheck: () => Promise<void>
  release: () => Promise<void>
}

/**
 * Destroys one detached database generation without touching replacement state.
 *
 * @param generation - Current generation to detach and destroy.
 * @returns The shared retirement completion, or an already resolved promise for stale generations.
 */
const retireDatabaseGeneration = (generation: DatabaseGeneration): Promise<void> => {
  const state = getDatabaseRegistry()
  if (state.kind !== 'active' || state.generation !== generation) return Promise.resolve()

  const retirement: Extract<DatabaseRegistry, { kind: 'retiring' }> = {
    kind: 'retiring',
    generationId: generation.id,
    promise: Promise.resolve().then(async () => {
      try {
        await generation.destroy()
      } finally {
        if (getDatabaseRegistry() === retirement) {
          databaseProcess.__gcsSscDatabaseRegistry = { kind: 'empty' }
        }
      }
    })
  }
  databaseProcess.__gcsSscDatabaseRegistry = retirement
  clearMigrationStateForDatabaseGeneration(generation.id)
  return retirement.promise
}

/**
 * Acquires one generation-bound lifecycle lease for the process database.
 *
 * Bundler reloads can evaluate adjacent module generations inside one Nitro
 * worker. The returned release function is idempotent, and that worker's
 * database is destroyed only after the final local generation releases its lease.
 *
 * @param dependencies - Runtime configuration and request attribution boundary.
 * @returns The leased generation and an idempotent asynchronous release function.
 */
export const acquireDatabaseLease = async (dependencies: DatabaseRuntimeDependencies): Promise<DatabaseLease> => {
  let state = getDatabaseRegistry()
  while (state.kind === 'retiring') {
    await state.promise
    state = getDatabaseRegistry()
  }

  const generation = getDatabaseGeneration(dependencies)
  const leaseId = Symbol('gcs-ssc-database-lease')
  generation.leases.add(leaseId)

  /** Releases this lease once and retires the generation after its final lease. */
  const release = async (): Promise<void> => {
    if (!generation.leases.delete(leaseId)) return
    if (generation.leases.size > 0) return
    await retireDatabaseGeneration(generation)
  }

  return {
    database: generation.database,
    generationId: generation.id,
    healthCheck: generation.healthCheck,
    release
  }
}

/**
 * Force-destroys the database connection and resets all lifecycle state.
 */
export const destroyDatabase = async (): Promise<void> => {
  const state = getDatabaseRegistry()
  if (state.kind === 'active') {
    await retireDatabaseGeneration(state.generation)
  } else if (state.kind === 'retiring') {
    await state.promise
  }
}
