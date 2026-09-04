import type { Migration, MigrationProvider } from 'kysely'
import { productionCoreMigrations } from './production-core-migrations'
import * as seedMigration from './migrations/9999_seed'

export const coreMigrations = {
  ...productionCoreMigrations,
  '9999_seed': seedMigration
} satisfies Record<string, Migration>

export const coreMigrationProvider: MigrationProvider = {
  getMigrations: async () => coreMigrations
}
