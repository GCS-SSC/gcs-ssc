import type { Migration } from 'kysely'
import * as seed from './ncia-demo-seed'

export const demoMigrations = {
  '9999_seed': seed
} satisfies Record<string, Migration>
