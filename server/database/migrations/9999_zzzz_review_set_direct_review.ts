import type { Kysely } from 'kysely'

export const up = async (db: Kysely<unknown>): Promise<void> => {
  // Preserve existing manual-review eligibility, including historical demo sets.
  await db.schema.alterTable('Common_Review_Set_Setup')
    .addColumn('egcs_cn_directreview', 'boolean', column => column.notNull().defaultTo(true))
    .execute()
  await db.schema.alterTable('Common_Review_Set_Setup')
    .alterColumn('egcs_cn_directreview', column => column.setDefault(false))
    .execute()
}

export const down = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema.alterTable('Common_Review_Set_Setup').dropColumn('egcs_cn_directreview').execute()
}
