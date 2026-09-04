import type { PoolConfig } from 'pg'

export const POSTGRES_POOL_MAX = 20
export const POSTGRES_POOL_IDLE_TIMEOUT_MS = 30_000
export const POSTGRES_POOL_ACQUISITION_TIMEOUT_MS = 5_000
export const POSTGRES_HEALTH_POOL_MAX = 1

export interface PostgresTimeoutConfig {
  statementTimeoutMs: number
  lockTimeoutMs: number
  idleInTransactionSessionTimeoutMs: number
  healthQueryTimeoutMs: number
}

export interface PostgresTimeoutRuntimeConfig {
  postgresStatementTimeoutMs?: unknown
  postgresLockTimeoutMs?: unknown
  postgresIdleInTransactionSessionTimeoutMs?: unknown
  postgresHealthQueryTimeoutMs?: unknown
}

export const DEFAULT_POSTGRES_TIMEOUT_CONFIG: Readonly<PostgresTimeoutConfig> = Object.freeze({
  statementTimeoutMs: 60_000,
  lockTimeoutMs: 5_000,
  idleInTransactionSessionTimeoutMs: 60_000,
  healthQueryTimeoutMs: 2_000
})

interface TimeoutDefinition {
  environmentName: string
  runtimeKey: keyof PostgresTimeoutRuntimeConfig
  defaultValue: number
  minimum: number
  maximum: number
}

const timeoutDefinitions = {
  statementTimeoutMs: {
    environmentName: 'POSTGRES_STATEMENT_TIMEOUT_MS',
    runtimeKey: 'postgresStatementTimeoutMs',
    defaultValue: DEFAULT_POSTGRES_TIMEOUT_CONFIG.statementTimeoutMs,
    minimum: 1_000,
    maximum: 600_000
  },
  lockTimeoutMs: {
    environmentName: 'POSTGRES_LOCK_TIMEOUT_MS',
    runtimeKey: 'postgresLockTimeoutMs',
    defaultValue: DEFAULT_POSTGRES_TIMEOUT_CONFIG.lockTimeoutMs,
    minimum: 100,
    maximum: 600_000
  },
  idleInTransactionSessionTimeoutMs: {
    environmentName: 'POSTGRES_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS',
    runtimeKey: 'postgresIdleInTransactionSessionTimeoutMs',
    defaultValue: DEFAULT_POSTGRES_TIMEOUT_CONFIG.idleInTransactionSessionTimeoutMs,
    minimum: 1_000,
    maximum: 600_000
  },
  healthQueryTimeoutMs: {
    environmentName: 'POSTGRES_HEALTH_QUERY_TIMEOUT_MS',
    runtimeKey: 'postgresHealthQueryTimeoutMs',
    defaultValue: DEFAULT_POSTGRES_TIMEOUT_CONFIG.healthQueryTimeoutMs,
    minimum: 100,
    maximum: 4_000
  }
} as const satisfies Record<keyof PostgresTimeoutConfig, TimeoutDefinition>

/**
 * Selects a nonblank direct environment value before its runtime fallback.
 *
 * @param environmentValue - Direct process environment value.
 * @param runtimeValue - Nuxt runtime-config fallback.
 * @returns Selected raw configuration value.
 */
const configuredTimeoutValue = (environmentValue: string | undefined, runtimeValue: unknown): unknown => {
  if (environmentValue !== undefined && environmentValue.trim().length > 0) {
    return environmentValue.trim()
  }
  if (typeof runtimeValue === 'string' && runtimeValue.trim().length === 0) return undefined
  return runtimeValue
}

/**
 * Parses one timeout value against its finite millisecond range.
 *
 * @param definition - Timeout name, default, and allowed range.
 * @param value - Raw configured value.
 * @returns Validated timeout in milliseconds.
 */
const parseTimeout = (definition: TimeoutDefinition, value: unknown): number => {
  const resolvedValue = value ?? definition.defaultValue
  const parsed = typeof resolvedValue === 'number'
    ? resolvedValue
    : typeof resolvedValue === 'string' && /^\d+$/.test(resolvedValue)
      ? Number(resolvedValue)
      : Number.NaN

  if (!Number.isSafeInteger(parsed) || parsed < definition.minimum || parsed > definition.maximum) {
    throw new Error(
      `${definition.environmentName} must be a whole number from ${definition.minimum} to ${definition.maximum} milliseconds`
    )
  }

  return parsed
}

/**
 * Resolves and validates PostgreSQL server-side execution deadlines.
 *
 * Direct process variables take precedence over their Nuxt runtime-config
 * counterparts. The health maximum remains below the shortest deployment
 * probe deadline so a failed check can answer before its caller gives up.
 *
 * @param config - Nuxt runtime configuration.
 * @param env - Runtime process environment.
 * @returns Validated PostgreSQL timeout values in milliseconds.
 */
export const resolvePostgresTimeoutConfig = (
  config: PostgresTimeoutRuntimeConfig,
  env: NodeJS.ProcessEnv = process.env
): PostgresTimeoutConfig => Object.fromEntries(
  Object.entries(timeoutDefinitions).map(([key, definition]) => [
    key,
    parseTimeout(
      definition,
      configuredTimeoutValue(env[definition.environmentName], config[definition.runtimeKey])
    )
  ])
) as unknown as PostgresTimeoutConfig

/**
 * Builds the application pool configuration without changing its established
 * size, idle-client retirement, or acquisition bounds.
 *
 * @param connectionString - PostgreSQL connection URL.
 * @param timeouts - Validated server-side execution deadlines.
 * @returns node-postgres pool configuration.
 */
export const buildPostgresPoolConfig = (
  connectionString: string,
  timeouts: PostgresTimeoutConfig
): PoolConfig => ({
  connectionString,
  max: POSTGRES_POOL_MAX,
  idleTimeoutMillis: POSTGRES_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: POSTGRES_POOL_ACQUISITION_TIMEOUT_MS,
  statement_timeout: timeouts.statementTimeoutMs,
  lock_timeout: timeouts.lockTimeoutMs,
  idle_in_transaction_session_timeout: timeouts.idleInTransactionSessionTimeoutMs
})

/**
 * Builds the one-connection readiness pool configuration. Both connection
 * acquisition and server statement execution use the health budget.
 *
 * @param connectionString - PostgreSQL connection URL.
 * @param healthQueryTimeoutMs - Validated readiness budget.
 * @returns node-postgres health pool configuration.
 */
export const buildPostgresHealthPoolConfig = (
  connectionString: string,
  healthQueryTimeoutMs: number
): PoolConfig => ({
  connectionString,
  max: POSTGRES_HEALTH_POOL_MAX,
  idleTimeoutMillis: POSTGRES_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: healthQueryTimeoutMs,
  statement_timeout: healthQueryTimeoutMs
})
