import type { Migration, MigrationProvider } from 'kysely'
import { productionCoreMigrations } from './production-core-migrations'
import * as seedMigration from './historical-demo-seed'

export const coreMigrations = Object.fromEntries(Object.entries({
  ...productionCoreMigrations,
  '0240_seed': seedMigration
}).sort(([left], [right]) => left.localeCompare(right))) satisfies Record<string, Migration>

export const coreMigrationProvider: MigrationProvider = {
  getMigrations: async () => coreMigrations
}
