import type { Migration, MigrationProvider } from 'kysely'
import { productionCoreMigrations } from './production-core-migrations'
import { demoMigrations } from './demo-migrations-bundle'

export const coreMigrations = {
  ...productionCoreMigrations,
  ...demoMigrations
} satisfies Record<string, Migration>

export const coreMigrationProvider: MigrationProvider = {
  getMigrations: async () => coreMigrations
}
