import type { Migration, MigrationProvider } from 'kysely'
import { productionCoreMigrations } from './production-core-migrations'
import * as seedMigration from './historical-demo-seed'
import * as receivableSeedMigration from './receivable-demo-seed'
import * as creditMemoSeedMigration from './receivable-credit-memo-demo-seed'

export const coreMigrations = Object.fromEntries(Object.entries({
  ...productionCoreMigrations,
  '0240_seed': seedMigration,
  '0280_seed_accounts_receivable': receivableSeedMigration,
  '0290_seed_accounts_receivable_credit_memos': creditMemoSeedMigration
}).sort(([left], [right]) => left.localeCompare(right))) satisfies Record<string, Migration>

export const coreMigrationProvider: MigrationProvider = {
  getMigrations: async () => coreMigrations
}
