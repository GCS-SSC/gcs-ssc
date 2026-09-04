import { assertReferencedFileStorageProvidersRegistered } from '../utils/extensions'
import {
  getMigrationPromise,
  registerMigrationPromise,
  setMigrationReadiness
} from '../utils/migration-readiness'
import type { DatabaseLease } from '../utils/db'

/**
 * Runs core and enabled-extension migrations in canonical startup order.
 *
 * @param db - Database generation protected by the migration lease.
 */
const runMigrations = async (db: DatabaseLease['database']): Promise<void> => {
  const migrator = await useMigrator()

  const { error, results } = await migrator.migrateToLatest()

  results?.forEach(it => {
    if (it.status === 'Success') {
      console.info(`migration "${it.migrationName}" was executed successfully`)
    } else if (it.status === 'Error') {
      console.error(`failed to execute migration "${it.migrationName}"`)
    }
  })

  if (error) {
    console.error('failed to migrate')
    console.error(error)
    const migrationErrorMessage = error instanceof Error ? error.message : String(error)
    if (migrationErrorMessage.includes('corrupted migrations')) {
      console.error(
        'Detected old migration history against compacted baseline. Run `bun run dev --clean` to reset local PGlite data.'
      )
    }
    throw error
  }

  try {
    const extensions = await getRegisteredExtensions()
    const extensionResults = await runEnabledExtensionMigrations(db, extensions)
    extensionResults.forEach(extensionResult => {
      extensionResult.results.forEach(result => {
        if (result.status === 'Success') {
          console.info(`extension migration "${result.migrationName}" for "${extensionResult.extensionKey}" was executed successfully`)
        } else if (result.status === 'Error') {
          console.error(`failed to execute extension migration "${result.migrationName}" for "${extensionResult.extensionKey}"`)
        }
      })
    })
    await assertReferencedFileStorageProvidersRegistered(db)
  } catch (extensionMigrationError) {
    console.error('failed to migrate enabled extensions')
    console.error(extensionMigrationError)
    throw extensionMigrationError
  }
}

export default defineNitroPlugin(async () => {
  const dbLease = await acquireDbLease()
  try {
    const existingMigration = getMigrationPromise(dbLease.generationId)
    if (existingMigration) {
      await existingMigration
      return
    }

    const migrationPromise = runMigrations(dbLease.database)
    registerMigrationPromise(dbLease.generationId, migrationPromise)
    try {
      await migrationPromise
      setMigrationReadiness(dbLease.generationId, migrationPromise, 'ready')
    } catch (error) {
      setMigrationReadiness(dbLease.generationId, migrationPromise, 'failed')
      throw error
    }
  } finally {
    await dbLease.release()
  }
})
