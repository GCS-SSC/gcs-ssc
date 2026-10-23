import { resolve } from 'node:path'
import type { Kysely } from 'kysely'
import type { Database } from '../../shared/types/database'
import { auditControls } from './audit-runtime'

export interface AccessLogStorageConfig {
  databaseUrl: string
  pgliteDataDir: string
}

interface AccessLogRuntimeConfig {
  accessDatabaseUrl?: string
  pgliteAccessDataDir?: string
}

/**
 * Resolves an independent access destination; a missing cloud URL is a configuration error.
 * @param business Business storage configuration.
 * @param config Nuxt access-store fallbacks.
 * @param env Direct runtime overrides.
 * @returns Independent access-store configuration.
 */
export const resolveAccessLogStorageConfig = (
  business: AccessLogStorageConfig,
  config: AccessLogRuntimeConfig,
  env: NodeJS.ProcessEnv = process.env
): AccessLogStorageConfig => {
  const databaseUrl = (env.GCS_ACCESS_DATABASE_URL?.trim() || config.accessDatabaseUrl || '').trim()
  const pgliteDataDir = (env.PGLITE_ACCESS_DATA_DIR?.trim() || config.pgliteAccessDataDir || `${business.pgliteDataDir}-access`).trim()
  if (business.databaseUrl) {
    if (!databaseUrl) throw new Error('GCS_ACCESS_DATABASE_URL is required when DATABASE_URL is configured')
    /**
     * @param value Connection string supplied by runtime configuration.
     * @returns Parsed PostgreSQL endpoint without exposing invalid connection strings.
     */
    const parseUrl = (value: string): URL => {
      try {
        const url = new URL(value)
        if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error('invalid')
        return url
      } catch {
        throw new Error('Business and access database connections must use valid PostgreSQL URLs')
      }
    }
    const target = parseUrl(databaseUrl)
    const source = parseUrl(business.databaseUrl)
    if (target.hostname === source.hostname && (target.port || '5432') === (source.port || '5432')) {
      throw new Error('Access logs require a separate PostgreSQL instance')
    }
    return { databaseUrl, pgliteDataDir: '' }
  }
  if (databaseUrl) throw new Error('PGlite business storage requires PGlite access storage')
  if (!business.pgliteDataDir.startsWith('memory:') && resolve(pgliteDataDir) === resolve(business.pgliteDataDir)) {
    throw new Error('Access logs require a separate PGlite directory')
  }
  return { databaseUrl: '', pgliteDataDir }
}

/**
 * Resolves the generation-owned history store; standalone dialect fixtures retain their local store.
 * @param db Business generation used for authorization.
 * @returns Independent history database without falling back on destination failure.
 */
export const getAccessLogDatabase = async (db: Kysely<Database>): Promise<Kysely<Database>> => {
  const read = auditControls.get(db)?.accessDatabase
  return read ? await read() : db
}

/**
 * Caps writes per timer tick independently of the queue's memory bounds.
 * @param env Runtime settings.
 * @returns Maximum write attempts per periodic flush.
 */
export const resolveAccessLogFlushBudget = (env: NodeJS.ProcessEnv = process.env): number => {
  const value = env.GCS_ACCESS_LOG_MAX_BATCHES_PER_FLUSH ?? '10'
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 100) {
    throw new Error('GCS_ACCESS_LOG_MAX_BATCHES_PER_FLUSH must be a whole number from 1 to 100')
  }
  return Number(value)
}
