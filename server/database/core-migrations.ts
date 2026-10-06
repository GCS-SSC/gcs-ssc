import type { Migration, MigrationProvider } from 'kysely'
import { productionCoreMigrations } from './production-core-migrations'
import * as seed from './ncia-demo-seed'

export const coreMigrations = {
  ...productionCoreMigrations,
  '9999_seed': seed
} satisfies Record<string, Migration>

export const coreMigrationProvider: MigrationProvider = {
  getMigrations: async () => coreMigrations
}
