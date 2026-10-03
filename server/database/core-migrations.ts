import type { Migration, MigrationProvider } from 'kysely'
import { productionCoreMigrations } from './production-core-migrations'
import * as seedMigration from './historical-demo-seed'
import * as receivableSeedMigration from './receivable-demo-seed'

export const coreMigrations = Object.fromEntries(Object.entries({
  ...productionCoreMigrations,
  '0240_seed': seedMigration,
  '0280_seed_accounts_receivable': receivableSeedMigration
}).sort(([left], [right]) => left.localeCompare(right))) satisfies Record<string, Migration>

export const coreMigrationProvider: MigrationProvider = {
  getMigrations: async () => coreMigrations
}
