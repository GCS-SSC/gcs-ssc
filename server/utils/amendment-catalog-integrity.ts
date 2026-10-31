import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

type Executor = Kysely<Database> | Transaction<Database>

/**
 * Checks retained selections, including completed and removed selections.
 * @param db Database or active transaction.
 * @param id Amendment type catalog identity.
 * @returns Whether any retained selection uses this definition.
 */
export const isAmendmentTypeInUse = async (db: Executor, id: string): Promise<boolean> => Boolean(
  await db.selectFrom('Funding_Case_Agreement_Amendment_Type').select('id')
    .where('egcs_fc_amendmenttype', '=', id).executeTakeFirst()
)

/**
 * Checks historical subtype selections that freeze their compatible-type mapping.
 * @param db Database or active transaction.
 * @param id Amendment subtype catalog identity.
 * @returns Whether any retained selection uses this definition.
 */
export const isAmendmentSubtypeInUse = async (db: Executor, id: string): Promise<boolean> => Boolean(
  await db.selectFrom('Funding_Case_Agreement_Amendment_Subtype').select('id')
    .where('egcs_fc_amendmentsubtype', '=', id).executeTakeFirst()
)
