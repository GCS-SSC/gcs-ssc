import type { Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.alterTable('Common_Recommendation')
    .addColumn('egcs_cn_revision', 'integer', col => col.defaultTo(1).notNull())
    .execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.alterTable('Common_Recommendation').dropColumn('egcs_cn_revision').execute()
}
