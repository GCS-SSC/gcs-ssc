import { PGlite, types as pgliteTypes } from '@electric-sql/pglite'
import { citext } from '@electric-sql/pglite/contrib/citext'
import { pgDump } from '@electric-sql/pglite-tools/pg_dump'
import {
  CompiledQuery,
  Kysely,
  Migrator,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler
} from 'kysely'
import { productionCoreMigrations } from '../database/production-core-migrations'
import type { Database } from '../../shared/types/database'
import type { DatabaseConnection, Dialect, Driver, Migration, QueryResult, TransactionSettings } from 'kysely'

const UNSUPPORTED_ADMIN_DUMP_PROLOGUE_LINES = new Set([
  'SET transaction_timeout = 0;'
])

const parseNumericValue = (value: string) => Number(value)

/**
 * Removes known version-specific session settings from the pg_dump prologue.
 *
 * Object definitions and data after the first pg_dump object header remain
 * byte-for-byte unchanged.
 *
 * @param dump - Plain-text PostgreSQL dump.
 * @returns Dump accepted by supported PostgreSQL versions predating the setting.
 */
export const normalizeAdminSqlDumpPrologue = (dump: string): string => {
  let inPrologue = true
  return dump
    .split('\n')
    .filter(line => {
      if (line.startsWith('-- Name: ')) {
        inPrologue = false
      }
      return !inPrologue || !UNSUPPORTED_ADMIN_DUMP_PROLOGUE_LINES.has(line)
    })
    .join('\n')
}

/**
 * Kysely connection wrapper backed by a scratch PGlite client.
 */
class PGliteConnection implements DatabaseConnection {
  readonly #client: PGlite

  /**
   * Creates a Kysely connection over a scratch PGlite client.
   *
   * @param client - Scratch PGlite client used for dump generation.
   */
  constructor(client: PGlite) {
    this.#client = client
  }

  executeQuery = async <R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> => {
    return await this.#client.query(compiledQuery.sql, [...compiledQuery.parameters]) as QueryResult<R>
  }

  /**
   * Rejects unsupported query streaming for the scratch database.
   *
   * @param _compiledQuery - Compiled query that would be streamed.
   * @param _chunkSize - Requested stream chunk size.
   */
  async* streamQuery<R>(_compiledQuery: CompiledQuery, _chunkSize?: number): AsyncIterableIterator<QueryResult<R>> {
    yield* [] as QueryResult<R>[]

    throw new Error('PGlite does not support streaming.')
  }
}

/**
 * Minimal Kysely driver for the scratch PGlite database.
 */
class PGliteKyselyDriver implements Driver {
  readonly #client: PGlite

  /**
   * Creates a Kysely driver over a scratch PGlite client.
   *
   * @param client - Scratch PGlite client used by the driver.
   */
  constructor(client: PGlite) {
    this.#client = client
  }

  init = async (): Promise<void> => {}

  acquireConnection = async (): Promise<DatabaseConnection> => {
    return new PGliteConnection(this.#client)
  }

  beginTransaction = async (connection: DatabaseConnection, _settings: TransactionSettings): Promise<void> => {
    await connection.executeQuery(CompiledQuery.raw('BEGIN'))
  }

  commitTransaction = async (connection: DatabaseConnection): Promise<void> => {
    await connection.executeQuery(CompiledQuery.raw('COMMIT'))
  }

  rollbackTransaction = async (connection: DatabaseConnection): Promise<void> => {
    await connection.executeQuery(CompiledQuery.raw('ROLLBACK'))
  }

  releaseConnection = async (_connection: DatabaseConnection): Promise<void> => {}

  destroy = async (): Promise<void> => {
    await this.#client.close()
  }
}

/**
 * Creates a Postgres-compatible Kysely dialect backed by PGlite.
 *
 * @param client - Scratch PGlite client.
 * @returns Kysely dialect for the scratch database.
 */
const createPGliteDialect = (client: PGlite): Dialect => ({
  createAdapter: () => new PostgresAdapter(),
  createDriver: () => new PGliteKyselyDriver(client),
  createIntrospector: db => new PostgresIntrospector(db),
  createQueryCompiler: () => new PostgresQueryCompiler()
})

/**
 * Builds the schema in a scratch database and returns a PostgreSQL dump.
 *
 * @returns SQL dump containing all non-seed core migrations.
 */
export const generateAdminSqlDump = async (): Promise<string> => {
  const pg = new PGlite('memory://', {
    extensions: { citext },
    parsers: {
      [pgliteTypes.NUMERIC]: parseNumericValue
    }
  })

  const db = new Kysely<Database>({
    dialect: createPGliteDialect(pg)
  })

  const migrator = new Migrator({
    db,
    provider: {
      getMigrations: async (): Promise<Record<string, Migration>> => productionCoreMigrations
    }
  })

  try {
    const { error } = await migrator.migrateToLatest()

    if (error) {
      throw error
    }

    const dump = await pgDump({
      pg,
      args: ['--no-owner', '--no-privileges']
    })
    return normalizeAdminSqlDumpPrologue(await dump.text())
  } finally {
    await db.destroy()

    if (!pg.closed) {
      await pg.close()
    }
  }
}
