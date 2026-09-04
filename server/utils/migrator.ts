import { Migrator } from 'kysely'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { productionCoreMigrationProvider } from '../database/production-core-migrations'
import type { Migration, MigrationProvider } from 'kysely'

type DemoMigrationLoader = (url: string) => Promise<Migration>

/**
 * Loads a separately packaged demo migration.
 *
 * @param url - Packaged demo migration URL.
 * @returns Demo migration module.
 */
const loadPackagedDemoMigration: DemoMigrationLoader = async (url) => {
  return await import(url) as Migration
}

/**
 * Resolves the running server entry point as a module URL.
 *
 * @returns Runtime entry point URL.
 */
const resolveRuntimeModuleUrl = (): string => {
  const runtimeEntryPath = process.argv[1]
  if (runtimeEntryPath === undefined) {
    throw new Error('Runtime entry path is unavailable')
  }
  return pathToFileURL(resolve(runtimeEntryPath)).href
}

/**
 * Resolves demo seed migrations only for explicit demo runtime modes.
 *
 * @param migrationMode - Explicit runtime migration mode.
 * @param demoMigrationSuffix - Required demo migration suffix.
 * @param demoMigrationLoader - Loader for the separately packaged demo module.
 * @param moduleUrl - Current runtime module URL.
 * @returns Environment-appropriate migration provider.
 */
export const resolveProductionMigrationProvider = async (
  migrationMode: string | undefined,
  demoMigrationSuffix: string | undefined,
  demoMigrationLoader: DemoMigrationLoader = loadPackagedDemoMigration,
  moduleUrl: string = resolveRuntimeModuleUrl()
): Promise<MigrationProvider> => {
  const isDemoMode = migrationMode === 'webcontainer-demo' || migrationMode === 'hosted-demo'
  if (!isDemoMode || demoMigrationSuffix !== 'seed') {
    return productionCoreMigrationProvider
  }
  const demoMigration = await demoMigrationLoader(
    new URL('./demo-migrations/demo.mjs', moduleUrl).href
  )
  return {
    getMigrations: async () => ({
      ...await productionCoreMigrationProvider.getMigrations(),
      [`9999_${demoMigrationSuffix}`]: demoMigration
    })
  }
}

/**
 * Resolves the runtime provider while keeping demo source out of production.
 *
 * @returns Runtime migration provider.
 */
export const resolveRuntimeMigrationProvider = async (): Promise<MigrationProvider> => {
  if (process.env.NODE_ENV === 'production') {
    if (process.env.ENVIRONMENT_TYPE === 'development') {
      return await resolveProductionMigrationProvider('hosted-demo', 'seed')
    }

    return await resolveProductionMigrationProvider(
      process.env.GCS_RUNTIME_MIGRATION_MODE,
      process.env.GCS_DEMO_MIGRATION_SUFFIX
    )
  }

  const { coreMigrationProvider } = await import('../database/core-migrations')
  return coreMigrationProvider
}

/**
 * Creates a Kysely migrator for the bundled core migrations.
 *
 * @returns A Kysely migrator configured with the core migration provider.
 */
export const useMigrator = async () => {
  const db = useDb()
  return new Migrator({
    db,
    provider: await resolveRuntimeMigrationProvider()
  })
}
