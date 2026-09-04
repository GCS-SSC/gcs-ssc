import nodeProcess from 'node:process'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { KyselyPGlite } from 'kysely-pglite'
import { types as pgliteTypes } from '@electric-sql/pglite'
import { citext } from '@electric-sql/pglite/contrib/citext'
import pg from 'pg'
import type { Database } from '~~/shared/types/database'
import { parseSafeDecimal } from '~~/shared/utils/decimal'
import {
  buildPostgresHealthPoolConfig,
  buildPostgresPoolConfig,
  resolvePostgresTimeoutConfig,
  type PostgresTimeoutRuntimeConfig
} from './database-config'
import { executeBoundedPostgresHealthQuery } from './database-health'
import { clearMigrationStateForDatabaseGeneration } from './migration-readiness'

declare module 'h3' {
  interface H3EventContext {
    $db: Kysely<Database>
    $dbHealthCheck: () => Promise<void>
  }
}

interface DatabaseGeneration {
  id: symbol
  database: Kysely<Database>
  healthCheck: () => Promise<void>
  destroy: () => Promise<void>
  leases: Set<symbol>
}

interface DatabaseRetirement {
  generationId: symbol
  promise: Promise<void>
}

const databaseState = nodeProcess as NodeJS.Process & {
  __gcsSscDatabaseGeneration?: DatabaseGeneration
  __gcsSscDatabaseRetirement?: DatabaseRetirement
}

interface DatabaseRuntimeConfig extends PostgresTimeoutRuntimeConfig {
  databaseUrl?: string
  pgliteDataDir?: string
}

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
 * Retrieves the singleton Kysely database instance, initializing it if necessary.
 *
 * @returns The Kysely database instance.
 */
const createDatabase = (): Omit<DatabaseGeneration, 'id' | 'leases'> => {
  const config = useRuntimeConfig()
  const {
    databaseUrl,
    pgliteDataDir
  } = resolveDatabaseConfig(config)

  if (!databaseUrl && !pgliteDataDir) {
    throw new Error('No database configuration provided (DATABASE_URL or PGLITE_DATA_DIR)')
  }

  if (databaseUrl) {
    const timeouts = resolvePostgresTimeoutConfig(config)
    pg.types.setTypeParser(pg.types.builtins.NUMERIC, parseSafeDecimal)
    pg.types.setTypeParser(pg.types.builtins.DATE, parsePostgresDate)
    pg.defaults.parseInputDatesAsUTC = true

    const applicationPool = new pg.Pool(buildPostgresPoolConfig(databaseUrl, timeouts))
    const healthPool = new pg.Pool(buildPostgresHealthPoolConfig(databaseUrl, timeouts.healthQueryTimeoutMs))
    const database = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: applicationPool })
    })

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
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failure) throw failure.reason
      }
    }
  }

  const dialect = new KyselyPGlite(pgliteDataDir, {
    extensions: { citext },
    parsers: {
      [pgliteTypes.INT8]: String,
      [pgliteTypes.NUMERIC]: parseSafeDecimal
    }
  }).dialect
  const database = new Kysely<Database>({ dialect })

  return {
    database,
    healthCheck: async () => {
      await sql`SELECT 1`.execute(database)
    },
    destroy: async () => await database.destroy()
  }
}

/**
 * Creates an unleased database generation with a unique process identity.
 *
 * @returns Newly initialized database generation.
 */
const createDatabaseGeneration = (): DatabaseGeneration => {
  const database = createDatabase()
  return {
    id: Symbol('gcs-ssc-database-generation'),
    ...database,
    leases: new Set<symbol>()
  }
}

/**
 * Retrieves the current Kysely generation, creating it when no retirement is active.
 *
 * @returns The current Kysely database instance.
 */
export const useDb = (): Kysely<Database> => {
  const currentGeneration = databaseState.__gcsSscDatabaseGeneration
  if (currentGeneration) return currentGeneration.database

  if (databaseState.__gcsSscDatabaseRetirement) {
    throw new Error('Database generation is shutting down')
  }

  const generation = createDatabaseGeneration()
  databaseState.__gcsSscDatabaseGeneration = generation

  return generation.database
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
 * @param generation - Detached generation to destroy.
 */
const retireDatabaseGeneration = async (generation: DatabaseGeneration): Promise<void> => {
  const destroyPromise = Promise.resolve().then(async () => {
    await generation.destroy()
  })
  const retirement: DatabaseRetirement = {
    generationId: generation.id,
    promise: destroyPromise
  }
  databaseState.__gcsSscDatabaseRetirement = retirement

  try {
    await destroyPromise
  } finally {
    if (databaseState.__gcsSscDatabaseRetirement === retirement) {
      delete databaseState.__gcsSscDatabaseRetirement
    }
  }
}

/**
 * Synchronously detaches one current generation and its matching migration state.
 *
 * @param generation - Generation expected to be current.
 * @returns True when the generation was detached.
 */
const detachDatabaseGeneration = (generation: DatabaseGeneration): boolean => {
  if (databaseState.__gcsSscDatabaseGeneration !== generation) return false

  delete databaseState.__gcsSscDatabaseGeneration
  clearMigrationStateForDatabaseGeneration(generation.id)
  return true
}

/**
 * Acquires one Nitro-generation lifecycle lease for the process database.
 *
 * Bundler reloads can evaluate adjacent module generations inside one Nitro
 * worker. The returned release function is idempotent, and that worker's
 * database is destroyed only after the final local generation releases its lease.
 *
 * @returns The leased generation and an idempotent asynchronous release function.
 */
export const acquireDbLease = async (): Promise<DatabaseLease> => {
  const activeRetirement = databaseState.__gcsSscDatabaseRetirement
  if (activeRetirement) await activeRetirement.promise

  const generation = databaseState.__gcsSscDatabaseGeneration ?? createDatabaseGeneration()
  databaseState.__gcsSscDatabaseGeneration = generation
  const leaseId = Symbol('gcs-ssc-database-lease')
  generation.leases.add(leaseId)

  let released = false
  /** Releases this lease once and retires the generation after its final lease. */
  const release = async (): Promise<void> => {
    if (released) return
    released = true

    if (!generation.leases.delete(leaseId)) return
    if (generation.leases.size > 0) return
    if (!detachDatabaseGeneration(generation)) return

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
export const destroyDb = async (): Promise<void> => {
  const generation = databaseState.__gcsSscDatabaseGeneration
  if (generation && detachDatabaseGeneration(generation)) {
    await retireDatabaseGeneration(generation)
    return
  }

  const retirement = databaseState.__gcsSscDatabaseRetirement
  if (retirement) await retirement.promise
}
