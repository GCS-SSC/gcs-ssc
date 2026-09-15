import type { Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.alterTable('Agency_Cost_Category')
    .addColumn('egcs_ay_active', 'boolean', column => column.notNull().defaultTo(true)).execute()
  await db.schema.alterTable('Agency_Cost_Category_Line_Item')
    .addColumn('egcs_ay_active', 'boolean', column => column.notNull().defaultTo(true)).execute()
  await db.schema.alterTable('Transfer_Payment_Stream_Cost_Category_Line_Item')
    .addColumn('egcs_tp_active', 'boolean', column => column.notNull().defaultTo(true)).execute()
}
